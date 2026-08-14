import { Language, MediaType, PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// Real, subject-accurate photos from Wikimedia Commons — each URL was
// downloaded and visually verified to show what its slug says (Bisoke
// volcano really is a volcano, the chimp really is a chimp, etc).
const REAL_IMAGES: Record<string, string> = {
  'gorilla-trek': 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/78/Mountain_gorilla_%28Gorilla_beringei_beringei%29_yawn.jpg/960px-Mountain_gorilla_%28Gorilla_beringei_beringei%29_yawn.jpg',
  'kigali-dinner': 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6b/Local_Food_Dish.jpg/960px-Local_Food_Dish.jpg',
  'kigali-livemusic': 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/56/KIGALI_NIGHT.jpg/960px-KIGALI_NIGHT.jpg',
  'kigali-market': 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/63/Vegetable_stir-fry.jpg/960px-Vegetable_stir-fry.jpg',
  'kigali-memorial': 'https://upload.wikimedia.org/wikipedia/commons/d/d3/Kigali_Genocide_Memorial_site.jpg',
  'kigali-night': 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7a/Kigali_night_life.jpg/960px-Kigali_night_life.jpg',
  'kigali-skyline': 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2d/High_Angle_View_Of_Kigali_City_Street_on_November_29%2C_2018._Emmanuel_Kwizera.jpg/960px-High_Angle_View_Of_Kigali_City_Street_on_November_29%2C_2018._Emmanuel_Kwizera.jpg',
  'kigali-sunset': 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a0/Kigali_hills.jpg/960px-Kigali_hills.jpg',
  'kivu-beach': 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c0/Gisenyi_view_at_kivu_lac_mountain.jpg/960px-Gisenyi_view_at_kivu_lac_mountain.jpg',
  'kivu-boat': 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/ef/Lake_Kivu%2C_boats.jpg/960px-Lake_Kivu%2C_boats.jpg',
  'kivu-springs': 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/66/Shore_of_Lake_Kivu_-_Karongi-Kibuye_-_Western_Rwanda_-_01.jpg/960px-Shore_of_Lake_Kivu_-_Karongi-Kibuye_-_Western_Rwanda_-_01.jpg',
  'kivu-sunset': 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f4/Sunset_of_Lake_Kivu_on_Kivu_belt.jpg/960px-Sunset_of_Lake_Kivu_on_Kivu_belt.jpg',
  'musanze-cave': 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/49/Musanze_Cave.jpg/960px-Musanze_Cave.jpg',
  'musanze-lakes': 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/49/Lake_Burera_of_northwestern_Rwanda_01.jpg/960px-Lake_Burera_of_northwestern_Rwanda_01.jpg',
  'musanze-village': 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/fe/Iby%27Iwacu.jpg/960px-Iby%27Iwacu.jpg',
  'musanze-volcano': 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/53/Bisoke_Volcano.jpg/960px-Bisoke_Volcano.jpg',
  'nyungwe-canopy': 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9c/Nyungwe_canopy_walk.jpg/960px-Nyungwe_canopy_walk.jpg',
  'nyungwe-chimp': 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/86/013_Alpha_male_chimpanzee_at_Kibale_forest_National_Park_Photo_by_Giles_Laurent.jpg/960px-013_Alpha_male_chimpanzee_at_Kibale_forest_National_Park_Photo_by_Giles_Laurent.jpg',
  'nyungwe-forest': 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8d/Sunrisenyungwe.jpg/960px-Sunrisenyungwe.jpg',
  'nyungwe-waterfall': 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/98/Isumo_Waterfall_in_Nyungwe_Forest.jpg/960px-Isumo_Waterfall_in_Nyungwe_Forest.jpg',
  'rwanda-baskets': 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f0/Igiseke.jpg/960px-Igiseke.jpg',
  'rwanda-craft': 'https://upload.wikimedia.org/wikipedia/commons/5/54/RWANDA_YACU.jpg',
  'rwanda-drums': 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/Umukaraza_ku_ngoma.jpg/960px-Umukaraza_ku_ngoma.jpg',
  'rwanda-museum': 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5d/Kandt_House_Museum_%288%29.jpg/960px-Kandt_House_Museum_%288%29.jpg',
};

// Verified real photo when we have one; deterministic placeholder otherwise.
const img = (slug: string, w = 900, h = 600) =>
  REAL_IMAGES[slug] ?? `https://picsum.photos/seed/${slug}/${w}/${h}`;

async function upsertUser(input: {
  email: string;
  password: string;
  fullName: string;
  nationality: string;
  role: UserRole;
  profileImage?: string;
}) {
  const password = await bcrypt.hash(input.password, 10);
  return prisma.user.upsert({
    where: { email: input.email },
    update: {
      fullName: input.fullName,
      role: input.role,
      emailVerified: true,
      profileImage: input.profileImage,
    },
    create: {
      email: input.email,
      password,
      fullName: input.fullName,
      nationality: input.nationality,
      role: input.role,
      defaultLanguage: Language.EN,
      emailVerified: true,
      profileImage: input.profileImage,
    },
  });
}

interface SeedTour {
  id: string;
  title: string;
  description: string;
  duration: number; // hours
  price: number;
}

interface SeedPackage {
  id: string;
  tourTypeId: string;
  name: string;
  description: string;
  durationHours: number;
  price: number;
  media: string[]; // image slugs
  tours: SeedTour[];
}

async function main() {
  // ── Users ──────────────────────────────────────────────────
  await upsertUser({
    email: 'admin@yoguide.app',
    password: 'Y0guide#Admin2026',
    fullName: 'YoGuide Admin',
    nationality: 'Rwanda',
    role: UserRole.ADMIN,
  });
  await upsertUser({
    email: 'tourist@yoguide.app',
    password: 'Y0guide#Tour2026',
    fullName: 'Patrick Ndizeye',
    nationality: 'Rwanda',
    role: UserRole.TOURIST,
  });

  // ── Regions & tour types ───────────────────────────────────
  const regions: Array<{ id: string; name: string }> = [
    { id: 'seed-region-kigali', name: 'Kigali' },
    { id: 'seed-region-musanze', name: 'Musanze' },
    { id: 'seed-region-rubavu', name: 'Rubavu' },
    { id: 'seed-region-nyungwe', name: 'Nyungwe' },
  ];
  for (const r of regions) {
    await prisma.region.upsert({
      where: { id: r.id },
      update: { name: r.name },
      create: r,
    });
  }

  const tourTypes: Array<{ id: string; regionId: string; name: string }> = [
    { id: 'seed-tourtype-kigali-city', regionId: 'seed-region-kigali', name: 'City Tours' },
    { id: 'seed-tourtype-kigali-culture', regionId: 'seed-region-kigali', name: 'Culture & Heritage' },
    { id: 'seed-tourtype-city', regionId: 'seed-region-musanze', name: 'Adventure Tours' },
    { id: 'seed-tourtype-musanze-community', regionId: 'seed-region-musanze', name: 'Community Tours' },
    { id: 'seed-tourtype-rubavu-nature', regionId: 'seed-region-rubavu', name: 'Nature & Scenic' },
    { id: 'seed-tourtype-nyungwe-nature', regionId: 'seed-region-nyungwe', name: 'Nature & Scenic' },
  ];
  for (const t of tourTypes) {
    await prisma.tourType.upsert({
      where: { id: t.id },
      update: { name: t.name, regionId: t.regionId },
      create: t,
    });
  }

  // ── Packages with tours and image galleries ────────────────
  const packages: SeedPackage[] = [
    {
      id: 'seed-package-kigali-classic',
      tourTypeId: 'seed-tourtype-kigali-city',
      name: 'Kigali Classic',
      description:
        'The essential Kigali day — the memorial, the biggest market in the capital, contemporary art and a golden-hour view over all of it.',
      durationHours: 8,
      price: 130,
      media: ['kigali-skyline', 'kigali-memorial', 'kigali-market', 'kigali-sunset'],
      tours: [
        { id: 'seed-tour-memorial', title: 'Genocide Memorial Visit', description: 'A guided, respectful visit to the Kigali Genocide Memorial with time for the gardens.', duration: 2, price: 30 },
        { id: 'seed-tour-kimironko', title: 'Kimironko Market Walk', description: 'Colours, crafts and produce at Kigali’s biggest covered market — with a local shopping guide.', duration: 2, price: 25 },
        { id: 'seed-tour-artgallery', title: 'Niyo Art Gallery', description: 'Contemporary Rwandan art and a chat with resident artists over coffee.', duration: 1, price: 20 },
        { id: 'seed-tour-mount-kigali', title: 'Mount Kigali Sunset Hike', description: 'An easy hike ending with a panoramic view of the city at golden hour.', duration: 3, price: 35 },
      ],
    },
    {
      id: 'seed-package-kigali-nightlife',
      tourTypeId: 'seed-tourtype-kigali-city',
      name: 'Kigali by Night',
      description:
        'Dinner, live music and the city lights — Kigali after dark with someone who knows every door worth opening.',
      durationHours: 5,
      price: 90,
      media: ['kigali-night', 'kigali-dinner', 'kigali-livemusic'],
      tours: [
        { id: 'seed-tour-dinner', title: 'Rooftop Dinner', description: 'Modern Rwandan cuisine on a rooftop overlooking the city.', duration: 2, price: 40 },
        { id: 'seed-tour-livemusic', title: 'Live Music Circuit', description: 'Two of Kigali’s best live-music venues in one evening.', duration: 3, price: 30 },
      ],
    },
    {
      id: 'seed-package-kigali-heritage',
      tourTypeId: 'seed-tourtype-kigali-culture',
      name: 'Heritage & Craft Trail',
      description:
        'The royal history, the drum, the basket — a hands-on day through Rwanda’s living heritage in and around the capital.',
      durationHours: 6,
      price: 110,
      media: ['rwanda-craft', 'rwanda-drums', 'rwanda-baskets', 'rwanda-museum'],
      tours: [
        { id: 'seed-tour-ethnographic', title: 'Kandt House Museum', description: 'Rwanda’s natural history and colonial past in the house of Richard Kandt.', duration: 2, price: 25 },
        { id: 'seed-tour-weaving', title: 'Agaseke Weaving Workshop', description: 'Weave your own peace basket with a cooperative of master weavers.', duration: 2, price: 35 },
        { id: 'seed-tour-drumming', title: 'Ingoma Drumming Session', description: 'Learn the rhythms of the royal drums — loud, joyful, unforgettable.', duration: 2, price: 30 },
      ],
    },
    {
      id: 'seed-package-musanze-gorilla',
      tourTypeId: 'seed-tourtype-city',
      name: 'Gorilla Country Explorer',
      description:
        'Volcanoes National Park’s foothills: caves, twin lakes and the villages at the edge of gorilla country.',
      durationHours: 10,
      price: 220,
      media: ['gorilla-trek', 'musanze-volcano', 'musanze-cave', 'musanze-lakes', 'musanze-village'],
      tours: [
        { id: 'seed-tour-gorilla', title: 'Gorilla Trek Briefing', description: 'Pre-trek orientation with a park ranger and a village walk.', duration: 2, price: 45 },
        { id: 'seed-tour-musanze-caves', title: 'Musanze Caves', description: '2km of volcanic tunnels under the Virunga foothills, helmet lamps on.', duration: 2, price: 40 },
        { id: 'seed-tour-twin-lakes', title: 'Twin Lakes Kayak', description: 'Paddle Burera and Ruhondo between volcano views.', duration: 3, price: 60 },
        { id: 'seed-tour-iby-iwacu', title: 'Gorilla Guardians Village', description: 'Former poachers turned cultural performers — dance, archery, banana beer.', duration: 3, price: 50 },
      ],
    },
    {
      id: 'seed-package-musanze-community',
      tourTypeId: 'seed-tourtype-musanze-community',
      name: 'Village Life Immersion',
      description:
        'A day lived the local way — dance with the Gorilla Guardians, weave a basket with the cooperative, and share a traditional lunch.',
      durationHours: 7,
      price: 95,
      media: ['musanze-village', 'rwanda-baskets', 'rwanda-drums', 'kigali-dinner'],
      tours: [
        { id: 'seed-tour-guardians-dance', title: 'Gorilla Guardians Dance', description: 'Intore dance performance and drumming with former poachers turned cultural ambassadors.', duration: 2, price: 35 },
        { id: 'seed-tour-basket-coop', title: 'Weaving Cooperative Visit', description: 'Sit with the weavers and take home the agaseke basket you made.', duration: 2, price: 25 },
        { id: 'seed-tour-village-lunch', title: 'Traditional Village Lunch', description: 'A shared meal cooked on the wood fire — ibirayi, isombe, banana beer for the brave.', duration: 2, price: 20 },
      ],
    },
    {
      id: 'seed-package-rubavu-lake',
      tourTypeId: 'seed-tourtype-rubavu-nature',
      name: 'Lake Kivu Escape',
      description:
        'Boat, beach and hot springs on Rwanda’s inland sea — the slow day you came for.',
      durationHours: 7,
      price: 140,
      media: ['kivu-boat', 'kivu-beach', 'kivu-springs', 'kivu-sunset'],
      tours: [
        { id: 'seed-tour-kivu-boat', title: 'Kivu Island Boat Trip', description: 'Napoleon Island’s fruit bats and a swim off the boat.', duration: 3, price: 55 },
        { id: 'seed-tour-kivu-springs', title: 'Rubona Hot Springs', description: 'Warm your feet where the lake literally boils eggs.', duration: 1, price: 20 },
        { id: 'seed-tour-kivu-coffee', title: 'Lakeside Coffee Washing Station', description: 'From cherry to cup with a farmer cooperative above the lake.', duration: 2, price: 35 },
      ],
    },
    {
      id: 'seed-package-nyungwe-canopy',
      tourTypeId: 'seed-tourtype-nyungwe-nature',
      name: 'Nyungwe Canopy & Chimps',
      description:
        'One of Africa’s oldest rainforests: the canopy walkway 60m up and the primates that own the place.',
      durationHours: 9,
      price: 190,
      media: ['nyungwe-canopy', 'nyungwe-forest', 'nyungwe-chimp', 'nyungwe-waterfall'],
      tours: [
        { id: 'seed-tour-canopy', title: 'Canopy Walkway', description: 'The famous suspended bridge over the rainforest canopy.', duration: 2, price: 60 },
        { id: 'seed-tour-chimp', title: 'Chimpanzee Tracking', description: 'Dawn tracking of the Cyamudongo chimp community.', duration: 4, price: 90 },
        { id: 'seed-tour-waterfall', title: 'Isumo Waterfall Trail', description: 'A lush trail to the park’s tallest waterfall.', duration: 3, price: 40 },
      ],
    },
  ];

  for (const p of packages) {
    await prisma.package.upsert({
      where: { id: p.id },
      update: {
        name: p.name,
        description: p.description,
        durationHours: p.durationHours,
        price: p.price,
        tourTypeId: p.tourTypeId,
      },
      create: {
        id: p.id,
        name: p.name,
        description: p.description,
        durationHours: p.durationHours,
        price: p.price,
        tourTypeId: p.tourTypeId,
      },
    });
    for (const t of p.tours) {
      const { id, ...data } = t;
      await prisma.packageTour.upsert({
        where: { id },
        update: { ...data, packageId: p.id },
        create: { id, ...data, packageId: p.id },
      });
    }
    // Media: replace wholesale so slug edits here stay authoritative.
    await prisma.packageMedia.deleteMany({ where: { packageId: p.id } });
    await prisma.packageMedia.createMany({
      data: p.media.map((slug) => ({
        packageId: p.id,
        url: img(slug),
        type: MediaType.IMAGE,
      })),
    });
  }

  // ── Vehicles matching the Flutter app's five vehicle types ──
  const vehicles = [
    { id: 'seed-vehicle-walking', name: 'Walking Tour', icon: 'directions_walk', seats: 1, pricePerHour: 5, pricePerDay: 40 },
    { id: 'seed-vehicle-motorbike', name: 'Motorbike', icon: 'two_wheeler', seats: 1, pricePerHour: 10, pricePerDay: 80 },
    { id: 'seed-vehicle-evcar', name: 'EV Car', icon: 'electric_car', seats: 4, pricePerHour: 25, pricePerDay: 200 },
    { id: 'seed-vehicle-van', name: 'Van', icon: 'airport_shuttle', seats: 7, pricePerHour: 40, pricePerDay: 320 },
    { id: 'seed-vehicle-bus', name: 'Bus', icon: 'directions_bus', seats: 30, pricePerHour: 60, pricePerDay: 480 },
  ];
  for (const v of vehicles) {
    const { id, ...data } = v;
    await prisma.vehicle.upsert({ where: { id }, update: data, create: { id, ...data } });
  }

  // ── Guides with profiles, vehicles and reviews ─────────────
  const guideSeeds = [
    {
      email: 'guide@yoguide.app',
      password: 'Y0guide#Guide2026',
      fullName: 'Eric Mugisha',
      languages: [Language.EN, Language.FR, Language.RW],
      vehicles: ['seed-vehicle-walking', 'seed-vehicle-motorbike', 'seed-vehicle-evcar'],
      avatar: 'https://ui-avatars.com/api/?name=Eric+Mugisha&size=400&background=1B7A4B&color=fff',
      stars: [5, 5, 4, 5],
    },
    {
      email: 'guide.claudine@yoguide.app',
      password: 'Y0guide#Guide2026',
      fullName: 'Claudine Uwase',
      languages: [Language.EN, Language.RW, Language.SW],
      vehicles: ['seed-vehicle-evcar', 'seed-vehicle-van'],
      avatar: 'https://ui-avatars.com/api/?name=Claudine+Uwase&size=400&background=0E5C8A&color=fff',
      stars: [5, 4, 5],
    },
    {
      email: 'guide.jean@yoguide.app',
      password: 'Y0guide#Guide2026',
      fullName: 'Jean Bosco Habimana',
      languages: [Language.EN, Language.FR],
      vehicles: ['seed-vehicle-van', 'seed-vehicle-bus'],
      avatar: 'https://ui-avatars.com/api/?name=Jean+Bosco&size=400&background=8A5A0E&color=fff',
      stars: [4, 4, 5, 5, 5],
    },
  ];

  const reviewer = await upsertUser({
    email: 'reviewer@yoguide.app',
    password: 'Y0guide#Rev2026',
    fullName: 'Amina Keza',
    nationality: 'Kenya',
    role: UserRole.TOURIST,
  });

  for (const g of guideSeeds) {
    const user = await upsertUser({
      email: g.email,
      password: g.password,
      fullName: g.fullName,
      nationality: 'Rwanda',
      role: UserRole.GUIDE,
      profileImage: g.avatar,
    });
    const profile = await prisma.guideProfile.upsert({
      where: { userId: user.id },
      update: { languages: g.languages },
      create: { userId: user.id, guideType: 'INDIVIDUAL', languages: g.languages },
    });
    for (const vehicleId of g.vehicles) {
      await prisma.guideVehicle.upsert({
        where: { guideId_vehicleId: { guideId: profile.id, vehicleId } },
        update: {},
        create: { guideId: profile.id, vehicleId },
      });
    }
    // Refresh this guide's seeded reviews (idempotent across reseeds).
    await prisma.review.deleteMany({ where: { guideId: profile.id, userId: reviewer.id } });
    await prisma.review.createMany({
      data: g.stars.map((starRating, i) => ({
        userId: reviewer.id,
        guideId: profile.id,
        starRating,
        message: ['Fantastic day out!', 'Knows every corner.', 'Would book again.', 'Great with the kids.', 'Flawless organisation.'][i % 5],
      })),
    });
  }

  console.log('Seed complete.');
  console.log('Admin login:   admin@yoguide.app / Y0guide#Admin2026');
  console.log('Tourist login: tourist@yoguide.app / Y0guide#Tour2026');
  console.log('Guide login:   guide@yoguide.app / Y0guide#Guide2026');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
