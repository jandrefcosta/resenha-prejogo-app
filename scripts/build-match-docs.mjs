#!/usr/bin/env node
/**
 * Consolidate parsed results into src/data/match-docs.json.
 *
 * Reads:  scripts/pdfs/{idJogo}/result.json  (one per match)
 *         scripts/round-map.json             (idJogo → round)
 * Writes: src/data/match-docs.json
 *
 * Usage:
 *   node scripts/build-match-docs.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PDF_DIR   = path.join(__dirname, 'pdfs');
const OUT_FILE  = path.join(__dirname, '..', 'src', 'data', 'match-docs.json');
const ROUND_MAP_FILE = path.join(__dirname, 'round-map.json');

// Load round map (idJogo → round number)
const roundMap = fs.existsSync(ROUND_MAP_FILE)
  ? JSON.parse(fs.readFileSync(ROUND_MAP_FILE, 'utf8'))
  : {};

const dirs = fs.readdirSync(PDF_DIR)
  .filter(d => fs.statSync(path.join(PDF_DIR, d)).isDirectory());

const matches = {};
let withBoletim = 0, withSumula = 0, total = 0;

for (const idJogo of dirs) {
  const resultPath = path.join(PDF_DIR, idJogo, 'result.json');
  if (!fs.existsSync(resultPath)) continue;

  const result = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
  const round = roundMap[idJogo] ?? null;

  matches[idJogo] = {
    idJogo,
    round,
    boletim: result.boletim ?? null,
    sumula:  result.sumula  ?? null,
  };

  if (result.boletim?.publico?.geral != null) withBoletim++;
  if (result.sumula?.gols != null) withSumula++;
  total++;
}

const output = {
  updatedAt: new Date().toISOString(),
  totalMatches: total,
  matches,
};

fs.writeFileSync(OUT_FILE, JSON.stringify(output, null, 2));

const sizeMb = (fs.statSync(OUT_FILE).size / 1024 / 1024).toFixed(2);
console.log(`==> src/data/match-docs.json`);
console.log(`    ${total} jogos  |  ${withBoletim} com boletim  |  ${withSumula} com súmula  |  ${sizeMb} MB`);
