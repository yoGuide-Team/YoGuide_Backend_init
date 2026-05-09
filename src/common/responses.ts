import { ApiProperty } from '@nestjs/swagger';

// ─── Error envelope ──────────────────────────────────────────────────────

export class ApiErrorResponse {
  @ApiProperty({ example: 400, description: 'HTTP status code echoed in the body for convenience.' })
  statusCode!: number;

  @ApiProperty({
    example: 'Bad Request',
    description: 'Short error class name. Stable across releases.',
  })
  error!: string;

  @ApiProperty({
    description:
      'Human-readable explanation. May be a single string or an array of strings (typical for validation failures).',
    oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
    example: 'email must be an email',
  })
  message!: string | string[];

  @ApiProperty({
    example: '2026-05-09T11:42:18.041Z',
    description: 'Server-side ISO timestamp the response was generated.',
  })
  timestamp!: string;

  @ApiProperty({
    example: '/auth/login',
    description: 'Path the request hit, useful when correlating logs.',
  })
  path!: string;
}

// ─── Generic OK ──────────────────────────────────────────────────────────

export class OkResponse {
  @ApiProperty({ example: true })
  ok!: boolean;
}

// ─── Auth ────────────────────────────────────────────────────────────────

export class AuthUserResponse {
  @ApiProperty({ example: 'cmoy51mhr0001ss61p3xpgazt' })
  id!: string;

  @ApiProperty({ example: 'admin@yoguide.app' })
  email!: string;

  @ApiProperty({ example: 'yoGuide Admin', nullable: true })
  fullName!: string | null;

  @ApiProperty({
    example: 'admin',
    description: 'Stable role identifier. Used in JWT payloads and FK references.',
  })
  roleKey!: string;

  @ApiProperty({ example: 'Administrator', description: 'Human-readable role label.' })
  roleLabel!: string;

  @ApiProperty({
    example: ['*'],
    description:
      "Permission strings the user currently holds. `['*']` is the superuser shortcut.",
  })
  permissions!: string[];
}

export class AuthSessionResponse {
  @ApiProperty({
    example:
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJjbW95...',
    description: 'JWT bearer token. Default lifetime is 30 days.',
  })
  token!: string;

  @ApiProperty({ type: AuthUserResponse })
  user!: AuthUserResponse;
}

// ─── Health ──────────────────────────────────────────────────────────────

export class HealthResponse {
  @ApiProperty({ example: 'ok', enum: ['ok'] })
  status!: string;

  @ApiProperty({ example: 'ok', enum: ['ok', 'down'] })
  db!: string;

  @ApiProperty({ example: 1234 })
  uptimeSeconds!: number;
}

// ─── Wallet ──────────────────────────────────────────────────────────────

export class WalletTransactionResponse {
  @ApiProperty({ example: 'cmoy7abc0000abc' })
  id!: string;

  @ApiProperty({
    example: 'topup',
    enum: ['topup', 'debit', 'refund', 'adjustment'],
    description: 'What kind of move this was.',
  })
  kind!: string;

  @ApiProperty({ example: 20000, description: 'Amount in integer cents (always positive).' })
  amountCents!: number;

  @ApiProperty({ example: 'USD' })
  currency!: string;

  @ApiProperty({ example: null, nullable: true, description: 'Linked booking, if any.' })
  bookingId!: string | null;

  @ApiProperty({ example: null, nullable: true })
  externalRef!: string | null;

  @ApiProperty({ example: 'mock card top-up', nullable: true })
  notes!: string | null;

  @ApiProperty({ example: '2026-05-09T11:42:18.041Z' })
  createdAt!: string;
}

export class WalletResponse {
  @ApiProperty({ example: 'cmoy7walletid' })
  id!: string;

  @ApiProperty({ example: 'cmoy7user' })
  userId!: string;

  @ApiProperty({ example: 25000, description: 'Current balance in integer cents.' })
  balanceCents!: number;

  @ApiProperty({ example: 'USD' })
  currency!: string;

  @ApiProperty({ example: '2026-05-08T09:00:00.000Z' })
  createdAt!: string;

  @ApiProperty({ example: '2026-05-09T11:42:18.041Z' })
  updatedAt!: string;

  @ApiProperty({
    type: [WalletTransactionResponse],
    description: 'Up to 50 most-recent transactions, newest first.',
  })
  transactions!: WalletTransactionResponse[];
}

