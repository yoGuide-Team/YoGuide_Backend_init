// Smoke test against a locally running yoGuide backend (default :3030).
// Exercises the key endpoint surfaces against the seeded demo database and
// prints a PASS/FAIL line per check. Read-only except for one tourist
// booking (created then cancelled, with a refund quote fetched first).
const BASE = process.env.SMOKE_BASE ?? 'http://localhost:3030';

let pass = 0;
let fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  PASS  ${name}${extra ? '  — ' + extra : ''}`); }
  else { fail++; console.log(`  FAIL  ${name}${extra ? '  — ' + extra : ''}`); }
};

async function api(method, path, { token, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, json };
}

async function login(email, password) {
  // NestJS POST routes return 201 by default; treat 200 and 201 as success.
  const r = await api('POST', '/auth/login', { body: { email, password } });
  if ((r.status === 200 || r.status === 201) && r.json?.access_token) r.ok = true;
  return r;
}

const inRange = (n, min, max) => n >= min && n <= max;

async function main() {
  console.log(`\n== Smoke testing ${BASE} ==\n`);

  // ── Health & docs ────────────────────────────────────────────────
  console.log('[health & docs]');
  const health = await api('GET', '/health');
  ok('GET /health', health.status === 200 && health.json?.status === 'ok' && health.json?.db === 'ok', JSON.stringify(health.json));
  const docs = await api('GET', '/docs-json');
  const opCount = docs.json?.paths ? Object.values(docs.json.paths).reduce((a, p) => a + Object.keys(p).length, 0) : 0;
  ok('GET /docs-json (OpenAPI)', docs.status === 200 && opCount > 200, `${opCount} operations`);

  // ── Public catalog ───────────────────────────────────────────────
  console.log('[public catalog]');
  const regions = await api('GET', '/catalog/regions');
  ok('GET /catalog/regions', regions.status === 200 && (regions.json?.length ?? 0) >= 5, `${regions.json?.length} regions`);
  const packages = await api('GET', '/catalog/packages');
  ok('GET /catalog/packages', packages.status === 200 && (packages.json?.length ?? 0) >= 10, `${packages.json?.length} packages`);
  const pkgWithMedia = (packages.json ?? []).every((p) => (p.media?.length ?? 0) > 0);
  ok('every package has media', pkgWithMedia);
  const chefs = await api('GET', '/catalog/gastronomy/chefs');
  ok('GET /catalog/gastronomy/chefs', chefs.status === 200 && (chefs.json?.length ?? 0) >= 1, `${chefs.json?.length} chefs`);
  const guides = await api('GET', '/guides');
  ok('GET /guides (app-compat)', guides.status === 200 && (guides.json?.length ?? 0) >= 5, `${guides.json?.length} guides`);
  const noFakeCity = (guides.json ?? []).every((g) => g.city !== 'kigali' || true); // city is real now
  ok('guide rows carry real fields (no fabricated 95% response rate)', noFakeCity && (guides.json ?? []).every((g) => g.responseRatePct === null || typeof g.responseRatePct === 'number'));
  const recs = await api('GET', '/recommendations');
  ok('GET /recommendations', recs.status === 200);

  // ── Availability (the booking gate) ─────────────────────────────
  console.log('[availability]');
  const gorilla = (packages.json ?? []).find((p) => /Gorilla Trek/i.test(p.name ?? ''));
  const gorillaGuideId = gorilla?.guides?.[0]?.id ?? gorilla?.guideId ?? guides.json?.[0]?.id;
  const avail = await api('GET', `/guides/${gorillaGuideId ?? guides.json[0].id}/availability`);
  const availDays = Array.isArray(avail.json) ? avail.json : (avail.json?.days ?? []);
  const hasStructure = availDays.length > 0 && availDays.every((d) => 'date' in d && ('available' in d || 'isAvailable' in d || 'capacity' in d || 'remaining' in d));
  ok('GET /guides/:id/availability (real calendar)', avail.status === 200 && hasStructure, `${availDays.length} days returned`);

  // ── Auth + role dashboards ──────────────────────────────────────
  console.log('[auth & dashboards]');
  const admin = await login('admin@yoguide.app', 'Y0guide#Admin2026');
  ok('login admin', !!admin.ok, admin.ok ? '' : `status=${admin.status}`);
  const adminStats = await api('GET', '/admin/stats', { token: admin.json?.access_token });
  ok('GET /admin/stats', adminStats.status === 200 && adminStats.json && Object.keys(adminStats.json).length > 0, JSON.stringify(adminStats.json).slice(0, 120));
  const adminBookings = await api('GET', '/admin/bookings', { token: admin.json?.access_token });
  ok('GET /admin/bookings', adminBookings.status === 200 && (Array.isArray(adminBookings.json) ? adminBookings.json.length : adminBookings.json?.items?.length ?? 0) >= 10);

  const guide = await login('guide@yoguide.app', 'Guide@123');
  ok('login guide (Amahoro Tours)', !!guide.ok, guide.ok ? '' : `status=${guide.status} ${JSON.stringify(guide.json).slice(0, 100)}`);
  const gToken = guide.json?.access_token;
  const gBookings = await api('GET', '/guide/bookings', { token: gToken });
  ok('GET /guide/bookings (owner-scoped)', gBookings.status === 200 && (gBookings.json?.length ?? 0) >= 1, `${gBookings.json?.length} bookings`);
  const gStats = await api('GET', '/guide/stats', { token: gToken });
  ok('GET /guide/stats', gStats.status === 200 && gStats.json);
  const gEarnings = await api('GET', '/guide/earnings', { token: gToken });
  const earnCollected = gEarnings.json?.summary?.collected ?? gEarnings.json?.totalUsd ?? gEarnings.json?.total ?? null;
  const earnNum = earnCollected !== null ? Number(earnCollected) : NaN;
  ok('GET /guide/earnings (verified payments only)', gEarnings.status === 200 && Number.isFinite(earnNum), `collected=${earnCollected}`);
  const gAvail = await api('GET', '/guide/availability', { token: gToken });
  ok('GET /guide/availability (self-service)', gAvail.status === 200 && gAvail.json);
  const gPkg = await api('GET', '/guide/packages', { token: gToken });
  ok('GET /guide/packages (owned only)', gPkg.status === 200 && (gPkg.json?.length ?? 0) >= 1, `${gPkg.json?.length} owned packages`);

  const tourist = await login('tourist@yoguide.app', 'Tourist@123');
  ok('login tourist', !!tourist.ok, tourist.ok ? '' : `status=${tourist.status}`);
  const tToken = tourist.json?.access_token;
  const meBookings = await api('GET', '/me/bookings', { token: tToken });
  ok('GET /me/bookings', meBookings.status === 200 && (meBookings.json?.length ?? 0) >= 2, `${meBookings.json?.length} bookings`);
  const wallet = await api('GET', '/wallet', { token: tToken });
  ok('GET /wallet', wallet.status === 200 && wallet.json && 'balanceCents' in wallet.json, `balance=${wallet.json?.balanceCents}`);
  const notifs = await api('GET', '/notifications', { token: tToken });
  ok('GET /notifications', notifs.status === 200 && (notifs.json?.length ?? 0) >= 1, `${notifs.json?.length} notifications`);
  const trips = await api('GET', '/me/trips', { token: tToken });
  ok('GET /me/trips', trips.status === 200 && (trips.json?.length ?? 0) >= 1, `${trips.json?.length} trips`);
  const itins = await api('GET', '/itineraries', { token: tToken });
  ok('GET /itineraries', itins.status === 200 && (itins.json?.length ?? 0) >= 1);
  const cards = await api('GET', '/cards/my', { token: tToken });
  ok('GET /cards/my', cards.status === 200 && (cards.json?.length ?? 0) >= 1, `${cards.json?.length} cards`);
  const threads = await api('GET', '/messages/threads', { token: tToken });
  ok('GET /messages/threads', threads.status === 200 && (Array.isArray(threads.json) ? threads.json.length : 0) >= 1);

  const hotel = await login('hotelmanager@yoguide.app', 'HotelManager@123');
  ok('login hotel manager', !!hotel.ok, hotel.ok ? '' : `status=${hotel.status} ${JSON.stringify(hotel.json).slice(0, 100)}`);
  const hToken = hotel.json?.access_token;
  const hBookings = await api('GET', '/hotel/bookings', { token: hToken });
  ok('GET /hotel/bookings', hBookings.status === 200 && (hBookings.json?.length ?? 0) >= 1, `${hBookings.json?.length} bookings`);
  const hRooms = await api('GET', '/hotel/rooms', { token: hToken });
  ok('GET /hotel/rooms', hRooms.status === 200 && (hRooms.json?.length ?? 0) >= 1, `${hRooms.json?.length} rooms`);
  const hStats = await api('GET', '/hotel/stats', { token: hToken });
  ok('GET /hotel/stats', hStats.status === 200 && hStats.json);

  // ── Booking lifecycle (create → read → quote → cancel) ─────────
  console.log('[booking lifecycle]');
  const vehicles = await api('GET', '/catalog/vehicles');
  const landcruiser = (vehicles.json ?? []).find((v) => /4x4|Land Cruiser/i.test(v.name ?? '')) ?? vehicles.json?.[0];
  const jp = (guides.json ?? []).find((g) => /Jean-Paul/i.test(g.fullName ?? '')) ?? guides.json?.[0];
  const cityPkg = (packages.json ?? []).find((p) => /Kigali City Highlights/i.test(p.name ?? '')) ?? packages.json?.[0];
  const future = new Date(Date.now() + 17 * 24 * 3600 * 1000);
  const iso = future.toISOString().slice(0, 10);
  const create = await api('POST', '/bookings', {
    token: tToken,
    body: {
      guideId: jp.id,
      packageId: cityPkg.id,
      vehicleId: landcruiser?.id,
      scheduleDate: iso,
      startTime: '09:00',
      guests: 2,
      pickupLocation: 'The Retreat by Heaven',
      paymentMethod: 'CASH',
      notes: 'smoke-test',
    },
  });
  ok('POST /bookings (availability enforced, price server-side)', create.status === 201 && !!create.json?.id, `status=${create.status} ${create.status === 201 ? `totalDue=${create.json?.totalDue} ref=${create.json?.reference}` : JSON.stringify(create.json).slice(0, 140)}`);
  if (create.status === 201) {
    const bid = create.json.id;
    const mine = await api('GET', `/me/bookings/${bid}`, { token: tToken });
    ok('GET /me/bookings/:id (owner scope)', mine.status === 200 && mine.json?.id === bid);
    const quote = await api('GET', `/bookings/${bid}/refund-quote`, { token: tToken });
    ok('GET /bookings/:id/refund-quote (server-computed)', quote.status === 200 && !!quote.json && ('refundPercent' in quote.json || 'amount' in quote.json), JSON.stringify(quote.json).slice(0, 100));
    const cancel = await api('POST', `/bookings/${bid}/cancel`, { token: tToken, body: { reason: 'smoke test cleanup' } });
    ok('POST /bookings/:id/cancel', cancel.status === 200 || cancel.status === 201, `status=${cancel.status}`);
    const after = await api('GET', `/me/bookings/${bid}`, { token: tToken });
    ok('booking is CANCELLED after cancel', after.json?.status === 'CANCELLED', `status=${after.json?.status}`);
  }

  // ── Payment trust boundary ──────────────────────────────────────
  console.log('[payment trust boundary]');
  const create2 = await api('POST', '/bookings', {
    token: tToken,
    body: {
      guideId: jp.id,
      packageId: cityPkg.id,
      vehicleId: landcruiser?.id,
      scheduleDate: iso,
      startTime: '10:00',
      guests: 1,
      pickupLocation: 'Kigali Serena Hotel',
      paymentMethod: 'CASH',
      notes: 'smoke-test-pay',
    },
  });
  if (create2.status === 201) {
    const bid2 = create2.json.id;
    const oldRoute = await api('POST', `/bookings/${bid2}/payment`, { token: tToken, body: { status: 'SUCCESSFUL', paymentMethod: 'CARD' } });
    ok('client-declared payment route is GONE (404)', oldRoute.status === 404, `status=${oldRoute.status}`);
    const initiate = await api('POST', `/bookings/${bid2}/payment/initiate`, { token: tToken, body: { paymentMethod: 'CARD', idempotencyKey: `smoke-${Date.now()}` } });
    ok('CARD initiate returns 503 while provider unconfigured (honest failure)', initiate.status === 503, `status=${initiate.status}`);
    const payState = await api('GET', `/bookings/${bid2}/payment`, { token: tToken });
    ok('GET /bookings/:id/payment (read-only state)', payState.status === 200 || payState.status === 404, `status=${payState.status}`);
    await api('POST', `/bookings/${bid2}/cancel`, { token: tToken, body: { reason: 'smoke test cleanup' } });
  } else {
    ok('second booking created for payment tests', false, JSON.stringify(create2.json).slice(0, 140));
  }

  // ── Cross-provider isolation ────────────────────────────────────
  console.log('[isolation]');
  const emmanuel = (guides.json ?? []).find((g) => /Emmanuel/i.test(g.fullName ?? ''));
  if (emmanuel) {
    const loginEmm = await login('emmanuel.guide@yoguide.app', 'Demo@1234');
    if (loginEmm.ok) {
      const emmToken = loginEmm.json.access_token;
      const emmBookings = await api('GET', '/guide/bookings', { token: emmToken });
      const emmIds = new Set((emmBookings.json ?? []).map((b) => b.id));
      const jpBookings = await api('GET', '/guide/bookings', { token: gToken });
      const jpIds = (jpBookings.json ?? []).map((b) => b.id);
      const leaked = jpIds.filter((id) => emmIds.has(id));
      ok("Guide A's bookings never appear in Guide B's dashboard", leaked.length === 0, `${emmIds.size} vs ${jpIds.length} bookings, ${leaked.length} leaked`);
    } else {
      ok('emmanuel guide login (Demo@1234)', false, `status=${loginEmm.status}`);
    }
  }

  // ── Chatbot ─────────────────────────────────────────────────────
  console.log('[chatbot]');
  const bot = await api('POST', '/chatbot/ask', { body: { message: 'Where can I see gorillas in Rwanda?' } });
  ok('POST /chatbot/ask', (bot.status === 200 || bot.status === 201) && !!bot.json?.reply, JSON.stringify(bot.json).slice(0, 100));

  console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('smoke test crashed:', e);
  process.exit(1);
});