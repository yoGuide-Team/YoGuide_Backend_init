import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/// Result of a provider call, including the raw body so PaymentAttempt can
/// keep a verbatim audit record.
export interface ProviderCallResult<T = any> {
  ok: boolean;
  httpStatus: number;
  data: T | null;
  raw: string;
  error?: string;
}

export interface CheckoutSession {
  sessionId: string;
  redirectUrl: string | null;
  status: string | null;
}

/// Normalised, provider-independent outcome of a payment.
export type SettlementOutcome = 'PENDING' | 'SUCCESSFUL' | 'FAILED' | 'CANCELLED' | 'EXPIRED';

/// Thin client for the yoEcoPay Cloudflare Worker, which fronts XentriPay.
///
/// The worker is the only thing holding the XentriPay API key; this backend
/// authenticates to it with a shared `X-App-Secret`. Nothing here ever runs
/// in a client app, and no card data passes through this process.
///
/// Configuration (both required for live payments):
///   YOECOPAY_WORKER_BASE  e.g. https://yoecopay-worker.<subdomain>.workers.dev
///   YOECOPAY_APP_SECRET   shared secret the worker checks on every request
///
/// When these are absent the client reports itself unconfigured and every
/// call throws. It never fabricates a successful settlement — an
/// unconfigured payment rail must fail loudly, not silently "succeed".
@Injectable()
export class YoEcoPayClient {
  private readonly logger = new Logger(YoEcoPayClient.name);
  private readonly base: string | undefined;
  private readonly appSecret: string | undefined;
  private readonly timeoutMs: number;

  constructor(private readonly config: ConfigService) {
    this.base = this.config.get<string>('YOECOPAY_WORKER_BASE')?.replace(/\/+$/, '');
    this.appSecret = this.config.get<string>('YOECOPAY_APP_SECRET');
    this.timeoutMs = Number(this.config.get<string>('YOECOPAY_TIMEOUT_MS') ?? 20000);
  }

  get isConfigured(): boolean {
    return Boolean(this.base && this.appSecret);
  }

  private assertConfigured() {
    if (!this.isConfigured) {
      throw new ServiceUnavailableException(
        'Online payments are not configured on this server. ' +
          'Set YOECOPAY_WORKER_BASE and YOECOPAY_APP_SECRET to enable them.',
      );
    }
  }

  /// Opens a checkout session with the provider. Returns the session id the
  /// backend later polls — the client is given only the redirect URL, never
  /// the ability to declare an outcome.
  async createCheckout(params: {
    customerName: string;
    customerPhone: string;
    customerEmail: string;
    /// Minor-unit-free amount in the provider's currency (RWF).
    amount: number;
    customerRef: string;
  }): Promise<{ session: CheckoutSession; call: ProviderCallResult }> {
    this.assertConfigured();
    const call = await this.request('POST', '/checkout/create', params);
    const data = call.data ?? {};
    const sessionId =
      data.sessionId ?? data.id ?? data.session_id ?? data.reference ?? null;
    if (!call.ok || !sessionId) {
      return {
        session: { sessionId: '', redirectUrl: null, status: null },
        call: { ...call, ok: false, error: call.error ?? 'Provider did not return a session id.' },
      };
    }
    return {
      session: {
        sessionId: String(sessionId),
        redirectUrl: data.redirectUrl ?? data.url ?? data.paymentUrl ?? null,
        status: data.status ?? null,
      },
      call,
    };
  }

  /// Authoritative status read. This — not the client — is what decides
  /// whether a booking is paid.
  async getCheckoutStatus(
    sessionId: string,
  ): Promise<{ outcome: SettlementOutcome; providerStatus: string | null; call: ProviderCallResult }> {
    this.assertConfigured();
    const call = await this.request('GET', `/checkout/status/${encodeURIComponent(sessionId)}`);
    const data = call.data ?? {};
    const providerStatus: string | null =
      data.status ?? data.state ?? data.transactionStatus ?? null;
    return { outcome: this.mapStatus(providerStatus, call.ok), providerStatus, call };
  }

  /// Sends money **out** to a provider.
  ///
  /// `msisdn`, `name` and `amount` are resolved by the backend from its own
  /// database before this is called — they are never client input. The
  /// worker's older `/payouts/initiate` route took a `productId` from a
  /// hardcoded table because the mobile app used to call it directly; that
  /// route is deprecated and this one replaces it.
  async sendPayout(params: {
    msisdn: string;
    name: string;
    amount: number;
    reference: string;
    telecomProviderId?: string | null;
  }): Promise<{ outcome: SettlementOutcome; providerStatus: string | null; call: ProviderCallResult }> {
    this.assertConfigured();
    const call = await this.request('POST', '/payouts/send', {
      msisdn: params.msisdn,
      name: params.name,
      amount: params.amount,
      reference: params.reference,
      ...(params.telecomProviderId ? { telecomProviderId: params.telecomProviderId } : {}),
    });
    const providerStatus: string | null = call.data?.status ?? null;
    return { outcome: this.mapStatus(providerStatus, call.ok), providerStatus, call };
  }

  /// Authoritative payout status, polled by reference.
  async getPayoutStatus(
    reference: string,
  ): Promise<{ outcome: SettlementOutcome; providerStatus: string | null; call: ProviderCallResult }> {
    this.assertConfigured();
    const call = await this.request('GET', `/payouts/status/${encodeURIComponent(reference)}`);
    const providerStatus: string | null = call.data?.status ?? null;
    return { outcome: this.mapStatus(providerStatus, call.ok), providerStatus, call };
  }

  /// Maps the provider's vocabulary onto our own. Anything unrecognised is
  /// treated as still pending rather than as success — an unknown string
  /// must never confirm a booking.
  mapStatus(providerStatus: string | null | undefined, callOk = true): SettlementOutcome {
    if (!callOk) return 'PENDING';
    const s = (providerStatus ?? '').toString().trim().toUpperCase();
    if (['SUCCESS', 'SUCCESSFUL', 'SUCCEEDED', 'COMPLETED', 'PAID', 'SETTLED'].includes(s)) {
      return 'SUCCESSFUL';
    }
    if (['FAILED', 'FAILURE', 'DECLINED', 'REJECTED', 'ERROR'].includes(s)) return 'FAILED';
    if (['CANCELLED', 'CANCELED', 'ABORTED', 'VOIDED'].includes(s)) return 'CANCELLED';
    if (['EXPIRED', 'TIMEOUT', 'TIMED_OUT'].includes(s)) return 'EXPIRED';
    return 'PENDING';
  }

  private async request(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
  ): Promise<ProviderCallResult> {
    const url = `${this.base}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'X-App-Secret': this.appSecret as string,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
      const raw = await response.text();
      let data: any = null;
      try {
        data = raw ? JSON.parse(raw) : null;
      } catch {
        // Provider returned non-JSON. Recorded verbatim rather than guessed at.
        return {
          ok: false,
          httpStatus: response.status,
          data: null,
          raw: raw.slice(0, 2000),
          error: 'Provider returned a non-JSON response.',
        };
      }
      return {
        ok: response.ok,
        httpStatus: response.status,
        data,
        raw: raw.slice(0, 2000),
        ...(response.ok ? {} : { error: data?.error ?? `Provider returned HTTP ${response.status}.` }),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`yoEcoPay ${method} ${path} failed: ${message}`);
      return { ok: false, httpStatus: 0, data: null, raw: '', error: message };
    } finally {
      clearTimeout(timer);
    }
  }
}
