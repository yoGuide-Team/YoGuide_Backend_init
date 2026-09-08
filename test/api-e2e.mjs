// End-to-end API test for the catalog / booking / guide endpoints.
//
// Prereqs: server running (npm run build && node dist/main.js) against a
// database that has been migrated and seeded (npm run prisma:seed).
//
//   node test/api-e2e.mjs [baseUrl]
//
// Creates throwaway users (unique email per run); safe to re-run.

const BASE = process.argv[2] ?? 'http://localhost:3030';
const stamp = Date.now();

let passed = 0;
let failed = 0;
const failures = [];

async function req(method, path, { token, body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, body: json };
}

function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  ✔ ${name}`);
  } else {
    failed += 1;
    failures.push(name);
    console.log(`  ✘ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

async function expect(name, method, path, opts, wantStatus, verify) {
  const { status, body } = await req(method, path, opts);
  if (status !== wantStatus) {
    check(name, false, `expected ${wantStatus}, got ${status}: ${JSON.stringify(body).slice(0, 200)}`);
    return null;
  }
  if (verify) {
    const problem = verify(body);
    check(name, !problem, problem ?? '');
    return problem ? null : body;
  }
  check(name, true);
  return body;
}

// ── Fixtures ─────────────────────────────────────────────────
// The seed no longer creates fixed ids, so resolve a real package (one
// with tours + a region, which the detail assertions need) and a real
// vehicle from the live catalog instead of hardcoding ids.

async function resolveSeedPackage() {
  const list = await req('GET', '/catalog/packages');
  const candidates = Array.isArray(list.body) ? list.body : [];
  if (!candidates.length) throw new Error('No packages seeded; cannot run the suite.');
  for (const p of candidates) {
    const detail = await req('GET', `/catalog/packages/${p.id}`);
    const d = detail.body;
    if (
      Array.isArray(d?.tours) &&
      d.tours.length > 0 &&
      d.tourType?.region &&
      d.isCustom !== true
    ) {
      return d;
    }
  }
  throw new Error('No seeded package with tours + region found.');
}

const seedPackageDetail = await resolveSeedPackage();
const SEED_PACKAGE = seedPackageDetail.id;
const SEED_PACKAGE_NAME = seedPackageDetail.name;

const vehicleList = await req('GET', '/catalog/vehicles');
const vehicles = Array.isArray(vehicleList.body) ? vehicleList.body : [];
if (!vehicles.length) throw new Error('No vehicles seeded; cannot run the suite.');
// Prefer a vehicle that seats at least one guest (all of them do here);
// keep the first so pricing math below uses its real rates.
const seedVehicle = vehicles[0];
const SEED_VEHICLE = seedVehicle.id;
const SEED_VEHICLE_HOUR = Number(seedVehicle.pricePerHour ?? 0);
const SEED_VEHICLE_DAY = Number(seedVehicle.pricePerDay ?? 0);

// ── Setup: users ─────────────────────────────────────────────
// Registration is OTP-gated (no token until the email is verified), so
// throwaway test users are created through the admin API — POST
// /admin/users creates them pre-verified — then logged in normally.
console.log('\nSetup');
const admin = await expect('admin login', 'POST', '/auth/login', {
  body: { email: 'admin@yoguide.app', password: 'Y0guide#Admin2026' },
}, 201);
if (!admin) {
  console.error('\nSetup failed, aborting.');
  process.exit(1);
}
const A = admin.access_token;

await expect('register is OTP-gated (no token before verification)', 'POST', '/auth/register', {
  body: { email: `otp${stamp}@e2e.dev`, password: 'E2e#Pass123', fullName: 'OTP Check', nationality: 'Rwanda' },
}, 201, (b) =>
  b.requiresVerification === true && !b.access_token
    ? null
    : `unexpected register response: ${JSON.stringify(b).slice(0, 120)}`);

