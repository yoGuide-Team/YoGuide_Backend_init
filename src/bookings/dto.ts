import { ApiProperty } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

const BOOKING_TYPES = ['tour', 'experience', 'hotel', 'guide', 'rental', 'shop'] as const;
const PAYMENT_METHODS = ['wallet', 'card', 'momo', 'cash'] as const;

export class CreateBookingDto {
  @ApiProperty({
    enum: BOOKING_TYPES,
    example: 'experience',
    description: 'What is being booked.',
  })
  @IsIn(BOOKING_TYPES)
  type!: string;

  @ApiProperty({
    example: 5000,
    minimum: 0,
    description: 'Total price in integer cents.',
  })
  @IsInt()
  @Min(0)
  totalCents!: number;

  @ApiProperty({ example: 'USD', required: false, default: 'USD' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiProperty({
    example: 'gorilla-trek',
    required: false,
    description: 'Slug of a TrippotoPlace, when applicable (experience/hotel/landmark).',
  })
  @IsOptional()
  @IsString()
  placeId?: string;

  @ApiProperty({
    required: false,
    description: 'Guide id, for type=guide bookings — powers GET /guides/me/bookings.',
  })
  @IsOptional()
  @IsString()
  guideId?: string;

  @ApiProperty({
    required: false,
    description: 'Vendor id, for type=hotel bookings — powers GET /vendors/me/bookings.',
  })
  @IsOptional()
  @IsString()
  vendorId?: string;

  @ApiProperty({
    example: { adults: 2, date: '2026-06-12', notes: 'Slow pace please' },
    required: false,
    description:
      'Free-form payload — adults, dates, hotel SKU, guide id, etc. Whatever the booking flow needs. Stored as Postgres jsonb.',
  })
  @IsOptional()
  @IsObject()
  details?: Record<string, unknown>;

  @ApiProperty({
    example: '2026-06-12T07:00:00.000Z',
    required: false,
    description: 'ISO-8601 timestamp for when the booking is scheduled (start time).',
  })
  @IsOptional()
  @IsString()
  scheduledAt?: string;

  @ApiProperty({ example: 'Vegetarian lunch please.', required: false })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({
    enum: PAYMENT_METHODS,
    example: 'wallet',
    description:
      "How the user wants to pay. `wallet` debits the wallet immediately (must have sufficient balance). Other methods record a pending transaction the operator settles externally.",
  })
  @IsIn(PAYMENT_METHODS)
  paymentMethod!: string;
}

export class CancelBookingDto {
  @ApiProperty({ example: 'Changed travel dates.', required: false })
  @IsOptional()
  @IsString()
  reason?: string;
}
