import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { AccountProvisioningService } from './account-provisioning.service';

class ActivateAccountDto {
  @IsString()
  @MinLength(16)
  @MaxLength(200)
  token!: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters.' })
  @MaxLength(200)
  password!: string;
}

/// Account activation for provisioned provider accounts.
///
/// Lives here rather than on AuthController because the provisioning
/// service that issues these tokens belongs to this module, and routing a
/// path prefix from another module is the cheaper of the two couplings.
@ApiTags('Account')
@Controller('auth')
export class ActivationController {
  constructor(private readonly provisioning: AccountProvisioningService) {}

  @Post('activate')
  // Tokens are 256-bit, but rate limiting still matters: it turns an
  // already-infeasible guessing attack into an obviously-detectable one.
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @ApiOperation({
    summary: 'Set a password using an activation link',
    description:
      'Completes provider account activation. The token comes from the approval email, ' +
      'is single-use, and expires. On success the account can sign in normally.',
  })
  async activate(@Body() dto: ActivateAccountDto) {
    const user = await this.provisioning.activate(dto.token, dto.password);
    return {
      ok: true,
      email: user.email,
      message: 'Your account is active. You can now sign in.',
    };
  }
}