async function makeUser(label, role) {
  const email = `${label}${stamp}@e2e.dev`;
  await expect(`admin creates ${label} (pre-verified)`, 'POST', '/admin/users', {
    token: A,
    body: { email, password: 'E2e#Pass123', fullName: `E2E ${label}`, nationality: 'Rwanda', role },
  }, 201);
  const login = await expect(`${label} login`, 'POST', '/auth/login', {
    body: { email, password: 'E2e#Pass123' },
  }, 201);
  return login?.access_token;
}
const T = await makeUser('tourist', 'TOURIST');
const I = await makeUser('intruder', 'TOURIST');
const G = await makeUser('guide', 'GUIDE');
if (!T || !I || !G) {
  console.error('\nSetup failed, aborting.');
  process.exit(1);
}

// ── Guide profile ────────────────────────────────────────────
console.log('\nGuide · profile');
await expect('GET /guide/profile before create → 404', 'GET', '/guide/profile', { token: G }, 404);
await expect('tourist blocked from /guide/* → 403', 'GET', '/guide/profile', { token: T }, 403);
await expect('POST /guide/profile without token → 401', 'POST', '/guide/profile', {
  body: { guideType: 'INDIVIDUAL' },
}, 401);
await expect('POST /guide/profile COMPANY without companyName → 400', 'POST', '/guide/profile', {
  token: G, body: { guideType: 'COMPANY' },
}, 400);
const profile = await expect('POST /guide/profile', 'POST', '/guide/profile', {
  token: G, body: { guideType: 'INDIVIDUAL', languages: ['EN', 'RW'] },
}, 201, (b) => (b.userId ? null : 'missing userId'));
await expect('POST /guide/profile duplicate → 409', 'POST', '/guide/profile', {
  token: G, body: { guideType: 'INDIVIDUAL' },
}, 409);
await expect('PATCH /guide/profile', 'PATCH', '/guide/profile', {
  token: G, body: { languages: ['EN', 'FR'] },
}, 200, (b) => (b.languages.join(',') === 'EN,FR' ? null : `languages=${b.languages}`));
await expect('GET /guide/profile', 'GET', '/guide/profile', { token: G }, 200,
  (b) => (b.languages.join(',') === 'EN,FR' ? null : 'PATCH not persisted'));
const guideId = profile.id;

// ── Guide availability ───────────────────────────────────────
// Bookings now enforce provider availability, so open the weekday of
// tomorrow (the date this suite books) before creating any booking.
const bookingDate = new Date(Date.now() + 86400000);
const bookingWeekday = new Date(
  `${bookingDate.toISOString().slice(0, 10)}T00:00:00Z`,
).getUTCDay();
await expect('guide opens the booking weekday', 'PUT', '/guide/availability/weekly', {
  token: G, body: { weekday: bookingWeekday, startTime: '08:00', endTime: '18:00', capacity: 10 },
}, 200);
await expect('guide sets daily capacity', 'PUT', '/guide/availability/daily-capacity', {
  token: G, body: { dailyCapacity: 10 },
}, 200);

// ── Guide vehicles ───────────────────────────────────────────
console.log('\nGuide · vehicles');
await expect('POST /guide/vehicles bogus id → 404', 'POST', '/guide/vehicles', {
  token: G, body: { vehicleId: 'nope' },
}, 404);
await expect('POST /guide/vehicles', 'POST', '/guide/vehicles', {
  token: G, body: { vehicleId: SEED_VEHICLE },
}, 201);
await expect('POST /guide/vehicles duplicate → 409', 'POST', '/guide/vehicles', {
  token: G, body: { vehicleId: SEED_VEHICLE },
}, 409);
await expect('GET /guide/vehicles', 'GET', '/guide/vehicles', { token: G }, 200,
  (b) => (b.length === 1 && b[0].vehicle.id === SEED_VEHICLE ? null : `got ${b.length}`));
await expect('DELETE /guide/vehicles/:id', 'DELETE', `/guide/vehicles/${SEED_VEHICLE}`, { token: G }, 200);
await expect('DELETE again → 404', 'DELETE', `/guide/vehicles/${SEED_VEHICLE}`, { token: G }, 404);
await expect('re-link vehicle', 'POST', '/guide/vehicles', {
  token: G, body: { vehicleId: SEED_VEHICLE },
}, 201);

