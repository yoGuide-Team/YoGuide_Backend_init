import { Injectable, Logger } from "@nestjs/common";
import * as nodemailer from "nodemailer";

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });

  async sendPasswordResetEmail(email: string, name: string, resetUrl: string) {
    try {
      await this.transporter.sendMail({
        from: `"yoGuide Team" <${process.env.GMAIL_USER}>`,
        to: email,
        subject: "Reset your yoGuide password",
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; padding: 20px;">
            <h2>Hello ${name},</h2>
            <p>You requested a password reset for your yoGuide account.</p>
            <p style="margin: 24px 0;">
              <a href="${resetUrl}" style="background-color: #0070f3; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">Reset Password</a>
            </p>
            <p>This link expires in 30 minutes.</p>
          </div>
        `,
      });
      this.logger.log(`Password reset email sent to ${email}`);
    } catch (error) {
      this.logger.error(`Failed to send password reset email to ${email}:`, error);
      throw error;
    }
  }

  async sendOtpEmail(email: string, code: string) {
    try {
      await this.transporter.sendMail({
        from: `"yoGuide Team" <${process.env.GMAIL_USER}>`,
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
      throw error;
    }
  }
}