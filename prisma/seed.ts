// Idempotent seed for Role, User (default admin), and Place. Re-run any time.
//
// Source of truth for places is the JSON file emitted by
// `dart run tool/dump_places.dart` in packages/yoguide_shared.
//
// Run with: npm run prisma:seed (uses ts-node).

import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import * as fs from 'fs';
import * as path from 'path';

interface SeedRole {
  key: string;
  label: string;
  permissions: string[];
  isSystem: boolean;
}

interface SeedPlace {
  id: string;
  name: string;
  tagline: string;
  kind: string;
  latitude: number;
  longitude: number;
  address: string;
  phone: string;
  hours: string;
  rating: number;
  priceLabel: string;
  images: string[];
  tags: string[];
  about: string;
  venueRef: string | null;
  experienceAdultUsd: number;
}

const SYSTEM_ROLES: SeedRole[] = [
  {
    key: 'user',
    label: 'Tourist',
    permissions: [],
    isSystem: true,
  },
  {
    key: 'admin',
    label: 'Administrator',
    permissions: ['*'],
    isSystem: true,
  },
  {
    key: 'tour',
    label: 'Tour Operator',
    permissions: [
      'admin.panel.access',
      'places.read.admin',
    ],
    isSystem: true,
  },
  {
    key: 'institute',
    label: 'Institutional Partner',
    permissions: [
      'admin.panel.access',
      'places.read.admin',
    ],
    isSystem: true,
  },
  // Demonstrates that roles are liquid: this is added the same way a future
  // role would be — no code changes elsewhere needed.
  {
    key: 'hotel_manager',
    label: 'Hotel Manager',
    permissions: [
      'admin.panel.access',
      'places.read.admin',
      'places.write',
      'bookings.read',
    ],
    isSystem: false,
  },
];

const DEFAULT_ADMIN = {
  email: 'admin@yoguide.app',
  fullName: 'yoGuide Admin',
  password: 'Y0guide#Admin2026',
  roleKey: 'admin',
};

async function seedRoles(prisma: PrismaClient): Promise<void> {
  for (const r of SYSTEM_ROLES) {
    await prisma.role.upsert({
      where: { key: r.key },
      update: {
        label: r.label,
        permissions: r.permissions,
        isSystem: r.isSystem,
      },
      create: {
        key: r.key,
        label: r.label,
        permissions: r.permissions,
        isSystem: r.isSystem,
      },
    });
  }
  console.log(`Seeded Role: ${SYSTEM_ROLES.length} upserted.`);
}

async function seedDefaultAdmin(prisma: PrismaClient): Promise<void> {
  const existing = await prisma.user.findUnique({
    where: { email: DEFAULT_ADMIN.email },
  });
  if (existing) {
    // Make sure the existing admin still has the admin role even if someone
    // demoted it manually — but never re-set their password silently.
    if (existing.roleKey !== DEFAULT_ADMIN.roleKey) {
      await prisma.user.update({
        where: { id: existing.id },
        data: { roleKey: DEFAULT_ADMIN.roleKey },
      });
      console.log(`Default admin role restored for ${DEFAULT_ADMIN.email}.`);
    } else {
      console.log(`Default admin already exists; left as-is.`);
    }
    return;
  }
  const passwordHash = await bcrypt.hash(DEFAULT_ADMIN.password, 10);
  await prisma.user.create({
    data: {
      email: DEFAULT_ADMIN.email,
      passwordHash,
      fullName: DEFAULT_ADMIN.fullName,
      roleKey: DEFAULT_ADMIN.roleKey,
    },
  });
  console.log(
    `Created default admin: ${DEFAULT_ADMIN.email} / ${DEFAULT_ADMIN.password}`,
  );
}

async function seedPlaces(prisma: PrismaClient): Promise<void> {
  const file = path.resolve(__dirname, 'seed-places.json');
  const places = JSON.parse(fs.readFileSync(file, 'utf8')) as SeedPlace[];
  for (const p of places) {
    const data = {
      name: p.name,
      tagline: p.tagline,
      kind: p.kind,
      latitude: p.latitude,
      longitude: p.longitude,
      address: p.address,
      phone: p.phone,
      hours: p.hours,
      rating: p.rating,
      priceLabel: p.priceLabel,
      images: p.images,
      tags: p.tags,
      about: p.about,
      venueRef: p.venueRef,
      experienceAdultUsd: p.experienceAdultUsd,
    };
    await prisma.place.upsert({
      where: { id: p.id },
      update: data,
      create: { id: p.id, ...data },
    });
  }
  console.log(`Seeded Place: ${places.length} upserted.`);
}

