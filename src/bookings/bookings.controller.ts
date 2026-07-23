import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { BookingsService } from './bookings.service';
import { AuthGuard } from '../auth/auth.guard';
import { EmailVerifiedGuard } from '../auth/email-verified.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { CancelBookingDto, CreateBookingDto } from './dto';
import { ApiErrorResponse, BookingResponse } from '../common/responses';

@ApiTags('Bookings')
@ApiBearerAuth('access-token')
@Controller('bookings')
@UseGuards(AuthGuard)
export class BookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @Post()
  @UseGuards(EmailVerifiedGuard)
  @ApiOperation({
    summary: 'Create booking',
    description:
      "Creates a booking and the associated charge transaction in a single DB transaction. If `paymentMethod=wallet`, the wallet is debited atomically — insufficient funds → 400. Other methods leave the booking and its charge in `pending` until the operator settles them. Requires a verified email (POST /auth/verify-otp).",
  })
  @ApiCreatedResponse({ description: 'Booking + charge transaction.', type: BookingResponse })
  @ApiBadRequestResponse({
    description: 'Validation failed, or insufficient wallet balance for a wallet booking.',
    type: ApiErrorResponse,
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token.', type: ApiErrorResponse })
  @ApiForbiddenResponse({ description: 'Email not verified.', type: ApiErrorResponse })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateBookingDto) {
    return this.bookings.create(user.id, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'My bookings',
    description: 'All bookings owned by the signed-in user, newest first.',
  })
  @ApiOkResponse({ type: [BookingResponse] })
  @ApiUnauthorizedResponse({ type: ApiErrorResponse })
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.bookings.listForUser(user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one booking' })
  @ApiOkResponse({ type: BookingResponse })
  @ApiUnauthorizedResponse({ type: ApiErrorResponse })
  @ApiForbiddenResponse({ description: 'Booking belongs to someone else.', type: ApiErrorResponse })
  @ApiNotFoundResponse({ description: 'Booking not found.', type: ApiErrorResponse })
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.bookings.findOne(user.id, id);
  }

  @Post(':id/cancel')
  @ApiOperation({
    summary: 'Cancel booking',
    description:
      "Sets status to `cancelled` (or `refunded` if a charge was already settled). For wallet-funded bookings, the refund is credited back to the wallet automatically. For off-wallet methods, a pending refund transaction is recorded for the operator to settle externally.",
  })
  @ApiCreatedResponse({ type: BookingResponse })
  @ApiBadRequestResponse({
    description: 'Booking is already cancelled, or completed (request a refund instead).',
    type: ApiErrorResponse,
  })
  @ApiUnauthorizedResponse({ type: ApiErrorResponse })
  @ApiForbiddenResponse({ type: ApiErrorResponse })
  @ApiNotFoundResponse({ type: ApiErrorResponse })
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CancelBookingDto,
  ) {
    return this.bookings.cancel(user.id, id, dto.reason);
  }
}
