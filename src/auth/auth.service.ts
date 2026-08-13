import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from './authenticated-user';

interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
}

export interface AuthSession {
  access_token: string;
  user: AuthenticatedUser;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(input: {
    email: string;
    password: string;
    fullName: string;
    nationality: string;
    phone?: string;
    role?: UserRole;
  }): Promise<AuthSession> {
    const email = input.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('An account with this email already exists.');
    }

    const adminExists = await this.prisma.user.findFirst({
      where: { role: UserRole.ADMIN },
    });
    const role =
      input.role === UserRole.ADMIN && !adminExists
        ? UserRole.ADMIN
        : input.role ?? UserRole.TOURIST;

    const password = await bcrypt.hash(input.password, 10);
    const user = await this.prisma.user.create({
      data: {
        email,
        password,
        fullName: input.fullName.trim(),
        nationality: input.nationality.trim(),
        phone: input.phone?.trim(),
        role,
      },
    });

    return this.buildSession(user.id);
  }

  async login(input: { email: string; password: string }): Promise<AuthSession> {
    const email = input.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new NotFoundException('No account found with this email.');
    }

    const ok = await bcrypt.compare(input.password, user.password);
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

  private permissionsForRole(role: UserRole): string[] {
    if (role === UserRole.ADMIN) return ['*'];
    if (role === UserRole.GUIDE) {
      return ['guides.read', 'guides.write', 'bookings.read'];
    }
    return [];
  }

  private async buildSession(userId: string): Promise<AuthSession> {
    const user = await this.loadAuthenticatedUser(userId);
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.roleKey as UserRole,
    };
    const access_token = await this.jwt.signAsync(payload);
    return { access_token, user };
  }

  private async loadAuthenticatedUser(userId: string): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('User no longer exists.');
    }
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      roleKey: user.role,
      roleLabel: user.role,
      permissions: this.permissionsForRole(user.role),
      emailVerified: true,
      identityStatus: 'approved',
    };
  }
}