// ─── Booking ─────────────────────────────────────────────────────────────

export class BookingTransactionResponse {
  @ApiProperty({ example: 'cmoy7tx' })
  id!: string;

  @ApiProperty({ example: 'charge', enum: ['charge', 'refund'] })
  kind!: string;

  @ApiProperty({ example: 'wallet', enum: ['wallet', 'card', 'momo', 'cash'] })
  method!: string;

  @ApiProperty({ example: 5000 })
  amountCents!: number;

  @ApiProperty({ example: 'USD' })
  currency!: string;

  @ApiProperty({ example: 'settled', enum: ['pending', 'settled', 'failed'] })
  status!: string;

  @ApiProperty({ example: null, nullable: true })
  externalRef!: string | null;

  @ApiProperty({ example: null, nullable: true })
  notes!: string | null;

  @ApiProperty({ example: '2026-05-09T11:42:18.041Z' })
  createdAt!: string;
}

export class BookingResponse {
  @ApiProperty({ example: 'cmoy7booking' })
  id!: string;

  @ApiProperty({ example: 'cmoy7user' })
  userId!: string;

  @ApiProperty({
    example: 'experience',
    enum: ['tour', 'experience', 'hotel', 'guide', 'rental', 'shop'],
  })
  type!: string;

  @ApiProperty({
    example: 'confirmed',
    enum: ['pending', 'confirmed', 'cancelled', 'completed', 'refunded'],
    description: 'See the booking lifecycle in the API description.',
  })
  status!: string;

  @ApiProperty({ example: 5000, description: 'Total in integer cents.' })
  totalCents!: number;

  @ApiProperty({ example: 'USD' })
  currency!: string;

  @ApiProperty({ example: 'gorilla-trek', nullable: true })
  placeId!: string | null;

  @ApiProperty({
    example: { adults: 2, date: '2026-06-12', notes: 'Slow pace please' },
    description: 'Type-specific payload. Stored as Postgres jsonb.',
  })
  details!: Record<string, unknown>;

  @ApiProperty({ example: '2026-06-12T07:00:00.000Z', nullable: true })
  scheduledAt!: string | null;

  @ApiProperty({ example: null, nullable: true })
  notes!: string | null;

  @ApiProperty({ example: '2026-05-09T11:42:18.041Z' })
  createdAt!: string;

  @ApiProperty({ type: [BookingTransactionResponse] })
  transactions!: BookingTransactionResponse[];
}

// ─── Place ───────────────────────────────────────────────────────────────

export class PlaceResponse {
  @ApiProperty({ example: 'gorilla-trek', description: 'Slug — stable identifier used in URLs.' })
  id!: string;

  @ApiProperty({ example: 'Mountain Gorilla Trek' })
  name!: string;

  @ApiProperty({ example: 'Half-day · from Kinigi HQ' })
  tagline!: string;

  @ApiProperty({
    example: 'experience',
    enum: ['hotel', 'restaurant', 'mall', 'landmark', 'experience'],
  })
  kind!: string;

  @ApiProperty({ example: -1.434 })
  latitude!: number;

  @ApiProperty({ example: 29.5555 })
  longitude!: number;

  @ApiProperty({ example: 'Kinigi park gate · group meets at 7:00 am' })
  address!: string;

  @ApiProperty({ example: '+250 788 800 200' })
  phone!: string;

  @ApiProperty({ example: '7:00 am briefing · 4–7 h total' })
  hours!: string;

  @ApiProperty({ example: 4.9, description: '0..5; 0 means hide.' })
  rating!: number;

  @ApiProperty({ example: 'USD 1 500 · permit + guide' })
  priceLabel!: string;

  @ApiProperty({ example: ['assets/images/gorillas.jpg'] })
  images!: string[];

  @ApiProperty({ example: ['Group of 8', 'Moderate–hard hike'] })
  tags!: string[];

  @ApiProperty({ example: 'The signature Rwandan experience...' })
  about!: string;

  @ApiProperty({ example: null, nullable: true, description: 'Mall slug, if this place is inside one.' })
  venueRef!: string | null;

  @ApiProperty({ example: 1500, description: 'Per-adult price in USD when bookable as a paid experience. 0 = not bookable.' })
  experienceAdultUsd!: number;
}