// ═════════════════════════════════════════════════════════════════════════
//  Cities, events, phrases
// ═════════════════════════════════════════════════════════════════════════

const SEED_CITIES = [
  {
    slug: 'kigali',
    name: 'Kigali',
    country: 'Rwanda',
    region: 'Kigali Province',
    description:
      "Rwanda's capital — clean, hilly, famously well-organised. The platform's most active city.",
    latitude: -1.9441,
    longitude: 30.0619,
    isFeatured: true,
  },
  {
    slug: 'musanze',
    name: 'Musanze',
    country: 'Rwanda',
    region: 'Northern Province',
    description:
      'Gateway to Volcanoes National Park and gorilla trekking. Coffee, caves, lakes.',
    latitude: -1.4994,
    longitude: 29.6347,
    isFeatured: true,
  },
  {
    slug: 'gisenyi',
    name: 'Gisenyi',
    country: 'Rwanda',
    region: 'Western Province',
    description: 'Lake Kivu beaches and the DRC border crossing at Goma.',
    latitude: -1.7026,
    longitude: 29.2569,
    isFeatured: false,
  },
  {
    slug: 'huye',
    name: 'Huye',
    country: 'Rwanda',
    region: 'Southern Province',
    description: 'The university town, formerly Butare. Ethnographic museum.',
    latitude: -2.6027,
    longitude: 29.7398,
    isFeatured: false,
  },
  {
    slug: 'nyungwe',
    name: 'Nyungwe',
    country: 'Rwanda',
    region: 'Western Province',
    description: 'Montane rainforest, chimps, and a 200-metre canopy walk.',
    latitude: -2.4769,
    longitude: 29.1506,
    isFeatured: false,
  },
];

async function seedCities(prisma: PrismaClient): Promise<void> {
  for (const c of SEED_CITIES) {
    await prisma.city.upsert({
      where: { slug: c.slug },
      update: c,
      create: c,
    });
  }
  console.log(`Seeded City: ${SEED_CITIES.length} upserted.`);
}

async function seedEvents(prisma: PrismaClient): Promise<void> {
  const cities = await prisma.city.findMany();
  const cityBySlug = new Map(cities.map((c) => [c.slug, c.id]));
  const now = new Date();
  const events: Array<{
    cityId: string;
    title: string;
    description: string;
    startsAt: Date;
    endsAt: Date;
    venue: string;
    priceLabel: string;
    tags: string[];
  }> = [];
  const seedDefs = [
    {
      city: 'kigali',
      title: 'Kigali Up — comedy night',
      description: 'Stand-up showcase featuring four East African comedians.',
      daysFromNow: 3,
      durationHours: 3,
      venue: 'Kigali Convention Centre',
      priceLabel: 'USD 12',
      tags: ['comedy', 'nightlife'],
    },
    {
      city: 'kigali',
      title: 'Made-in-Rwanda Expo',
      description: 'Annual showcase for local manufacturers and artisans.',
      daysFromNow: 11,
      durationHours: 9 * 24,
      venue: 'Gikondo Expo Grounds',
      priceLabel: 'Free',
      tags: ['expo', 'crafts'],
    },
    {
      city: 'musanze',
      title: 'Kwita Izina · Gorilla naming ceremony',
      description: 'Annual public ceremony naming this year\'s baby gorillas.',
      daysFromNow: 28,
      durationHours: 6,
      venue: 'Kinigi park gate',
      priceLabel: 'Free',
      tags: ['culture', 'wildlife'],
    },
    {
      city: 'gisenyi',
      title: 'Lake Kivu Music Festival',
      description: 'Three days, two stages, lake views.',
      daysFromNow: 21,
      durationHours: 3 * 24,
      venue: 'Rubavu beach',
      priceLabel: 'USD 35',
      tags: ['music', 'festival'],
    },
    {
      city: 'huye',
      title: 'Ethnographic Museum night tour',
      description: 'After-hours guided tour with intore drumming finale.',
      daysFromNow: 6,
      durationHours: 2,
      venue: 'Ethnographic Museum',
      priceLabel: 'USD 8',
      tags: ['culture', 'museum'],
    },
  ];
  for (const e of seedDefs) {
    const cityId = cityBySlug.get(e.city);
    if (!cityId) continue;
    const startsAt = new Date(now.getTime() + e.daysFromNow * 86400000);
    const endsAt = new Date(startsAt.getTime() + e.durationHours * 3600000);
    events.push({
      cityId,
      title: e.title,
      description: e.description,
      startsAt,
      endsAt,
      venue: e.venue,
      priceLabel: e.priceLabel,
      tags: e.tags,
    });
  }
  await prisma.event.deleteMany();
  for (const e of events) {
    await prisma.event.create({ data: e });
  }
  console.log(`Seeded Event: ${events.length} created.`);
}

