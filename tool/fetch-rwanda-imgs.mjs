// Temporary dev tool: gather REAL Rwanda photo ids from Unsplash's internal
// search API for manual curation. Prints per-query candidates with their
// slug + alt description so a human (or the assistant) can pick genuinely
// Rwanda-relevant photos. Also prints a strict list of hits whose slug
// explicitly names Rwanda places.
const QUERIES = [
  'rwanda gorilla',
  'mountain gorilla',
  'gorilla',
  'volcanoes national park',
  'volcano rwanda',
  'lake kivu',
  'nyungwe forest',
  'nyungwe',
  'akagera national park',
  'akagera',
  'rwanda safari',
  'kigali city',
  'kigali',
  'rwanda city',
  'rwanda market',
  'african market colorful',
  'rwanda coffee',
  'coffee beans africa',
  'african food',
  'rwanda hills',
  'rwanda landscape',
  'terraced hills africa',
  'african savanna elephants',
  'african woman portrait',
  'african man portrait',
  'black woman portrait',
  'african people',
  'rwandan',
  'african crafts market',
  'african art colorful',
  'luxury safari lodge',
  'hotel pool resort',
  'african restaurant food',
];

const RW_STRICT = /rwanda|rwandan|kigali|kivu|nyungwe|akagera|musanze|volcanoes|virunga|bisoke|kinigi|gisenyi|rubavu|karongi|kibuye|huye|butare|imigongo|nyamirambo|kimironko/i;

const strict = {};
const all = {};
for (const q of QUERIES) {
  const url = `https://unsplash.com/napi/search/photos?query=${encodeURIComponent(q)}&per_page=20`;
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) { all[q] = [{ error: `HTTP ${res.status}` }]; continue; }
    const data = await res.json();
    const rows = (data.results || []).map((p) => {
      const slug = p.alternative_slugs?.en || p.slug || '';
      const id = (p.urls?.regular || '').match(/photo-([0-9a-f-]+)/)?.[1] || p.id;
      return {
        id,
        slug: slug.slice(0, 110),
        alt: (p.alt_description || '').slice(0, 90),
      };
    });
    all[q] = rows;
    const s = rows.filter((r) => RW_STRICT.test(r.slug));
    if (s.length) strict[q] = s;
  } catch (e) {
    all[q] = [{ error: String(e) }];
  }
  await new Promise((r) => setTimeout(r, 300));
}
console.log('===== STRICT (slug names Rwanda) =====');
console.log(JSON.stringify(strict, null, 1));
console.log('\n===== ALL (for curation) =====');
console.log(JSON.stringify(all, null, 1));