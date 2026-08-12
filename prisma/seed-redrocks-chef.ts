import { PrismaClient, Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// One-off seed for the first real chef account (Red Rocks, Musanze) — creates
// an already-approved User + Guide pair so the account can log in and use
// the chef dashboard (PATCH /guides/me, GuideDashboardPage's Profile
// section) immediately, without going through the normal
// apply -> admin-verify flow. Idempotent: safe to re-run.
// Run with: ts-node prisma/seed-redrocks-chef.ts
async function main() {
  const email = 'redrocks@yoguide.africa';
  const password = 'redrocks@Test';
  const fullName = 'Chef Twizeyimana Faustin';

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      passwordHash,
      fullName,
      roleKey: 'tour',
      emailVerified: true,
    },
    create: {
      email,
      passwordHash,
      fullName,
      roleKey: 'tour',
      emailVerified: true,
    },
  });

  const menuCourses = [
    {
      course: 'Sorghum flour meal',
      description: 'Cooked over open firewood in a traditional clay hearth, the ancestral way.',
    },
    {
      course: 'Tropical Fruit Basket',
      description: 'Sweet yellow banana, avocado, jackfruit, tree tomato, and passion fruit.',
    },
    {
      course: 'Red Garden Tea',
      description: 'Herbs, honey, lemongrass, and mint.',
    },
  ];

  const bio =
    "Deep in the volcanic highlands of Musanze, Chef Twizeyimana Faustin has spent more than eight years turning Rwanda's culinary heritage into something you can taste, smell, and never forget. At his open-air kitchen at Red Rocks, he cooks the way his ancestors did: over crackling firewood gathered by hand from the surrounding forest, in clay hearths that infuse every dish with a smoky, earthy aroma no modern stove could replicate. Faustin's deep knowledge of local herbs and spices, passed down and perfected over years behind the flame, transforms simple ingredients into dishes bursting with authentic Rwandan flavor.\n\n" +
    "What makes the experience even richer is where that food comes from: fresh vegetables and produce sourced daily from the gardens of local women in the community, so every plate carries not just flavor but a story of connection between chef, land, and neighbor. From the crackle of the fire to the final, mouthwatering bite, a meal with Chef Faustin isn't just dinner. It's a journey into the heart of Rwandan culture, and one every traveler owes themselves at least once.";

  const guideData = {
    fullName,
    bio,
    city: 'Musanze',
    specialties: ['#Food'],
    languages: ['Kinyarwanda', 'English'],
    yearsExperience: 8,
    isVerified: true,
    isAvailable: true,
    status: 'approved',
    rejectionReason: null,
    restaurantName: 'Red Rocks',
    gastronomyCategory: 'homestyle',
    experienceName: 'Firewood & Clay Hearth Rwandan Feast',
    gastronomyArea: 'Musanze',
    chefTags: ['#OpenFireCooking', '#ClayHearth', '#RedRocks'],
    menuCourses: menuCourses as unknown as Prisma.InputJsonValue,
  };

  const guide = await prisma.guide.upsert({
    where: { userId: user.id },
    update: guideData,
    create: { userId: user.id, ...guideData },
  });

  console.log('Seeded chef account:');
  console.log(`  User  -> id=${user.id} email=${user.email} roleKey=${user.roleKey}`);
  console.log(`  Guide -> id=${guide.id} fullName=${guide.fullName} status=${guide.status}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
