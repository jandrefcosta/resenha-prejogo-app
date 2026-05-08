/**
 * Reads a stored PDF from Postgres and dumps its raw extracted text
 * alongside what the parser actually extracted — useful for diagnosing
 * layout variations in the Boletim Financeiro or Súmula.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/debug-boletim-text.ts <idJogo> [--sumula]
 *
 * Reads the stored PDF from Postgres (pdf_files table).
 * Falls back to downloading from CBF if not in DB.
 */

import { extractText } from 'unpdf';
import { getPdf } from '../src/lib/cbfPdfStore';
import { parseBoletim, parseSumula } from '../src/lib/cbfDocParser';

async function main() {
  const idJogo = process.argv[2];
  if (!idJogo) {
    console.error('Usage: npx tsx --env-file=.env.local scripts/debug-boletim-text.ts <idJogo> [--sumula]');
    process.exit(1);
  }

  const isSumula = process.argv.includes('--sumula');
  const type = isSumula ? 'sumula' : 'boletim';

  console.log(`\nReading ${type} for idJogo=${idJogo} from Postgres...\n`);

  let buffer = await getPdf(idJogo, type);

  if (!buffer) {
    console.log(`Not in DB — trying CBF URL fallback...`);
    const year = new Date().getFullYear();
    const suffix = isSumula ? 'se' : 'b';
    const url = `https://conteudo.cbf.com.br/sumulas/${year}/${idJogo}${suffix}.pdf`;
    console.log(`Downloading: ${url}\n`);
    const res = await fetch(url);
    if (!res.ok) { console.error(`HTTP ${res.status}`); process.exit(1); }
    buffer = await res.arrayBuffer();
  }

  // Copy before extractText — unpdf detaches the original ArrayBuffer
  const bufferForParser = buffer.slice(0);

  // ── Raw text ──────────────────────────────────────────────────────────────
  const { text: pages } = await extractText(new Uint8Array(buffer), { mergePages: false });

  console.log(`Pages: ${pages.length}\n`);
  for (let i = 0; i < pages.length; i++) {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`RAW TEXT — PAGE ${i + 1}`);
    console.log('='.repeat(70));
    pages[i].split('\n').forEach((line, idx) => {
      console.log(`[${String(idx).padStart(3)}] ${JSON.stringify(line)}`);
    });
  }

  // ── Parser output ─────────────────────────────────────────────────────────
  console.log(`\n${'='.repeat(70)}`);
  console.log(`PARSER OUTPUT`);
  console.log('='.repeat(70));

  try {
    const result = isSumula
      ? await parseSumula(bufferForParser, idJogo)
      : await parseBoletim(bufferForParser, idJogo);
    console.log(JSON.stringify(result, null, 2));
  } catch (e) {
    console.error('Parser threw:', e);
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
