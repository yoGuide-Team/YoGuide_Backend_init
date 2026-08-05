import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// One-off seed for the Community Tour and Gastronomy Tour flows — gives the
// frontend real backend-hydrated data to build/test against instead of only
// the bundled mock fallback. Not wired into `prisma db seed` (that seeds
// roles only); run directly with `ts-node prisma/seed-community-gastronomy.ts`.
async function main() {
  const kigali = await prisma.city.findUnique({ where: { slug: 'kigali' } });
  const musanze = await prisma.city.findUnique({ where: { slug: 'musanze' } });
  if (!kigali || !musanze) {
    throw new Error('Expected the kigali/musanze cities to already be seeded.');
  }

  const existingCommunityTour = await prisma.tour.findFirst({
    where: { category: 'community', title: 'Kigali Community & Culture Walk' },
  });
  if (!existingCommunityTour) {
    await prisma.tour.create({
      data: {
        cityId: kigali.id,
        title: 'Kigali Community & Culture Walk',
        description:
          'A half-day walking tour through a Kigali neighbourhood, led by a local resident — cooperative workshops, a community sports pitch, and a family-run market stall.',
        vehicleType: 'walking',
        category: 'community',
        durationMinutes: 210,
        priceCents: 2200,
        currency: 'USD',
        coverImage: null,
        highlights: ['Local cooperative visit', 'Community sports pitch', 'Family-run market stall'],
        isPublished: true,
        stops: {
          create: [
            { ordinal: 1, title: 'Neighbourhood welcome & briefing', durationMinutes: 20 },
            { ordinal: 2, title: 'Weaving cooperative workshop', durationMinutes: 60 },
            { ordinal: 3, title: 'Zaria Court community sports pitch', durationMinutes: 45 },
            { ordinal: 4, title: 'Family-run market stall visit', durationMinutes: 45 },
          ],
        },
      },
    });
    console.log('Created Community tour: Kigali Community & Culture Walk');
  } else {
    console.log('Community tour already exists, skipping.');
  }

  const chefs = [
    {
      fullName: 'Eric Nshimiyimana',
      emoji: '👨‍🍳',
      bio: 'Self-taught home cook turned pop-up chef. Fourth-generation Kigali family recipes, taught by his grandmother.',
      specialties: ['#Food', 'Homestyle'],
      languages: ['English', 'French', 'Kinyarwanda'],
      city: 'Kigali',
      hourlyRateCents: 3500,
      restaurantName: 'Fork Restaurant, Kigali Remera',
      gastronomyCategory: 'homestyle',
      experienceName: 'Traditional Kinyarwanda Feast',
      gastronomyArea: 'Kigali - Remera',
      chefTags: ['Family recipes', 'Vegetarian-friendly', 'Storytelling'],
      menuCourses: [
        { course: 'Starter', description: 'Isombe with smoked fish and eggplant' },
        { course: 'Main', description: 'Slow-braised goat with plantain and rice' },
        { course: 'Side', description: 'Ibirayi bishyushye — spiced roasted potatoes' },
        { course: 'Dessert', description: 'Passion fruit and honey pudding' },
      ],
      story: {
        title: "Eric's story",
        durationLabel: '2:04',
        text: 'Eric grew up cooking alongside his grandmother in Remera, learning the family recipes now served in his pop-up feasts across Kigali.',
      },
    },
    {
      fullName: 'Alice Uwase',
      emoji: '🌾',
      bio: 'Runs a farm-to-table supper club sourcing everything from her family cooperative farm outside Musanze.',
      specialties: ['#Food', 'Farm to table'],
      languages: ['English', 'Kinyarwanda'],
      city: 'Musanze',
      hourlyRateCents: 4000,
      restaurantName: 'Red Rocks, Musanze-Nakinama',
      gastronomyCategory: 'farmToTable',
      experienceName: 'Volcanoes Farm Table',
      gastronomyArea: 'Musanze - Nakinama',
      chefTags: ['Farm-to-table', 'Seasonal menu', 'Outdoor seating'],
      menuCourses: [
        { course: 'Starter', description: 'Garden pea and mint soup' },
        { course: 'Main', description: 'Grilled trout with volcanic-soil vegetables' },
        { course: 'Side', description: 'Wild greens sautéed with garlic' },
        { course: 'Dessert', description: 'Tree tomato compote with cream' },
      ],
      story: {
        title: "Alice's story",
        durationLabel: '1:48',
        text: 'Alice cooks with produce grown that same morning on her family cooperative farm, a few hundred metres from the Volcanoes National Park boundary.',
      },
    },
  ];

  for (const chef of chefs) {
    const existing = await prisma.guide.findFirst({ where: { fullName: chef.fullName } });
    if (existing) {
      console.log(`Chef already exists, skipping: ${chef.fullName}`);
      continue;
    }
    await prisma.guide.create({
      data: {
        fullName: chef.fullName,
        emoji: chef.emoji,
        bio: chef.bio,
        specialties: chef.specialties,
        languages: chef.languages,
        city: chef.city,
        hourlyRateCents: chef.hourlyRateCents,
        currency: 'USD',
        isVerified: true,
        isAvailable: true,
        status: 'approved',
        restaurantName: chef.restaurantName,
        gastronomyCategory: chef.gastronomyCategory,
        experienceName: chef.experienceName,
        gastronomyArea: chef.gastronomyArea,
        chefTags: chef.chefTags,
        menuCourses: chef.menuCourses,
        story: chef.story,
      },
    });
    console.log(`Created chef: ${chef.fullName}`);
  }

  console.log('✅ Community/gastronomy seed complete');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding community/gastronomy data:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