const SEED_PHRASES = [
  { category: 'greetings', english: 'Hello', kinyarwanda: 'Muraho', french: 'Bonjour' },
  { category: 'greetings', english: 'Good morning', kinyarwanda: 'Mwaramutse', french: 'Bonjour' },
  { category: 'greetings', english: 'Good evening', kinyarwanda: 'Mwiriwe', french: 'Bonsoir' },
  { category: 'greetings', english: 'Goodbye', kinyarwanda: 'Murabeho', french: 'Au revoir' },
  { category: 'greetings', english: 'How are you?', kinyarwanda: 'Bite?', french: 'Ça va ?' },
  { category: 'manners', english: 'Thank you', kinyarwanda: 'Murakoze', french: 'Merci' },
  { category: 'manners', english: "You're welcome", kinyarwanda: 'Murakaza neza', french: 'De rien' },
  { category: 'manners', english: 'Please', kinyarwanda: 'Nyabuneka', french: "S'il vous plaît" },
  { category: 'manners', english: 'Excuse me', kinyarwanda: 'Mbabarira', french: 'Excusez-moi' },
  { category: 'getting-around', english: 'Where is...?', kinyarwanda: '... iri he?', french: 'Où est... ?' },
  { category: 'getting-around', english: 'How much?', kinyarwanda: 'Ni angahe?', french: 'Combien ?' },
  { category: 'getting-around', english: 'Left', kinyarwanda: 'Ibumoso', french: 'Gauche' },
  { category: 'getting-around', english: 'Right', kinyarwanda: 'Iburyo', french: 'Droite' },
  { category: 'getting-around', english: 'Straight', kinyarwanda: 'Komeza', french: 'Tout droit' },
  { category: 'food', english: 'Water', kinyarwanda: 'Amazi', french: 'Eau' },
  { category: 'food', english: 'Food', kinyarwanda: 'Ibiryo', french: 'Nourriture' },
  { category: 'food', english: 'Coffee', kinyarwanda: 'Ikawa', french: 'Café' },
  { category: 'numbers', english: 'One', kinyarwanda: 'Rimwe', french: 'Un' },
  { category: 'numbers', english: 'Two', kinyarwanda: 'Kabiri', french: 'Deux' },
  { category: 'numbers', english: 'Three', kinyarwanda: 'Gatatu', french: 'Trois' },
];

async function seedPhrases(prisma: PrismaClient): Promise<void> {
  await prisma.phrase.deleteMany();
  for (const p of SEED_PHRASES) {
    await prisma.phrase.create({ data: p });
  }
  console.log(`Seeded Phrase: ${SEED_PHRASES.length} created.`);
}

// ═════════════════════════════════════════════════════════════════════════
//  Tours, guides, vendors, products
// ═════════════════════════════════════════════════════════════════════════