// ── Catalog (public, no token) ───────────────────────────────
console.log('\nCatalog (public)');
const regions = await expect('GET /catalog/regions', 'GET', '/catalog/regions', {}, 200,
  (b) => (b.length >= 1 && b[0].tourTypes ? null : 'no regions/tourTypes'));
const regionId = regions[0].id;
await expect('GET /catalog/tour-types', 'GET', '/catalog/tour-types', {}, 200,
  (b) => (b.length >= 1 ? null : 'empty'));
await expect('GET /catalog/tour-types?regionId filter', 'GET', `/catalog/tour-types?regionId=${regionId}`, {}, 200,
  (b) => (b.every((t) => t.regionId === regionId) ? null : 'filter leaked'));
await expect('GET /catalog/tour-types bogus region → empty', 'GET', '/catalog/tour-types?regionId=nope', {}, 200,
  (b) => (b.length === 0 ? null : 'expected empty'));
await expect('GET /catalog/packages', 'GET', '/catalog/packages', {}, 200,
  (b) => (b.some((p) => p.id === SEED_PACKAGE) ? null : 'seed package missing'));
// Search by a real word from the resolved seed package's name so the
// assertion holds against any seeded catalog.
const SEARCH_TERM = encodeURIComponent(
  SEED_PACKAGE_NAME.split(' ').find((w) => w.length >= 3) ?? 'Tour',
);
await expect(`GET /catalog/packages?search=${SEARCH_TERM}`, 'GET', `/catalog/packages?search=${SEARCH_TERM}`, {}, 200,
  (b) => (b.length >= 1 ? null : 'search found nothing'));
await expect('GET /catalog/packages?search=zzzz → empty', 'GET', '/catalog/packages?search=zzzznothing', {}, 200,
  (b) => (b.length === 0 ? null : 'expected empty'));
await expect('GET /catalog/packages/:id', 'GET', `/catalog/packages/${SEED_PACKAGE}`, {}, 200,
  (b) => (b.tours && b.tourType?.region ? null : 'missing includes'));
await expect('GET /catalog/packages/:id bogus → 404', 'GET', '/catalog/packages/nope', {}, 404);
const tours = await expect('GET /catalog/tours', 'GET', '/catalog/tours', {}, 200,
  (b) => (b.length >= 1 ? null : 'no tours'));
await expect('GET /catalog/tours?packageId filter', 'GET', `/catalog/tours?packageId=${SEED_PACKAGE}`, {}, 200,
  (b) => (b.every((t) => t.packageId === SEED_PACKAGE) ? null : 'filter leaked'));
await expect('GET /catalog/vehicles', 'GET', '/catalog/vehicles', {}, 200,
  (b) => (b.some((v) => v.id === SEED_VEHICLE) ? null : 'seed vehicle missing'));
await expect('GET /catalog/guides', 'GET', '/catalog/guides', {}, 200,
  (b) => (b.some((g) => g.id === guideId) ? null : 'new guide missing'));
await expect('GET /catalog/guides?language=fr filter', 'GET', '/catalog/guides?language=fr', {}, 200,
  (b) => (b.some((g) => g.id === guideId) ? null : 'FR guide missing'));
await expect('GET /catalog/guides?language=sw → excludes guide', 'GET', '/catalog/guides?language=sw', {}, 200,
  (b) => (b.every((g) => g.id !== guideId) ? null : 'filter leaked'));
await expect('GET /catalog/guides/:id', 'GET', `/catalog/guides/${guideId}`, {}, 200,
  (b) => (b.user?.fullName === 'E2E guide' ? null : 'wrong guide'));
await expect('GET /catalog/guides/:id bogus → 404', 'GET', '/catalog/guides/nope', {}, 404);

