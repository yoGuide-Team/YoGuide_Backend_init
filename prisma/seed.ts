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
    await prisma.guideProfile.create({
      data: {
        userId: guideUser.id,
        guideType: 'INDIVIDUAL',
        languages: ['EN', 'FR', 'RW'], // Using the Language enum values
        numberOfTours: 0,
      },
    });
    console.log('✅ Guide user created');
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
