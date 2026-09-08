// Multi-provider data-isolation tests — the properties that matter most.
//
// This is the Phase 21 critical test: two guides, two customers, one
// booking, and the demand that the booking is visible to exactly the right
// people and nobody else. It also covers package ownership, availability /
// double-booking, and the payment trust boundary.
//
// Prereqs: server running (npm run build && node dist/main.js) against a
// migrated + seeded database (npm run prisma:seed).
//
//   node test/isolation-e2e.mjs [baseUrl]
//
// Creates throwaway users (unique email per run); safe to re-run.

const BASE = process.argv[2] ?? 'http://localhost:3030';
const stamp = Date.now();
const PASSWORD = 'E2e#Pass123';

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

function fatal(message) {
  console.error(`\n${message}`);
  process.exit(1);
}

// ── Setup ────────────────────────────────────────────────────

console.log('\nSetup');
const adminLogin = await expect('admin login', 'POST', '/auth/login', {
  body: { email: 'admin@yoguide.app', password: 'Y0guide#Admin2026' },
}, 201);
if (!adminLogin) fatal('Could not log in as admin. Is the database seeded?');
const A = adminLogin.access_token;

async function makeUser(label, role) {
  const email = `${label}${stamp}@iso.dev`;
  const created = await req('POST', '/admin/users', {
    token: A,
    body: { email, password: PASSWORD, fullName: `ISO ${label}`, nationality: 'Rwanda', role },
  });
  if (created.status !== 201) {
    check(`create ${label}`, false, `status ${created.status}: ${JSON.stringify(created.body).slice(0, 160)}`);
    return null;
  }
  const login = await req('POST', '/auth/login', { body: { email, password: PASSWORD } });
  if (login.status !== 201) {
    check(`login ${label}`, false, `status ${login.status}`);
    return null;
  }
  check(`create + login ${label}`, true);
  return login.body.access_token;
}

const guideA = await makeUser('guideA', 'GUIDE');
const guideB = await makeUser('guideB', 'GUIDE');
const custA = await makeUser('custA', 'TOURIST');
const custB = await makeUser('custB', 'TOURIST');
if (!guideA || !guideB || !custA || !custB) fatal('Setup failed, aborting.');

// ── Provider profiles ────────────────────────────────────────

console.log('\nProvider profiles');
const profileA = await expect('Guide A creates profile', 'POST', '/guide/profile', {
  token: guideA, body: { guideType: 'INDIVIDUAL', languages: ['EN'] },
}, 201);
const profileB = await expect('Guide B creates profile', 'POST', '/guide/profile', {
  token: guideB, body: { guideType: 'INDIVIDUAL', languages: ['EN'] },
}, 201);
if (!profileA || !profileB) fatal('Could not create guide profiles, aborting.');
const guideAId = profileA.id;
const guideBId = profileB.id;

// ── Availability ─────────────────────────────────────────────

console.log('\nAvailability');
// Pick a date 10 days out and open that weekday for Guide A only.
const target = new Date(Date.now() + 10 * 24 * 3600 * 1000);
const targetDate = target.toISOString().slice(0, 10);
const targetWeekday = new Date(`${targetDate}T00:00:00Z`).getUTCDay();

await expect('Guide A opens the target weekday', 'PUT', '/guide/availability/weekly', {
  token: guideA,
  body: { weekday: targetWeekday, startTime: '08:00', endTime: '18:00', capacity: 2 },
}, 200);

await expect('Guide A sets daily capacity', 'PUT', '/guide/availability/daily-capacity', {
  token: guideA, body: { dailyCapacity: 2 },
}, 200);

await expect('availability is real, not a 14-day stub', 'GET', `/guides/${guideAId}/availability?from=${targetDate}&days=3`, {}, 200,
  (b) => {
    const day = b.days?.find((d) => d.date === targetDate);
    if (!day) return 'target date missing from calendar';
    if (day.available !== true) return `target date not available: ${day.reason}`;
    if (day.capacity !== 2) return `expected capacity 2, got ${day.capacity}`;
    return null;
  });

await expect('Guide B has no open weekday → not bookable', 'GET', `/guides/${guideBId}/availability?from=${targetDate}&days=1`, {}, 200,
  (b) => (b.days?.[0]?.available === false ? null : 'Guide B reported available with no schedule set'));

