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
}