async function seedToursAndGuides(prisma: PrismaClient): Promise<void> {
  const cities = await prisma.city.findMany();
  const cityBySlug = new Map(cities.map((c) => [c.slug, c.id]));

  const tourDefs = [
    {
      slug: 'classic-musanze-loop',
      title: 'Classic Musanze Loop',
      description: 'A half-day moto tour through the highlights of Musanze town and Kinigi.',
      vehicleType: 'motorbike',
      durationMinutes: 240,
      priceCents: 4500,
      city: 'musanze',
      highlights: ['Kinigi briefing centre', 'Buhanga Eco-Park', 'Goico Plaza coffee'],
      stops: [
        { ordinal: 1, title: 'Kinigi park gate', durationMinutes: 30 },
        { ordinal: 2, title: 'Buhanga sacred forest', durationMinutes: 60 },
        { ordinal: 3, title: 'Volcanoes lookout', durationMinutes: 45 },
        { ordinal: 4, title: 'Coffee at Goico Plaza', durationMinutes: 60 },
      ],
    },
    {
      slug: 'kigali-history-day',
      title: 'Kigali History Day',
      description: 'A full-day EV-car tour covering the Genocide Memorial, Camp Kigali, and Kandt House.',
      vehicleType: 'ev_car',
      durationMinutes: 480,
      priceCents: 12500,
      city: 'kigali',
      highlights: ['Kigali Genocide Memorial', 'Kandt House Museum', 'Inema Arts Centre'],
      stops: [
        { ordinal: 1, title: 'Kigali Genocide Memorial', durationMinutes: 120 },
        { ordinal: 2, title: 'Lunch at Repub Lounge', durationMinutes: 90 },
        { ordinal: 3, title: 'Kandt House Museum', durationMinutes: 75 },
        { ordinal: 4, title: 'Inema Arts Centre', durationMinutes: 60 },
        { ordinal: 5, title: 'Sunset at Mt Kigali', durationMinutes: 90 },
      ],
    },
    {
      slug: 'lake-kivu-sunset',
      title: 'Lake Kivu Sunset',
      description: 'Boat ride out to the islands at golden hour, stop at Napoleon Island for the bats.',
      vehicleType: 'minivan',
      durationMinutes: 180,
      priceCents: 3500,
      city: 'gisenyi',
      highlights: ['Napoleon Island', 'Bat colony', 'Rubavu beach barbecue'],
      stops: [
        { ordinal: 1, title: 'Rubavu pier', durationMinutes: 20 },
        { ordinal: 2, title: 'Napoleon Island', durationMinutes: 90 },
        { ordinal: 3, title: 'Beach barbecue', durationMinutes: 60 },
      ],
    },
    {
      slug: 'nyungwe-canopy',
      title: 'Nyungwe Canopy Walk',
      description: 'The 200-metre suspension bridge plus a chimp habituation hike. Full-day.',
      vehicleType: 'minivan',
      durationMinutes: 540,
      priceCents: 18500,
      city: 'nyungwe',
      highlights: ['Canopy walk', 'Chimp habituation', 'Tea estate stop'],
      stops: [
        { ordinal: 1, title: 'Park entry', durationMinutes: 45 },
        { ordinal: 2, title: 'Canopy walk', durationMinutes: 90 },
        { ordinal: 3, title: 'Chimp tracking', durationMinutes: 240 },
        { ordinal: 4, title: 'Gisakura tea estate', durationMinutes: 90 },
      ],
    },
  ];

  await prisma.tourStop.deleteMany();
  await prisma.tour.deleteMany();
  for (const t of tourDefs) {
    const created = await prisma.tour.create({
      data: {
        title: t.title,
        description: t.description,
        vehicleType: t.vehicleType,
        durationMinutes: t.durationMinutes,
        priceCents: t.priceCents,
        cityId: cityBySlug.get(t.city) ?? null,
        highlights: t.highlights,
      },
    });
    for (const s of t.stops) {
      await prisma.tourStop.create({ data: { tourId: created.id, ...s } });
    }
  }
  console.log(`Seeded Tour: ${tourDefs.length} with stops.`);

  const guideDefs = [
    {
      fullName: 'Patrick Habimana',
      emoji: '🏔️',
      bio: '12 years guiding gorilla treks. Speaks 5 languages.',
      rating: 4.9, reviewCount: 287, toursCompleted: 412, responseRatePct: 100,
      hourlyRateCents: 1500, specialties: ['Gorilla trekking', 'Birding'],
      languages: ['English', 'French', 'Kinyarwanda', 'Kiswahili', 'German'],
      yearsExperience: 12, isVerified: true, city: 'Musanze',
    },
    {
      fullName: 'Aline Mukasine',
      emoji: '🎨',
      bio: 'Cultural guide focused on Kigali — markets, art, and the modern story of the city.',
      rating: 4.8, reviewCount: 154, toursCompleted: 198, responseRatePct: 96,
      hourlyRateCents: 1200, specialties: ['Cultural tours', 'Markets'],
      languages: ['English', 'French', 'Kinyarwanda'],
      yearsExperience: 7, isVerified: true, city: 'Kigali',
    },
    {
      fullName: 'Eric Nshuti',
      emoji: '🚣',
      bio: 'Lake Kivu boat captain. Family-friendly trips, dolphin-style splash detours.',
      rating: 4.7, reviewCount: 89, toursCompleted: 142, responseRatePct: 88,
      hourlyRateCents: 1000, specialties: ['Lake tours', 'Boat trips'],
      languages: ['English', 'Kinyarwanda', 'Kiswahili'],
      yearsExperience: 9, isVerified: true, city: 'Gisenyi',
    },
    {
      fullName: 'Solange Iradukunda',
      emoji: '🌿',
      bio: 'Biology PhD, Nyungwe specialist — chimps, primates, montane plants.',
      rating: 4.95, reviewCount: 62, toursCompleted: 71, responseRatePct: 100,
      hourlyRateCents: 2000, specialties: ['Wildlife', 'Botany'],
      languages: ['English', 'French'],
      yearsExperience: 6, isVerified: true, city: 'Nyungwe',
    },
    {
      fullName: 'Theo Karangwa',
      emoji: '🏍️',
      bio: 'Moto-tour driver and unofficial city DJ. Knows every shortcut in Kigali.',
      rating: 4.6, reviewCount: 211, toursCompleted: 340, responseRatePct: 92,
      hourlyRateCents: 800, specialties: ['Moto tours', 'Transport'],
      languages: ['English', 'Kinyarwanda'],
      yearsExperience: 5, isVerified: false, city: 'Kigali',
    },
  ];

  await prisma.guide.deleteMany();
  for (const g of guideDefs) {
    await prisma.guide.create({ data: g });
  }
  console.log(`Seeded Guide: ${guideDefs.length} created.`);
}

