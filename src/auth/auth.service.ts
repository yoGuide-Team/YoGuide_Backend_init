import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
  BadRequestException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import { OAuth2Client } from "google-auth-library";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthenticatedUser } from "./authenticated-user";
import { MailService } from "../mail/mail.service";
import { randomBytes, createHash } from "node:crypto";

interface JwtPayload {
  sub: string;
  email: string;
  roleKey: string;
}

export interface AuthSession {
  access_token: string;
  user: AuthenticatedUser;
}

export interface RegisterResult {
  requiresVerification: boolean;
  email: string;
  message: string;
}

@Injectable()
export class AuthService {
  private readonly googleClient: OAuth2Client;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly mailService: MailService,
  ) {
    this.googleClient = new OAuth2Client(
      this.config.get<string>("GOOGLE_CLIENT_ID"),
    );
  }

  // ── Email + password register ─────────────────────────────────────────────

  async register(input: {
    email: string;
    password: string;
    fullName?: string;
    phone?: string;
    userType?: string;
    cardNumber?: string;
    roleKey?: string;
  }): Promise<RegisterResult> {
    const email = input.email.trim().toLowerCase();
    const roleKey = this.resolveRoleKey(input.userType ?? input.roleKey);

    const adminAlreadyExists = await this.prisma.user.findFirst({
      where: { roleKey: "admin" },
    });
    const effectiveRole =
      roleKey === "admin" && !adminAlreadyExists ? "admin" : "user";

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException("An account with that email already exists.");
    }

    const role = await this.prisma.role.findUnique({
      where: { key: effectiveRole },
    });
    if (!role) {
      throw new NotFoundException(`Role '${effectiveRole}' is not configured.`);
    }

    const passwordHash = await bcrypt.hash(input.password, 10);

    // Generate 6-digit verification code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const codeHash = createHash("sha256").update(code).digest("hex");
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        fullName: input.fullName?.trim() ?? null,
        phone: input.phone?.trim() ?? null,
        cardNumber: input.cardNumber?.trim() ?? null,
        roleKey: effectiveRole,
        emailVerified: false,
        otpCodeHash: codeHash,
        otpExpiresAt: expiresAt,
      },
    });

    console.log("\n=======================================================");
    console.log("🔑 REGISTRATION OTP CODE:", code, "for", user.email);
    console.log("=======================================================\n");

    await this.mailService.sendOtpEmail(user.email, code);

    return {
      requiresVerification: true,
      email: user.email,
      message:
        "Registration successful. Please enter the verification code sent to your email.",
    };
  }

  // ── Email + password login ────────────────────────────────────────────────

  async login(input: {
    email: string;
    password: string;
  }): Promise<AuthSession> {
    const email = input.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException("Invalid email or password.");
    }

    const ok = await bcrypt.compare(input.password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException("Invalid email or password.");
    }

    // 🔑 Block unverified email accounts from obtaining a JWT session
    if (!user.emailVerified) {
      // Re-issue a fresh OTP code automatically
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const codeHash = createHash("sha256").update(code).digest("hex");
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

      await this.prisma.user.update({
        where: { id: user.id },
        data: { otpCodeHash: codeHash, otpExpiresAt: expiresAt },
      });

      console.log("\n=======================================================");
      console.log("🔑 UNVERIFIED LOGIN OTP CODE:", code, "for", user.email);
      console.log("=======================================================\n");

      await this.mailService.sendOtpEmail(user.email, code);

      throw new UnauthorizedException(
        "EMAIL_NOT_VERIFIED: Your email is not verified. A new verification code has been sent to your email.",
      );
    }

    return this.buildSession(user.id);
  }

  // ── Google Sign-In ────────────────────────────────────────────────────────

  async loginWithGoogle(token: string): Promise<AuthSession> {
    const clientId = this.config.get<string>("GOOGLE_CLIENT_ID");
    if (!clientId) {
      throw new UnauthorizedException(
        "Google Sign-In is not configured on this server.",
      );
    }

    let googleId: string;
    let email: string;
    let name: string | undefined;
    let picture: string | undefined;

    const looksLikeJwt = token.split(".").length === 3;

    if (looksLikeJwt) {
      let ticket;
      try {
        ticket = await this.googleClient.verifyIdToken({
          idToken: token,
          audience: clientId,
        });
      } catch {
        throw new UnauthorizedException("Invalid Google ID token.");
      }
      const payload = ticket.getPayload();
      if (!payload?.email) {
        throw new UnauthorizedException(
          "Google token is missing required fields.",
        );
      }
      googleId = payload.sub;
      email = payload.email;
      name = payload.name;
      picture = payload.picture;
    } else {
      const res = await fetch(`https://www.googleapis.com/oauth2/v3/userinfo`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        throw new UnauthorizedException("Invalid Google access token.");
      }
      const info = (await res.json()) as {
        sub: string;
        email: string;
        name?: string;
        picture?: string;
        email_verified?: boolean;
      };
      if (!info.email || !info.sub) {
        throw new UnauthorizedException(
          "Google token is missing required fields.",
        );
      }
      googleId = info.sub;
      email = info.email;
      name = info.name;
      picture = info.picture;
    }

    let user = await this.prisma.user.findFirst({
      where: { OR: [{ googleId }, { email: email.toLowerCase() }] },
    });

    if (user) {
      if (!user.googleId || !user.emailVerified) {
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: {
            googleId,
            avatarUrl: user.avatarUrl ?? picture ?? null,
            emailVerified: true, // Google already verified this email
          },
        });
      }
    } else {
      const role = await this.prisma.role.findUnique({
        where: { key: "user" },
      });
      if (!role) {
        throw new NotFoundException("Default role 'user' is not configured.");
      }
      user = await this.prisma.user.create({
        data: {
          email: email.toLowerCase(),
          passwordHash: "",
          fullName: name ?? null,
          avatarUrl: picture ?? null,
          googleId,
          roleKey: "user",
          emailVerified: true, // Automatically trusted from Google OAuth
        },
      });
    }

    return this.buildSession(user.id);
  }

  // ── Public OTP Verification & Resend ──────────────────────────────────────

