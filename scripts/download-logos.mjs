// Downloads team logos from Wikipedia article thumbnails and saves them to
// public/logos/{apiFootballId}.png for self-hosting.
// Run: node scripts/download-logos.mjs

import { mkdirSync, createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '../public/logos');
mkdirSync(OUT_DIR, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// apiFootballId → exact English Wikipedia article title
// directUrl: use this image URL directly, skipping the Wikipedia API lookup
const CLUBS = [
  { id: 134,  wiki: 'Athletico Paranaense' },
  { id: 1062, wiki: 'Clube Atlético Mineiro' },
  { id: 118,  wiki: 'Esporte Clube Bahia' },
  { id: 120,  wiki: 'Botafogo de Futebol e Regatas' },
  { id: 132,  wiki: 'Associação Chapecoense de Futebol' },
  { id: 131,  directUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/30/S.C._Corinthians_Paulista_Antigo.svg/400px-S.C._Corinthians_Paulista_Antigo.svg.png' },
  { id: 147,  wiki: 'Coritiba Foot Ball Club' },
  { id: 135,  wiki: 'Cruzeiro Esporte Clube' },
  { id: 127,  wiki: 'Clube de Regatas do Flamengo' },
  { id: 124,  wiki: 'Fluminense Football Club' },
  { id: 130,  wiki: 'Grêmio Foot-Ball Porto Alegrense' },
  { id: 119,  wiki: 'Sport Club Internacional' },
  { id: 7848, wiki: 'Mirassol Futebol Clube' },
  { id: 121,  wiki: 'Sociedade Esportiva Palmeiras' },
  { id: 794,  wiki: 'Red Bull Bragantino' },
  { id: 1198, wiki: 'Clube do Remo' },
  { id: 128,  wiki: 'Santos FC' },
  { id: 126,  wiki: 'São Paulo FC' },
  { id: 133,  wiki: 'Club de Regatas Vasco da Gama' },
  { id: 136,  wiki: 'Esporte Clube Vitória' },
];

const WIKI_HEADERS = { 'User-Agent': 'sports-compile-logo-downloader/1.0 (self-hosted logos)' };

async function findThumbnail(wikiTitle, retries = 3) {
  const params = new URLSearchParams({
    action: 'query',
    titles: wikiTitle,
    prop: 'pageimages',
    format: 'json',
    pithumbsize: '400',
    redirects: '1',
    origin: '*',
  });
  const url = `https://en.wikipedia.org/w/api.php?${params}`;

  for (let attempt = 1; attempt <= retries; attempt++) {
    const res = await fetch(url, { headers: WIKI_HEADERS });
    if (res.status === 429) {
      const wait = attempt * 3000;
      console.log(`  Rate limited — waiting ${wait / 1000}s...`);
      await sleep(wait);
      continue;
    }
    if (!res.ok) throw new Error(`Wikipedia API HTTP ${res.status}`);
    const data = await res.json();
    const pages = Object.values(data.query.pages);
    return pages[0]?.thumbnail?.source ?? null;
  }
  throw new Error('Exceeded retries due to rate limiting');
}

async function downloadImage(url, dest, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    const res = await fetch(url, { headers: WIKI_HEADERS });
    if (res.status === 429) {
      const wait = attempt * 3000;
      console.log(`  Rate limited on download — waiting ${wait / 1000}s...`);
      await sleep(wait);
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await pipeline(res.body, createWriteStream(dest));
    return;
  }
  throw new Error('Exceeded retries due to rate limiting');
}

let ok = 0;
let skipped = 0;

for (const club of CLUBS) {
  try {
    let imageUrl = club.directUrl ?? null;

    if (!imageUrl) {
      imageUrl = await findThumbnail(club.wiki);
      await sleep(1500); // be polite to Wikipedia
    }

    if (!imageUrl) {
      console.warn(`⚠  No thumbnail: "${club.wiki}" (id ${club.id}) — add PNG manually to public/logos/${club.id}.png`);
      skipped++;
      continue;
    }

    const dest = join(OUT_DIR, `${club.id}.png`);
    await downloadImage(imageUrl, dest);
    console.log(`✓  ${club.wiki ?? `id ${club.id}`}`);
    ok++;
    await sleep(500);
  } catch (err) {
    console.error(`✗  ${club.wiki ?? `id ${club.id}`}: ${err.message}`);
    skipped++;
  }
}

console.log(`\nDone: ${ok} downloaded, ${skipped} skipped.`);
if (skipped > 0) {
  console.log('For skipped clubs, add PNG files manually to public/logos/{apiFootballId}.png');
}