async function seedVendorsAndProducts(prisma: PrismaClient): Promise<void> {
  const vendorDefs = [
    {
      slug: 'urwibutso',
      name: 'Urwibutso · Sina Gerard',
      category: 'shop',
      description: 'Iconic Rwandan brand — Akabanga chili oil, biscuits, and banana wine.',
      city: 'Nyirangarama',
      isVerified: true,
      rating: 4.7,
      products: [
        { slug: 'akabanga-50ml', title: 'Akabanga chili oil 50ml', description: 'Iconic Rwandan birds-eye chili oil — a few drops go a long way.', priceCents: 400, category: 'food', images: ['assets/images/coffee-exports.jpg'] },
        { slug: 'urwagwa-bananas', title: 'Urwagwa banana wine 750ml', description: 'Traditional banana wine, fermented at the Urwibutso estate in Nyirangarama.', priceCents: 1200, category: 'beverage', images: ['assets/images/coffee-exports.jpg'] },
      ],
    },
    {
      slug: 'kigali-coffee-collective',
      name: 'Kigali Coffee Collective',
      category: 'shop',
      description: 'Specialty single-origin Rwandan coffee — beans, ground, capsules.',
      city: 'Kigali',
      isVerified: true,
      rating: 4.8,
      products: [
        { slug: 'rwanda-bourbon-250g', title: 'Rwanda Bourbon · 250g', description: 'Single-origin Bourbon variety from the Northern Province. Bright, citrusy.', priceCents: 1800, category: 'beverage', images: ['assets/images/cofee.jpg'] },
        { slug: 'cooperative-blend-1kg', title: 'Cooperative Blend · 1kg', description: 'A blend of beans from three cooperatives — fuller body, chocolatey finish.', priceCents: 4500, category: 'beverage', images: ['assets/images/cofee.jpg'] },
      ],
    },
    {
      slug: 'inkomoko-baskets',
      name: 'Inkomoko Baskets Co-op',
      category: 'shop',
      description: 'Hand-woven peace baskets, agaseke, by a women-led co-op outside Musanze.',
      city: 'Musanze',
      isVerified: true,
      rating: 4.9,
      products: [
        { slug: 'agaseke-medium', title: 'Agaseke Peace Basket · medium', description: 'Hand-woven by a women-led cooperative outside Musanze. Each piece is unique.', priceCents: 2200, category: 'art', images: ['assets/images/basket.jpg'], badge: 'Hand-woven' },
        { slug: 'agaseke-mini', title: 'Agaseke Mini · 4-pack', description: 'Four small woven baskets, perfect as gifts.', priceCents: 1500, category: 'art', images: ['assets/images/basket.jpg'] },
      ],
    },
    {
      slug: 'five-volcanoes-lodge',
      name: 'Five Volcanoes Lodge',
      category: 'hotel',
      description: 'Boutique lodge minutes from the Kinigi park gate.',
      city: 'Musanze',
      isVerified: true,
      rating: 4.6,
      products: [],
    },
  ];

  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.product.deleteMany();
  await prisma.vendor.deleteMany();

  for (const v of vendorDefs) {
    const { products, ...vendorData } = v;
    const vendor = await prisma.vendor.create({ data: vendorData });
    for (const p of products) {
      await prisma.product.create({
        data: { ...p, vendorId: vendor.id },
      });
    }
  }
  console.log(
    `Seeded Vendor: ${vendorDefs.length} with ${vendorDefs.reduce((a, v) => a + v.products.length, 0)} products.`,
  );
}

async function main() {
  const prisma = new PrismaClient();
  try {
    await seedRoles(prisma);
    await seedDefaultAdmin(prisma);
    await seedPlaces(prisma);
    await seedCities(prisma);
    await seedEvents(prisma);
    await seedPhrases(prisma);
    await seedToursAndGuides(prisma);
    await seedVendorsAndProducts(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
