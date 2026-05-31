import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class OnboardingService {
  constructor(private readonly prisma: PrismaService) {}

  // ── eSIM ──────────────────────────────────────────────────────────────────
  async orderEsim(userId: string, bundleId: string, deliveryEmail: string) {
    const order = await (this.prisma as any).esimOrder.create({
      data: { userId, bundleId, deliveryEmail, status: 'pending' },
    });
    return {
      orderId: order.id,
      qrCodeUrl: `https://esim.example.com/qr/${order.id}`,
      confirmationEmail: deliveryEmail,
    };
  }

  // ── Shuttle ───────────────────────────────────────────────────────────────
  async bookShuttle(userId: string, dropOffPoint: string, slotTime: string) {
    const booking = await (this.prisma as any).shuttleBooking.create({
      data: {
        userId,
        dropOffPoint,
        slotTime: new Date(slotTime),
        status: 'confirmed',
      },
    });
    return {
      bookingId: booking.id,
      qrTicketUrl: `https://shuttle.example.com/ticket/${booking.id}`,
      confirmationMessage: `Your shuttle to ${dropOffPoint} is confirmed.`,
    };
  }

  // ── Wallet top-up ─────────────────────────────────────────────────────────
  async topUpWallet(
    userId: string,
    amount: number,
    sourceCurrency: string,
    cardToken: string,
  ) {
    const rates: Record<string, number> = {
      USD: 1320,
      EUR: 1430,
      GBP: 1670,
      Other: 1320,
    };
    const rwfAmount = amount * (rates[sourceCurrency] ?? 1320);

    // Use the EXISTING WalletTransaction model — just add the new fields below
    // if they don't already exist on it, or adapt to your current field names.
    await (this.prisma as any).walletTransaction.create({
      data: {
        userId,
        sourceAmount: amount,
        sourceCurrency,
        rwfAmount,
        cardToken,
        status: 'processing',
      },
    });

    return { rwfAmount, status: 'processing' };
  }

  // ── Trip profile ──────────────────────────────────────────────────────────
  async saveTripProfile(
    userId: string,
    data: {
      destinationCity: string;
      arrivalDate?: string;
      departureDate?: string;
      tripPurpose?: string;
      nationality?: string;
      freeSlots?: { day: number; slot: string }[];
      experienceTypes?: string[];
    },
  ) {
    await (this.prisma as any).tripProfile.upsert({
      where: { userId },
      create: {
        userId,
        destinationCity: data.destinationCity,
        arrivalDate: data.arrivalDate ? new Date(data.arrivalDate) : null,
        departureDate: data.departureDate ? new Date(data.departureDate) : null,
        tripPurpose: data.tripPurpose ?? null,
        nationality: data.nationality ?? null,
        freeSlots: data.freeSlots ? JSON.stringify(data.freeSlots) : null,
        experienceTypes: data.experienceTypes ?? [],
      },
      update: {
        destinationCity: data.destinationCity,
        arrivalDate: data.arrivalDate ? new Date(data.arrivalDate) : null,
        departureDate: data.departureDate ? new Date(data.departureDate) : null,
        tripPurpose: data.tripPurpose ?? null,
        nationality: data.nationality ?? null,
        freeSlots: data.freeSlots ? JSON.stringify(data.freeSlots) : null,
        experienceTypes: data.experienceTypes ?? [],
      },
    });
    return { saved: true };
  }

  // ── Event interests ───────────────────────────────────────────────────────
  async saveEventInterests(
    userId: string,
    eventIds: string[],
    reminderEnabled: boolean,
  ) {
    await (this.prisma as any).eventInterest.upsert({
      where: { userId },
      create: { userId, eventIds, reminderEnabled },
      update: { eventIds, reminderEnabled },
    });
    return { saved: true };
  }
}