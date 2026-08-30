/**
 * DEMO SEED — investor-presentation dataset for yoGuide.
 *
 * Purpose: make every catalog / dashboard screen render a rich, internally
 * consistent, Rwanda-focused story. Runs on top of the base `seed.ts`
 * (which creates the 4 role accounts) and is fully idempotent — safe to run
 * repeatedly. It never deletes; it upserts by natural keys.
 *
 * Prices are deliberately kept in the base seed's tiny-value convention
 * ($0.02–$0.60) so real-payment testing stays cheap on every environment.
 * Bump them only once the payment gateway is signed off.
 *
 * Run:  npx ts-node prisma/seed-demo.ts
 */
import { PrismaClient, MediaType, BookingStatus, PaymentMethod } from '@prisma/client';

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Image pool — Unsplash CDN (images.unsplash.com). Globally edge-cached and
// fast on conference wifi; every id below was verified to return 200. Slugs
// are matched by keyword to a themed photo so cards look intentional; a
// hashed fallback keeps unknown slugs deterministic. Swap for licensed
// Rwanda photography before any public launch — the frontends already fall
// back to a coloured placeholder on load error.
// ---------------------------------------------------------------------------
const U = (id: string, w = 1200) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&q=70`;

// keyword → Unsplash photo id (scenery / lodging / food)
const SCENE: [RegExp, string][] = [
  [/gorilla|monkey|chimp|fossey|primate/, '1541348263662-e068662d82af'],
  [/bisoke|volcano|hike|kinigi/, '1534177616072-ef7dc120449d'],
  [/kivu|congonile|ihema|boat|lake/, '1493246507139-91e8fad9978e'],
  [/nyungwe|canopy|rainforest|forest/, '1523805009345-7448845a9e53'],
  [/akagera|safari|game|wildlife|big.?five/, '1516426122078-c23e76319801'],
  [/kigali|kimihurura|nyamirambo|city/, '1489749798305-4fea3ae63d43'],
  [/coffee/, '1447933601403-0c6688de566e'],
  [/isombe|brochette|dessert|course|cm-|food/, '1504674900247-0877df9cc836'],
  [/serena|retreat|volcanoes-hotel|hotel|house|lodge/, '1445019980597-93fa8acb246c'],
  [/room|suite/, '1566073771259-6a8506099945'],
  [/itin|cover|trip/, '1502005097973-6a7082348e28'],
  [/exp-/, '1504198266287-1659872e6590'],
];
const SCENE_POOL = [
  '1523805009345-7448845a9e53', '1516426122078-c23e76319801', '1489749798305-4fea3ae63d43',
  '1493246507139-91e8fad9978e', '1534177616072-ef7dc120449d', '1502005097973-6a7082348e28',
  '1547970810-dc1eac37d174', '1504198266287-1659872e6590',
];
const PORTRAIT_POOL = [
  '1507003211169-0a1dd7228f2d', '1494790108377-be9c29b29330', '1500648767791-00dcc994a43e',
  '1534528741775-53994a69daeb', '1558898479-33c0057a5d12', '1531123897727-8f129e1688ce',
];
const hashIdx = (s: string, n: number) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h) % n;
};
const img = (slug: string) => {
  for (const [re, id] of SCENE) if (re.test(slug)) return U(id);
  return U(SCENE_POOL[hashIdx(slug, SCENE_POOL.length)]);
};
const portrait = (slug: string) => U(PORTRAIT_POOL[hashIdx(slug, PORTRAIT_POOL.length)], 480);

const bcrypt = require('bcryptjs');
const DEMO_PASSWORD = 'Demo@1234';

async function hash(pw: string) {
  return bcrypt.hash(pw, 10);
}

/** find-or-create a User by email */
async function ensureUser(opts: {
  email: string;
  fullName: string;
  role: 'GUIDE' | 'HOTEL_MANAGER' | 'TOURIST';
  nationality?: string;
  profileImage?: string;
}) {
  const existing = await prisma.user.findUnique({ where: { email: opts.email } });
  if (existing) {
    // keep portrait + display name fresh even if the row predates this seed
    const patch: Record<string, unknown> = {};
    if (opts.profileImage && existing.profileImage !== opts.profileImage) patch.profileImage = opts.profileImage;
    if (existing.fullName !== opts.fullName) patch.fullName = opts.fullName;
    if (Object.keys(patch).length) {
      await prisma.user.update({ where: { id: existing.id }, data: patch });
    }
    return existing;
  }
  return prisma.user.create({
    data: {
      email: opts.email,
      fullName: opts.fullName,
      password: await hash(DEMO_PASSWORD),
      nationality: opts.nationality ?? 'Rwandan',
      role: opts.role,
      profileImage: opts.profileImage ?? null,
      emailVerified: true,
      inAppNotifications: true,
      emailNotifications: true,
    },
  });
}

async function ensureRegion(name: string) {
  const found = await prisma.region.findFirst({ where: { name } });
  return found ?? prisma.region.create({ data: { name } });
}

async function ensureTourType(name: string, regionId: string) {
  const found = await prisma.tourType.findFirst({ where: { name, regionId } });
  return found ?? prisma.tourType.create({ data: { name, regionId } });
}

// ---------------------------------------------------------------------------
async function main() {
  console.log('🌱  DEMO SEED starting…');

  // --- 0a. Drop any first-generation picsum.photos image rows so the
  //     create-guards below refill them from the current (Unsplash) pool.
  const pic = { url: { contains: 'picsum.photos' } };
  const dropped =
    (await prisma.packageMedia.deleteMany({ where: pic })).count +
    (await prisma.guideExperienceMedia.deleteMany({ where: pic })).count +
    (await prisma.chefCourseMedia.deleteMany({ where: pic })).count;
  await prisma.user.updateMany({ where: { profileImage: { contains: 'picsum.photos' } }, data: { profileImage: null } });
  for (const c of await prisma.chefCourse.findMany({ where: { imageUrl: { contains: 'picsum.photos' } } })) {
    await prisma.chefCourse.update({ where: { id: c.id }, data: { imageUrl: img(`course-${c.name}`) } });
  }
  for (const it of await prisma.itinerary.findMany({ where: { coverImage: { contains: 'picsum.photos' } } })) {
    await prisma.itinerary.update({ where: { id: it.id }, data: { coverImage: img('itin-cover') } });
  }
  if (dropped) console.log(`  ✓ cleared ${dropped} legacy picsum image rows for refresh`);

  // --- 0. Fix inconsistent region casing from earlier seeds -----------------
  const misCased = await prisma.region.findFirst({ where: { name: 'MUsanze' } });
  if (misCased) {
    await prisma.region.update({ where: { id: misCased.id }, data: { name: 'Musanze' } });
    console.log('  ✓ normalised region name  MUsanze → Musanze');
  }

  // --- 1. Regions ----------------------------------------------------------
  const kigali = await ensureRegion('Kigali');
  const musanze = await ensureRegion('Musanze');
  const rubavu = await ensureRegion('Rubavu');
  const nyungwe = await ensureRegion('Nyungwe');
  const akagera = await ensureRegion('Akagera');
  console.log('  ✓ 5 regions');

  // --- 2. Tour types -----------------------------------------------------
  const ttCity = await ensureTourType('City Tour', kigali.id);
  const ttCulture = await ensureTourType('Cultural Experience', kigali.id);
  const ttGorilla = await ensureTourType('Gorilla Trekking', musanze.id);
  const ttHike = await ensureTourType('Volcano Hike', musanze.id);
  const ttKivu = await ensureTourType('Lake Kivu', rubavu.id);
  const ttCanopy = await ensureTourType('Rainforest & Canopy', nyungwe.id);
  const ttSafari = await ensureTourType('Big Five Safari', akagera.id);
  console.log('  ✓ 7 tour types');

  // --- 3. Packages (+ media + stops) -----------------------------------
  type PkgSpec = {
    key: string;
    name: string;
    tourTypeId: string;
    description: string;
    durationHours: number;
    price: number;
    images: string[];
    stops: { title: string; description: string; duration: number; price: number }[];
  };

  const packages: PkgSpec[] = [
    {
      key: 'kigali-city-highlights',
      name: 'Kigali City Highlights',
      tourTypeId: ttCity.id,
      description:
        'A half-day loop through the capital: the Kigali Genocide Memorial, the buzzing Kimironko Market, Inema Arts Centre and a hilltop coffee stop with skyline views. A gentle, moving introduction to modern Rwanda.',
      durationHours: 5,
      price: 0.12,
      images: [img('kigali-1'), img('kigali-2'), img('kigali-3')],
      stops: [
        { title: 'Kigali Genocide Memorial', description: 'Guided, respectful visit to the memorial and gardens.', duration: 2, price: 0.03 },
        { title: 'Kimironko Market', description: 'Spices, kitenge fabric and fresh produce with your guide.', duration: 1, price: 0.02 },
        { title: 'Inema Arts Centre', description: 'Meet working Rwandan painters and sculptors.', duration: 1, price: 0.03 },
        { title: 'Hilltop coffee tasting', description: 'Single-origin Rwandan coffee with a view over the city.', duration: 1, price: 0.04 },
      ],
    },
    {
      key: 'kimihurura-roundabout',
      name: 'Kimihurura Roundabout Walk',
      tourTypeId: ttCity.id,
      description:
        "A relaxed loop through Kimihurura's embassies, cafés and viewpoints — a good first taste of Kigali on foot.",
      durationHours: 2,
      price: 0.05,
      images: [img('kimihurura-1'), img('kimihurura-2')],
      stops: [
        { title: 'Embassy row', description: 'Leafy diplomatic quarter and its stories.', duration: 1, price: 0.02 },
        { title: 'Car-free zone', description: 'Kigali\'s pedestrian street, cafés and street art.', duration: 1, price: 0.03 },
      ],
    },
    {
      key: 'nyamirambo-womens-walk',
      name: "Nyamirambo Women's Cultural Walk",
      tourTypeId: ttCulture.id,
      description:
        "Kigali's oldest, most diverse neighbourhood, led by the Nyamirambo Women's Centre: a henna workshop, a home-cooked lunch and a walk past mosques, tailors and the local barber.",
      durationHours: 4,
      price: 0.1,
      images: [img('nyamirambo-1'), img('nyamirambo-2'), img('nyamirambo-3')],
      stops: [
        { title: 'Henna & kitenge workshop', description: 'Hands-on session with local artisans.', duration: 1, price: 0.03 },
        { title: 'Neighbourhood walk', description: 'Mosques, tailors, the mill and the barber.', duration: 2, price: 0.03 },
        { title: 'Home-cooked lunch', description: 'Lunch prepared by the cooperative.', duration: 1, price: 0.04 },
      ],
    },
    {
      key: 'gorilla-trek-volcanoes',
      name: 'Mountain Gorilla Trek — Volcanoes National Park',
      tourTypeId: ttGorilla.id,
      description:
        'The flagship Rwandan experience: an early briefing at Kinigi, then a guided hike through bamboo and Hagenia forest to spend a protected hour with a habituated mountain gorilla family. Porters and walking sticks arranged.',
      durationHours: 8,
      price: 0.6,
      images: [img('gorilla-1'), img('gorilla-2'), img('gorilla-3'), img('gorilla-4')],
      stops: [
        { title: 'Kinigi HQ briefing', description: 'Group allocation, safety and etiquette briefing with coffee.', duration: 1, price: 0.05 },
        { title: 'Forest ascent', description: 'Guided trek with trackers to the gorilla family.', duration: 3, price: 0.2 },
        { title: 'One hour with the family', description: 'Protected observation time with a habituated group.', duration: 1, price: 0.3 },
        { title: 'Descent & certificate', description: 'Return hike and presentation of your trekking certificate.', duration: 2, price: 0.05 },
      ],
    },
    {
      key: 'golden-monkey-trek',
      name: 'Golden Monkey Trek',
      tourTypeId: ttGorilla.id,
      description:
        'A shorter, lively alternative to the gorillas: track troops of endangered golden monkeys through the bamboo at the base of the Virungas — superb for photography and families.',
      durationHours: 5,
      price: 0.25,
      images: [img('goldenmonkey-1'), img('goldenmonkey-2')],
      stops: [
        { title: 'Briefing at Kinigi', description: 'Short orientation and group allocation.', duration: 1, price: 0.05 },
        { title: 'Bamboo tracking', description: 'Follow the troop with your ranger.', duration: 3, price: 0.15 },
        { title: 'Return & refreshments', description: 'Walk out and local tea.', duration: 1, price: 0.05 },
      ],
    },
    {
      key: 'dian-fossey-hike',
      name: 'Dian Fossey Tomb & Karisoke Hike',
      tourTypeId: ttHike.id,
      description:
        "A half-day hike to the site of Dian Fossey's Karisoke Research Center and her grave among the gorillas she studied. Steep in places; rewarding views of the Virunga chain.",
      durationHours: 6,
      price: 0.2,
      images: [img('fossey-1'), img('fossey-2')],
      stops: [
        { title: 'Bisate trailhead', description: 'Meet your guide and village start.', duration: 1, price: 0.03 },
        { title: 'Climb to Karisoke', description: 'Forest hike to the research site.', duration: 3, price: 0.12 },
        { title: 'Memorial & descent', description: 'Time at the site, then return.', duration: 2, price: 0.05 },
      ],
    },
    {
      key: 'bisoke-crater-lake',
      name: 'Mount Bisoke Crater-Lake Climb',
      tourTypeId: ttHike.id,
      description:
        'A full-day summit hike (3,711 m) to the perfect crater lake on top of Bisoke volcano. Muddy, cool and spectacular — a real trekking day out.',
      durationHours: 9,
      price: 0.22,
      images: [img('bisoke-1'), img('bisoke-2'), img('bisoke-3')],
      stops: [
        { title: 'Park briefing', description: 'Kit check and ranger assignment.', duration: 1, price: 0.04 },
        { title: 'Summit ascent', description: 'Guided climb to the crater lake.', duration: 4, price: 0.12 },
        { title: 'Crater lake & lunch', description: 'Packed lunch on the rim.', duration: 1, price: 0.02 },
        { title: 'Descent', description: 'Return to the trailhead.', duration: 3, price: 0.04 },
      ],
    },
    {
      key: 'kivu-belt-boat',
      name: 'Lake Kivu Belt Boat Cruise',
      tourTypeId: ttKivu.id,
      description:
        'A sunset cruise from Rubavu across the islands of Lake Kivu, with a stop to hear the "singing fishermen" and swim in bilharzia-free water. Drinks and grilled sambaza included.',
      durationHours: 4,
      price: 0.14,
      images: [img('kivu-1'), img('kivu-2'), img('kivu-3')],
      stops: [
        { title: 'Rubavu jetty', description: 'Board and safety briefing.', duration: 1, price: 0.02 },
        { title: 'Island hop & swim', description: 'Napoleon Island and a swim stop.', duration: 2, price: 0.08 },
        { title: 'Sunset & sambaza', description: 'Grilled sambaza and drinks as the sun drops.', duration: 1, price: 0.04 },
      ],
    },
    {
      key: 'congo-nile-ebike',
      name: 'Congo-Nile Trail E-Bike Day',
      tourTypeId: ttKivu.id,
      description:
        'Ride the most scenic section of the Congo-Nile Trail by electric mountain bike: coffee-washing stations, banana plantations and lake coves, with a support vehicle throughout.',
      durationHours: 6,
      price: 0.18,
      images: [img('congonile-1'), img('congonile-2')],
      stops: [
        { title: 'Bike fitting', description: 'E-bike setup and route brief in Kibuye.', duration: 1, price: 0.03 },
        { title: 'Coffee washing station', description: 'See the harvest-to-cup process.', duration: 1, price: 0.04 },
        { title: 'Lakeshore ride', description: 'Coves, villages and viewpoints.', duration: 3, price: 0.09 },
      ],
    },
    {
      key: 'nyungwe-canopy-walk',
      name: 'Nyungwe Canopy Walk & Rainforest',
      tourTypeId: ttCanopy.id,
      description:
        "East Africa's only canopy walkway — a 160 m suspension bridge 50 m above the forest floor — combined with a guided trail through one of Africa's oldest rainforests, alive with birds and butterflies.",
      durationHours: 5,
      price: 0.16,
      images: [img('nyungwe-1'), img('nyungwe-2'), img('nyungwe-3')],
      stops: [
        { title: 'Uwinka reception', description: 'Trail briefing and guide assignment.', duration: 1, price: 0.03 },
        { title: 'Igishigishigi trail', description: 'Rainforest trail to the walkway.', duration: 1, price: 0.04 },
        { title: 'Canopy walkway', description: 'Cross the suspended bridges above the canopy.', duration: 1, price: 0.06 },
        { title: 'Return loop', description: 'Forest loop back to Uwinka.', duration: 2, price: 0.03 },
      ],
    },
    {
      key: 'nyungwe-chimp-trek',
      name: 'Nyungwe Chimpanzee Trek',
      tourTypeId: ttCanopy.id,
      description:
        'A pre-dawn start to track a habituated chimpanzee community in the Cyamudongo forest. Fast-paced and unpredictable — the classic primate chase.',
      durationHours: 7,
      price: 0.3,
      images: [img('chimp-1'), img('chimp-2')],
      stops: [
        { title: 'Dawn briefing', description: 'Early meet with trackers.', duration: 1, price: 0.05 },
        { title: 'Cyamudongo tracking', description: 'Follow the calls to the community.', duration: 4, price: 0.2 },
        { title: 'Observation & return', description: 'Time with the chimps, then walk out.', duration: 2, price: 0.05 },
      ],
    },
    {
      key: 'akagera-game-drive',
      name: 'Akagera Big Five Game Drive',
      tourTypeId: ttSafari.id,
      description:
        'A full-day 4x4 safari across Akagera\'s savannah and wetlands: lion, elephant, buffalo, leopard and rhino, plus hippos and the rare shoebill. Park fees, ranger and picnic lunch included.',
      durationHours: 10,
      price: 0.35,
      images: [img('akagera-1'), img('akagera-2'), img('akagera-3'), img('akagera-4')],
      stops: [
        { title: 'Southern plains', description: 'Morning drive for big cats and antelope.', duration: 4, price: 0.15 },
        { title: 'Lakeside picnic', description: 'Lunch overlooking the hippo pools.', duration: 1, price: 0.03 },
        { title: 'Northern rhino sector', description: 'Afternoon search for rhino and elephant.', duration: 5, price: 0.17 },
      ],
    },
    {
      key: 'akagera-boat-safari',
      name: 'Akagera Lake Ihema Boat Safari',
      tourTypeId: ttSafari.id,
      description:
        'A 90-minute boat safari on Lake Ihema — the second-largest lake in Rwanda — nose-to-nose with hippos and crocodiles, and one of the best shoebill spots in the country.',
      durationHours: 3,
      price: 0.12,
      images: [img('ihema-1'), img('ihema-2')],
      stops: [
        { title: 'Ihema jetty', description: 'Board with your ranger.', duration: 1, price: 0.03 },
        { title: 'Hippo & croc pools', description: 'Close approaches to the pods.', duration: 1, price: 0.05 },
        { title: 'Shoebill shoreline', description: 'Slow cruise of the papyrus edge.', duration: 1, price: 0.04 },
      ],
    },
  ];

  const pkgByKey: Record<string, string> = {};
  for (const spec of packages) {
    let pkg = await prisma.package.findFirst({
      where: { name: spec.name, tourTypeId: spec.tourTypeId, isCustom: false },
    });
    if (!pkg) {
      pkg = await prisma.package.create({
        data: {
          tourTypeId: spec.tourTypeId,
          name: spec.name,
          description: spec.description,
          durationHours: spec.durationHours,
          price: spec.price,
        },
      });
    } else {
      // keep copy/price/duration in sync with this file
      await prisma.package.update({
        where: { id: pkg.id },
        data: {
          description: spec.description,
          durationHours: spec.durationHours,
          price: spec.price,
        },
      });
    }
    pkgByKey[spec.key] = pkg.id;

    const mediaCount = await prisma.packageMedia.count({ where: { packageId: pkg.id } });
    if (mediaCount === 0) {
      await prisma.packageMedia.createMany({
        data: spec.images.map((url) => ({ packageId: pkg!.id, url, type: MediaType.IMAGE })),
      });
    }
    const tourCount = await prisma.packageTour.count({ where: { packageId: pkg.id } });
    if (tourCount === 0) {
      await prisma.packageTour.createMany({
        data: spec.stops.map((s) => ({ packageId: pkg!.id, ...s })),
      });
    }
  }
  // Catch-all: any public package still without media (e.g. the base
  // seed's original "Kimihurura Roundabout") gets two themed images.
  for (const p of await prisma.package.findMany({
    where: { isCustom: false, media: { none: {} } },
    select: { id: true, name: true },
  })) {
    await prisma.packageMedia.createMany({
      data: [img(`${p.name}-a`), img(`${p.name}-b`)].map((url) => ({ packageId: p.id, url, type: MediaType.IMAGE })),
    });
  }
  console.log(`  ✓ ${packages.length}+ packages (+ media + stops)`);

  // --- 4. Vehicle catalog -------------------------------------------------
  const vehicleSpecs = [
    { name: 'Walking Tour', icon: 'directions_walk', seats: 8, pricePerHour: 0.02, pricePerDay: 0.1 },
    { name: 'Motorbike', icon: 'two_wheeler', seats: 1, pricePerHour: 0.03, pricePerDay: 0.15 },
    { name: 'EV Car', icon: 'electric_car', seats: 4, pricePerHour: 0.05, pricePerDay: 0.3 },
    { name: '4x4 Land Cruiser', icon: 'directions_car', seats: 6, pricePerHour: 0.08, pricePerDay: 0.5 },
    { name: 'Safari Van', icon: 'airport_shuttle', seats: 12, pricePerHour: 0.07, pricePerDay: 0.45 },
    { name: 'Coach', icon: 'directions_bus', seats: 30, pricePerHour: 0.12, pricePerDay: 0.8 },
  ];
  const vehByName: Record<string, string> = {};
  for (const v of vehicleSpecs) {
    let veh = await prisma.vehicle.findFirst({ where: { name: v.name } });
    if (!veh) veh = await prisma.vehicle.create({ data: v });
    vehByName[v.name] = veh.id;
  }
  console.log(`  ✓ ${vehicleSpecs.length} vehicles`);

  // --- 5. Guides (users + profiles + vehicles + experiences) ------------
  type GuideSpec = {
    key: string;
    email: string;
    fullName: string;
    portraitSlug: string;
    guideType: 'INDIVIDUAL' | 'COMPANY';
    companyName?: string;
    languages: ('EN' | 'FR' | 'RW' | 'SW')[];
    numberOfTours: number;
    vehicles: string[];
    experiences: { title: string; description: string; images: string[] }[];
  };

  const guideSpecs: GuideSpec[] = [
    {
      key: 'jeanpaul',
      email: 'jeanpaul.guide@yoguide.app',
      fullName: 'Jean-Paul Habimana',
      portraitSlug: 'guide-jeanpaul',
      guideType: 'INDIVIDUAL',
      languages: ['EN', 'FR', 'RW'],
      numberOfTours: 214,
      vehicles: ['EV Car', 'Walking Tour'],
      experiences: [
        { title: 'Kigali on foot, five years running', description: 'Lead guide for the city heritage walk since 2021.', images: [img('exp-jp-1'), img('exp-jp-2')] },
        { title: 'Coffee origin trips', description: 'Takes small groups to washing stations in the Southern Province.', images: [img('exp-jp-3')] },
      ],
    },
    {
      key: 'aline',
      email: 'aline.guide@yoguide.app',
      fullName: 'Aline Uwase',
      portraitSlug: 'guide-aline',
      guideType: 'INDIVIDUAL',
      languages: ['EN', 'RW', 'SW'],
      numberOfTours: 168,
      vehicles: ['Safari Van', '4x4 Land Cruiser'],
      experiences: [
        { title: 'Akagera ranger-guide', description: 'Former park ranger, now freelance safari guide.', images: [img('exp-aline-1'), img('exp-aline-2')] },
        { title: 'Birding specialist', description: 'Shoebill and Albertine Rift endemics.', images: [img('exp-aline-3')] },
      ],
    },
    {
      key: 'emmanuel',
      email: 'emmanuel.guide@yoguide.app',
      fullName: 'Emmanuel Nsengimana',
      portraitSlug: 'guide-emmanuel',
      guideType: 'INDIVIDUAL',
      languages: ['EN', 'FR', 'RW'],
      numberOfTours: 305,
      vehicles: ['4x4 Land Cruiser'],
      experiences: [
        { title: 'Volcanoes NP trek leader', description: 'Over 300 gorilla and volcano treks led.', images: [img('exp-emm-1'), img('exp-emm-2')] },
      ],
    },
    {
      key: 'amahoro-tours',
      email: 'guide@yoguide.app', // the base-seed guide account — upgrade it
      fullName: 'Amahoro Tours',
      portraitSlug: 'guide-amahoro',
      guideType: 'COMPANY',
      companyName: 'Amahoro Tours & Travel',
      languages: ['EN', 'FR', 'RW', 'SW'],
      numberOfTours: 540,
      vehicles: ['Safari Van', 'Coach', 'EV Car'],
      experiences: [
        { title: 'Full-service DMC since 2015', description: 'Country-wide tours, fleet of 12 vehicles, 20 guides.', images: [img('exp-amh-1'), img('exp-amh-2')] },
      ],
    },
    {
      key: 'chef-mukamana',
      email: 'chantal.chef@yoguide.app',
      fullName: 'Chantal Mukamana',
      portraitSlug: 'guide-chantal',
      guideType: 'INDIVIDUAL',
      languages: ['EN', 'RW'],
      numberOfTours: 92,
      vehicles: ['Walking Tour'],
      experiences: [
        { title: 'Home kitchen table', description: 'Hosts a traditional Rwandan cooking table in Kimihurura.', images: [img('exp-chef-1'), img('exp-chef-2')] },
      ],
    },
  ];

  const guideProfileByKey: Record<string, string> = {};
  for (const g of guideSpecs) {
    const user = await ensureUser({
      email: g.email,
      fullName: g.fullName,
      role: 'GUIDE',
      profileImage: portrait(g.portraitSlug),
    });
    let profile = await prisma.guideProfile.findUnique({ where: { userId: user.id } });
    if (!profile) {
      profile = await prisma.guideProfile.create({
        data: {
          userId: user.id,
          guideType: g.guideType,
          companyName: g.companyName ?? null,
          languages: g.languages,
          numberOfTours: g.numberOfTours,
        },
      });
    } else {
      profile = await prisma.guideProfile.update({
        where: { id: profile.id },
        data: {
          guideType: g.guideType,
          companyName: g.companyName ?? null,
          languages: g.languages,
          numberOfTours: g.numberOfTours,
        },
      });
    }
    guideProfileByKey[g.key] = profile.id;

    for (const vName of g.vehicles) {
      const vehicleId = vehByName[vName];
      if (!vehicleId) continue;
      const link = await prisma.guideVehicle.findUnique({
        where: { guideId_vehicleId: { guideId: profile.id, vehicleId } },
      });
      if (!link) await prisma.guideVehicle.create({ data: { guideId: profile.id, vehicleId } });
    }

    const expCount = await prisma.guideExperience.count({ where: { guideId: profile.id } });
    if (expCount === 0) {
      for (let i = 0; i < g.experiences.length; i++) {
        const e = g.experiences[i];
        const exp = await prisma.guideExperience.create({
          data: { guideId: profile.id, title: e.title, description: e.description, sortOrder: i },
        });
        await prisma.guideExperienceMedia.createMany({
          data: e.images.map((url, j) => ({
            experienceId: exp.id,
            url,
            type: MediaType.IMAGE,
            sortOrder: j,
          })),
        });
      }
    }
  }
  console.log(`  ✓ ${guideSpecs.length} guides (profiles + vehicles + experiences)`);

  // --- 6. Gastronomy: category + chef profile for Chantal ---------------
  let cat = await prisma.gastronomyCategory.findFirst({ where: { name: 'Homestyle' } });
  if (!cat) {
    cat = await prisma.gastronomyCategory.create({
      data: {
        name: 'Homestyle',
        description: 'Traditional home-cooked meals shared at a local family table.',
        iconKey: 'restaurant',
        sortOrder: 0,
        isActive: true,
      },
    });
  }
  let catFarm = await prisma.gastronomyCategory.findFirst({ where: { name: 'Farm-to-table' } });
  if (!catFarm) {
    catFarm = await prisma.gastronomyCategory.create({
      data: {
        name: 'Farm-to-table',
        description: 'Meals built around produce picked the same morning.',
        iconKey: 'agriculture',
        sortOrder: 1,
        isActive: true,
      },
    });
  }

  const chantalProfileId = guideProfileByKey['chef-mukamana'];
  if (chantalProfileId) {
    let chef = await prisma.chefProfile.findUnique({ where: { guideId: chantalProfileId } });
    if (!chef) {
      chef = await prisma.chefProfile.create({
        data: {
          guideId: chantalProfileId,
          categoryId: cat.id,
          restaurantName: "Chantal's Table",
          experienceName: 'Rwandan Home-Cooking Table',
          area: 'Kimihurura, Kigali',
          tags: ['#Food', 'Traditional', 'Vegetarian-friendly'],
          storyTitle: 'A Table Rooted in Kigali',
          storyDurationLabel: '2–3 hours',
          storyText:
            'Chantal opens her family kitchen and walks guests through the dishes she grew up with — isombe, brochettes, plantain and fresh juice — while telling the story of each one.',
        },
      });
      const courses = await Promise.all([
        prisma.chefCourse.create({ data: { chefId: chef.id, name: 'Isombe with grilled plantain', description: 'Starter — cassava leaves slow-cooked with peanut.', imageUrl: img('course-isombe'), sortOrder: 0 } }),
        prisma.chefCourse.create({ data: { chefId: chef.id, name: 'Brochettes with ugali', description: 'Main — marinated goat skewers over the coals.', imageUrl: img('course-brochettes'), sortOrder: 1 } }),
        prisma.chefCourse.create({ data: { chefId: chef.id, name: 'Ikivuguto & fruit', description: 'Dessert — fermented milk with tree-tomato and passion.', imageUrl: img('course-dessert'), sortOrder: 2 } }),
      ]);
      for (const c of courses) {
        await prisma.chefCourseMedia.create({ data: { courseId: c.id, url: img(`cm-${c.id.slice(0, 6)}`), type: MediaType.IMAGE, sortOrder: 0 } });
      }
      await prisma.chefPriceTier.createMany({
        data: [
          { chefId: chef.id, minPartySize: 1, maxPartySize: 2, pricePerPersonUsd: 0.06, sortOrder: 0 },
          { chefId: chef.id, minPartySize: 3, maxPartySize: 6, pricePerPersonUsd: 0.05, sortOrder: 1 },
          { chefId: chef.id, minPartySize: 7, maxPartySize: null, pricePerPersonUsd: 0.04, sortOrder: 2 },
        ],
      });
    }
  }
  console.log('  ✓ gastronomy category + chef profile');

  // --- 7. Hotels (manager user + hotel + rooms) ------------------------
  type HotelSpec = {
    managerEmail: string;
    managerName: string;
    name: string;
    description: string;
    city: string;
    address: string;
    amenities: string[];
    phone: string;
    website: string;
    code: string;
    rooms: { name: string; totalRooms: number; nightlyRateCents: number; amenities: string[] }[];
  };

  const hotelSpecs: HotelSpec[] = [
    {
      managerEmail: 'hotelmanager@yoguide.app', // base-seed manager — keep
      managerName: 'Hotel Manager',
      name: 'Kigali Serena Hotel',
      description: 'Luxury hotel in the heart of Kigali with a garden pool, spa and easy reach of the convention centre.',
      city: 'Kigali',
      address: 'KN 3 Ave, Kiyovu, Kigali',
      amenities: ['WiFi', 'Pool', 'Spa', 'Restaurant', 'Gym', 'Conference Room', 'Airport shuttle'],
      phone: '+250 788 184 500',
      website: 'https://www.serenahotels.com/kigali',
      code: 'SERENA-KGL',
      rooms: [
        { name: 'Standard Room', totalRooms: 40, nightlyRateCents: 18, amenities: ['WiFi', 'TV', 'AC'] },
        { name: 'Executive Room', totalRooms: 20, nightlyRateCents: 28, amenities: ['WiFi', 'TV', 'AC', 'Mini Bar', 'Lounge access'] },
        { name: 'Suite', totalRooms: 8, nightlyRateCents: 52, amenities: ['WiFi', 'TV', 'AC', 'Mini Bar', 'Living Room', 'Butler'] },
      ],
    },
    {
      managerEmail: 'manager.heaven@yoguide.app',
      managerName: 'Josiane Ingabire',
      name: 'The Retreat by Heaven',
      description: 'A boutique eco-hotel in Kiyovu: solar-powered, farm-to-table restaurant, saltwater pool and eleven individually designed rooms.',
      city: 'Kigali',
      address: 'KN 29 St, Kiyovu, Kigali',
      amenities: ['WiFi', 'Saltwater Pool', 'Farm-to-table Restaurant', 'Spa', 'Solar power', 'Bar'],
      phone: '+250 788 439 585',
      website: 'https://heavenrwanda.com',
      code: 'RETREAT-KGL',
      rooms: [
        { name: 'Garden Room', totalRooms: 6, nightlyRateCents: 34, amenities: ['WiFi', 'AC', 'Terrace'] },
        { name: 'Pool View Room', totalRooms: 4, nightlyRateCents: 44, amenities: ['WiFi', 'AC', 'Pool view', 'Mini Bar'] },
        { name: 'Retreat Suite', totalRooms: 1, nightlyRateCents: 60, amenities: ['WiFi', 'AC', 'Plunge pool', 'Living Room'] },
      ],
    },
    {
      managerEmail: 'manager.fivevolcanoes@yoguide.app',
      managerName: 'Patrick Bizimana',
      name: 'Five Volcanoes Boutique Hotel',
      description: 'Ten minutes from the Volcanoes National Park briefing point in Kinigi — log fires, hearty breakfasts and porter arrangements for gorilla treks.',
      city: 'Musanze',
      address: 'Kinigi Sector, Musanze',
      amenities: ['WiFi', 'Restaurant', 'Bar', 'Fireplace', 'Trek transfers', 'Laundry'],
      phone: '+250 788 300 972',
      website: 'https://fivevolcanoes.com',
      code: 'FIVEVOLC-MUS',
      rooms: [
        { name: 'Cottage Twin', totalRooms: 10, nightlyRateCents: 26, amenities: ['WiFi', 'Heater', 'Ensuite'] },
        { name: 'Volcano View Double', totalRooms: 6, nightlyRateCents: 36, amenities: ['WiFi', 'Heater', 'Volcano view', 'Fireplace'] },
      ],
    },
    {
      managerEmail: 'manager.lakekivu@yoguide.app',
      managerName: 'Diane Mutoni',
      name: 'Lake Kivu Serena Hotel',
      description: 'Beachfront resort in Rubavu with a private stretch of Lake Kivu, watersports, two pools and lakeside dining.',
      city: 'Rubavu',
      address: 'Avenue de la Coopération, Rubavu',
      amenities: ['WiFi', 'Private beach', 'Two Pools', 'Watersports', 'Spa', 'Restaurant', 'Kids club'],
      phone: '+250 788 200 720',
      website: 'https://www.serenahotels.com/lake-kivu',
      code: 'SERENA-KVU',
      rooms: [
        { name: 'Garden Room', totalRooms: 30, nightlyRateCents: 20, amenities: ['WiFi', 'AC', 'Balcony'] },
        { name: 'Lake View Room', totalRooms: 24, nightlyRateCents: 30, amenities: ['WiFi', 'AC', 'Lake view', 'Balcony'] },
        { name: 'Family Suite', totalRooms: 6, nightlyRateCents: 46, amenities: ['WiFi', 'AC', 'Two bedrooms', 'Lake view'] },
      ],
    },
    {
      managerEmail: 'manager.oneandonly@yoguide.app',
      managerName: 'Kevin Rugamba',
      name: 'One&Only Nyungwe House',
      description: 'A luxury lodge set inside a working tea plantation on the edge of Nyungwe rainforest — spa, heated pool and guided forest access.',
      city: 'Nyungwe',
      address: 'Gisakura, Nyamasheke (Nyungwe)',
      amenities: ['WiFi', 'Heated Pool', 'Spa', 'Restaurant', 'Forest guides', 'Tea tours', 'Gym'],
      phone: '+250 788 000 100',
      website: 'https://www.oneandonlyresorts.com/nyungwe-house',
      code: 'OO-NYUNGWE',
      rooms: [
        { name: 'Forest Room', totalRooms: 12, nightlyRateCents: 55, amenities: ['WiFi', 'Heater', 'Forest view', 'Fireplace'] },
        { name: 'Tea House Suite', totalRooms: 4, nightlyRateCents: 80, amenities: ['WiFi', 'Heater', 'Plantation view', 'Living Room', 'Butler'] },
      ],
    },
  ];

  const hotelByCode: Record<string, string> = {};
  for (const h of hotelSpecs) {
    const manager = await ensureUser({
      email: h.managerEmail,
      fullName: h.managerName,
      role: 'HOTEL_MANAGER',
    });
    let hotel = await prisma.hotel.findFirst({ where: { managerId: manager.id } });
    if (!hotel) {
      hotel = await prisma.hotel.create({
        data: {
          managerId: manager.id,
          name: h.name,
          description: h.description,
          city: h.city,
          address: h.address,
          amenities: h.amenities,
          checkInTime: '14:00',
          checkOutTime: '11:00',
          contact: h.managerEmail,
          phone: h.phone,
          website: h.website,
          isVerified: true,
          code: h.code,
        },
      });
    } else {
      hotel = await prisma.hotel.update({
        where: { id: hotel.id },
        data: {
          name: h.name,
          description: h.description,
          city: h.city,
          address: h.address,
          amenities: h.amenities,
          phone: h.phone,
          website: h.website,
          isVerified: true,
          code: h.code,
        },
      });
    }
    hotelByCode[h.code] = hotel.id;

    const roomCount = await prisma.hotelRoom.count({ where: { hotelId: hotel.id } });
    if (roomCount === 0) {
      await prisma.hotelRoom.createMany({
        data: h.rooms.map((r) => ({
          hotelId: hotel!.id,
          name: r.name,
          totalRooms: r.totalRooms,
          nightlyRateCents: r.nightlyRateCents,
          currency: 'USD',
          amenities: r.amenities,
        })),
      });
    }
  }
  // normalise any pre-existing rooms that were seeded at realistic cents
  // (e.g. base seed's 15000 = $150) down to this file's tiny-price scale so
  // the Stays list doesn't show $150 next to $0.34.
  await prisma.$executeRawUnsafe(`
    UPDATE "HotelRoom" SET "nightlyRateCents" = CASE
      WHEN name ILIKE '%suite%' THEN 52
      WHEN name ILIKE '%deluxe%' OR name ILIKE '%executive%' OR name ILIKE '%president%' THEN 28
      ELSE 18 END
    WHERE "nightlyRateCents" > 200;
  `);
  await prisma.hotel.updateMany({ where: { checkOutTime: '12:00' }, data: { checkOutTime: '11:00' } });
  console.log(`  ✓ ${hotelSpecs.length} hotels (managers + rooms)`);

  // --- 8. Extra tourist personas (for reviews & bookings) --------------
  const reviewers = await Promise.all(
    [
      { email: 'sarah.visitor@yoguide.app', fullName: 'Sarah Thompson', nationality: 'British', slug: 'rev-sarah' },
      { email: 'kwame.visitor@yoguide.app', fullName: 'Kwame Mensah', nationality: 'Ghanaian', slug: 'rev-kwame' },
      { email: 'lena.visitor@yoguide.app', fullName: 'Lena Fischer', nationality: 'German', slug: 'rev-lena' },
      { email: 'maria.visitor@yoguide.app', fullName: 'Maria Santos', nationality: 'Brazilian', slug: 'rev-maria' },
    ].map((r) =>
      ensureUser({ email: r.email, fullName: r.fullName, role: 'TOURIST', nationality: r.nationality, profileImage: portrait(r.slug) }),
    ),
  );

  // --- 9. Reviews (drive ratings on guides + packages) ----------------
  const reviewSpecs: {
    reviewer: number;
    guideKey?: string;
    pkgKey?: string;
    starRating: number;
    message: string;
  }[] = [
    { reviewer: 0, guideKey: 'jeanpaul', starRating: 5, message: 'Jean-Paul made the Genocide Memorial visit deeply meaningful and handled a sensitive day with real care.' },
    { reviewer: 1, guideKey: 'jeanpaul', starRating: 5, message: 'Best city walk of our trip. Knows every café and every story.' },
    { reviewer: 2, guideKey: 'emmanuel', starRating: 5, message: 'Emmanuel got us to the gorilla family fast and kept the group calm and quiet. Unforgettable.' },
    { reviewer: 3, guideKey: 'emmanuel', starRating: 4, message: 'Tough hike but Emmanuel paced it well and the porters he arranged were great.' },
    { reviewer: 0, guideKey: 'aline', starRating: 5, message: 'Aline spotted a leopard nobody else saw. Encyclopaedic on the birds too.' },
    { reviewer: 2, guideKey: 'aline', starRating: 5, message: 'We saw the shoebill! Aline knew exactly where to go on Lake Ihema.' },
    { reviewer: 1, guideKey: 'amahoro-tours', starRating: 4, message: 'Well-run multi-day tour, comfortable van, good driver-guide. Minor mix-up on pickup time.' },
    { reviewer: 3, guideKey: 'chef-mukamana', starRating: 5, message: 'Dinner at Chantal\'s table was the warmest evening of the whole trip. The isombe!' },
    { reviewer: 0, pkgKey: 'gorilla-trek-volcanoes', starRating: 5, message: 'Worth every franc. One hour with the gorillas goes impossibly fast.' },
    { reviewer: 1, pkgKey: 'nyungwe-canopy-walk', starRating: 5, message: 'The canopy bridge is a thrill and the forest guide was excellent on the birds.' },
    { reviewer: 2, pkgKey: 'akagera-game-drive', starRating: 4, message: 'Saw four of the Big Five in a day. Long drive but the picnic spot was stunning.' },
    { reviewer: 3, pkgKey: 'kivu-belt-boat', starRating: 5, message: 'Sunset, grilled sambaza, a swim in the lake — perfect way to end a week.' },
    { reviewer: 0, pkgKey: 'kigali-city-highlights', starRating: 5, message: 'A moving, well-paced introduction to Kigali. Highly recommend as a first day.' },
  ];

  const existingReviewCount = await prisma.review.count();
  if (existingReviewCount < reviewSpecs.length) {
    for (const r of reviewSpecs) {
      const userId = reviewers[r.reviewer].id;
      const guideId = r.guideKey ? guideProfileByKey[r.guideKey] : undefined;
      const packageId = r.pkgKey ? pkgByKey[r.pkgKey] : undefined;
      const dup = await prisma.review.findFirst({
        where: { userId, guideId: guideId ?? null, packageId: packageId ?? null },
      });
      if (dup) continue;
      await prisma.review.create({
        data: { userId, guideId: guideId ?? null, packageId: packageId ?? null, starRating: r.starRating, message: r.message },
      });
    }
  }
  console.log(`  ✓ reviews`);

  // --- 10. Cities + events --------------------------------------------
  async function ensureCity(slug: string, name: string) {
    const c = await prisma.city.findUnique({ where: { slug } });
    return c ?? prisma.city.create({ data: { slug, name } });
  }
  const cityKigali = await ensureCity('kigali', 'Kigali');
  const cityMusanze = await ensureCity('musanze', 'Musanze');
  const soon = (days: number, hour = 19) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    d.setHours(hour, 0, 0, 0);
    return d;
  };
  const eventSpecs = [
    { cityId: cityKigali.id, title: 'Kigali Jazz Junction', venue: 'Kigali Convention Centre', priceLabel: 'From RWF 15,000', startsAt: soon(6), tags: ['music', 'nightlife'] },
    { cityId: cityKigali.id, title: 'Made in Rwanda Expo', venue: 'Gikondo Expo Grounds', priceLabel: 'RWF 2,000', startsAt: soon(10, 10), tags: ['market', 'crafts', 'family'] },
    { cityId: cityKigali.id, title: 'Kigali Up! Music Festival', venue: 'Rebero Hill', priceLabel: 'From RWF 20,000', startsAt: soon(18, 14), tags: ['music', 'festival'] },
    { cityId: cityKigali.id, title: 'Car-Free Day Community Walk', venue: 'KN 5 Rd (car-free zone)', priceLabel: 'Free', startsAt: soon(3, 7), tags: ['wellness', 'free', 'outdoor'] },
    { cityId: cityMusanze.id, title: 'Kwita Izina Gorilla Naming Ceremony', venue: 'Kinigi, Volcanoes NP', priceLabel: 'Free (public viewing)', startsAt: soon(21, 9), tags: ['conservation', 'culture'] },
    { cityId: cityMusanze.id, title: 'Musanze Caves Night Tour', venue: 'Musanze Caves', priceLabel: 'RWF 10,000', startsAt: soon(8, 18), tags: ['adventure', 'nature'] },
  ];
  if ((await prisma.event.count()) === 0) {
    for (const e of eventSpecs) await prisma.event.create({ data: e });
  }
  console.log('  ✓ cities + events');

  // --- 11. Demo tourist: wallet, notifications, bookings, itinerary ---
  const tourist = await prisma.user.findUnique({ where: { email: 'tourist@yoguide.app' } });
  if (tourist) {
    // wallet (comfortable balance for on-stage wallet payments; tiny prices)
    const wallet = await prisma.wallet.upsert({
      where: { userId: tourist.id },
      update: {},
      create: { userId: tourist.id, balanceCents: 0, currency: 'USD' },
    });
    if (wallet.balanceCents < 2000) {
      await prisma.wallet.update({ where: { id: wallet.id }, data: { balanceCents: 5000 } });
      await prisma.walletTransaction.create({
        data: { walletId: wallet.id, userId: tourist.id, kind: 'topup', amountCents: 5000 - wallet.balanceCents, currency: 'USD', method: 'demo', status: 'succeeded', notes: 'Demo top-up' },
      });
    }

    // notifications
    if ((await prisma.notification.count({ where: { userId: tourist.id } })) === 0) {
      await prisma.notification.createMany({
        data: [
          { userId: tourist.id, title: 'Booking confirmed', message: 'Emmanuel confirmed your Mountain Gorilla Trek for next week.', type: 'booking', isRead: false, actionLabel: 'View booking' },
          { userId: tourist.id, title: 'Guide message', message: 'Jean-Paul: "Looking forward to showing you Kigali on Friday!"', type: 'message', isRead: false, actionLabel: 'Open chat' },
          { userId: tourist.id, title: 'Wallet topped up', message: 'Your yoEcopay wallet was credited with $50.00.', type: 'wallet', isRead: true },
          { userId: tourist.id, title: 'Trip reminder', message: 'Kigali Jazz Junction is on this weekend near your hotel.', type: 'event', isRead: true, actionLabel: 'See events' },
        ],
      });
    }

    // bookings across statuses tied to seeded content
    const gorillaPkg = pkgByKey['gorilla-trek-volcanoes'];
    const cityPkg = pkgByKey['kigali-city-highlights'];
    const kivuPkg = pkgByKey['kivu-belt-boat'];
    const emmanuelGuide = guideProfileByKey['emmanuel'];
    const jpGuide = guideProfileByKey['jeanpaul'];
    const retreatHotel = hotelByCode['RETREAT-KGL'];

    const seededBookingMarker = await prisma.booking.findFirst({
      where: { userId: tourist.id, notes: 'demo-seed' },
    });
    if (!seededBookingMarker) {
      const b1 = await prisma.booking.create({
        data: {
          userId: tourist.id,
          packageId: gorillaPkg,
          guideId: emmanuelGuide,
          scheduleDate: soon(7, 6),
          pickupLocation: 'Five Volcanoes Boutique Hotel, Kinigi',
          totalDue: 0.6,
          status: BookingStatus.CONFIRMED,
          paymentMethod: PaymentMethod.WALLET,
          notes: 'demo-seed',
        },
      });
      await prisma.booking.create({
        data: {
          userId: tourist.id,
          packageId: cityPkg,
          guideId: jpGuide,
          scheduleDate: soon(2, 9),
          pickupLocation: 'The Retreat by Heaven',
          totalDue: 0.12,
          status: BookingStatus.PENDING,
          paymentMethod: PaymentMethod.WALLET,
          notes: 'demo-seed',
        },
      });
      const b3 = await prisma.booking.create({
        data: {
          userId: tourist.id,
          packageId: kivuPkg,
          scheduleDate: soon(-9, 17),
          pickupLocation: 'Lake Kivu Serena Hotel',
          totalDue: 0.14,
          status: BookingStatus.COMPLETED,
          paymentMethod: PaymentMethod.WALLET,
          notes: 'demo-seed',
        },
      });
      // review for the completed booking
      const hasReview = await prisma.review.findUnique({ where: { bookingId: b3.id } });
      if (!hasReview) {
        await prisma.review.create({
          data: { userId: tourist.id, packageId: kivuPkg, bookingId: b3.id, starRating: 5, message: 'The sunset cruise was the highlight of our week on Lake Kivu.' },
        });
      }
      if (retreatHotel) {
        await prisma.booking.create({
          data: {
            userId: tourist.id,
            hotelId: retreatHotel,
            scheduleDate: soon(1, 14),
            totalDue: 0.44,
            status: BookingStatus.CONFIRMED,
            paymentMethod: PaymentMethod.WALLET,
            notes: 'demo-seed',
          },
        });
      }
      void b1;
    }

    // itinerary
    if ((await prisma.itinerary.count({ where: { userId: tourist.id } })) === 0) {
      const itin = await prisma.itinerary.create({
        data: {
          userId: tourist.id,
          title: 'Rwanda in a Week',
          description: 'Kigali → Musanze (gorillas) → Lake Kivu → home.',
          startDate: soon(0),
          endDate: soon(7),
          isPublic: true,
          coverImage: img('itin-cover'),
        },
      });
      await prisma.itineraryItem.createMany({
        data: [
          { itineraryId: itin.id, ordinal: 0, notes: 'Land KGL, check in at The Retreat, evening walk in Kimihurura', scheduledAt: soon(0, 16) },
          { itineraryId: itin.id, ordinal: 1, notes: 'Kigali City Highlights with Jean-Paul', scheduledAt: soon(2, 9) },
          { itineraryId: itin.id, ordinal: 2, notes: 'Drive to Musanze, dinner by the fire', scheduledAt: soon(6, 15) },
          { itineraryId: itin.id, ordinal: 3, notes: 'Gorilla trek with Emmanuel — early start', scheduledAt: soon(7, 6) },
          { itineraryId: itin.id, ordinal: 4, notes: 'Transfer to Lake Kivu, sunset boat cruise', scheduledAt: soon(9, 12) },
        ],
      });
    }

    // a message thread with a guide
    if (jpGuide) {
      const jpUser = await prisma.guideProfile.findUnique({ where: { id: jpGuide }, select: { userId: true } });
      if (jpUser) {
        let thread = await prisma.messageThread.findFirst({
          where: {
            OR: [
              { participantA: tourist.id, participantB: jpUser.userId },
              { participantA: jpUser.userId, participantB: tourist.id },
            ],
          },
        });
        if (!thread) {
          thread = await prisma.messageThread.create({
            data: { participantA: tourist.id, participantB: jpUser.userId },
          });
          await prisma.message.createMany({
            data: [
              { threadId: thread.id, senderId: tourist.id, body: 'Hi Jean-Paul! We land Thursday night — is a 9am start on Friday ok for the city tour?' },
              { threadId: thread.id, senderId: jpUser.userId, body: '9am is perfect. I\'ll pick you up at The Retreat. Bring a hat and comfortable shoes!' },
              { threadId: thread.id, senderId: tourist.id, body: 'Great, see you then. Really looking forward to it.' },
            ],
          });
        }
      }
    }
  }
  console.log('  ✓ demo tourist wallet / notifications / bookings / itinerary / messages');

  console.log('✅  DEMO SEED complete.');
}

main()
  .catch((e) => {
    console.error('❌  demo seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
