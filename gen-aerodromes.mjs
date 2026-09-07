// Génère src/data/aerodromes.ts depuis OpenAIP.
// À relancer quand vous voulez rafraîchir l'index. Aucune donnée saisie à la main.
import { writeFileSync, mkdirSync } from 'node:fs';

const API_KEY = process.env.OPENAIP_KEY;
if (!API_KEY) {
  console.error('Manque OPENAIP_KEY. Lancez : OPENAIP_KEY=xxx node scripts/gen-aerodromes.mjs');
  process.exit(1);
}

const all = [];
let page = 1;

while (true) {
  const url = `https://api.core.openaip.net/api/airports?country=FR&page=${page}&limit=100`;
  const res = await fetch(url, {
    headers: { 'x-openaip-api-key': API_KEY, Accept: 'application/json' },
  });
  if (!res.ok) {
    console.error(`HTTP ${res.status} page ${page}`);
    process.exit(1);
  }
  const data = await res.json();
  const items = Array.isArray(data.items) ? data.items : [];
  if (items.length === 0) break;

  for (const it of items) {
    if (!it.icaoCode || !it.name) continue;
    all.push({ oaci: it.icaoCode.toUpperCase(), name: it.name });
  }
  console.log(`page ${page} : ${items.length} items (total ${all.length})`);
  page++;
  if (page > 100) break; // garde-fou
}

all.sort((a, b) => a.oaci.localeCompare(b.oaci));

const out = `// GÉNÉRÉ AUTOMATIQUEMENT — ne pas éditer à la main.
// Source : OpenAIP, ${new Date().toISOString().split('T')[0]}
// Index d'autocomplétion uniquement : aucune fréquence, altitude ou TdP.
// Les données opérationnelles sont récupérées à la sélection via services/openaip.ts

export interface AerodromeIndexEntry {
  oaci: string;
  name: string;
}

export const FRENCH_AERODROMES: AerodromeIndexEntry[] = ${JSON.stringify(all, null, 2)};

export function searchAerodromes(query: string): AerodromeIndexEntry[] {
  const q = (query || '').trim().toLowerCase();
  if (!q) return FRENCH_AERODROMES.slice(0, 20);
  const exact = FRENCH_AERODROMES.filter((a) => a.oaci.toLowerCase() === q);
  const partial = FRENCH_AERODROMES.filter(
    (a) =>
      a.oaci.toLowerCase() !== q &&
      (a.oaci.toLowerCase().includes(q) || a.name.toLowerCase().includes(q))
  );
  return [...exact, ...partial].slice(0, 20);
}
`;

mkdirSync('src/data', { recursive: true });
writeFileSync('src/data/aerodromes.ts', out, 'utf8');
console.log(`Écrit src/data/aerodromes.ts : ${all.length} aérodromes.`);