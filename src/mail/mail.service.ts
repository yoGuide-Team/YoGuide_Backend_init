import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { Resend } from 'resend';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly gmailUser = process.env.GMAIL_USER?.trim();
  private readonly gmailAppPassword = process.env.GMAIL_APP_PASSWORD?.trim();
  private readonly resendApiKey = process.env.RESEND_API_KEY?.trim();
  private readonly resendFrom = process.env.RESEND_FROM_EMAIL?.trim() || this.gmailUser || 'no-reply@yoguide.app';

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
            : resendResult.error && typeof resendResult.error === 'object' && 'message' in resendResult.error
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
          this.logger.warn(
            `Falling back to Resend because Gmail failed for ${options.to}.`,
          );
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
        const errorMessage =
          resendError instanceof Error
            ? resendError.message
            : JSON.stringify(resendError);

        this.logger.error(
          `Resend email delivery failed for ${options.to}: ${errorMessage}`,
        );

        if (this.transporter) {
          this.logger.warn(
            `Falling back to Gmail because Resend failed for ${options.to}.`,
          );
          try {
            return await sendViaGmail();
          } catch (gmailError) {
            this.logger.error(
              `Gmail fallback also failed for ${options.to}: ${
                gmailError instanceof Error ? gmailError.message : JSON.stringify(gmailError)
              }`,
            );
            this.logEmailPreview({ from, to: options.to, subject: options.subject, html: options.html });
            return;
          }
        }

        if (this.isResendDomainVerificationError(resendError)) {
          this.logger.error(
            `Resend domain verification failed for ${options.to}. Email will not be sent unless an alternate provider is configured.`,
          );
          this.logEmailPreview({ from, to: options.to, subject: options.subject, html: options.html });
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
    this.logger.warn(`No working email provider configured for ${options.to}. Showing email preview in the server logs.`);
    this.logger.log(`Email preview for ${options.to}:
From: ${options.from}
Subject: ${options.subject}

${options.html}`);
  }

  async sendPasswordResetEmail(email: string, name: string, resetUrl: string) {
    try {
      await this.sendEmail({
        from: this.resend ? this.resendFrom : undefined,
        to: email,
        subject: 'Reset your yoGuide password',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; padding: 20px;">
            <h2>Hello ${name},</h2>
            <p>You requested a password reset for your yoGuide account.</p>
            <p style="margin: 24px 0;">
              <a href="${resetUrl}" style="background-color: #0070f3; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">Reset Password</a>
            </p>
            <p>If the button does not work, copy and paste this link into your browser:</p>
            <p style="word-break: break-all; color: #065f46;">${resetUrl}</p>
            <p>This link expires in 30 minutes.</p>
          </div>
        `,
      });
      this.logger.log(`Password reset email sent to ${email}`);
    } catch (error) {
      this.logger.error(`Failed to send password reset email to ${email}:`, error);
    }
  }

  async sendOtpEmail(email: string, code: string) {
    try {
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
      this.logger.log(`OTP verification email sent to ${email}`);
    } catch (error) {
      this.logger.error(`Failed to send OTP email to ${email}:`, error);
    }
  }

  async sendApplicationStatusEmail(
    email: string,
    name: string,
    entityType: string,
    status: 'approved' | 'rejected',
    reason?: string | null,
  ) {
    try {
      const isApproved = status === 'approved';
      await this.sendEmail({
        from: this.resend ? this.resendFrom : undefined,
        to: email,
        subject: isApproved
          ? `Your ${entityType} application was approved`
          : `Your ${entityType} application needs changes`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; padding: 20px;">
            <h2>Hello ${name},</h2>
            ${
              isApproved
                ? `<p>Your ${entityType} application has been <strong style="color:#0C8A5B;">approved</strong>. You can now access the related dashboard.</p>`
                : `<p>Your ${entityType} application was <strong style="color:#B42318;">rejected</strong>.</p>
                   <p>Reason: ${reason ?? 'No reason provided.'}</p>
                   <p>You're welcome to update your details and resubmit.</p>`
            }
          </div>
        `,
      });
      this.logger.log(`Application status (${status}) email sent to ${email}`);
    } catch (error) {
      this.logger.error(`Failed to send application status email to ${email}:`, error);
    }
  }

  async sendBookingConfirmationEmail(
    email: string,
    name: string,
    booking: {
      id: string;
      type: string;
      totalCents: number;
      currency: string;
      scheduledAt?: Date | null;
      title?: string | null;
    },
  ) {
    try {
      const amount = (booking.totalCents / 100).toFixed(2);
      const when = booking.scheduledAt
        ? new Date(booking.scheduledAt).toLocaleString('en-GB', {
            dateStyle: 'medium',
            timeStyle: 'short',
          })
        : 'To be confirmed';
      await this.sendEmail({
        from: this.resend ? this.resendFrom : undefined,
        to: email,
        subject: `Booking confirmed${booking.title ? `: ${booking.title}` : ''}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; padding: 20px;">
            <h2>Hello ${name},</h2>
            <p>Your booking is confirmed. Here are the details:</p>
            <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
              <tr><td style="padding: 6px 0; color: #667085;">Booking ref</td><td style="padding: 6px 0; text-align: right;">${booking.id}</td></tr>
              ${booking.title ? `<tr><td style="padding: 6px 0; color: #667085;">Experience</td><td style="padding: 6px 0; text-align: right;">${booking.title}</td></tr>` : ''}
              <tr><td style="padding: 6px 0; color: #667085;">When</td><td style="padding: 6px 0; text-align: right;">${when}</td></tr>
              <tr><td style="padding: 6px 0; color: #667085;">Total</td><td style="padding: 6px 0; text-align: right; font-weight: bold; color: #0C8A5B;">${amount} ${booking.currency}</td></tr>
            </table>
            <p>You can message your guide and review your booking any time in the yoGuide app.</p>
          </div>
        `,
      });
      this.logger.log(`Booking confirmation email sent to ${email}`);
    } catch (error) {
      this.logger.error(`Failed to send booking confirmation email to ${email}:`, error);
    }
  }
}
