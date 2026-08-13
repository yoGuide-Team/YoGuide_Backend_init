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
}
