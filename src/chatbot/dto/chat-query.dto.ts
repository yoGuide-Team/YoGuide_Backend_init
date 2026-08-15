import { IsArray, IsOptional, IsString, ValidateNested } from 'class-validator';

class ChatHistoryItemDto {
  @IsOptional()
  @IsString()
  role?: 'user' | 'assistant';

  @IsOptional()
  @IsString()
  content?: string;
}

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

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  history?: ChatHistoryItemDto[];
}