// ── Package ownership (Phase 7) ──────────────────────────────

console.log('\nPackage ownership');
const regions = await req('GET', '/catalog/regions');
const regionId = Array.isArray(regions.body) ? regions.body[0]?.id : null;
if (!regionId) fatal('No regions seeded; cannot test package ownership.');

const tourTypeA = await expect('Guide A creates a tour type', 'POST', '/guide/tour-types', {
  token: guideA, body: { name: `ISO Type ${stamp}`, regionId },
}, 201);

const packageA = await expect('Guide A creates a package', 'POST', '/guide/packages', {
  token: guideA,
  body: {
    tourTypeId: tourTypeA.id,
    name: `Nyungwe Forest Adventure ${stamp}`,
    description: 'Isolation test package owned by Guide A.',
    durationHours: 6,
    price: 120,
    maxGuests: 4,
  },
}, 201);
if (!packageA) fatal('Could not create Guide A package, aborting.');

await expect('Guide A sees own package', 'GET', '/guide/packages', { token: guideA }, 200,
  (b) => (b.some((p) => p.id === packageA.id) ? null : "Guide A's own package missing"));

// THE OWNERSHIP TEST: Guide B must not see, edit, or delete it.
await expect('Guide B does NOT see Guide A\'s package', 'GET', '/guide/packages', { token: guideB }, 200,
  (b) => (b.some((p) => p.id === packageA.id) ? "LEAK: Guide B sees Guide A's package" : null));

await expect('Guide B cannot read Guide A\'s package', 'GET', `/guide/packages/${packageA.id}`, { token: guideB }, 404);
await expect('Guide B cannot edit Guide A\'s package', 'PATCH', `/guide/packages/${packageA.id}`, {
  token: guideB, body: { price: 1 },
}, 404);
await expect('Guide B cannot delete Guide A\'s package', 'DELETE', `/guide/packages/${packageA.id}`, { token: guideB }, 404);

// ── Booking ownership (Phases 8 & 21) ────────────────────────

console.log('\nBooking ownership');
// Needs >= 2 seats: the seat check runs before the availability check, so a
// 1-seat motorbike would fail the over-capacity case for the wrong reason.
const vehicles = await req('GET', '/catalog/vehicles');
const vehicleId = Array.isArray(vehicles.body)
  ? vehicles.body.find((v) => v.seats >= 2)?.id
  : null;
if (!vehicleId) fatal('No vehicle with 2+ seats seeded; cannot run the capacity tests.');

const booking = await expect('Customer A books Guide A', 'POST', '/bookings', {
  token: custA,
  body: {
    guideId: guideAId,
    packageId: packageA.id,
    vehicleId,
    pickupLocation: 'Kigali Convention Centre',
    scheduleDate: `${targetDate}T09:00:00.000Z`,
    startTime: '09:00',
    guests: 1,
  },
}, 201, (b) => {
  if (b.guideId !== guideAId) return 'booking not linked to Guide A';
  if (b.status !== 'PENDING') return `expected PENDING, got ${b.status}`;
  if (!b.reference) return 'no booking reference generated';
  return null;
});
if (!booking) fatal('Could not create the booking, aborting.');

// Price must be server-computed, never client-supplied.
await expect('price is computed server-side', 'GET', `/me/bookings/${booking.id}`, { token: custA }, 200,
  (b) => (Number(b.totalDue) >= 120 ? null : `unexpected totalDue ${b.totalDue}`));

// ─── The core assertions ───
await expect('Guide A SEES the booking', 'GET', '/guide/bookings', { token: guideA }, 200,
  (b) => (b.some((x) => x.id === booking.id) ? null : 'Guide A cannot see their own booking'));

await expect('Guide B does NOT see the booking', 'GET', '/guide/bookings', { token: guideB }, 200,
  (b) => (b.some((x) => x.id === booking.id) ? 'LEAK: Guide B sees Guide A\'s booking' : null));

