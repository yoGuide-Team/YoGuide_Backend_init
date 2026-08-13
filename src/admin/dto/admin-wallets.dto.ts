import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsString } from 'class-validator';

export enum WalletAdjustmentKind {
  ADJUSTMENT = 'adjustment',
  TOPUP = 'topup',
  REFUND = 'refund',
  DEBIT = 'debit',
}

export class WalletAdjustmentDto {
  @ApiProperty({
    example: 5000,
    description: 'Amount in cents. Positive credits the wallet; negative debits it.',
  })
  @IsInt()
  amountCents!: number;

  @ApiProperty({
    enum: WalletAdjustmentKind,
    enumName: 'WalletAdjustmentKind',
    example: WalletAdjustmentKind.ADJUSTMENT,
  })
  @IsEnum(WalletAdjustmentKind)
  kind!: WalletAdjustmentKind;

  @ApiPropertyOptional({ example: 'Manual correction after support ticket #42' })
  @IsOptional()
  @IsString()
  notes?: string;
}
