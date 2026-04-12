/**
 * Downloads one boletim PDF and dumps its raw extracted text
 * so we can verify regex patterns against actual content.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/debug-boletim-text.ts [idJogo]
 *   (default idJogo: 831889)
 */

import { extractText } from 'unpdf';

async function main() {
  // Accept either a full URL or a doc ID (default: doc 1421)
  const arg = process.argv[2] ?? '1421';
  const isSumula = process.argv[3] === '--sumula';
  const suffix = isSumula ? 'se' : 'b';
  const url    = arg.startsWith('http')
    ? arg
    : `https://conteudo.cbf.com.br/sumulas/2026/${arg}${suffix}.pdf`;

  console.log(`Downloading: ${url}\n`);

  const res = await fetch(url);
  if (!res.ok) {
    console.error(`HTTP ${res.status} ${res.statusText}`);
    process.exit(1);
  }

  const buffer = await res.arrayBuffer();
  const { text: pages } = await extractText(new Uint8Array(buffer), { mergePages: false });

  console.log(`Pages extracted: ${pages.length}\n`);

  for (let i = 0; i < pages.length; i++) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`PAGE ${i + 1}`);
    console.log('='.repeat(60));
    // Show each line with its index so we can spot spacing
    const lines = pages[i].split('\n');
    lines.forEach((line, idx) => {
      console.log(`[${String(idx).padStart(3)}] ${JSON.stringify(line)}`);
    });
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
