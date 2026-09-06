// Temporary dev tool: second verification pass.
// 1) The 404 candidates above retried on the premium CDN (plus.unsplash.com).
// 2) The ORIGINAL seed-demo.ts ids re-verified so we know which still serve.
const PREMIUM = ['1661843402797-d51337c5e42e', '1686232986066-df37c6972f57', '1696531220266-362a418da9b4', '1723881627816-30001656c4c1', '1666726272929-b0e9f14ff563', '1664302700221-bd1549347986', '1661810056990-57be781caa2d', '1664302622341-e04fadaa8574', '1666116634482-66fdae7dd02b', '1675122317265-9cdd93e6b92d', '1675122317427-7d9dd55faf93', '1686981821198-347bd13247f4', '1666976506270-29610b4af0e1', '1721742730758-0bb3ba39716f', '1666976510011-28202995a11b', '1671379523824-c8aae61cb52a', '1695297516698-fd7a320a55e5', '1682913629540-3857602b540c', '1687995672262-1ed45d6ed3d1', '1703385175281-9176ca9fc41d', '1745624797642-4f522d5bcbfe', '1698749344907-a4207ef21593', '1708275672423-837db6d3d700', '1661895504446-902ae02bbc05'];
const ORIGINAL = ['1541348263662-e068662d82af', '1534177616072-ef7dc120449d', '1493246507139-91e8fad9978e', '1523805009345-7448845a9e53', '1516426122078-c23e76319801', '1489749798305-4fea3ae63d43', '1447933601403-0c6688de566e', '1504674900247-0877df9cc836', '1445019980597-93fa8acb246c', '1566073771259-6a8506099945', '1502005097973-6a7082348e28', '1504198266287-1659872e6590', '1547970810-dc1eac37d174', '1507003211169-0a1dd7228f2d', '1494790108377-be9c29b29330', '1500648767791-00dcc994a43e', '1534528741775-53994a69daeb', '1558898479-33c0057a5d12', '1531123897727-8f129e1688ce'];

async function check(url) {
  try {
    const res = await fetch(url, { method: 'HEAD', redirect: 'follow' });
    return res.ok ? 'OK' : `HTTP ${res.status}`;
  } catch { return 'ERR'; }
}
const out = { premium: {}, original: {} };
for (const id of PREMIUM) {
  out.premium[id] = await check(`https://plus.unsplash.com/premium_photo-${id}?auto=format&fit=crop&w=400&q=70`);
  await new Promise((r) => setTimeout(r, 150));
}
for (const id of ORIGINAL) {
  out.original[id] = await check(`https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=400&q=70`);
  await new Promise((r) => setTimeout(r, 150));
}
console.log(JSON.stringify(out, null, 1));