await expect('Guide B cannot confirm the booking', 'POST', `/guide/bookings/${booking.id}/confirm`, { token: guideB }, 404);
await expect('Guide B cannot decline the booking', 'POST', `/guide/bookings/${booking.id}/decline`, { token: guideB }, 404);
await expect('Guide B cannot complete the booking', 'POST', `/guide/bookings/${booking.id}/complete`, { token: guideB }, 404);

await expect('Customer A sees own booking', 'GET', '/me/bookings', { token: custA }, 200,
  (b) => (b.some((x) => x.id === booking.id) ? null : 'Customer A cannot see own booking'));

await expect('Customer B does NOT see the booking', 'GET', '/me/bookings', { token: custB }, 200,
  (b) => (b.some((x) => x.id === booking.id) ? 'LEAK: Customer B sees Customer A\'s booking' : null));

await expect('Customer B cannot read the booking directly', 'GET', `/me/bookings/${booking.id}`, { token: custB }, 404);
await expect('Customer B cannot cancel the booking', 'POST', `/bookings/${booking.id}/cancel`, { token: custB, body: {} }, 404);

// ── Provider dashboard isolation (Phase 17) ──────────────────

console.log('\nDashboard isolation');
await expect('Guide A stats count the booking', 'GET', '/guide/stats', { token: guideA }, 200,
  (b) => (b.bookings.total >= 1 ? null : 'Guide A stats show no bookings'));

await expect('Guide B stats show zero bookings', 'GET', '/guide/stats', { token: guideB }, 200,
  (b) => (b.bookings.total === 0 ? null : `LEAK: Guide B stats show ${b.bookings.total} bookings`));

await expect('Guide B earnings are empty', 'GET', '/guide/earnings', { token: guideB }, 200,
  (b) => (b.lines.length === 0 ? null : `LEAK: Guide B earnings show ${b.lines.length} lines`));

await expect('Guide B customer list is empty', 'GET', '/guide/customers', { token: guideB }, 200,
  (b) => (b.length === 0 ? null : `LEAK: Guide B sees ${b.length} customers`));

await expect('Guide A customer list has exactly the one customer', 'GET', '/guide/customers', { token: guideA }, 200,
  (b) => (b.length === 1 ? null : `expected 1 customer, got ${b.length}`));

// ── Notification isolation (Phase 16) ────────────────────────

console.log('\nNotification isolation');
await expect('Guide A was notified of the new booking', 'GET', '/notifications', { token: guideA }, 200,
  (b) => (b.some((n) => n.transactionId === booking.id) ? null : 'Guide A got no booking notification'));

await expect('Guide B was NOT notified', 'GET', '/notifications', { token: guideB }, 200,
  (b) => (b.some((n) => n.transactionId === booking.id) ? 'LEAK: Guide B notified about Guide A\'s booking' : null));

await expect('Customer B was NOT notified', 'GET', '/notifications', { token: custB }, 200,
  (b) => (b.some((n) => n.transactionId === booking.id) ? 'LEAK: Customer B notified about Customer A\'s booking' : null));

// ── Payment trust boundary (Phase 12) ────────────────────────

console.log('\nPayment trust boundary');
// The old route accepted a client-declared status. It must be gone.
const selfDeclare = await req('POST', `/bookings/${booking.id}/payment`, {
  token: custA, body: { status: 'SUCCESSFUL', paymentMethod: 'CARD' },
});
check(
  'client cannot self-declare a payment SUCCESSFUL',
  selfDeclare.status === 404 || selfDeclare.status === 405,
  `expected the route to be gone, got ${selfDeclare.status}: ${JSON.stringify(selfDeclare.body).slice(0, 160)}`,
);

await expect('booking is still not confirmed', 'GET', `/me/bookings/${booking.id}`, { token: custA }, 200,
  (b) => (b.status === 'PENDING' ? null : `booking status changed to ${b.status} without a verified payment`));

await expect('Customer B cannot start a payment on it', 'POST', `/bookings/${booking.id}/payment/initiate`, {
  token: custB, body: { paymentMethod: 'CASH' },
}, 404);

const cashPayment = await expect('CASH payment stays PENDING (no gateway)', 'POST', `/bookings/${booking.id}/payment/initiate`, {
  token: custA, body: { paymentMethod: 'CASH', idempotencyKey: `iso-${stamp}` },
}, 201, (b) => (b.status === 'PENDING' ? null : `expected PENDING, got ${b.status}`));

