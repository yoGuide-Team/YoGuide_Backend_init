import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // 1. Create admin user
  console.log('👤 Creating admin user...');
  const adminEmail = 'admin@yoguide.app';
  const existingAdmin = await prisma.user.findUnique({
    where: { email: adminEmail },
  });

  if (!existingAdmin) {
    const bcrypt = require('bcryptjs');
    const password = await bcrypt.hash('Y0guide#Admin2026', 10);
    
    await prisma.user.create({
      data: {
        fullName: 'System Admin',
        email: adminEmail,
        password: password,
        nationality: 'Rwandan',
        role: 'ADMIN', // Valid UserRole value
        emailVerified: true,
        inAppNotifications: true,
        emailNotifications: true,
      },
    });
    console.log('✅ Admin user created');
  }

  // 2. Create a test tourist user
  console.log('👤 Creating tourist user...');
  const touristEmail = 'tourist@yoguide.app';
  const existingTourist = await prisma.user.findUnique({
    where: { email: touristEmail },
  });

  if (!existingTourist) {
    const bcrypt = require('bcryptjs');
    const password = await bcrypt.hash('Tourist@123', 10);
    
    await prisma.user.create({
      data: {
        fullName: 'Test Tourist',
        email: touristEmail,
        password: password,
        nationality: 'Rwandan',
        role: 'TOURIST', // Valid UserRole value
        emailVerified: true,
        inAppNotifications: true,
        emailNotifications: true,
      },
    });
    console.log('✅ Tourist user created');
  }

  // 3. Create a guide user with profile
  console.log('👨‍🏫 Creating guide user...');
  const guideEmail = 'guide@yoguide.app';
  const existingGuide = await prisma.user.findUnique({
    where: { email: guideEmail },
  });

  let guideProfileId: string | undefined;

  if (!existingGuide) {
    const bcrypt = require('bcryptjs');
    const password = await bcrypt.hash('Guide@123', 10);

    const guideUser = await prisma.user.create({
      data: {
        fullName: 'Sample Guide',
        email: guideEmail,
        password: password,
        nationality: 'Rwandan',
        role: 'GUIDE', // Valid UserRole value
        emailVerified: true,
        inAppNotifications: true,
        emailNotifications: true,
      },
    });

    // Create guide profile with correct Language enum values
    const guideProfile = await prisma.guideProfile.create({
      data: {
        userId: guideUser.id,
        guideType: 'INDIVIDUAL',
        languages: ['EN', 'FR', 'RW'], // Using the Language enum values
        numberOfTours: 0,
      },
    });
    guideProfileId = guideProfile.id;
    console.log('✅ Guide user created');
  } else {
    const profile = await prisma.guideProfile.findUnique({
      where: { userId: existingGuide.id },
    });
    guideProfileId = profile?.id;
  }

  // 4. Catalog reference data — region/tour type/package, gastronomy
  //    category, and the sample guide's chef profile/courses/price tiers
  //    and vehicles. Prices are intentionally tiny (not realistic $ amounts)
  //    so real-payment testing stays cheap on every environment this seed
  //    runs against, deployed included — bump them once the gateway
  //    integration is fully signed off.
  console.log('🗺️  Seeding catalog reference data...');

  let region = await prisma.region.findFirst({ where: { name: 'Kigali' } });
  if (!region) {
    region = await prisma.region.create({ data: { name: 'Kigali' } });
  }

  let tourType = await prisma.tourType.findFirst({
    where: { name: 'City Tour', regionId: region.id },
  });
  if (!tourType) {
    tourType = await prisma.tourType.create({
      data: { name: 'City Tour', regionId: region.id },
    });
  }

  const existingPackage = await prisma.package.findFirst({
    where: { name: 'Kimihurura Roundabout', tourTypeId: tourType.id },
  });
  if (!existingPackage) {
    await prisma.package.create({
      data: {
        tourTypeId: tourType.id,
        name: 'Kimihurura Roundabout',
        description:
          'A relaxed loop through Kimihurura\'s embassies, cafes, and viewpoints — a good first taste of Kigali.',
        durationHours: 2,
        price: 0.05,
      },
    });
    console.log('✅ Sample package created');
  }

  let gastronomyCategory = await prisma.gastronomyCategory.findFirst({
    where: { name: 'Homestyle' },
  });
  if (!gastronomyCategory) {
    gastronomyCategory = await prisma.gastronomyCategory.create({
      data: {
        name: 'Homestyle',
        description: 'Traditional home-cooked meals shared at a local family table.',
        iconKey: 'restaurant',
        sortOrder: 0,
        isActive: true,
      },
    });
    console.log('✅ Gastronomy category created');
  }

  if (guideProfileId) {
    const existingChefProfile = await prisma.chefProfile.findUnique({
      where: { guideId: guideProfileId },
    });

    if (!existingChefProfile) {
      const chefProfile = await prisma.chefProfile.create({
        data: {
          guideId: guideProfileId,
          categoryId: gastronomyCategory.id,
          restaurantName: 'Heaven Restaurant',
          experienceName: 'Rwandan Home-Cooking Table',
          area: 'Kigali',
          tags: ['#Food', 'Traditional'],
          storyTitle: 'A Table Rooted in Kigali',
          storyDurationLabel: '2-3 hours',
          storyText: 'Chef Amahoro opens her family kitchen and walks guests through the dishes she grew up with.',
        },
      });

      await prisma.chefCourse.createMany({
        data: [
          {
            chefId: chefProfile.id,
            name: 'Isombe with grilled plantain',
            description: 'Starter',
            sortOrder: 0,
          },
          {
            chefId: chefProfile.id,
            name: 'Brochettes with ugali',
            description: 'Main',
            sortOrder: 1,
          },
        ],
      });

      await prisma.chefPriceTier.createMany({
        data: [
          { chefId: chefProfile.id, minPartySize: 1, maxPartySize: 2, pricePerPersonUsd: 0.04, sortOrder: 0 },
          { chefId: chefProfile.id, minPartySize: 3, maxPartySize: 6, pricePerPersonUsd: 0.03, sortOrder: 1 },
          { chefId: chefProfile.id, minPartySize: 7, maxPartySize: null, pricePerPersonUsd: 0.02, sortOrder: 2 },
        ],
      });

      console.log('✅ Chef profile, courses, and price tiers created');
    }

    const vehicleCatalog: { name: string; icon: string; seats: number }[] = [
      { name: 'Walking Tour', icon: 'directions_walk', seats: 8 },
      { name: 'Motorbike', icon: 'two_wheeler', seats: 1 },
      { name: 'EV Car', icon: 'electric_car', seats: 4 },
      { name: 'Van', icon: 'airport_shuttle', seats: 12 },
      { name: 'Bus', icon: 'directions_bus', seats: 30 },
    ];

    for (const v of vehicleCatalog) {
      let vehicle = await prisma.vehicle.findFirst({ where: { name: v.name } });
      if (!vehicle) {
        vehicle = await prisma.vehicle.create({
          data: {
            name: v.name,
            icon: v.icon,
            seats: v.seats,
            pricePerHour: 0.02,
            pricePerDay: 0.15,
          },
        });
      }
      const linked = await prisma.guideVehicle.findUnique({
        where: { guideId_vehicleId: { guideId: guideProfileId, vehicleId: vehicle.id } },
      });
      if (!linked && (v.name === 'EV Car' || v.name === 'Motorbike')) {
        await prisma.guideVehicle.create({
          data: { guideId: guideProfileId, vehicleId: vehicle.id },
        });
      }
    }
    console.log('✅ Vehicle catalog seeded and linked to sample guide');
  }

  console.log('✅ Seeding complete!');
  console.log('📋 Admin credentials:');
  console.log('   Email: admin@yoguide.app');
  console.log('   Password: Y0guide#Admin2026');
  console.log('📋 Guide credentials:');
  console.log('   Email: guide@yoguide.app');
  console.log('   Password: Guide@123');
  console.log('📋 Tourist credentials:');
  console.log('   Email: tourist@yoguide.app');
  console.log('   Password: Tourist@123');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
