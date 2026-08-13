import { Language, PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const adminEmail = 'admin@yoguide.app';
  const adminPassword = 'Y0guide#Admin2026';

  const password = await bcrypt.hash(adminPassword, 10);

  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      fullName: 'YoGuide Admin',
      password,
      nationality: 'Rwanda',
      role: UserRole.ADMIN,
      defaultLanguage: Language.EN,
    },
    create: {
      email: adminEmail,
      password,
      fullName: 'YoGuide Admin',
      nationality: 'Rwanda',
      role: UserRole.ADMIN,
      defaultLanguage: Language.EN,
    },
  });

  const region = await prisma.region.upsert({
    where: { id: 'seed-region-musanze' },
    update: { name: 'Musanze' },
    create: { id: 'seed-region-musanze', name: 'Musanze' },
  });

  const tourType = await prisma.tourType.upsert({
    where: { id: 'seed-tourtype-city' },
    update: { name: 'City Tours', regionId: region.id },
    create: {
      id: 'seed-tourtype-city',
      name: 'City Tours',
      regionId: region.id,
    },
  });

  await prisma.package.upsert({
    where: { id: 'seed-package-highlights' },
    update: {
      name: 'Musanze Highlights',
      description: 'A guided introduction to Musanze.',
      durationHours: 4,
      price: 120,
      tourTypeId: tourType.id,
    },
    create: {
      id: 'seed-package-highlights',
      name: 'Musanze Highlights',
      description: 'A guided introduction to Musanze.',
      durationHours: 4,
      price: 120,
      tourTypeId: tourType.id,
    },
  });

  await prisma.packageTour.upsert({
    where: { id: 'seed-package-tour-gorilla' },
    update: {
      packageId: 'seed-package-highlights',
      title: 'Gorilla Trek Briefing',
      description: 'Pre-trek orientation and village walk.',
      duration: 2,
      price: 45,
    },
    create: {
      id: 'seed-package-tour-gorilla',
      packageId: 'seed-package-highlights',
      title: 'Gorilla Trek Briefing',
      description: 'Pre-trek orientation and village walk.',
      duration: 2,
      price: 45,
    },
  });

  await prisma.vehicle.upsert({
    where: { id: 'seed-vehicle-sedan' },
    update: {
      name: 'Comfort Sedan',
      seats: 4,
      pricePerHour: 25,
      pricePerDay: 150,
    },
    create: {
      id: 'seed-vehicle-sedan',
      name: 'Comfort Sedan',
      seats: 4,
      pricePerHour: 25,
      pricePerDay: 150,
    },
  });

  console.log('Seed complete.');
  console.log(`Admin login: ${adminEmail} / ${adminPassword}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
