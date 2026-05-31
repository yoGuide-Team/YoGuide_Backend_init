import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateNotificationDto, NotificationType } from './dto/create-notification.dto';
 
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
 
  constructor(private readonly prisma: PrismaService) {}
 
  // ── Core CRUD ─────────────────────────────────────────────────────────────
 
  async create(dto: CreateNotificationDto) {
    return this.prisma.notification.create({
      data: {
        userId:   dto.userId,
        title:    dto.title,
        body:     dto.body,
        type:     dto.type,
        metadata: dto.metadata ?? null,
        isRead:   false,
      },
    });
  }
 
  async findForUser(userId: string) {
    return this.prisma.notification.findMany({
      where:   { userId },
      orderBy: { createdAt: 'desc' },
      take:    50,
    });
  }
 
  async markOneRead(id: string, userId: string) {
    return this.prisma.notification.updateMany({
      where: { id, userId },
      data:  { isRead: true },
    });
  }
 
  async markAllRead(userId: string) {
    return this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data:  { isRead: true },
    });
  }
 
  // ── Semantic helpers (called by other services) ───────────────────────────
 
  /** Called by WalletService after every successful top-up / convenience deposit */
  async notifyWalletDeposit(userId: string, amount: number, currency: string) {
    const formatted = new Intl.NumberFormat('en-RW').format(amount);
    await this.create({
      userId,
      title: '💳 Funds Added',
      body:  `${formatted} ${currency} was deposited into your convenience account.`,
      type:  NotificationType.WALLET_DEPOSIT,
      metadata: JSON.stringify({ amount, currency }),
    }).catch((e) => this.logger.warn(`notifyWalletDeposit: ${e.message}`));
  }
 
  /** Called by OnboardingService / MeController when trip-profile is saved */
  async notifyTripProfile(userId: string, styles: string[], interests: string[]) {
    if (!styles.length && !interests.length) return;
    const styleStr     = styles.length    ? `Travel style: ${styles.join(', ')}. ` : '';
    const interestStr  = interests.length ? `Interests: ${interests.join(', ')}.`   : '';
    await this.create({
      userId,
      title: '✅ Travel Profile Saved',
      body:  `${styleStr}${interestStr}`,
      type:  NotificationType.TRIP_PREFERENCE,
    }).catch((e) => this.logger.warn(`notifyTripProfile: ${e.message}`));
  }
 
  /** Called by OnboardingService when event-interests are saved */
  async notifyEventInterests(userId: string, interests: string[]) {
    if (!interests.length) return;
    await this.create({
      userId,
      title: '🎟️ Event Interests Saved',
      body:  `You're interested in: ${interests.join(', ')}.`,
      type:  NotificationType.TOUR_INTEREST,
    }).catch((e) => this.logger.warn(`notifyEventInterests: ${e.message}`));
  }
 
  /** Called when a city is selected / changed */
  async notifyCitySelected(userId: string, cityName: string) {
    await this.create({
      userId,
      title: '📍 City Updated',
      body:  `Your active city is now ${cityName}.`,
      type:  NotificationType.CITY_SELECTED,
    }).catch((e) => this.logger.warn(`notifyCitySelected: ${e.message}`));
  }
}