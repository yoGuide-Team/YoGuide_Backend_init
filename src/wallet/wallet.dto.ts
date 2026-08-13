import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsInt, Min } from 'class-validator';

export enum WalletTopUpMethod {
  CARD = 'card',
  MOMO = 'momo',
  CASH = 'cash',
}

export class TopUpDto {
  @ApiProperty({ example: 20000, description: 'Top-up amount in integer cents (min 1).' })
  @IsInt()
  @Min(1)
  amountCents!: number;

  @ApiProperty({
    enum: WalletTopUpMethod,
    enumName: 'WalletTopUpMethod',
    example: WalletTopUpMethod.CARD,
  })
  @IsEnum(WalletTopUpMethod)
  method!: WalletTopUpMethod;
}
