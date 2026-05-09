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
  token: string;
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
    roleKey?: string;
  }): Promise<AuthSession> {
    const email = input.email.trim().toLowerCase();
    const requestedRole = input.roleKey ?? 'user';

    // Anyone can register, but only as `user`. Higher roles are assigned by
    // an admin through /admin/users — never by the user themselves.
    const roleKey = requestedRole === 'user' ? 'user' : 'user';

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('An account with that email already exists.');
    }

    // Make sure the role exists (the seed always provides 'user').
    const role = await this.prisma.role.findUnique({ where: { key: roleKey } });
    if (!role) {
      throw new NotFoundException(`Role '${roleKey}' is not configured.`);
    }

    const passwordHash = await bcrypt.hash(input.password, 10);
    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        fullName: input.fullName?.trim() || null,
        roleKey,
      },
    });

    return this.buildSession(user.id);
  }

  async login(input: { email: string; password: string }): Promise<AuthSession> {
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

  /// Verifies a JWT and re-fetches the user + role on every request so role
  /// changes (e.g. admin demoting a user) take effect immediately, without
  /// waiting for the JWT to expire.
  async verifyToken(token: string): Promise<AuthenticatedUser> {
    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired token.');
    }
    return this.loadAuthenticatedUser(payload.sub);
  }

  private async buildSession(userId: string): Promise<AuthSession> {
    const user = await this.loadAuthenticatedUser(userId);
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      roleKey: user.roleKey,
    };
    const token = await this.jwt.signAsync(payload);
    return { token, user };
  }

  private async loadAuthenticatedUser(userId: string): Promise<AuthenticatedUser> {
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
      fullName: user.fullName,
      roleKey: user.roleKey,
      roleLabel: user.role.label,
      permissions: user.role.permissions,
    };
  }
}