if (cashPayment) {
  await expect('repeating the idempotency key does not double-charge', 'POST', `/bookings/${booking.id}/payment/initiate`, {
    token: custA, body: { paymentMethod: 'CASH', idempotencyKey: `iso-${stamp}` },
  }, 201, (b) => (b.id === cashPayment.id ? null : 'a second payment record was created for the same key'));
}

await expect('CASH does not confirm the booking', 'GET', `/me/bookings/${booking.id}`, { token: custA }, 200,
  (b) => (b.status === 'PENDING' ? null : `LEAK: booking became ${b.status} on an unsettled cash payment`));

// ── Availability enforcement (Phase 10) ──────────────────────

console.log('\nAvailability enforcement');
await expect('booking consumed capacity', 'GET', `/guides/${guideAId}/availability?from=${targetDate}&days=1`, {}, 200,
  (b) => {
    const day = b.days?.[0];
    if (!day) return 'no day returned';
    if (day.booked !== 1) return `expected booked 1, got ${day.booked}`;
    if (day.remaining !== 1) return `expected remaining 1, got ${day.remaining}`;
    return null;
  });

// Capacity is 2 and 1 is taken; a 2-guest booking must be refused.
await expect('over-capacity booking is refused', 'POST', '/bookings', {
  token: custB,
  body: {
    guideId: guideAId, packageId: packageA.id, vehicleId,
    pickupLocation: 'Kigali', scheduleDate: `${targetDate}T09:00:00.000Z`, guests: 2,
  },
}, 409);

// A second single-guest booking fills the day.
const booking2 = await expect('second booking fills the last place', 'POST', '/bookings', {
  token: custB,
  body: {
    guideId: guideAId, packageId: packageA.id, vehicleId,
    pickupLocation: 'Kigali', scheduleDate: `${targetDate}T09:00:00.000Z`, guests: 1,
  },
}, 201);

await expect('now fully booked → third is refused', 'POST', '/bookings', {
  token: custA,
  body: {
    guideId: guideAId, packageId: packageA.id, vehicleId,
    pickupLocation: 'Kigali', scheduleDate: `${targetDate}T09:00:00.000Z`, guests: 1,
  },
}, 409);

// Booking a guide with no open weekday must fail.
await expect('cannot book a provider with no schedule', 'POST', '/bookings', {
  token: custA,
  body: {
    guideId: guideBId, packageId: packageA.id, vehicleId,
    pickupLocation: 'Kigali', scheduleDate: `${targetDate}T09:00:00.000Z`, guests: 1,
  },
}, 409);

// Blocked dates must be respected.
const blockDate = new Date(Date.now() + 11 * 24 * 3600 * 1000).toISOString().slice(0, 10);
const blockWeekday = new Date(`${blockDate}T00:00:00Z`).getUTCDay();
await expect('Guide A opens the block-test weekday', 'PUT', '/guide/availability/weekly', {
  token: guideA, body: { weekday: blockWeekday, startTime: '08:00', endTime: '18:00', capacity: 5 },
}, 200);
await expect('Guide A blocks that date', 'POST', '/guide/availability/block', {
  token: guideA, body: { date: blockDate, isBlocked: true, reason: 'Public holiday' },
}, 201);
await expect('booking a blocked date is refused', 'POST', '/bookings', {
  token: custA,
  body: {
    guideId: guideAId, packageId: packageA.id, vehicleId,
    pickupLocation: 'Kigali', scheduleDate: `${blockDate}T09:00:00.000Z`, guests: 1,
  },
}, 409);

// ── Cancellation & refund policy (Phase 13) ──────────────────

console.log('\nCancellation policy');
await expect('refund quote is server-computed', 'GET', `/bookings/${booking.id}/refund-quote`, { token: custA }, 200,
  (b) => {
    // No captured payment, so nothing is refundable — and the server says so
    // rather than letting the client assert eligibility.
    if (b.eligible !== false) return 'quote claims a refund with no captured payment';
    if (b.rule !== 'no_captured_payment') return `unexpected rule ${b.rule}`;
    return null;
  });

