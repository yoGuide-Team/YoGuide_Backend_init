import { IsString, MinLength } from 'class-validator';

export class CreateThreadDto {
  @IsString()
  @MinLength(1)
  participantId!: string;

  @IsString()
  @MinLength(1)
  firstMessage!: string;
}

export class SendMessageDto {
  @IsString()
  @MinLength(1)
  body!: string;
}
