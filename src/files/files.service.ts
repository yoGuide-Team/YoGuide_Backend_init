import { Injectable, UnauthorizedException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import { dirname, join } from 'path';

export const UPLOADS_ROOT = join(process.cwd(), 'uploads');

interface PendingUpload {
  userId: string;
  relativePath: string;
  contentType: string;
  expiresAt: number;
}

/// Real (but locally-hosted, not cloud) file storage. A signed upload gets
/// a short-lived token held in memory — fine for a single-process dev/small
/// deployment; swapping to S3/R2 later means replacing this service's
/// internals, not any caller's contract (POST /files/sign-upload's response
/// shape is unchanged from the old mock signer).
@Injectable()
export class FilesService {
  private readonly pending = new Map<string, PendingUpload>();

  createUploadToken(userId: string, relativePath: string, contentType: string): string {
    const token = randomUUID();
    this.pending.set(token, {
      userId,
      relativePath,
      contentType,
      expiresAt: Date.now() + 15 * 60 * 1000,
    });
    return token;
  }

  private consumeToken(token: string, userId: string): PendingUpload {
    const entry = this.pending.get(token);
    if (!entry || entry.expiresAt < Date.now() || entry.userId !== userId) {
      throw new UnauthorizedException('Upload link is invalid or has expired.');
    }
    this.pending.delete(token);
    return entry;
  }

  async saveUpload(token: string, userId: string, data: Buffer): Promise<string> {
    const entry = this.consumeToken(token, userId);
    const absolutePath = join(UPLOADS_ROOT, entry.relativePath);
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, data);
    return entry.relativePath;
  }
}
