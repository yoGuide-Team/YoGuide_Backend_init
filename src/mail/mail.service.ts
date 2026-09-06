import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { Resend } from 'resend';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly gmailUser = process.env.GMAIL_USER?.trim();
  private readonly gmailAppPassword = process.env.GMAIL_APP_PASSWORD?.trim();
  private readonly resendApiKey = process.env.RESEND_API_KEY?.trim();
  private readonly resendFrom =
    process.env.RESEND_FROM_EMAIL?.trim() || this.gmailUser || 'no-reply@yoguide.app';

  private readonly transporter =
    this.gmailUser && this.gmailAppPassword
      ? nodemailer.createTransport({
          service: 'gmail',
          auth: {
            user: this.gmailUser,
            pass: this.gmailAppPassword,
          },
        })
      : null;

  private readonly resend = this.resendApiKey ? new Resend(this.resendApiKey) : null;

  private async sendEmail(options: {
    to: string;
    subject: string;
    html: string;
    from?: string;
  }) {
    const from = options.from ?? this.getDefaultFromAddress();
    const gmailFrom = this.gmailUser ? `"yoGuide Team" <${this.gmailUser}>` : from;

    const sendViaGmail = async () => {
      if (!this.transporter) {
        throw new Error('Gmail transporter is not configured.');
      }
      const result = await this.transporter.sendMail({
        from: gmailFrom,
        to: options.to,
        subject: options.subject,
        html: options.html,
      });
      this.logger.log(`Email sent via Gmail to ${options.to}`);
      return result;
    };

    const sendViaResend = async () => {
      const result = await this.resend!.emails.send({
        from,
        to: options.to,
        subject: options.subject,
        html: options.html,
      });
      const resendResult = result as { error?: unknown };
      if (resendResult?.error) {
        const errorMessage =
          typeof resendResult.error === 'string'
            ? resendResult.error
            : resendResult.error &&
                typeof resendResult.error === 'object' &&
                'message' in resendResult.error
              ? (resendResult.error as { message?: string }).message
              : JSON.stringify(resendResult.error);
        throw new Error(errorMessage || 'Resend email delivery failed.');
      }
      this.logger.log(`Email sent via Resend to ${options.to}`);
      return result;
    };

    if (this.transporter) {
      try {
        return await sendViaGmail();
      } catch (gmailError) {
        this.logger.error(
          `Gmail delivery failed for ${options.to}: ${
            gmailError instanceof Error ? gmailError.message : JSON.stringify(gmailError)
          }`,
        );
        if (this.resend) {
          try {
            return await sendViaResend();
          } catch (resendError) {
            this.logger.error(
              `Resend fallback also failed for ${options.to}: ${
                resendError instanceof Error ? resendError.message : JSON.stringify(resendError)
              }`,
            );
            throw resendError;
          }
        }
        throw gmailError;
      }
    }

    if (this.resend) {
      try {
        return await sendViaResend();
      } catch (resendError) {
        if (this.transporter) {
          try {
            return await sendViaGmail();
          } catch {
            this.logEmailPreview({
              from,
              to: options.to,
              subject: options.subject,
              html: options.html,
            });
            return;
          }
        }
        if (this.isResendDomainVerificationError(resendError)) {
          this.logEmailPreview({
            from,
            to: options.to,
            subject: options.subject,
            html: options.html,
          });
          return;
        }
        throw resendError;
      }
    }

    this.logger.warn(
      'No email provider configured: set RESEND_API_KEY or GMAIL_USER/GMAIL_APP_PASSWORD.',
    );
    this.logEmailPreview({ from, to: options.to, subject: options.subject, html: options.html });
  }

  private getDefaultFromAddress() {
    if (this.gmailUser) {
      return `"yoGuide Team" <${this.gmailUser}>`;
    }
    if (this.resendFrom) {
      return this.resendFrom;
    }
    return 'no-reply@yoguide.app';
  }

  private isResendDomainVerificationError(error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === 'string'
          ? error
          : JSON.stringify(error);
    return /domain.*not verified/i.test(message) || /not verified/i.test(message);
  }

  private logEmailPreview(options: {
    to: string;
    from: string;
    subject: string;
    html: string;
  }) {
    this.logger.warn(
      `No working email provider configured for ${options.to}. Showing email preview in the server logs.`,
    );
    this.logger.log(
      `Email preview for ${options.to}:\nFrom: ${options.from}\nSubject: ${options.subject}\n\n${options.html}`,
    );
  }

  async sendPasswordResetOtpEmail(email: string, code: string) {
    await this.sendEmail({
      from: this.resend ? this.resendFrom : undefined,
      to: email,
      subject: `${code} is your yoGuide password reset code`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; padding: 20px;">
          <h2>Reset your password</h2>
          <p>You requested to reset your yoGuide password. Enter this code in the app:</p>
          <p style="font-size: 32px; font-weight: bold; letter-spacing: 4px; color: #0C8A5B;">${code}</p>
          <p>This code expires in 10 minutes.</p>
          <p>If you didn't request this, you can ignore this email.</p>
        </div>
      `,
    });
  }

  async sendOtpEmail(email: string, code: string) {
    await this.sendEmail({
      from: this.resend ? this.resendFrom : undefined,
      to: email,
      subject: `${code} is your yoGuide verification code`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; padding: 20px;">
          <h2>Verify your email</h2>
          <p>Your yoGuide verification code is:</p>
          <p style="font-size: 32px; font-weight: bold; letter-spacing: 4px; color: #0C8A5B;">${code}</p>
          <p>This code expires in 10 minutes.</p>
          <p>If you didn't request this, you can ignore this email.</p>
        </div>
      `,
    });
  }

  // ── Provider application lifecycle ─────────────────────────

  /// Sent when an admin approves a provider application.
  ///
  /// SECURITY: this deliberately carries a single-use, time-limited
  /// activation link and **never a password**. The applicant chooses their
  /// own password through the link; no credential ever travels by email.
  async sendGuideApprovalEmail(
    email: string,
    params: { fullName: string; activationUrl: string; expiresInHours: number },
  ) {
    await this.sendEmail({
      from: this.resend ? this.resendFrom : undefined,
      to: email,
      subject: 'Your yoGuide provider application has been approved',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; padding: 20px;">
          <h2>Welcome to yoGuide, ${escapeHtml(params.fullName)}</h2>
          <p>Your application has been approved and your provider account is ready.</p>
          <p>Set your password to activate it:</p>
          <p style="margin: 24px 0;">
            <a href="${params.activationUrl}"
               style="background:#0C8A5B;color:#fff;padding:14px 28px;border-radius:8px;
                      text-decoration:none;font-weight:bold;display:inline-block;">
              Activate my account
            </a>
          </p>
          <p style="color:#555;font-size:14px;">
            This link can be used once and expires in ${params.expiresInHours} hours.
            If it expires, use “Forgot password” on the sign-in screen to get a new one.
          </p>
          <p style="color:#555;font-size:14px;">
            We will never email you a password. If you did not apply to yoGuide, ignore this message.
          </p>
        </div>
      `,
    });
  }

  async sendApplicationRejectedEmail(
    email: string,
    params: { fullName: string; reason?: string | null },
  ) {
    await this.sendEmail({
      from: this.resend ? this.resendFrom : undefined,
      to: email,
      subject: 'Update on your yoGuide provider application',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; padding: 20px;">
          <h2>Hello ${escapeHtml(params.fullName)}</h2>
          <p>Thank you for applying to join yoGuide. After review, we are not able to
             approve your application at this time.</p>
          ${params.reason ? `<p><strong>Reason:</strong> ${escapeHtml(params.reason)}</p>` : ''}
          <p>You are welcome to apply again once the points above are addressed.</p>
        </div>
      `,
    });
  }

  // ── Booking lifecycle ──────────────────────────────────────

  async sendBookingConfirmationEmail(
    email: string,
    params: {
      customerName: string;
      experience: string;
      date: string;
      reference: string;
      total: string;
    },
  ) {
    await this.sendEmail({
      from: this.resend ? this.resendFrom : undefined,
      to: email,
      subject: `Your yoGuide booking is confirmed — ${params.reference}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; padding: 20px;">
          <h2>You're booked, ${escapeHtml(params.customerName)}</h2>
          <p>Your payment is confirmed. Here are the details:</p>
          <table style="border-collapse:collapse;margin:16px 0;">
            ${row('Experience', params.experience)}
            ${row('Date', params.date)}
            ${row('Reference', params.reference)}
            ${row('Total paid', params.total)}
          </table>
          <p>Show your reference to your host on the day. Enjoy Rwanda.</p>
        </div>
      `,
    });
  }

  async sendBookingCancelledEmail(
    email: string,
    params: {
      customerName: string;
      experience: string;
      date: string;
      reference: string;
      refundSummary: string;
    },
  ) {
    await this.sendEmail({
      from: this.resend ? this.resendFrom : undefined,
      to: email,
      subject: `Your yoGuide booking was cancelled — ${params.reference}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; padding: 20px;">
          <h2>Booking cancelled</h2>
          <p>Hello ${escapeHtml(params.customerName)}, your booking has been cancelled.</p>
          <table style="border-collapse:collapse;margin:16px 0;">
            ${row('Experience', params.experience)}
            ${row('Date', params.date)}
            ${row('Reference', params.reference)}
            ${row('Refund', params.refundSummary)}
          </table>
        </div>
      `,
    });
  }

  async sendRefundIssuedEmail(
    email: string,
    params: { customerName: string; amount: string; reference: string },
  ) {
    await this.sendEmail({
      from: this.resend ? this.resendFrom : undefined,
      to: email,
      subject: `Your yoGuide refund is on its way — ${params.reference}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; padding: 20px;">
          <h2>Refund issued</h2>
          <p>Hello ${escapeHtml(params.customerName)}, we have issued a refund of
             <strong>${escapeHtml(params.amount)}</strong> for booking
             ${escapeHtml(params.reference)}.</p>
          <p>It can take a few business days to appear, depending on your payment method.</p>
        </div>
      `,
    });
  }
}

/// Minimal HTML escaping for values interpolated into email templates.
/// Names, reasons and experience titles are user-supplied, so they must not
/// be able to inject markup into an email we send on someone's behalf.
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function row(label: string, value: string): string {
  return `<tr>
    <td style="padding:6px 16px 6px 0;color:#555;">${escapeHtml(label)}</td>
    <td style="padding:6px 0;font-weight:bold;">${escapeHtml(value)}</td>
  </tr>`;
}