await expect('Customer B cannot quote someone else\'s booking', 'GET', `/bookings/${booking.id}/refund-quote`, { token: custB }, 404);

await expect('Customer A cancels own booking', 'POST', `/bookings/${booking.id}/cancel`, {
  token: custA, body: { reason: 'Change of plans' },
}, 201, (b) => (b.booking?.status === 'CANCELLED' ? null : `expected CANCELLED, got ${b.booking?.status}`));

await expect('cancellation freed the capacity', 'GET', `/guides/${guideAId}/availability?from=${targetDate}&days=1`, {}, 200,
  (b) => {
    const day = b.days?.[0];
    if (!day) return 'no day returned';
    if (day.booked !== 1) return `expected booked back down to 1, got ${day.booked}`;
    return null;
  });

// ── Booking lifecycle (Phase 9) ──────────────────────────────
//
// Regression cover for the transitions the api-e2e.mjs suite exercises
// too. api-e2e.mjs now resolves its package/vehicle fixtures dynamically
// from the live catalog (the old hardcoded 'seed-package-kigali-classic' /
// 'seed-vehicle-evcar' ids no longer exist), so both suites run against
// any seeded database. These assertions re-cover the same lifecycle rules
// against fixtures we own here.

console.log('\nBooking lifecycle');
const lifecycleDate = new Date(Date.now() + 12 * 24 * 3600 * 1000).toISOString().slice(0, 10);
const lifecycleWeekday = new Date(`${lifecycleDate}T00:00:00Z`).getUTCDay();
await expect('open a weekday for lifecycle tests', 'PUT', '/guide/availability/weekly', {
  token: guideA, body: { weekday: lifecycleWeekday, startTime: '08:00', endTime: '18:00', capacity: 10 },
}, 200);

async function makeLifecycleBooking(label) {
  return expect(label, 'POST', '/bookings', {
    token: custA,
    body: {
      guideId: guideAId, packageId: packageA.id, vehicleId,
      pickupLocation: 'Kigali', scheduleDate: `${lifecycleDate}T09:00:00.000Z`, guests: 1,
    },
  }, 201);
}

const lc1 = await makeLifecycleBooking('lifecycle booking 1 created');
if (lc1) {
  await expect('complete before confirm → 400', 'POST', `/guide/bookings/${lc1.id}/complete`, { token: guideA }, 400);
  await expect('guide confirms', 'POST', `/guide/bookings/${lc1.id}/confirm`, { token: guideA }, 201,
    (b) => (b.status === 'CONFIRMED' ? null : `expected CONFIRMED, got ${b.status}`));
  await expect('confirm twice → 400', 'POST', `/guide/bookings/${lc1.id}/confirm`, { token: guideA }, 400);
  await expect('guide completes', 'POST', `/guide/bookings/${lc1.id}/complete`, { token: guideA }, 201,
    (b) => (b.status === 'COMPLETED' ? null : `expected COMPLETED, got ${b.status}`));
  await expect('cancel a COMPLETED booking → 400', 'POST', `/bookings/${lc1.id}/cancel`, { token: custA, body: {} }, 400);

  // Review is only allowed on a completed booking you own.
  await expect('customer B cannot review it', 'POST', `/bookings/${lc1.id}/review`, {
    token: custB, body: { starRating: 5 },
  }, 404);
  await expect('customer A reviews the completed booking', 'POST', `/bookings/${lc1.id}/review`, {
    token: custA, body: { starRating: 5, message: 'Excellent guide.' },
  }, 201);
  await expect('cannot review twice', 'POST', `/bookings/${lc1.id}/review`, {
    token: custA, body: { starRating: 4 },
  }, 400);
  await expect('review lands on Guide A', 'GET', '/guide/reviews', { token: guideA }, 200,
    (b) => (b.some((r) => r.bookingId === lc1.id) ? null : "review missing from Guide A's list"));
  await expect('review does NOT land on Guide B', 'GET', '/guide/reviews', { token: guideB }, 200,
    (b) => (b.some((r) => r.bookingId === lc1.id) ? 'LEAK: Guide B sees Guide A\'s review' : null));
}

