import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { PermissionsGuard } from './permissions.guard';

@Global()
@Module({
  imports: [
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const secret = config.get<string>('JWT_SECRET');
        if (!secret) {
          throw new Error('Missing JWT_SECRET environment variable.');
        }
        return {
          secret,
          signOptions: {
            // Was '30d'. A month-long, non-revocable bearer token on an app
            // that moves money is too long a window for a stolen device or
            // leaked token. 7d keeps sessions comfortable without a refresh
            // -token system, which does not exist yet; shorten further once
            // refresh-token rotation is added.
            expiresIn: config.get<string>('JWT_EXPIRES_IN') ?? '7d',
          },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, AuthGuard, PermissionsGuard],
  exports: [AuthService, AuthGuard, PermissionsGuard],
})
export class AuthModule {}
