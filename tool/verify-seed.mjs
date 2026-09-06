// Verification: query the seeded DB the same way the API does, so we know
// every dashboard endpoint has data. Read-only.
import { PrismaClient, PaymentStatus } from '@prisma/client';
const prisma = new PrismaClient();

const count = (label, n, extra = '') =>
  console.log(`${n === 0 ? '!!' : '  '} ${label}: ${n}${extra ? '  ' + extra : ''}`);

async function main() {
  console.log('=== USERS / ROLES ===');
  count('ADMIN', await prisma.user.count({ where: { role: 'ADMIN' } }));
  count('TOURIST', await prisma.user.count({ where: { role: 'TOURIST' } }));
  count('GUIDE', await prisma.user.count({ where: { role: 'GUIDE' } }));
  count('HOTEL_MANAGER', await prisma.user.count({ where: { role: 'HOTEL_MANAGER' } }));
  count('users with profileImage', await prisma.user.count({ where: { profileImage: { not: null } } }));
  count('picsum/legacy images left', await prisma.user.count({ where: { profileImage: { contains: 'picsum.photos' } } }));

  console.log('\n=== CATALOG (public endpoints) ===');
  count('regions', await prisma.region.count());
  count('tourTypes', await prisma.tourType.count());
  const pkgs = await prisma.package.count({ where: { isCustom: false, isActive: true } });
  count('active public packages', pkgs);
  count('packages without media', await prisma.package.count({ where: { isCustom: false, media: { none: {} } } }));
  count('packages with owner', await prisma.package.count({ where: { ownerId: { not: null } } }));
  count('vehicles', await prisma.vehicle.count());
  count('guide experiences', await prisma.guideExperience.count());
  count('chef courses', await prisma.chefCourse.count());
  count('chef price tiers', await prisma.chefPriceTier.count());

  console.log('\n=== AVAILABILITY (GET /guides/:id/availability, POST /bookings gate) ===');
  count('ProviderAvailability rows', await prisma.providerAvailability.count());
  count('guides with weekly rules', await prisma.providerAvailability.groupBy({ by: ['guideId'], _count: true }).then((g) => g.length));
  count('AvailabilityException rows', await prisma.availabilityException.count());

  console.log('\n=== BOOKINGS (GET /guide/bookings, /hotel/bookings, /me/bookings) ===');
  count('bookings total', await prisma.booking.count());
  for (const st of ['PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED']) {
    count(`  status ${st}`, await prisma.booking.count({ where: { status: st } }));
  }
  count('bookings with reference', await prisma.booking.count({ where: { reference: { not: null } } }));
  count('gastronomy bookings w/ courses', await prisma.bookingCourse.count());

  console.log('\n=== PAYMENTS (GET /guide/earnings — needs SUCCESSFUL + verifiedAt) ===');
  count('payments total', await prisma.payment.count());
  count('SUCCESSFUL payments', await prisma.payment.count({ where: { status: PaymentStatus.SUCCESSFUL } }));
  count('verified (verifiedAt != null)', await prisma.payment.count({ where: { verifiedAt: { not: null } } }));
  count('payment attempts (audit)', await prisma.paymentAttempt.count());

  console.log('\n=== GUIDE DASHBOARDS (per-guide, mirrors /guide/stats + /guide/earnings) ===');
  const guides = await prisma.guideProfile.findMany({
    select: { id: true, dailyCapacity: true, availability: { select: { id: true } }, bookings: { select: { id: true, status: true } } },
  });
  for (const g of guides) {
    const paid = await prisma.payment.count({ where: { status: PaymentStatus.SUCCESSFUL, verifiedAt: { not: null }, booking: { guideId: g.id } } });
    console.log(`  guide ${g.id.slice(0, 8)}: bookings=${g.bookings.length} verifiedPayments=${paid} weeklyRules=${g.availability.length} capacity=${g.dailyCapacity}`);
  }

  console.log('\n=== HOTELS (GET /hotel/bookings, /hotel/rooms) ===');
  count('hotels verified', await prisma.hotel.count({ where: { isVerified: true } }));
  count('hotel rooms', await prisma.hotelRoom.count());
  for (const h of await prisma.hotel.findMany({ select: { name: true, _count: { select: { bookings: true, rooms: true } } } })) {
    console.log(`  ${h.name}: rooms=${h._count.rooms} bookings=${h._count.bookings}`);
  }

  console.log('\n=== OTHER ENDPOINT SURFACES ===');
  count('notifications', await prisma.notification.count());
  count('message threads', await prisma.messageThread.count());
  count('messages', await prisma.message.count());
  count('itineraries', await prisma.itinerary.count());
  count('itinerary items', await prisma.itineraryItem.count());
  count('trips', await prisma.trip.count());
  count('wallets', await prisma.wallet.count());
  count('wallet transactions', await prisma.walletTransaction.count());
  count('cards', await prisma.card.count());
  count('card transactions', await prisma.cardTransaction.count());
  count('guide applications', await prisma.guideApplication.count());
  count('payouts', await prisma.payout.count());
  count('refunds', await prisma.refund.count());
  count('esim orders', await prisma.esimOrder.count());
  count('event interests', await prisma.eventInterest.count());
  count('cities', await prisma.city.count());
  count('events', await prisma.event.count());
  count('reviews', await prisma.review.count());

  console.log('\n=== IMAGE URL SANITY (spot-check for non-verified hosts) ===');
  const mediaUrls = [
    ...(await prisma.packageMedia.findMany({ select: { url: true } })),
    ...(await prisma.guideExperienceMedia.findMany({ select: { url: true } })),
  ].map((m) => m.url);
  const hosts = {};
  for (const u of mediaUrls) {
    const h = u.split('/')[2] || '?';
    hosts[h] = (hosts[h] || 0) + 1;
  }
  console.log('  media hosts:', JSON.stringify(hosts));
  count('package media URLs', mediaUrls.length);
}

main()
  .catch((e) => { console.error('verify failed:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());