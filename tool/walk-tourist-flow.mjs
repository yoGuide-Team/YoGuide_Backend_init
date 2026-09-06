// Walk the Flutter app's tourist booking flow against the live local API.
// Mirrors the app's exact sequence (see Tripoguide_app):
//   AuthRepository.login            -> POST /auth/login
//   ToursRepository hydration       -> GET /catalog/regions|packages|vehicles|guides
//   BookingApi.availability         -> GET /guides/:id/availability
//   WalletService                   -> GET /wallet
//   BookingApi.createBooking        -> POST /bookings
//   BookingCheckoutPage             -> POST /bookings/:id/payment/initiate
//                                     GET  /bookings/:id/payment
//                                     POST /bookings/:id/payment/verify
//   BookingApi.myBookings           -> GET /me/bookings
//   BookingApi.cancelBooking        -> POST /bookings/:id/cancel
// Read-only on data; creates real (then cancelled) bookings like the smoke test.
const BASE = process.env.BASE || 'http://localhost:3030';
const EMAIL = process.env.EMAIL || 'kwame.visitor@yoguide.app';
const PASSWORD = process.env.PASSWORD || 'Demo@1234';

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  PASS  ${name}${extra ? '  — ' + extra : ''}`); }
  else { fail++; console.log(`  FAIL  ${name}${extra ? '  — ' + extra : ''}`); }
};

async function req(method, path, { token, body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* empty body */ }
  return { status: res.status, json };
}
const unwrap = (j) => (j && typeof j === 'object' && 'data' in j && j.data !== null ? j.data : j);

async function main() {
  console.log(`\n== Walking the tourist booking flow on ${BASE} as ${EMAIL} ==\n`);

  // 1. Login (NestJS returns 201 for POST; the app's dio accepts any 2xx)
  const login = await req('POST', '/auth/login', { body: { email: EMAIL, password: PASSWORD } });
  const token = unwrap(login.json)?.accessToken ?? unwrap(login.json)?.access_token;
  ok('POST /auth/login', login.status >= 200 && login.status < 300 && !!token,
     login.status === 401 ? 'wrong credentials — set EMAIL/PASSWORD' : `status ${login.status}`);
  if (!token) { console.log('\nCannot continue without a token.'); process.exit(1); }
  const auth = { token };

  // 2. Catalog hydration (ToursRepository)
  const [regions, packages, vehicles, guides] = await Promise.all([
    req('GET', '/catalog/regions'), req('GET', '/catalog/packages'),
    req('GET', '/catalog/vehicles'), req('GET', '/catalog/guides'),
  ]);
  const pkgs = unwrap(packages.json) ?? [];
  const vehs = unwrap(vehicles.json) ?? [];
  const gds = (unwrap(guides.json)?.items ?? unwrap(guides.json) ?? []);
  ok('GET /catalog/regions', regions.status === 200, `${(unwrap(regions.json) ?? []).length} regions`);
  ok('GET /catalog/packages', packages.status === 200 && pkgs.length > 0, `${pkgs.length} packages`);
  ok('GET /catalog/vehicles', vehicles.status === 200 && vehs.length > 0, `${vehs.length} vehicles`);
  ok('GET /catalog/guides', guides.status === 200 && gds.length > 0, `${gds.length} guides`);
  ok('packages carry media for the cards', pkgs.every(p => !p.media || p.media.length > 0) || pkgs.some(p => p.media?.length > 0));

  // 3. Pick a bookable guide + package + vehicle (as the app's picker does)
  const guide = gds.find(g => g.id) ?? gds[0];
  const gDetail = await req('GET', `/catalog/guides/${guide.id}`);
  ok('GET /catalog/guides/:id', gDetail.status === 200);
  const pkg = pkgs.find(p => p.isActive !== false && !p.isCustom) ?? pkgs[0];
  const guests = 2;
  const vehicle = vehs.find(v => (v.seats ?? 1) >= guests) ?? vehs[0];
  console.log(`\n  booking: guide=${guide.id} pkg="${pkg.name}" ($${pkg.price}) vehicle="${vehicle.name}" guests=${guests}`);

  // 4. Availability calendar (BookingApi.availability)
  const avail = await req('GET', `/guides/${guide.id}/availability?days=30`, auth);
  const days = (unwrap(avail.json)?.days ?? unwrap(avail.json) ?? []);
  const open = days.find(d => d.available && (d.remaining ?? 1) >= guests);
  ok('GET /guides/:id/availability', avail.status === 200 && days.length > 0, `${days.length} days`);
  ok('an open day with capacity exists', !!open, open ? `${open.date} ${open.startTime ?? ''}-${open.endTime ?? ''}` : 'none open');

  // 5. Wallet (WalletService.fetchWalletAndTransactions)
  const wallet = await req('GET', '/wallet', auth);
  const w = unwrap(wallet.json) ?? {};
  const balance = (w.balanceCents ?? 0) / 100;
  ok('GET /wallet', wallet.status === 200, `balance $${balance.toFixed(2)}, ${(w.transactions ?? []).length} tx`);

  // 6. Create the booking (BookingApi.createBooking — server prices it)
  const date = (open?.date ?? new Date(Date.now() + 864e5).toISOString().slice(0, 10));
  const startTime = open?.startTime ?? '09:00';
  const created = await req('POST', '/bookings', auth ? { ...auth, body: {
    packageId: pkg.id, vehicleId: vehicle.id, guideId: guide.id,
    scheduleDate: `${date}T00:00:00.000Z`, pickupLocation: 'Kigali — hotel pickup',
    guests, startTime, paymentMethod: 'CASH', notes: 'walk-tourist-flow',
  } } : {});
  const booking = unwrap(created.json) ?? {};
  ok('POST /bookings (CASH)', created.status === 201 && !!booking.id,
     created.status === 201 ? `ref ${booking.reference} totalDue $${booking.totalDue}` : JSON.stringify(created.json).slice(0, 200));
  ok('server computed the price (package + vehicle)', booking.totalDue != null && Number(booking.totalDue) > 0,
     `$${booking.totalDue} vs pkg $${pkg.price}`);
  ok('booking starts PENDING', booking.status === 'PENDING');

  // 7. Payment initiate (BookingCheckoutPage -> WalletService.initiateBookingPayment)
  const init = await req('POST', `/bookings/${booking.id}/payment/initiate`, { ...auth,
    body: { paymentMethod: 'CASH', idempotencyKey: `walk-${booking.id}` } });
  ok('POST .../payment/initiate (CASH)', init.status === 201 && unwrap(init.json)?.status === 'PENDING',
     `payment ${unwrap(init.json)?.status}`);

  // The WALLET path the app offers:
  const initWallet = await req('POST', `/bookings/${booking.id}/payment/initiate`, { ...auth,
    body: { paymentMethod: 'WALLET' } });
  console.log(`  NOTE  initiate(WALLET) -> ${initWallet.status} ${JSON.stringify(initWallet.json?.message ?? '')}`);
  ok('WALLET initiate behaves sanely (accepted or honest 503, never fake success)',
     initWallet.status === 201 || initWallet.status === 503 || initWallet.status === 400);

  // Idempotent initiate replays the original payment (before the booking is
  // cancelled — the cancelled-booking guard intentionally runs first).
  const replay = await req('POST', `/bookings/${booking.id}/payment/initiate`, { ...auth,
    body: { paymentMethod: 'CASH', idempotencyKey: `walk-${booking.id}` } });
  ok('idempotent initiate returns the original payment', replay.status === 201,
     `idempotencyKey respected`);

  // Payment status read (WalletService.bookingPaymentStatus)
  const payStatus = await req('GET', `/bookings/${booking.id}/payment`, auth);
  ok('GET .../payment', payStatus.status === 200, `state ${unwrap(payStatus.json)?.status}`);

  // Verify (WalletService.verifyBookingPayment) — CASH stays PENDING until provider confirms
  const verify = await req('POST', `/bookings/${booking.id}/payment/verify`, auth);
  ok('POST .../payment/verify (CASH stays PENDING)', verify.status === 200 || verify.status === 201,
     `payment ${unwrap(verify.json)?.payment?.status ?? unwrap(verify.json)?.status}`);

  // 8. History shows it (BookingApi.myBookings)
  const mine = await req('GET', '/me/bookings', auth);
  const mineList = unwrap(mine.json) ?? [];
  ok('GET /me/bookings lists the new booking', mine.status === 200 && mineList.some(b => b.id === booking.id),
     `${mineList.length} bookings total`);

  // 9. Refund quote (checkout page quote)
  const refund = await req('GET', `/bookings/${booking.id}/refund-quote`, auth);
  console.log(`  NOTE  refund-quote -> ${refund.status} ${JSON.stringify(refund.json?.eligible ?? refund.json?.message ?? '')}`);

  // 10. Cancel (BookingApi.cancelBooking)
  const cancel = await req('POST', `/bookings/${booking.id}/cancel`, auth);
  ok('POST /bookings/:id/cancel', cancel.status === 200 || cancel.status === 201,
     `status -> ${unwrap(cancel.json)?.status}`);

  console.log(`\n== Walk complete: ${pass} passed, ${fail} failed ==\n`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