async verifyRegisterOtp(email: string, code: string): Promise<AuthSession> {
  if (!email || typeof email !== "string") {
    throw new BadRequestException("Email is required.");
  }
  if (!code || typeof code !== "string") {
    throw new BadRequestException("OTP code is required.");
  }

  const targetEmail = email.trim().toLowerCase();
  const codeHash = createHash("sha256").update(code.trim()).digest("hex");

  const user = await this.prisma.user.findFirst({
    where: {
      email: targetEmail,
      otpCodeHash: codeHash,
      otpExpiresAt: { gt: new Date() },
    },
  });

  if (!user) {
    throw new UnauthorizedException("Invalid or expired verification code.");
  }

  await this.prisma.user.update({
    where: { id: user.id },
    data: { emailVerified: true, otpCodeHash: null, otpExpiresAt: null },
  });

  return this.buildSession(user.id);
}

 async sendOtpByEmail(email: string) {
  if (!email || typeof email !== "string") {
    throw new BadRequestException("Email is required.");
  }

  const targetEmail = email.trim().toLowerCase();
  const user = await this.prisma.user.findUnique({
    where: { email: targetEmail },
  });

  if (!user) {
    return {
      message: "If an account exists for that email, a code has been sent.",
    };
  }

  // 🔑 Check if email is already verified
  if (user.emailVerified) {
    return {
      message: "This email is already verified. You can log in directly.",
    };
  }

  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const codeHash = createHash("sha256").update(code).digest("hex");
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await this.prisma.user.update({
    where: { id: user.id },
    data: { otpCodeHash: codeHash, otpExpiresAt: expiresAt },
  });

  console.log("\n=======================================================");
  console.log("🔑 RESENT OTP CODE:", code, "for", user.email);
  console.log("=======================================================\n");

  await this.mailService.sendOtpEmail(user.email, code);

  return { message: "Verification code sent." };
}
  // ── Authenticated User OTP Verification ──────────────────────────

  async sendOtp(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException("User no longer exists.");
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const codeHash = createHash("sha256").update(code).digest("hex");
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await this.prisma.user.update({
      where: { id: userId },
      data: { otpCodeHash: codeHash, otpExpiresAt: expiresAt },
    });

    console.log("\n=======================================================");
    console.log("🔑 OTP CODE:", code, "for", user.email);
    console.log("=======================================================\n");

    await this.mailService.sendOtpEmail(user.email, code);

    return { message: "Verification code sent." };
  }

  async verifyOtp(userId: string, code: string) {
    const codeHash = createHash("sha256").update(code).digest("hex");

    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
        otpCodeHash: codeHash,
        otpExpiresAt: { gt: new Date() },
      },
    });

    if (!user) {
      throw new UnauthorizedException("Invalid or expired verification code.");
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { emailVerified: true, otpCodeHash: null, otpExpiresAt: null },
    });

    return { emailVerified: true };
  }

  // ── Password Reset ────────────────────────────────────────────────────────

  async forgotPassword(email: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });

    if (!user) {
      return {
        message:
          "If an account exists for that email, a reset link has been sent.",
      };
    }

    const token = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetToken: tokenHash,
        passwordResetExpiresAt: expiresAt,
      },
    });

    const frontendUrl =
      this.config.get<string>("FRONTEND_URL") ?? "http://localhost:3000";

    const resetUrl = frontendUrl.endsWith("/reset-password")
      ? `${frontendUrl}?token=${token}`
      : `${frontendUrl}/reset-password?token=${token}`;

    console.log("\n=======================================================");
    console.log("🔑 RAW TOKEN:", token);
    console.log("🔗 RESET URL:", resetUrl);
    console.log("=======================================================\n");

    await this.mailService.sendPasswordResetEmail(
      user.email,
      user.fullName ?? "User",
      resetUrl,
    );

    return {
      message:
        "If an account exists for that email, a reset link has been sent.",
    };
  }

  async resetPassword(token: string, password: string) {
    const tokenHash = createHash("sha256").update(token).digest("hex");

    const user = await this.prisma.user.findFirst({
      where: {
        passwordResetToken: tokenHash,
        passwordResetExpiresAt: { gt: new Date() },
      },
    });

    if (!user) {
      throw new UnauthorizedException("Invalid or expired reset token.");
    }

    const passwordHash = await bcrypt.hash(password, 10);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        passwordResetToken: null,
        passwordResetExpiresAt: null,
      },
    });

    return { message: "Password reset successful." };
  }

  // ── Token verification & Helpers ──────────────────────────────────────────

  async verifyToken(token: string): Promise<AuthenticatedUser> {
    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException("Invalid or expired token.");
    }
    return this.loadAuthenticatedUser(payload.sub);
  }

  private resolveRoleKey(value?: string): string {
    if (!value) return "user";
    const map: Record<string, string> = {
      Visitor: "user",
      Resident: "user",
      "Hospitality Card Holder": "user",
      admin: "admin",
      user: "user",
    };
    return map[value] ?? "user";
  }

  private async buildSession(userId: string): Promise<AuthSession> {
    const user = await this.loadAuthenticatedUser(userId);
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      roleKey: user.roleKey,
    };
    const access_token = await this.jwt.signAsync(payload);
    return { access_token, user };
  }

  private async loadAuthenticatedUser(
    userId: string,
  ): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { role: true },
    });
    if (!user) {
      throw new UnauthorizedException("User no longer exists.");
    }
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName ?? null,
      roleKey: user.roleKey,
      roleLabel: user.role.label,
      permissions: user.role.permissions,
      emailVerified: user.emailVerified,
    };
  }
}