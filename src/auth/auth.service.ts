import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import { OAuth2Client } from "google-auth-library";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthenticatedUser } from "./authenticated-user";

interface JwtPayload {
  sub: string;
  email: string;
  roleKey: string;
}

export interface AuthSession {
  access_token: string;
  user: AuthenticatedUser;
}

@Injectable()
export class AuthService {
  private readonly googleClient: OAuth2Client;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
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
  }): Promise<AuthSession> {
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
    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        fullName: input.fullName?.trim() ?? null,
        phone: input.phone?.trim() ?? null,
        cardNumber: input.cardNumber?.trim() ?? null,
        roleKey: effectiveRole,
      },
    });

    return this.buildSession(user.id);
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
    return this.buildSession(user.id);
  }

  // ── Google Sign-In ────────────────────────────────────────────────────────

  /**
   * Receives the ID token the Flutter `google_sign_in` package returns after
   * the user chooses a Google account, verifies it with Google's servers,
   * then either creates a new User row or logs into the existing one.
   *
   * Returns the same `{ access_token, user }` shape as email/password login
   * so the Flutter side needs no special handling.
   */
  async loginWithGoogle(idToken: string): Promise<AuthSession> {
    const clientId = this.config.get<string>("GOOGLE_CLIENT_ID");
    if (!clientId) {
      throw new UnauthorizedException(
        "Google Sign-In is not configured on this server.",
      );
    }

    // 1. Verify the token is genuine and issued for our app.
    let ticket;
    try {
      ticket = await this.googleClient.verifyIdToken({
        idToken,
        audience: clientId,
      });
    } catch {
      throw new UnauthorizedException("Invalid Google ID token.");
    }

    const payload = ticket.getPayload();
    if (!payload || !payload.email) {
      throw new UnauthorizedException(
        "Google token is missing required fields.",
      );
    }

    const { sub: googleId, email, name, picture } = payload;

    // 2. Look for an existing account — first by googleId, then by email
    //    (covers the case where a user registered with email+password first
    //    and is now signing in with the same Google account email).
    let user = await this.prisma.user.findFirst({
      where: { OR: [{ googleId }, { email: email.toLowerCase() }] },
    });

    if (user) {
      // Link googleId if this is an existing email-only account
      if (!user.googleId) {
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: {
            googleId,
            avatarUrl: user.avatarUrl ?? picture ?? null,
          },
        });
      }
    } else {
      // 3. New user — create account. Google accounts don't need a password.
      const role = await this.prisma.role.findUnique({
        where: { key: "user" },
      });
      if (!role) {
        throw new NotFoundException("Default role 'user' is not configured.");
      }
      user = await this.prisma.user.create({
        data: {
          email: email.toLowerCase(),
          passwordHash: "", // Google-only account — no password
          fullName: name ?? null,
          avatarUrl: picture ?? null,
          googleId,
          roleKey: "user",
        },
      });
    }

    return this.buildSession(user.id);
  }

  // ── Token verification (used by AuthGuard) ────────────────────────────────

  async verifyToken(token: string): Promise<AuthenticatedUser> {
    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException("Invalid or expired token.");
    }
    return this.loadAuthenticatedUser(payload.sub);
  }

  // ── helpers ───────────────────────────────────────────────────────────────

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
    };
  }
}

// import {
//   ConflictException,
//   Injectable,
//   NotFoundException,
//   UnauthorizedException,
// } from '@nestjs/common';
// import { JwtService } from '@nestjs/jwt';
// import * as bcrypt from 'bcryptjs';
// import { PrismaService } from '../prisma/prisma.service';
// import type { AuthenticatedUser } from './authenticated-user';

// interface JwtPayload {
//   sub: string;
//   email: string;
//   roleKey: string;
// }

// export interface AuthSession {
//   access_token: string; // ← renamed to match what Flutter reads: body['access_token']
//   user: AuthenticatedUser;
// }

// @Injectable()
// export class AuthService {
//   constructor(
//     private readonly prisma: PrismaService,
//     private readonly jwt: JwtService,
//   ) {}

