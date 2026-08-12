import { Global, Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { AuthService } from "./auth.service";
import { AuthController } from "./auth.controller";
import { AuthGuard } from "./auth.guard";
import { PermissionsGuard } from "./permissions.guard";
import { IdentityVerifiedGuard } from "./identity-verified.guard";

@Global()
@Module({
  imports: [
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const secret = config.get<string>("JWT_SECRET");
        if (!secret) {
          throw new Error(
            "Missing JWT_SECRET environment variable. Add JWT_SECRET to your .env file.",
          );
        }
        return {
          secret,
          signOptions: {
            expiresIn: config.get<string>("JWT_EXPIRES_IN") ?? "30d",
          },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, AuthGuard, PermissionsGuard, IdentityVerifiedGuard],
  exports: [AuthService, AuthGuard, PermissionsGuard, IdentityVerifiedGuard],
})
export class AuthModule {}

// import { Global, Module } from '@nestjs/common';
// import { ConfigModule, ConfigService } from '@nestjs/config';
// import { JwtModule } from '@nestjs/jwt';
// import { AuthService } from './auth.service';
// import { AuthController } from './auth.controller';
// import { AuthGuard } from './auth.guard';
// import { PermissionsGuard } from './permissions.guard';

// @Global()
// @Module({
//   imports: [
//     JwtModule.registerAsync({
//       imports: [ConfigModule],
//       inject: [ConfigService],
//       useFactory: (config: ConfigService) => ({
//         secret: config.get<string>('JWT_SECRET'),
//         signOptions: { expiresIn: config.get<string>('JWT_EXPIRES_IN') ?? '30d' },
//       }),
//     }),
//   ],
//   controllers: [AuthController],
//   providers: [AuthService, AuthGuard, PermissionsGuard],
//   exports: [AuthService, AuthGuard, PermissionsGuard],
// })
// export class AuthModule {}
