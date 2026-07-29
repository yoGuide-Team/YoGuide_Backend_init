import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Create roles if they don't exist
  const roles = [
    { key: 'user', label: 'User', isSystem: false },
    { key: 'admin', label: 'Administrator', isSystem: false },
    { key: 'guide', label: 'Tour Guide', isSystem: false },
    { key: 'vendor', label: 'Vendor', isSystem: false },
    { key: 'TRAVELER', label: 'Traveler', isSystem: false },
  ];

  for (const role of roles) {
    await prisma.role.upsert({
      where: { key: role.key },
      update: {},
      create: {
        key: role.key,
        label: role.label,
        isSystem: role.isSystem,
        permissions: [],
      },
    });
  }

  console.log('✅ Roles seeded successfully');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding roles:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
