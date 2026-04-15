#!/usr/bin/env node
/**
 * Download all available CBF PDFs (súmula, boletim, relatório) for finished matches.
 *
 * PDFs are saved to: scripts/pdfs/{idJogo}/{idJogo}se.pdf / b.pdf / rdj.pdf
 * Already-downloaded files are skipped (idempotent).
 *
 * Usage:
 *   node scripts/download-pdfs.mjs
 *   MAX_ROUND=11 node scripts/download-pdfs.mjs   # limit rounds
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BASE      = process.env.BASE      ?? 'http://localhost:3000';
const MAX_ROUND = Number(process.env.MAX_ROUND ?? 38);
const DELAY_MS  = Number(process.env.DELAY ?? 0.5) * 1000;
const PDF_DIR   = path.join(__dirname, 'pdfs');

const PDF_HEADERS = {
  Accept: 'application/pdf,*/*;q=0.8',
  'Accept-Language': 'pt-BR,pt;q=0.9',
  'Cache-Control': 'no-cache',
  Referer: 'https://www.cbf.com.br/',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
};

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Identify doc type from title
function classifyDoc(title) {
  const t = title.toLowerCase();
  if (t.includes('súmula') || t.includes('sumula')) return 'sumula';
  if (t.includes('boletim') || t.includes('financeiro') || t.includes('borderô') || t.includes('bordero')) return 'boletim';
  if (t.includes('relatório') || t.includes('relatorio')) return 'relatorio';
  return null;
}

const suffixMap = { sumula: 'se', boletim: 'b', relatorio: 'rdj' };

async function downloadFile(url, dest) {
  if (fs.existsSync(dest)) return 'skipped';
  const res = await fetch(url, { headers: PDF_HEADERS });
  if (!res.ok) return `http-${res.status}`;
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buf);
  return 'downloaded';
}

// ── Main ─────────────────────────────────────────────────────────────────────

if (!fs.existsSync(PDF_DIR)) fs.mkdirSync(PDF_DIR, { recursive: true });

console.log(`==> Varrendo rodadas 1..${MAX_ROUND}...\n`);

const allMatches = []; // { idJogo, round, docs: [{type, url}] }

for (let round = 1; round <= MAX_ROUND; round++) {
  let data;
  try {
    data = await fetch(`${BASE}/api/cbf/round?round=${round}`).then(r => r.json());
  } catch (e) {
    console.log(`  Rodada ${round}: ERRO ao buscar — ${e.message}`);
    continue;
  }

  const matches = data.matches ?? [];
  const finished = matches.filter(m => {
    if (!m.idJogo) return false;
    if (m.documentos?.length > 0) return true;
    if (m.mandante?.gols != null && m.visitante?.gols != null) return true;
    if (m.data && m.hora) {
      const [d, mo, y] = m.data.split('/').map(Number);
      const [h, mi] = m.hora.split(':').map(Number);
      return new Date(Date.UTC(y, mo - 1, d, h + 3, mi)).getTime() <= Date.now();
    }
    return false;
  });

  for (const m of finished) {
    const docs = [];
    // From documentos[] in API
    for (const doc of (m.documentos ?? [])) {
      const type = classifyDoc(doc.title);
      if (type && doc.url?.startsWith('http')) docs.push({ type, url: doc.url });
    }
    // Fallback: construct URLs from idJogo + year
    if (docs.length === 0 && m.idJogo && m.data) {
      const year = m.data.split('/')[2];
      if (year) {
        for (const [type, suffix] of Object.entries(suffixMap)) {
          docs.push({ type, url: `https://conteudo.cbf.com.br/sumulas/${year}/${m.idJogo}${suffix}.pdf` });
        }
      }
    }
    if (docs.length > 0) allMatches.push({ idJogo: m.idJogo, round, docs });
  }

  console.log(`  Rodada ${round}: ${finished.length} jogos finalizados`);
}

console.log(`\n==> Baixando PDFs para ${allMatches.length} jogos...\n`);

let downloaded = 0, skipped = 0, errors = 0;

for (let i = 0; i < allMatches.length; i++) {
  const { idJogo, docs } = allMatches[i];
  const dir = path.join(PDF_DIR, idJogo);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const results = [];
  for (const { type, url } of docs) {
    const suffix = suffixMap[type];
    const dest = path.join(dir, `${idJogo}${suffix}.pdf`);
    const status = await downloadFile(url, dest);
    results.push(`${type}:${status}`);
    if (status === 'downloaded') downloaded++;
    else if (status === 'skipped') skipped++;
    else errors++;
    if (status === 'downloaded') await sleep(DELAY_MS);
  }

  const pad = String(i + 1).padStart(3);
  console.log(`  [${pad}/${allMatches.length}] idJogo=${idJogo.padEnd(10)} ${results.join('  ')}`);
}

console.log(`
=== Resumo ===
  Baixados:  ${downloaded}
  Pulados:   ${skipped}
  Erros:     ${errors}
  PDFs em:   ${PDF_DIR}
`);