// ── Custom packages ──────────────────────────────────────────
console.log('\nCustom packages');
await expect('POST /packages/custom without token → 401', 'POST', '/packages/custom', {
  body: { tourIds: [tours[0].id] },
}, 401);
await expect('POST /packages/custom empty tourIds → 400', 'POST', '/packages/custom', {
  token: T, body: { tourIds: [] },
}, 400);
await expect('POST /packages/custom bogus tour → 404', 'POST', '/packages/custom', {
  token: T, body: { tourIds: ['nope'] },
}, 404);
// A handful of tours keeps the custom package realistic (the catalog has
// dozens now).
const picked = tours.slice(0, 4);
const wantPrice = picked.reduce((s, t) => s + Number(t.price), 0);
const wantHours = picked.reduce((s, t) => s + t.duration, 0);
const custom = await expect('POST /packages/custom sums price+duration', 'POST', '/packages/custom', {
  token: T, body: { tourIds: picked.map((t) => t.id), name: 'E2E Custom' },
}, 201, (b) => {
  if (Number(b.price) !== wantPrice) return `price ${b.price} != ${wantPrice}`;
  if (b.durationHours !== wantHours) return `duration ${b.durationHours} != ${wantHours}`;
  if (b.tours.length !== picked.length) return `tours ${b.tours.length} != ${picked.length}`;
  if (!b.isCustom) return 'isCustom not set';
  return null;
});
await expect('GET /me/packages (owner sees 1)', 'GET', '/me/packages', { token: T }, 200,
  (b) => (b.length === 1 && b[0].id === custom.id ? null : `got ${b.length}`));
await expect('GET /me/packages (other user sees 0)', 'GET', '/me/packages', { token: I }, 200,
  (b) => (b.length === 0 ? null : 'leaked'));
await expect('custom package hidden from catalog list', 'GET', '/catalog/packages', {}, 200,
  (b) => (b.every((p) => p.id !== custom.id) ? null : 'leaked into catalog'));
await expect('custom package hidden from catalog by id → 404', 'GET', `/catalog/packages/${custom.id}`, {}, 404);

// ── Bookings (tourist) ───────────────────────────────────────
console.log('\nBookings (tourist)');
const tomorrow = new Date(Date.now() + 86400000).toISOString();
const yesterday = new Date(Date.now() - 86400000).toISOString();
const bookingBody = {
  packageId: custom.id, vehicleId: SEED_VEHICLE, guideId,
  scheduleDate: tomorrow, pickupLocation: 'Kigali town centre',
  paymentMethod: 'WALLET', notes: 'E2E booking',
};
await expect('POST /bookings without token → 401', 'POST', '/bookings', { body: bookingBody }, 401);
await expect('POST /bookings past date → 400', 'POST', '/bookings', {
  token: T, body: { ...bookingBody, scheduleDate: yesterday },
}, 400);
await expect('POST /bookings bogus package → 404', 'POST', '/bookings', {
  token: T, body: { ...bookingBody, packageId: 'nope' },
}, 404);
await expect('POST /bookings bogus vehicle → 404', 'POST', '/bookings', {
  token: T, body: { ...bookingBody, vehicleId: 'nope' },
}, 404);
await expect('POST /bookings bogus guide → 404', 'POST', '/bookings', {
  token: T, body: { ...bookingBody, guideId: 'nope' },
}, 404);
await expect('POST /bookings bad paymentMethod → 400', 'POST', '/bookings', {
  token: T, body: { ...bookingBody, paymentMethod: 'GOLD' },
}, 400);
// Mirror the server's vehicle pricing (src/booking/bookings.controller.ts
// vehicleCost): full days at the day rate, remainder hourly but never more
// than another day. Uses the resolved vehicle's real rates, not constants.
const wantVehicleCost =
  Math.floor(wantHours / 24) * SEED_VEHICLE_DAY +
  Math.min((wantHours % 24) * SEED_VEHICLE_HOUR, SEED_VEHICLE_DAY);
const wantTotal = Math.round((wantPrice + wantVehicleCost) * 1e6) / 1e6;
const b1 = await expect('POST /bookings computes totalDue server-side', 'POST', '/bookings', {
  token: T, body: bookingBody,
}, 201, (b) => {
  if (b.status !== 'PENDING') return `status ${b.status}`;
  if (Math.round(Number(b.totalDue) * 1e6) / 1e6 !== wantTotal) {
    return `totalDue ${b.totalDue} != ${wantTotal}`;
  }
  if (b.paymentMethod !== 'WALLET') return 'paymentMethod lost';
  return null;
});
await expect("intruder can't book someone else's custom package → 404", 'POST', '/bookings', {
  token: I, body: bookingBody,
}, 404);
await expect('GET /me/bookings', 'GET', '/me/bookings', { token: T }, 200,
  (b) => (b.length === 1 && b[0].id === b1.id ? null : `got ${b.length}`));