//   async register(input: {
//     email: string;
//     password: string;
//     fullName?: string;
//     phone?: string;       // ← added: Flutter sends this
//     userType?: string;    // ← added: Flutter sends 'Visitor' | 'Resident' | 'Hospitality Card Holder'
//     cardNumber?: string;  // ← added: Flutter sends this for card holders
//     roleKey?: string;     // ← kept for backward compat
//   }): Promise<AuthSession> {
//     const email = input.email.trim().toLowerCase();

//     // Map Flutter's userType strings to backend role keys.
//     // Fall back to roleKey if userType is absent (API callers).
//     const roleKey = this.resolveRoleKey(input.userType ?? input.roleKey);

//     // First user with roleKey='admin' becomes admin; all others get 'user'.
//     const adminAlreadyExists = await this.prisma.user.findFirst({
//       where: { roleKey: 'admin' },
//     });
//     const effectiveRole =
//       roleKey === 'admin' && !adminAlreadyExists ? 'admin' : 'user';

//     const existing = await this.prisma.user.findUnique({ where: { email } });
//     if (existing) {
//       throw new ConflictException('An account with that email already exists.');
//     }

//     const role = await this.prisma.role.findUnique({
//       where: { key: effectiveRole },
//     });
//     if (!role) {
//       throw new NotFoundException(`Role '${effectiveRole}' is not configured.`);
//     }

//     const passwordHash = await bcrypt.hash(input.password, 10);
//     const user = await this.prisma.user.create({
//       data: {
//         email,
//         passwordHash,
//         fullName: input.fullName?.trim() ?? null,
//         phone: input.phone?.trim() ?? null,         // ← store phone
//         cardNumber: input.cardNumber?.trim() ?? null, // ← store card number
//         roleKey: effectiveRole,
//       },
//     });

//     return this.buildSession(user.id);
//   }

//   async login(input: {
//     email: string;
//     password: string;
//   }): Promise<AuthSession> {
//     const email = input.email.trim().toLowerCase();
//     const user = await this.prisma.user.findUnique({ where: { email } });
//     if (!user) {
//       throw new UnauthorizedException('Invalid email or password.');
//     }
//     const ok = await bcrypt.compare(input.password, user.passwordHash);
//     if (!ok) {
//       throw new UnauthorizedException('Invalid email or password.');
//     }
//     return this.buildSession(user.id);
//   }

//   async verifyToken(token: string): Promise<AuthenticatedUser> {
//     let payload: JwtPayload;
//     try {
//       payload = await this.jwt.verifyAsync<JwtPayload>(token);
//     } catch {
//       throw new UnauthorizedException('Invalid or expired token.');
//     }
//     return this.loadAuthenticatedUser(payload.sub);
//   }

//   // ── helpers ──────────────────────────────────────────────────────────────

//   /**
//    * Maps Flutter userType strings → backend role keys.
//    * Visitor / Resident / Hospitality Card Holder all become 'user'.
//    * Unknown values default to 'user'.
//    */
//   private resolveRoleKey(value?: string): string {
//     if (!value) return 'user';
//     const map: Record<string, string> = {
//       Visitor: 'user',
//       Resident: 'user',
//       'Hospitality Card Holder': 'user',
//       admin: 'admin',
//       user: 'user',
//     };
//     return map[value] ?? 'user';
//   }

//   private async buildSession(userId: string): Promise<AuthSession> {
//     const user = await this.loadAuthenticatedUser(userId);
//     const payload: JwtPayload = {
//       sub: user.id,
//       email: user.email,
//       roleKey: user.roleKey,
//     };
//     const access_token = await this.jwt.signAsync(payload);
//     return { access_token, user };
//   }

//   private async loadAuthenticatedUser(
//     userId: string,
//   ): Promise<AuthenticatedUser> {
//     const user = await this.prisma.user.findUnique({
//       where: { id: userId },
//       include: { role: true },
//     });
//     if (!user) {
//       throw new UnauthorizedException('User no longer exists.');
//     }
//     return {
//       id: user.id,
//       email: user.email,
//       fullName: user.fullName ?? null,  // ← safe null, not forced String
//       roleKey: user.roleKey,
//       roleLabel: user.role.label,
//       permissions: user.role.permissions,
//     };
//   }
// }
