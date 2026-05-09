import { BadRequestException, Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, Matches, Min } from 'class-validator';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/authenticated-user';

class SignUploadDto {
  @IsString() filename!: string;
  @IsString() @Matches(/^[\w-]+\/[\w.+-]+$/) contentType!: string;
  @IsOptional() @IsInt() @Min(1) sizeBytes?: number;
  @IsOptional() @IsIn(['user.avatar', 'guide.avatar', 'guide.document', 'place.image', 'product.image', 'misc'])
  purpose?: string;
}

@ApiTags('Files')
@ApiBearerAuth('access-token')
@Controller('files')
@UseGuards(AuthGuard)
export class FilesController {
  @Post('sign-upload')
  @ApiOperation({
    summary: 'Sign an upload (mock)',
    description:
      "Returns a (mock) presigned URL the client uploads to via PUT, plus the canonical URL the file will live at. Replace this with a real S3/Cloudflare R2 signer when storage is wired.",
  })
  sign(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SignUploadDto,
  ) {
    if (!dto.contentType.startsWith('image/') && !dto.contentType.startsWith('application/pdf')) {
      throw new BadRequestException('Only images and PDFs are accepted right now.');
    }
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const purpose = dto.purpose ?? 'misc';
    const cleanName = dto.filename.replace(/[^\w.-]+/g, '_');
    const path = `${purpose}/${user.id}/${id}-${cleanName}`;
    return {
      uploadUrl: `https://uploads.example.com/sign/${path}?expires=900`,
      method: 'PUT',
      contentType: dto.contentType,
      url: `https://cdn.yoguide.app/${path}`,
      expiresInSeconds: 900,
    };
  }
}
