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

const SEED_PACKAGE = 'seed-package-highlights';
const SEED_VEHICLE = 'seed-vehicle-sedan';

// ── Setup: users ─────────────────────────────────────────────
console.log('\nSetup');
const tourist = await expect('register tourist', 'POST', '/auth/register', {
  body: { email: `t${stamp}@e2e.dev`, password: 'E2e#Pass123', fullName: 'E2E Tourist', nationality: 'Kenya' },
}, 201);
const intruder = await expect('register second tourist', 'POST', '/auth/register', {
  body: { email: `i${stamp}@e2e.dev`, password: 'E2e#Pass123', fullName: 'E2E Intruder', nationality: 'Ghana' },
}, 201);
const guide = await expect('register guide', 'POST', '/auth/register', {
  body: { email: `g${stamp}@e2e.dev`, password: 'E2e#Pass123', fullName: 'E2E Guide', nationality: 'Rwanda', role: 'GUIDE' },
}, 201);
const admin = await expect('admin login', 'POST', '/auth/login', {
  body: { email: 'admin@yoguide.app', password: 'Y0guide#Admin2026' },
}, 201);
if (!tourist || !intruder || !guide || !admin) {
  console.error('\nSetup failed, aborting.');
  process.exit(1);
}
const T = tourist.access_token;
const I = intruder.access_token;
const G = guide.access_token;
const A = admin.access_token;

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
await expect('GET /catalog/packages?search=musanze', 'GET', '/catalog/packages?search=musanze', {}, 200,
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
  (b) => (b.user?.fullName === 'E2E Guide' ? null : 'wrong guide'));
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
const wantPrice = tours.reduce((s, t) => s + Number(t.price), 0);
const wantHours = tours.reduce((s, t) => s + t.duration, 0);
const custom = await expect('POST /packages/custom sums price+duration', 'POST', '/packages/custom', {
  token: T, body: { tourIds: tours.map((t) => t.id), name: 'E2E Custom' },
}, 201, (b) => {
  if (Number(b.price) !== wantPrice) return `price ${b.price} != ${wantPrice}`;
  if (b.durationHours !== wantHours) return `duration ${b.durationHours} != ${wantHours}`;
  if (b.tours.length !== tours.length) return `tours ${b.tours.length} != ${tours.length}`;
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
// seed sedan: 25/h, 150/day — custom package duration is wantHours (< 24h)
const wantVehicleCost = Math.min(25 * wantHours, 150);
const wantTotal = wantPrice + wantVehicleCost;
const b1 = await expect('POST /bookings computes totalDue server-side', 'POST', '/bookings', {
  token: T, body: bookingBody,
}, 201, (b) => {
  if (b.status !== 'PENDING') return `status ${b.status}`;
  if (Number(b.totalDue) !== wantTotal) return `totalDue ${b.totalDue} != ${wantTotal}`;
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
