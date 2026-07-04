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

    // Try verifying as an ID token (JWT) first — used on Android/iOS.
    // If that fails, treat it as an access token (used on web) and verify
    // via Google's tokeninfo endpoint.
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
      // Access token path — used by google_sign_in on web.
      // Verify via Google's userinfo endpoint.
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

    // Find or create the user
    let user = await this.prisma.user.findFirst({
      where: { OR: [{ googleId }, { email: email.toLowerCase() }] },
    });

    if (user) {
      if (!user.googleId) {
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: { googleId, avatarUrl: user.avatarUrl ?? picture ?? null },
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