await expect('GET /me/bookings?status=PENDING', 'GET', '/me/bookings?status=PENDING', { token: T }, 200,
  (b) => (b.length === 1 ? null : `got ${b.length}`));
await expect('GET /me/bookings?status=CONFIRMED → empty', 'GET', '/me/bookings?status=CONFIRMED', { token: T }, 200,
  (b) => (b.length === 0 ? null : 'not empty'));
await expect('GET /me/bookings (intruder sees none)', 'GET', '/me/bookings', { token: I }, 200,
  (b) => (b.length === 0 ? null : 'leaked'));
await expect('GET /me/bookings/:id', 'GET', `/me/bookings/${b1.id}`, { token: T }, 200,
  (b) => (b.package && b.vehicle && b.guide ? null : 'missing includes'));
await expect("GET /me/bookings/:id (intruder) → 404", 'GET', `/me/bookings/${b1.id}`, { token: I }, 404);

// ── Guide booking transitions ────────────────────────────────
console.log('\nGuide · booking transitions');
await expect('GET /guide/bookings', 'GET', '/guide/bookings', { token: G }, 200,
  (b) => (b.length === 1 && b[0].id === b1.id ? null : `got ${b.length}`));
await expect('GET /guide/bookings?status=PENDING', 'GET', '/guide/bookings?status=PENDING', { token: G }, 200,
  (b) => (b.length === 1 ? null : `got ${b.length}`));
await expect('complete before confirm → 400', 'POST', `/guide/bookings/${b1.id}/complete`, { token: G }, 400);
await expect('confirm booking', 'POST', `/guide/bookings/${b1.id}/confirm`, { token: G }, 201,
  (b) => (b.status === 'CONFIRMED' ? null : b.status));
await expect('confirm twice → 400', 'POST', `/guide/bookings/${b1.id}/confirm`, { token: G }, 400);
await expect('complete booking', 'POST', `/guide/bookings/${b1.id}/complete`, { token: G }, 201,
  (b) => (b.status === 'COMPLETED' ? null : b.status));
await expect('tourist cancel COMPLETED → 400', 'POST', `/bookings/${b1.id}/cancel`, { token: T }, 400);

const b2 = await expect('second booking (public package)', 'POST', '/bookings', {
  token: T, body: { ...bookingBody, packageId: SEED_PACKAGE, paymentMethod: 'CARD' },
}, 201);
await expect('decline booking', 'POST', `/guide/bookings/${b2.id}/decline`, { token: G }, 201,
  (b) => (b.status === 'DECLINED' ? null : b.status));
await expect('tourist cancel DECLINED → 400', 'POST', `/bookings/${b2.id}/cancel`, { token: T }, 400);

const b3 = await expect('third booking', 'POST', '/bookings', {
  token: T, body: { ...bookingBody, packageId: SEED_PACKAGE },
}, 201);
await expect("intruder can't cancel someone else's booking → 404", 'POST', `/bookings/${b3.id}/cancel`, { token: I }, 404);
await expect('owner cancels PENDING booking', 'POST', `/bookings/${b3.id}/cancel`, { token: T }, 201,
  (b) => (b.status === 'CANCELLED' ? null : b.status));
await expect('guide confirm CANCELLED → 400', 'POST', `/guide/bookings/${b3.id}/confirm`, { token: G }, 400);

// ── Admin still sees everything ──────────────────────────────
console.log('\nAdmin visibility');
await expect('GET /admin/bookings shows the new bookings', 'GET', '/admin/bookings', { token: A }, 200,
  (b) => (b.filter((x) => [b1.id, b2.id, b3.id].includes(x.id)).length === 3 ? null : 'missing bookings'));

// ── Result ───────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed`);
if (failed) {
  console.log('Failed:');
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
console.log('ALL ENDPOINT TESTS PASSED');
