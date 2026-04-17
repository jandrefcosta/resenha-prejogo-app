#!/usr/bin/env node
/**
 * cron-match-docs.mjs — Pipeline diário: download → parse → build match-docs.json
 *
 * Rode manualmente:
 *   node scripts/cron-match-docs.mjs
 *
 * Ou via npm:
 *   npm run docs:cron
 */

import { execSync } from 'child_process';

const steps = [
  { name: 'download', cmd: 'node scripts/download-pdfs.mjs' },
  { name: 'parse',    cmd: 'node scripts/parse-pdfs.mjs' },
  { name: 'build',    cmd: 'node scripts/build-match-docs.mjs' },
];

const ts = () => new Date().toISOString();

console.log(`\n[${ts()}] docs:cron iniciado\n`);

for (const step of steps) {
  console.log(`[${ts()}] ── ${step.name} ──────────────────────────────`);
  try {
    execSync(step.cmd, { stdio: 'inherit' });
    console.log(`[${ts()}] ${step.name} concluído\n`);
  } catch (err) {
    console.error(`[${ts()}] ${step.name} falhou: ${err.message}`);
    process.exit(1);
  }
}

console.log(`[${ts()}] docs:cron concluído com sucesso\n`);
