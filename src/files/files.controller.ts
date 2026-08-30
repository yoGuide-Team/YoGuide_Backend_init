import {
  BadRequestException,
  Body,
  Controller,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, Matches, Min } from 'class-validator';
import type { Request } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { FilesService } from './files.service';

class SignUploadDto {
  @IsString() filename!: string;
  @IsString() @Matches(/^[\w-]+\/[\w.+-]+$/) contentType!: string;
  @IsOptional() @IsInt() @Min(1) sizeBytes?: number;
  @IsOptional() @IsIn(['user.avatar', 'guide.avatar', 'guide.document', 'place.image', 'product.image', 'misc'])
  purpose?: string;
}

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

function originOf(req: Request): string {
  return `${req.protocol}://${req.get('host')}`;
}

@ApiTags('Files')
@ApiBearerAuth('access-token')
@Controller('files')
@UseGuards(AuthGuard)
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Post('sign-upload')
  @ApiOperation({
    summary: 'Sign an upload',
    description:
      'Returns a short-lived upload URL (PUT the file bytes there) and the canonical URL it will be reachable at afterwards. Backed by real local-disk storage under uploads/.',
  })
  sign(
    @Req() req: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SignUploadDto,
  ) {
    if (!dto.contentType.startsWith('image/') && !dto.contentType.startsWith('application/pdf')) {
      throw new BadRequestException('Only images and PDFs are accepted right now.');
    }
    if (dto.sizeBytes && dto.sizeBytes > MAX_UPLOAD_BYTES) {
      throw new BadRequestException('File is too large (max 15MB).');
    }
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const purpose = dto.purpose ?? 'misc';
    const cleanName = dto.filename.replace(/[^\w.-]+/g, '_');
    const relativePath = `${purpose}/${user.id}/${id}-${cleanName}`;
    const token = this.files.createUploadToken(user.id, relativePath, dto.contentType);
    const origin = originOf(req);
    return {
      uploadUrl: `${origin}/files/upload/${token}`,
      method: 'PUT',
      contentType: dto.contentType,
      url: `${origin}/uploads/${relativePath}`,
      expiresInSeconds: 900,
    };
  }

  @Put('upload/:token')
  @ApiOperation({ summary: 'Upload the file bytes for a previously signed token' })
  async upload(
    @CurrentUser() user: AuthenticatedUser,
    @Param('token') token: string,
    @Req() req: Request,
  ) {
    const body = req.body;
    if (!Buffer.isBuffer(body) || body.length === 0) {
      throw new BadRequestException('Request body must be the raw file bytes.');
    }
    if (body.length > MAX_UPLOAD_BYTES) {
      throw new BadRequestException('File is too large (max 15MB).');
    }
    const relativePath = await this.files.saveUpload(token, user.id, body);
    return { ok: true, path: relativePath };
  }
}
