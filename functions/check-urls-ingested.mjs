// One-off: check whether a list of URLs is already in the leads collection.
// Run: cd functions && node check-urls-ingested.mjs

import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const app = getApps().length > 0 ? getApps()[0] : initializeApp({ projectId: "asterley-bros-b29c0" });
const db = getFirestore(app);

const URLS = [
  "www.mondosando.com",
  "https://www.instagram.com/cafe_mondo_se5/",
  "https://www.southlondongallery.org/your-visit/south-london-louie/",
  "https://thepeckhampelican.co.uk/",
  "https://palais.co.uk/",
  "https://www.theospizzeria.com/",
  "https://peckhamcellars.co.uk/",
  "https://www.thekerfieldarms.co.uk/",
  "https://gladwells.co.uk/",
  "https://www.flourandgrape.com/",
  "https://josepizarro.com/venues/pizarro-restaurant-bermondsey/",
  "https://www.baccalalondon.co.uk/?utm_source=GMB&utm_medium=website+click&utm_campaign=SDM&utm_id=GMB",
  "https://www.cafemurano.co.uk/",
  "https://thelasttalisman.com/",
  "https://giddygrocer.co.uk/",
  "https://www.bstreetdeli.co.uk/",
  "https://eataliacafe.co.uk/",
  "https://josepizarro.com/venues/lolo-by-jose-pizarro/",
  "https://www.cassecroute.co.uk/",
  "https://vine-bermondsey.com/",
  "https://www.sollip.co.uk/",
  "http://trivetrestaurant.co.uk/",
  "www.cornershoplondon.com",
  "unwinedbars.co.uk",
  "lowerwine.com",
  "greensmiths.co.uk",
];

function extractDomain(url) {
  if (!url) return "";
  let s = url.toLowerCase().trim()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0]
    .split("?")[0]
    .replace(/\/$/, "");
  return s;
}

console.log("Loading all leads from Firestore...");
const snap = await db.collection("leads").get();
console.log(`Loaded ${snap.size} leads.\n`);

// Build a lookup map: domain → [lead, lead, ...]
const byDomain = new Map();
for (const doc of snap.docs) {
  const data = doc.data();
  const candidates = [data.website, data.instagram_handle, data.google_maps_url].filter(Boolean);
  for (const url of candidates) {
    const dom = extractDomain(url);
    if (!dom) continue;
    if (!byDomain.has(dom)) byDomain.set(dom, []);
    byDomain.get(dom).push({ id: doc.id, ...data });
  }
}

const found = [];
const missing = [];

for (const url of URLS) {
  const domain = extractDomain(url);
  const matches = byDomain.get(domain) || [];
  if (matches.length > 0) {
    found.push({ url, domain, matches });
  } else {
    missing.push({ url, domain });
  }
}

console.log("=".repeat(80));
console.log(`ALREADY INGESTED (${found.length}/${URLS.length})`);
console.log("=".repeat(80));
for (const f of found) {
  console.log(`\n  ${f.url}`);
  console.log(`    domain: ${f.domain}`);
  for (const m of f.matches) {
    console.log(`    → "${m.business_name}" [${m.id}] source=${m.source} stage=${m.stage} added_by=${m.added_by_email || "n/a"}`);
  }
}

console.log("\n" + "=".repeat(80));
console.log(`NOT YET INGESTED (${missing.length}/${URLS.length})`);
console.log("=".repeat(80));
for (const m of missing) {
  console.log(`  ${m.url}  (domain: ${m.domain})`);
}

console.log("\n" + "=".repeat(80));
console.log(`SUMMARY: ${found.length} already ingested, ${missing.length} new`);
console.log("=".repeat(80));
