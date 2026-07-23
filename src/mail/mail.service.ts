// src/mail/mail.service.ts

import { Injectable } from "@nestjs/common";
import { Resend } from "resend";

@Injectable()
export class MailService {
  private readonly resend = new Resend(process.env.RESEND_API_KEY);

  async sendPasswordResetEmail(
    email: string,
    name: string,
    resetUrl: string,
  ) {
    await this.resend.emails.send({
      from: "onboarding@resend.dev",
      to: email,
      subject: "Reset your yoGuide password",
      html: `
        <h2>Hello ${name}</h2>

        <p>You requested a password reset.</p>

        <p>
          <a href="${resetUrl}">
            Reset Password
          </a>
        </p>

        <p>This link expires in 30 minutes.</p>

        <p>If you didn't request this, you can ignore this email.</p>
      `,
    });
  }

  async sendOtpEmail(email: string, code: string) {
    await this.resend.emails.send({
      from: "onboarding@resend.dev",
      to: email,
      subject: `${code} is your yoGuide verification code`,
      html: `
        <h2>Verify your email</h2>

        <p>Your yoGuide verification code is:</p>

        <p style="font-size: 32px; font-weight: bold; letter-spacing: 4px;">${code}</p>

        <p>This code expires in 10 minutes.</p>

        <p>If you didn't request this, you can ignore this email.</p>
      `,
    });
  }
}