const lc2 = await makeLifecycleBooking('lifecycle booking 2 created');
if (lc2) {
  await expect('guide declines', 'POST', `/guide/bookings/${lc2.id}/decline`, { token: guideA }, 201,
    (b) => (b.status === 'DECLINED' ? null : `expected DECLINED, got ${b.status}`));
  await expect('cancel a DECLINED booking → 400', 'POST', `/bookings/${lc2.id}/cancel`, { token: custA, body: {} }, 400);
}

const lc3 = await makeLifecycleBooking('lifecycle booking 3 created');
if (lc3) {
  await expect('owner cancels a PENDING booking', 'POST', `/bookings/${lc3.id}/cancel`, { token: custA, body: {} }, 201,
    (b) => (b.booking?.status === 'CANCELLED' ? null : `expected CANCELLED, got ${b.booking?.status}`));
  await expect('guide confirm of a CANCELLED booking → 400', 'POST', `/guide/bookings/${lc3.id}/confirm`, { token: guideA }, 400);
}

await expect('booking a past date is refused', 'POST', '/bookings', {
  token: custA,
  body: {
    guideId: guideAId, packageId: packageA.id, vehicleId,
    pickupLocation: 'Kigali', scheduleDate: '2020-01-01T09:00:00.000Z', guests: 1,
  },
}, 400);

// ── Guide application → approval → activation (Phase 14) ─────

console.log('\nProvider application flow');
const applicantEmail = `applicant${stamp}@iso.dev`;
const application = await expect('anyone can apply', 'POST', '/guide/apply', {
  body: {
    fullName: 'Iso Applicant',
    email: applicantEmail,
    guideType: 'INDIVIDUAL',
    city: 'Musanze',
    languages: ['EN', 'RW'],
  },
}, 201, (b) => (b.status === 'PENDING' ? null : `expected PENDING, got ${b.status}`));

await expect('tourist cannot see the review queue', 'GET', '/admin/guide-applications', { token: custA }, 403);
await expect('guide cannot see the review queue', 'GET', '/admin/guide-applications', { token: guideA }, 403);
await expect('admin sees the review queue', 'GET', '/admin/guide-applications?status=PENDING', { token: A }, 200,
  (b) => (b.some((x) => x.id === application?.id) ? null : 'new application missing from the queue'));

await expect('guide cannot approve applications', 'POST', `/admin/guide-applications/${application?.id}/approve`, { token: guideA }, 403);

const approval = await expect('admin approves → account provisioned', 'POST', `/admin/guide-applications/${application?.id}/approve`, {
  token: A,
}, 201, (b) => {
  if (!b.userId) return 'no user was provisioned';
  if (!b.guideId) return 'no guide profile was provisioned';
  return null;
});

// SECURITY: the provisioned account must not be usable until activated,
// and no password was ever emailed.
if (approval) {
  const loginAttempt = await req('POST', '/auth/login', {
    body: { email: applicantEmail, password: PASSWORD },
  });
  check(
    'provisioned account cannot log in before activation',
    loginAttempt.status === 401 || loginAttempt.status === 404,
    `expected rejection, got ${loginAttempt.status}`,
  );

  await expect('activation rejects a bogus token', 'POST', '/auth/activate', {
    body: { token: 'x'.repeat(64), password: 'Brand#New1' },
  }, 400);
}

// ── Cross-role guards ────────────────────────────────────────

console.log('\nCross-role guards');
await expect('tourist blocked from /guide/*', 'GET', '/guide/stats', { token: custA }, 403);
await expect('tourist blocked from /admin/*', 'GET', '/admin/stats', { token: custA }, 403);
await expect('guide blocked from /admin/*', 'GET', '/admin/stats', { token: guideA }, 403);
await expect('no token → 401', 'GET', '/guide/bookings', {}, 401);
await expect('garbage token → 401', 'GET', '/guide/bookings', { token: 'not-a-jwt' }, 401);

// ── Summary ──────────────────────────────────────────────────

console.log(`\n${'─'.repeat(60)}`);
console.log(`  passed: ${passed}`);
console.log(`  failed: ${failed}`);
if (failures.length) {
  console.log('\n  Failures:');
  for (const f of failures) console.log(`    • ${f}`);
}
console.log(`${'─'.repeat(60)}\n`);
process.exit(failed > 0 ? 1 : 0);
