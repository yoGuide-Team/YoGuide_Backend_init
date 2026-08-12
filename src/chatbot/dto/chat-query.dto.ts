import { IsOptional, IsString } from 'class-validator';

export class ChatQueryDto {
  @IsOptional()
  @IsString()
  message?: string;

  @IsOptional()
  @IsString()
  text?: string;

  @IsOptional()
  @IsString()
  userId?: string;
}
