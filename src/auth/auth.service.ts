import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from './authenticated-user';

interface JwtPayload {
  sub: string;
  email: string;
  roleKey: string;
}

export interface AuthSession {
  access_token: string; // ← renamed to match what Flutter reads: body['access_token']
  user: AuthenticatedUser;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async register(input: {
    email: string;
    password: string;
    fullName?: string;
    phone?: string;       // ← added: Flutter sends this
    userType?: string;    // ← added: Flutter sends 'Visitor' | 'Resident' | 'Hospitality Card Holder'
    cardNumber?: string;  // ← added: Flutter sends this for card holders
    roleKey?: string;     // ← kept for backward compat
  }): Promise<AuthSession> {
    const email = input.email.trim().toLowerCase();

    // Map Flutter's userType strings to backend role keys.
    // Fall back to roleKey if userType is absent (API callers).
    const roleKey = this.resolveRoleKey(input.userType ?? input.roleKey);

    // First user with roleKey='admin' becomes admin; all others get 'user'.
    const adminAlreadyExists = await this.prisma.user.findFirst({
      where: { roleKey: 'admin' },
    });
    const effectiveRole =
      roleKey === 'admin' && !adminAlreadyExists ? 'admin' : 'user';

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('An account with that email already exists.');
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
        phone: input.phone?.trim() ?? null,         // ← store phone
        cardNumber: input.cardNumber?.trim() ?? null, // ← store card number
        roleKey: effectiveRole,
      },
    });

    return this.buildSession(user.id);
  }

  async login(input: {
    email: string;
    password: string;
  }): Promise<AuthSession> {
    const email = input.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new UnauthorizedException('Invalid email or password.');
    }
    const ok = await bcrypt.compare(input.password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Invalid email or password.');
    }
    return this.buildSession(user.id);
  }

  async verifyToken(token: string): Promise<AuthenticatedUser> {
    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired token.');
    }
    return this.loadAuthenticatedUser(payload.sub);
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  /**
   * Maps Flutter userType strings → backend role keys.
   * Visitor / Resident / Hospitality Card Holder all become 'user'.
   * Unknown values default to 'user'.
   */
  private resolveRoleKey(value?: string): string {
    if (!value) return 'user';
    const map: Record<string, string> = {
      Visitor: 'user',
      Resident: 'user',
      'Hospitality Card Holder': 'user',
      admin: 'admin',
      user: 'user',
    };
    return map[value] ?? 'user';
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
      throw new UnauthorizedException('User no longer exists.');
    }
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName ?? null,  // ← safe null, not forced String
      roleKey: user.roleKey,
      roleLabel: user.role.label,
      permissions: user.role.permissions,
    };
  }
}