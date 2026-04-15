#!/usr/bin/env node
/**
 * Parse all downloaded CBF PDFs and save structured results per match.
 *
 * Input:  scripts/pdfs/{idJogo}/{idJogo}b.pdf   (boletim)
 *         scripts/pdfs/{idJogo}/{idJogo}se.pdf  (súmula)
 * Output: scripts/pdfs/{idJogo}/result.json
 *         scripts/pdfs/{idJogo}/boletim-raw.txt  (debug)
 *         scripts/pdfs/{idJogo}/sumula-raw.txt   (debug)
 *
 * Usage:
 *   node scripts/parse-pdfs.mjs
 *   MATCH=831894 node scripts/parse-pdfs.mjs   # single match
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PDF_DIR   = path.join(__dirname, 'pdfs');
const ONLY_MATCH = process.env.MATCH ?? null;

// ─── Number helpers ───────────────────────────────────────────────────────────

function parseBr(raw) {
  if (!raw) return null;
  const n = parseFloat(raw.trim().replace(/\./g, '').replace(',', '.'));
  return isNaN(n) ? null : n;
}

function parseIntBr(raw) {
  if (!raw) return null;
  const n = parseInt(raw.trim().replace(/\./g, ''), 10);
  return isNaN(n) ? null : n;
}

// ─── BOLETIM FINANCEIRO parser ────────────────────────────────────────────────

function parseBoletim(pages, idJogo) {
  const fullText = pages.join('\n');
  const page1 = pages[0] ?? '';

  // ── Header fields ─────────────────────────────────────────────────────────
  // Format A (old): single line "COMPETIÇÃO ... ESTÁDIO ..."
  // Format B (new): separate lines "Competição: ..." and "ESTÁDIO\n<name>"
  const competicaoLineA = page1.match(/^COMPETI[CÇ][AÃ]O\s+(.+?)\s+EST[AÁ]DIO\s+(.+)$/im);
  const competicaoLineB = page1.match(/^Competi[çc][aã]o:\s*(.+)$/im);
  const estadioLineB    = page1.match(/^EST[AÁ]DIO\s*\n([^\n]+)/im);

  const competicao = competicaoLineA?.[1]?.trim()
    ?? competicaoLineB?.[1]?.trim()
    ?? '';
  const estadio = competicaoLineA?.[2]?.trim()
    ?? estadioLineB?.[1]?.trim()
    ?? '';

  // Format A (old): "JOGO mandante X visitante DATA dd/mm/yyyy hh:mm"
  // Format B (new): "Jogo: mandante x visitante" + "Data: dd/mm/yyyy hh:mm"
  const jogoLineA = page1.match(/^JOGO\s+(.+?)\s+X\s+(.+?)\s+DATA\s+(\d{2}\/\d{2}\/\d{4})\s+(\d{2}:\d{2})/im);
  const jogoLineB = page1.match(/^Jogo:\s*(.+?)\s+[xX]\s+(.+?)$/im);
  const dataLineB = page1.match(/^Data:\s*(\d{2}\/\d{2}\/\d{4})\s+(\d{2}:\d{2})/im);

  const mandante = jogoLineA?.[1]?.trim() ?? jogoLineB?.[1]?.trim() ?? '';
  const visitante = jogoLineA?.[2]?.trim() ?? jogoLineB?.[2]?.trim() ?? '';
  const data      = jogoLineA?.[3]?.trim() ?? dataLineB?.[1]?.trim() ?? '';
  const hora      = jogoLineA?.[4]?.trim() ?? dataLineB?.[2]?.trim() ?? '';

  // Rodada
  const rodadaMatch = page1.match(/RODADA\s*\/\s*N[ºo]\s*JOGO\s+(\d+)\s*\/\s*(\d+)/i);
  const rodada = rodadaMatch?.[1] ?? '';
  const numJogo = rodadaMatch?.[2] ?? '';

  // ── Ticket table ──────────────────────────────────────────────────────────
  // Format A (old/standard): each row has "DESCRIPTION  disponivel  devolvidos  vendidos  preco  arrecadacao"
  // Format B (split-column): descriptions+quantities on one section, prices on another section of same page

  const rowPatternFull = /^(.+?)\s+([\d.]+)\s+\d+\s+([\d.]+)\s+(?:R\$\s*)?([\d.,]+)\s+(?:R\$\s*)?([\d.,]+)$/gm;
  // Split-column: description rows with only quantities (no price columns)
  // May have footer text appended on same line without a newline separator
  const rowPatternQtyOnly = /^(.+?)\s+([\d.]+)\s+\d+\s+([\d.]+)(?:\D|$)/gm;
  // Split-column: price-only rows "R$ x,xx R$ x,xx"
  const rowPatternPricesOnly = /^R\$\s*([\d.,]+)\s+R\$\s*([\d.,]+)$/gm;

  let naoPagante = 0;
  const catAcc = {}; // categoria → { quantidade, arrecadacao }
  let m;

  // Detect format: if the full-row pattern matches anything meaningful, use it.
  // Otherwise use split-column strategy.
  const fullRowMatches = [];
  while ((m = rowPatternFull.exec(fullText)) !== null) {
    fullRowMatches.push(m);
  }

  if (fullRowMatches.length > 0) {
    // Format A: full rows with description + quantities + prices
    for (const m of fullRowMatches) {
      const desc     = m[1].toUpperCase();
      const vendidos = parseIntBr(m[3]) ?? 0;
      const preco    = parseBr(m[4]) ?? 0;
      const arrec    = parseBr(m[5]) ?? 0;

      if (preco === 0 && vendidos > 0) naoPagante += vendidos;

      let cat;
      if (desc.includes('GRATUIDADE') || desc.includes('CONV') || desc.includes('AUTORIDADE') ||
          desc.includes('SERVICO') || desc.includes('SERVIÇO')) {
        cat = 'Gratuidade';
      } else if (desc.includes('MEIA')) {
        cat = 'Meia Entrada';
      } else if (desc.includes('INTEIRA')) {
        cat = 'Inteira';
      } else {
        continue;
      }
      if (!catAcc[cat]) catAcc[cat] = { quantidade: 0, arrecadacao: 0 };
      catAcc[cat].quantidade  += vendidos;
      catAcc[cat].arrecadacao += arrec;
    }
  } else {
    // Format B (split-column): collect qty-only rows and price-only rows separately,
    // then correlate by position index.
    const qtyRows = [];
    while ((m = rowPatternQtyOnly.exec(fullText)) !== null) {
      const desc     = m[1].toUpperCase();
      const vendidos = parseIntBr(m[3]) ?? 0;
      // Skip TOTAL/TOTAIS lines here — handled separately
      if (/^(?:TOTAL|TOTAIS)\b/.test(desc)) continue;
      qtyRows.push({ desc, vendidos });
    }

    const priceRows = [];
    while ((m = rowPatternPricesOnly.exec(fullText)) !== null) {
      const preco = parseBr(m[1]) ?? 0;
      const arrec = parseBr(m[2]) ?? 0;
      priceRows.push({ preco, arrec });
    }

    const count = Math.min(qtyRows.length, priceRows.length);
    for (let i = 0; i < count; i++) {
      const { desc, vendidos } = qtyRows[i];
      const { preco, arrec } = priceRows[i];

      if (preco === 0 && vendidos > 0) naoPagante += vendidos;

      let cat;
      if (desc.includes('GRATUIDADE') || desc.includes('CONV') || desc.includes('AUTORIDADE') ||
          desc.includes('SERVICO') || desc.includes('SERVIÇO')) {
        cat = 'Gratuidade';
      } else if (desc.includes('MEIA')) {
        cat = 'Meia Entrada';
      } else if (desc.includes('INTEIRA')) {
        cat = 'Inteira';
      } else {
        continue;
      }
      if (!catAcc[cat]) catAcc[cat] = { quantidade: 0, arrecadacao: 0 };
      catAcc[cat].quantidade  += vendidos;
      catAcc[cat].arrecadacao += arrec;
    }
  }

  // ── TOTAL row ─────────────────────────────────────────────────────────────
  // Old: "TOTAL 25.770 0 25.770 1.331.907,88"
  // New: "TOTAIS 32213 0 32213 R$ 2.171.746,00"
  // Split-column: "TOTAIS 36650 0 36650" (no revenue — look for it on surrounding lines)
  const totalMatch = fullText.match(/^(?:TOTAL|TOTAIS)\s+([\d.]+)\s+\d+\s+([\d.]+)\s+(?:R\$\s*)?([\d.,]+)/m);
  // Qty-only TOTAIS: no trailing price — may have footer text after the numbers on same line
  const totalMatchQtyOnly = !totalMatch
    ? fullText.match(/^(?:TOTAL|TOTAIS)\s+([\d.]+)\s+\d+\s+([\d.]+)(?:\D|$)/m)
    : null;

  let geralVendidos = null;
  let rendaBruta    = null;

  if (totalMatch) {
    geralVendidos = parseIntBr(totalMatch[2]);
    rendaBruta    = parseBr(totalMatch[3]);
  } else if (totalMatchQtyOnly) {
    geralVendidos = parseIntBr(totalMatchQtyOnly[2]);
    // Revenue is on a nearby line — look for the last standalone "R$ X" before TOTAIS
    // or a line like "R$ X R$ 0,00 R$ 0,00 R$ X" (total row in split format)
    const totaisIdx = fullText.search(/^(?:TOTAL|TOTAIS)\s+[\d.]+\s+\d+\s+[\d.]+$/m);
    const before = fullText.slice(0, totaisIdx);
    // Look for "R$ X R$ 0,00 R$ 0,00 R$ X" pattern where first == last (gross revenue appears twice)
    // Scan all such lines and pick the one where first value equals last value (non-zero)
    const splitTotalPat = /^R\$\s*([\d.,]+)\s+R\$\s*[\d.,]+\s+R\$\s*[\d.,]+\s+R\$\s*([\d.,]+)\s*$/gm;
    let stm;
    let candidateBruta = null;
    while ((stm = splitTotalPat.exec(before)) !== null) {
      const v1 = parseBr(stm[1]);
      const v2 = parseBr(stm[2]);
      if (v1 != null && v1 > 0 && v1 === v2) {
        candidateBruta = v1;
      }
    }
    if (candidateBruta != null) {
      rendaBruta = candidateBruta;
    } else {
      // Fallback: find last standalone "R$ X,XX" line (non-zero) before TOTAIS
      const standaloneRsPat = /^R\$\s*([\d.,]+)\s*$/gm;
      let lastRsM;
      let lastNonZero = null;
      while ((lastRsM = standaloneRsPat.exec(before)) !== null) {
        const v = parseBr(lastRsM[1]);
        if (v != null && v > 0) lastNonZero = v;
      }
      rendaBruta = lastNonZero;
    }
  }

  const pagante = geralVendidos != null ? geralVendidos - naoPagante : null;

  // ── Renda Líquida (any page) ──────────────────────────────────────────────
  // "RENDA LÍQUIDA 683.891,75"
  // "RENDA LÍQUIDA (RECEITA - DESPESA) R$ 1.245.515,49"
  const rendaLiquidaMatch = fullText.match(/RENDA\s+L[IÍ]QUIDA[^0-9\n]*(?:R\$\s*)?([\d.,]+)/i);
  const rendaLiquida = rendaLiquidaMatch ? parseBr(rendaLiquidaMatch[1]) : null;

  // ── Ingressos ─────────────────────────────────────────────────────────────
  const ingressos = Object.entries(catAcc).map(([categoria, { quantidade, arrecadacao }]) => ({
    categoria,
    quantidade,
    valorTotal: arrecadacao > 0 ? arrecadacao : null,
  }));

  return {
    idJogo,
    parsedAt: new Date().toISOString(),
    competicao,
    estadio,
    mandante,
    visitante,
    data,
    hora,
    rodada,
    numJogo,
    publico: {
      geral:      geralVendidos,
      pagante,
      naoPagente: naoPagante > 0 ? naoPagante : null,
    },
    renda: {
      bruta:   rendaBruta,
      liquida: rendaLiquida,
    },
    ingressos,
  };
}

// ─── SÚMULA DE ARBITRAGEM parser ──────────────────────────────────────────────

function parseSumula(pages, idJogo) {
  const page1 = pages[0] ?? '';
  const page2 = pages[1] ?? '';
  const page3 = pages[2] ?? '';

  // ── Header ────────────────────────────────────────────────────────────────
  const campeonatoMatch = page1.match(/Campeonato:\s*(.+?)\s+Rodada:/i);
  const rodadaMatch     = page1.match(/Rodada:\s*(\d+)/i);
  const dataMatch       = page1.match(/Data:\s*(\d{2}\/\d{2}\/\d{4})/i);
  const horaMatch       = page1.match(/Hor[aá]rio:\s*(\d{2}:\d{2})/i);
  const estadioMatch    = page1.match(/Est[aá]dio:\s*([^/\n]+)/i);
  const cidadeMatch     = page1.match(/Est[aá]dio:[^/]+\/\s*([^\n]+)/i);

  const campeonato = campeonatoMatch?.[1]?.trim() ?? '';
  const rodada     = rodadaMatch?.[1]?.trim() ?? '';
  const data       = dataMatch?.[1]?.trim() ?? '';
  const hora       = horaMatch?.[1]?.trim() ?? '';
  const estadio    = estadioMatch?.[1]?.trim() ?? '';
  const cidade     = cidadeMatch?.[1]?.trim() ?? '';

  // ── Teams & score ─────────────────────────────────────────────────────────
  const jogoMatch   = page1.match(/Jogo:\s*(.+?)\s+X\s+(.+?)(?:\n|Data:)/i);
  const resultMatch = page1.match(/Resultado\s+Final:\s*(\d+)\s+X\s+(\d+)/i);

  const homeNome = jogoMatch?.[1]?.trim() ?? '';
  const awayNome = jogoMatch?.[2]?.trim() ?? '';
  const homeGols = resultMatch ? parseInt(resultMatch[1], 10) : null;
  const awayGols = resultMatch ? parseInt(resultMatch[2], 10) : null;

  // ── Referees ──────────────────────────────────────────────────────────────
  const arbitros = [];
  const refPattern = /^(Arbitro(?:\s+Assistente\s+\d+)?|Quarto\s+Arbitro|VAR\d*|AVAR\d*|Inspetor|Assessor|Observador[^:]*|Cronometrista|Quality\s+manager):\s*(.+?)(?:\s*\(([^)]+)\))?$/gmi;
  let rm;
  while ((rm = refPattern.exec(page1)) !== null) {
    const funcao = rm[1].trim();
    const nome   = rm[2].trim();
    const raw    = rm[3] ?? '';
    const parts  = raw.split('/').map(s => s.trim()).filter(Boolean);
    const uf     = parts[parts.length - 1] ?? '';
    arbitros.push({ funcao, nome, uf });
  }

  // ── Players ───────────────────────────────────────────────────────────────
  const sectionStart = page1.search(/Rela[çc][aã]o\s+de\s+Jogadores/i);
  const mandantePlayers = [], visitantePlayers = [];

  if (sectionStart !== -1) {
    const section = page1.slice(sectionStart);
    const homeEsc = homeNome.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const awayEsc = awayNome.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const homeIdx = section.search(new RegExp(homeEsc, 'i'));
    const awayIdx = section.search(new RegExp(awayEsc, 'i'));

    const homeBlock = homeIdx !== -1 && awayIdx !== -1
      ? (homeIdx < awayIdx ? section.slice(homeIdx, awayIdx) : section.slice(awayIdx + awayNome.length))
      : homeIdx !== -1 ? section.slice(homeIdx) : '';
    const awayBlock = awayIdx !== -1
      ? section.slice(awayIdx)
      : '';

    const parsePlayerBlock = (block) => {
      const players = [];
      const rowPat = /^\s*(\d{1,2})\s+(\S+(?:\s+\S+)?)\s+.+?\s+(T(?:\(g\))?|R(?:\(g\))?)\s+[PA]/gm;
      let pm;
      while ((pm = rowPat.exec(block)) !== null) {
        players.push({
          numero:   parseInt(pm[1], 10),
          apelido:  pm[2].trim(),
          titular:  pm[3].startsWith('T'),
          goleiro:  pm[3].includes('(g)'),
        });
      }
      return players;
    };

    mandantePlayers.push(...parsePlayerBlock(homeBlock));
    visitantePlayers.push(...parsePlayerBlock(awayBlock));
  }

  // ── Goals ─────────────────────────────────────────────────────────────────
  const gols = [];
  const goalSection = page2.search(/^Gols?\b/im);
  if (goalSection !== -1) {
    const goalText = page2.slice(goalSection);
    const goalPat = /^(\d{1,3}:\d{2})\s+(1T|2T|PE|AC)\s+\d+\s+(NR|PN|CT|FT)\s+(.+?)\s+([\w\s\/]+(?:SA|MG|SP|RJ|RS|PR|BA|CE|GO|PE|SC|MT|MS|AM|PA|RN|PI|MA|AL|SE|RO|AC|AP|TO|DF|PB|ES|RR)(?:[-\/][A-Z]{2})?)$/gm;
    let gm;
    while ((gm = goalPat.exec(goalText)) !== null) {
      const minuto = gm[1].split(':')[0];
      const periodo = gm[2];
      const codeTipo = gm[3];
      const jogador  = gm[4].trim();
      const equipe   = gm[5].trim();
      const tipo = codeTipo === 'PN' ? 'penalti' : codeTipo === 'CT' ? 'contra' : 'normal';
      const time = normalizeTeam(equipe).startsWith(normalizeTeam(homeNome).slice(0, 10)) ? 'mandante' : 'visitante';
      gols.push({ minuto, periodo, tipo, jogador, equipe, time });
    }
  }

  // ── Cards ─────────────────────────────────────────────────────────────────
  const cartoes = [];
  for (const [header, baseTipo] of [['Cartões Amarelos', 'amarelo'], ['Cartões Vermelhos', 'vermelho']]) {
    const escaped = header.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const start = page2.search(new RegExp(escaped, 'i'));
    if (start === -1) continue;
    const nextSec = page2.slice(start + header.length).search(/Cartões\s+(?:Amarelos|Vermelhos)|Ocorrências|Substituições/i);
    const block = nextSec !== -1
      ? page2.slice(start, start + header.length + nextSec)
      : page2.slice(start);

    const cardPat = /^(?:(\d{1,3}:\d{2})|\+\d+:\d{2}|-)\s+(1T|2T|PE|AC|PJ)\s+(?:\d+|TC)\s+([A-ZÁÉÍÓÚÂÃÊÔÕÇÀ].+?)\s+([\w\s\/]+(?:SA|MG|SP|RJ|RS|PR|BA|CE|GO|PE|SC|MT|MS|AM|PA|RN|PI|MA|AL|SE|RO|AC|AP|TO|DF|PB|ES|RR)(?:[-\/][A-Z]{2})?)$/gm;
    let cm;
    while ((cm = cardPat.exec(block)) !== null) {
      const minutoRaw = cm[1] ?? '90+';
      const minuto  = minutoRaw === '90+' ? '90+' : minutoRaw.split(':')[0];
      const periodo = cm[2];
      const jogador = cm[3].trim();
      const equipe  = cm[4].trim();
      let tipo = baseTipo;
      if (baseTipo === 'vermelho') {
        const nearby = block.slice(Math.max(0, cm.index - 50), cm.index + 200);
        if (/2[oº]\s*Cart[aã]o\s*Amarelo/i.test(nearby)) tipo = 'segundo_amarelo';
      }
      const time = normalizeTeam(equipe).startsWith(normalizeTeam(homeNome).slice(0, 10)) ? 'mandante' : 'visitante';
      cartoes.push({ minuto, periodo, tipo, jogador, equipe, time });
    }
  }

  // ── Substitutions ─────────────────────────────────────────────────────────
  const substituicoesMandante = [], substituicoesVisitante = [];
  const subPat = /^(\d{1,3}:\d{2})\s+(1T|2T|PE)\s+(.+?)\s+(\d{1,3})\s+-\s+(.+?)\s+(\d{1,3})\s+-\s+(.+)$/gm;
  let sm;
  while ((sm = subPat.exec(page3)) !== null) {
    const minuto   = sm[1].split(':')[0];
    const periodo  = sm[2];
    const equipe   = sm[3].trim();
    const entrouNum = parseInt(sm[4], 10);
    const entrouNome = sm[5].trim();
    const saiuNum   = parseInt(sm[6], 10);
    const saiuNome  = sm[7].trim();
    const sub = { minuto, periodo, entrouNum, entrouNome, saiuNum, saiuNome };
    if (normalizeTeam(equipe).startsWith(normalizeTeam(homeNome).slice(0, 10))) {
      substituicoesMandante.push(sub);
    } else {
      substituicoesVisitante.push(sub);
    }
  }

  return {
    idJogo,
    parsedAt: new Date().toISOString(),
    campeonato,
    rodada,
    data,
    hora,
    estadio,
    cidade,
    mandante: {
      nome: homeNome,
      gols: homeGols,
      titulares:    mandantePlayers.filter(p => p.titular),
      reservas:     mandantePlayers.filter(p => !p.titular),
      substituicoes: substituicoesMandante,
    },
    visitante: {
      nome: awayNome,
      gols: awayGols,
      titulares:    visitantePlayers.filter(p => p.titular),
      reservas:     visitantePlayers.filter(p => !p.titular),
      substituicoes: substituicoesVisitante,
    },
    arbitros,
    gols,
    cartoes,
  };
}

function normalizeTeam(s) {
  return s.toLowerCase().replace(/\s*[-\/]\s*[a-z]{2}\s*$/i, '').trim();
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const { extractText } = await import('unpdf');

const dirs = fs.readdirSync(PDF_DIR)
  .filter(d => !ONLY_MATCH || d === ONLY_MATCH)
  .filter(d => fs.statSync(path.join(PDF_DIR, d)).isDirectory());

console.log(`Parsing ${dirs.length} matches...\n`);

let ok = 0, noBoletim = 0, noSumula = 0, errors = 0;

for (const idJogo of dirs) {
  const dir = path.join(PDF_DIR, idJogo);
  const boletimPath  = path.join(dir, `${idJogo}b.pdf`);
  const sumulaPath   = path.join(dir, `${idJogo}se.pdf`);

  let boletim = null, sumula = null;

  // Parse boletim
  if (fs.existsSync(boletimPath)) {
    try {
      const buf = fs.readFileSync(boletimPath);
      const { text: pages } = await extractText(new Uint8Array(buf), { mergePages: false });
      fs.writeFileSync(path.join(dir, 'boletim-raw.txt'), pages.join('\n--- PAGE BREAK ---\n'));
      boletim = parseBoletim(pages, idJogo);
    } catch (e) {
      console.error(`  ${idJogo} boletim ERROR: ${e.message}`);
      errors++;
    }
  } else {
    noBoletim++;
  }

  // Parse súmula
  if (fs.existsSync(sumulaPath)) {
    try {
      const buf = fs.readFileSync(sumulaPath);
      const { text: pages } = await extractText(new Uint8Array(buf), { mergePages: false });
      fs.writeFileSync(path.join(dir, 'sumula-raw.txt'), pages.join('\n--- PAGE BREAK ---\n'));
      sumula = parseSumula(pages, idJogo);
    } catch (e) {
      console.error(`  ${idJogo} sumula ERROR: ${e.message}`);
      errors++;
    }
  } else {
    noSumula++;
  }

  const result = { idJogo, boletim, sumula };
  fs.writeFileSync(path.join(dir, 'result.json'), JSON.stringify(result, null, 2));

  const bStatus = boletim
    ? `geral=${boletim.publico.geral ?? '?'} bruta=${boletim.renda.bruta ?? '?'}`
    : 'sem boletim';
  const sStatus = sumula
    ? `gols=${sumula.gols.length} cartoes=${sumula.cartoes.length} tit=${sumula.mandante.titulares.length + sumula.visitante.titulares.length}`
    : 'sem súmula';

  console.log(`  ${idJogo}: [boletim] ${bStatus}  [sumula] ${sStatus}`);
  ok++;
}

console.log(`
=== Resumo ===
  Processados: ${ok}
  Sem boletim: ${noBoletim}
  Sem súmula:  ${noSumula}
  Erros:       ${errors}
`);
