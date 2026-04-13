/**
 * CBF PDF downloader and parser.
 *
 * Downloads official CBF match documents from conteudo.cbf.com.br,
 * extracts structured data using unpdf (serverless-safe PDF.js wrapper),
 * and stores the results permanently in Redis.
 *
 * Redis keys:
 *   cbf:match:{idJogo}:docs:status  → CbfDocStatus  (sentinel — 2h TTL if unavailable, permanent if found)
 *   cbf:match:{idJogo}:sumula       → CbfSumulaData  (permanent)
 *   cbf:match:{idJogo}:boletim      → CbfBoletimData (permanent)
 *
 * URL strategy:
 *   1. Read from match.documentos[] (CBF internal API — most reliable when populated)
 *   2. Fallback: HEAD-test constructed URLs {year}/{idJogo}se.pdf / b.pdf / rdj.pdf
 *
 * Processing is lazy/on-demand — called when a user first opens a finished match ficha.
 * Subsequent calls are served from Redis cache (~50ms).
 */

import { getCache, setCache, setCachePermanent } from '@/lib/redisCache';
import type { CbfMatchDetail } from '@/lib/types';
import type {
  CbfBoletimData,
  CbfBoletimTicketCategory,
  CbfDocStatus,
  CbfMatchDocsResult,
  CbfSumulaCard,
  CbfSumulaData,
  CbfSumulaGoal,
  CbfSumulaPlayer,
  CbfSumulaReferee,
  CbfSumulaSubstitution,
  CbfSumulaTeam,
  PdfUrlSet,
} from '@/lib/cbfDocTypes';

// ─── Constants ────────────────────────────────────────────────────────────────

const CONTEUDO_BASE = 'https://conteudo.cbf.com.br/sumulas';

/** TTL when documents haven't been published yet. Re-check after 30 min.
 *  Docs are typically published within an hour of the final whistle;
 *  the previous 2h window blocked escalação from appearing in that window. */
const TTL_NOT_AVAILABLE = 60 * 30;

const PDF_HEADERS = {
  Accept: 'application/pdf,*/*;q=0.8',
  'Accept-Language': 'pt-BR,pt;q=0.9',
  'Cache-Control': 'no-cache',
  Referer: 'https://www.cbf.com.br/',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
};

// ─── Redis key helpers ────────────────────────────────────────────────────────

const statusKey  = (id: string) => `cbf:match:${id}:docs:status`;
const sumulaKey  = (id: string) => `cbf:match:${id}:sumula`;
const boletimKey = (id: string) => `cbf:match:${id}:boletim`;

// ─── URL resolution ───────────────────────────────────────────────────────────

/**
 * Resolve PDF URLs for a match.
 *
 * Primary source: match.documentos[] from the CBF internal API.
 * These entries have `{ url, title }` where url points to conteudo.cbf.com.br.
 *
 * Fallback: Construct candidate URLs from idJogo + year extracted from match.data,
 * then HEAD-test each to confirm they exist before downloading.
 */
export async function resolvePdfUrls(match: CbfMatchDetail): Promise<PdfUrlSet> {
  const urls: PdfUrlSet = {};

  // ── 1. From CBF API documentos field ─────────────────────────────────────
  for (const doc of match.documentos) {
    const title = doc.title.toLowerCase();
    const url = doc.url;
    if (!url || !url.startsWith('http')) continue;

    if (title.includes('súmula') || title.includes('sumula')) {
      urls.sumula = url;
    } else if (title.includes('boletim') || title.includes('financeiro') || title.includes('borderô') || title.includes('bordero')) {
      urls.boletim = url;
    } else if (title.includes('relatório') || title.includes('relatorio')) {
      urls.relatorio = url;
    }
  }

  // ── 2. Fallback: constructed URLs + HEAD-test ─────────────────────────────
  if (!urls.sumula || !urls.boletim) {
    const year = parseYearFromDate(match.data);
    if (year && match.idJogo) {
      const candidates: Array<[keyof PdfUrlSet, string]> = [
        ['sumula',   `${CONTEUDO_BASE}/${year}/${match.idJogo}se.pdf`],
        ['boletim',  `${CONTEUDO_BASE}/${year}/${match.idJogo}b.pdf`],
        ['relatorio',`${CONTEUDO_BASE}/${year}/${match.idJogo}rdj.pdf`],
      ];

      await Promise.all(
        candidates
          .filter(([key]) => !urls[key])
          .map(async ([key, url]) => {
            const exists = await headTest(url);
            if (exists) urls[key] = url;
          }),
      );
    }
  }

  return urls;
}

function parseYearFromDate(data: string): number | null {
  // data is "DD/MM/YYYY"
  const parts = data.split('/');
  const year = parseInt(parts[2] ?? '', 10);
  return isNaN(year) ? null : year;
}

async function headTest(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'HEAD', headers: PDF_HEADERS, cache: 'no-store' });
    return res.ok;
  } catch {
    return false;
  }
}

// ─── PDF Download ─────────────────────────────────────────────────────────────

export async function downloadPdf(url: string): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(url, { headers: PDF_HEADERS, cache: 'no-store' });
    if (!res.ok) return null;
    return await res.arrayBuffer();
  } catch {
    return null;
  }
}

// ─── Number parsing helpers ───────────────────────────────────────────────────

/**
 * Parse Brazilian decimal format: "1.331.907,88" → 1331907.88, "683.891,75" → 683891.75
 */
function parseBrl(raw: string): number | null {
  if (!raw) return null;
  // Remove thousand separators (.), replace decimal comma with dot
  const normalised = raw.trim().replace(/\./g, '').replace(',', '.');
  const n = parseFloat(normalised);
  return isNaN(n) ? null : n;
}

/**
 * Parse Brazilian integer format: "25.770" → 25770
 */
function parseIntBr(raw: string): number | null {
  if (!raw) return null;
  const n = parseInt(raw.replace(/\./g, '').trim(), 10);
  return isNaN(n) ? null : n;
}

// ─── Boletim Financeiro parser ────────────────────────────────────────────────

/**
 * Extract attendance and revenue data from the Boletim Financeiro PDF.
 *
 * Actual CBF boletim layout (observed from production PDFs):
 *
 *   Page 1 — ticket table:
 *     Each row: "LOCATION CADEIRA - ... - INTEIRA/MEIA   disponível   devolvidos   vendidos   preço   arrecadação"
 *     Rows with price 0,00 are complimentary (gratuidades / convênios)
 *     TOTAL row: "TOTAL   {total_disp}   {total_dev}   {total_vendidos}   {total_arrecadacao}"
 *
 *   Page 2 — expenses and net revenue:
 *     "RENDA LÍQUIDA   {value}"
 *
 * Derived values:
 *   - pagante   = TOTAL vendidos minus complimentary sold rows (price == 0)
 *   - renda bruta = TOTAL arrecadação (= sum of all revenue)
 *   - renda líquida = explicitly stated on page 2
 *   - geral     = total vendidos (everyone inside, paying or not)
 */
export async function parseBoletim(
  buffer: ArrayBuffer,
  idJogo: string,
): Promise<CbfBoletimData> {
  const { extractText } = await import('unpdf');
  const { text: pages } = await extractText(new Uint8Array(buffer), { mergePages: false });

  // ── Estádio / data from header (page 1) ──────────────────────────────────
  const page1 = pages[0] ?? '';
  // "ESTÁDIO ARENA MRV - BELO HORIZONTE - MG"
  const estadioMatch = page1.match(/EST[AÁ]DIO\s+(.+?)(?:\n|DATA\b)/i);
  // "DATA 28/01/2026 19:00"
  const dataMatch = page1.match(/DATA\s+(\d{2}\/\d{2}\/\d{4})/i);

  // ── TOTAL row (page 1): "TOTAL  disponiveis  devolvidos  vendidos  arrecadacao" ──
  // The last line before RECEITAS / signature block
  // Format: "TOTAL  25.770  0  25.770  1.331.907,88"
  const totalRowMatch = page1.match(/^TOTAL\s+([\d.]+)\s+\d+\s+([\d.]+)\s+([\d.,]+)/m);
  const geralVendidos     = totalRowMatch ? parseIntBr(totalRowMatch[2]) : null;
  const rendaBruta        = totalRowMatch ? parseBrl(totalRowMatch[3])   : null;

  // ── Complimentary rows (price = 0,00) → non-paying public ────────────────
  // Rows like: "DESCRIPTION  qty  0  qty  0,00  0,00"
  let naoPagante = 0;
  // Find rows whose price column (4th number after qty) is 0,00
  const ticketRowPattern = /^.+?\s+([\d.]+)\s+\d+\s+([\d.]+)\s+([\d.,]+)\s+([\d.,]+)$/gm;
  let m: RegExpExecArray | null;
  while ((m = ticketRowPattern.exec(page1)) !== null) {
    const preco  = parseBrl(m[3]);
    const vendidos = parseIntBr(m[2]);
    if (preco === 0 && vendidos != null && vendidos > 0) {
      naoPagante += vendidos;
    }
  }

  const pagante = geralVendidos != null ? geralVendidos - naoPagante : null;

  // ── Renda Líquida (page 2) ────────────────────────────────────────────────
  const page2 = pages[1] ?? '';
  // "RENDA LÍQUIDA 683.891,75"
  const rendaLiquidaMatch = page2.match(/RENDA\s+L[IÍ]QUIDA\s+([\d.,]+)/i);
  const rendaLiquida = rendaLiquidaMatch ? parseBrl(rendaLiquidaMatch[1]) : null;

  // ── Ticket breakdown (simple aggregation by INTEIRA / MEIA / GRATUIDADE) ─
  const ingressos = parseTicketCategories(page1);

  return {
    idJogo,
    parsedAt: new Date().toISOString(),
    estadio: estadioMatch?.[1]?.trim() ?? '',
    data: dataMatch?.[1]?.trim() ?? '',
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

/**
 * Aggregate ticket categories from the boletim INGRESSOS table.
 * Rows: "LOCATION - CATEGORY - INTEIRA/MEIA  disponível  devolvidos  vendidos  preço  arrecadação"
 * We  aggregate by "INTEIRA" / "MEIA" / "GRATUIDADE".
 */
function parseTicketCategories(page1Text: string): CbfBoletimTicketCategory[] {
  const acc: Record<string, { quantidade: number; arrecadacao: number }> = {};

  const rowPattern = /^(.+?)\s+([\d.]+)\s+\d+\s+([\d.]+)\s+([\d.,]+)\s+([\d.,]+)$/gm;
  let m: RegExpExecArray | null;
  while ((m = rowPattern.exec(page1Text)) !== null) {
    const desc = m[1].toUpperCase();
    const vendidos = parseIntBr(m[3]) ?? 0;
    const arrecadacao = parseBrl(m[5]) ?? 0;

    let categoria: string;
    if (desc.includes('GRATUIDADE') || desc.includes('CONV') || desc.includes('SERVICO') || desc.includes('SERVIÇO')) {
      categoria = 'Gratuidade';
    } else if (desc.includes('MEIA')) {
      categoria = 'Meia Entrada';
    } else if (desc.includes('INTEIRA')) {
      categoria = 'Inteira';
    } else {
      continue;
    }

    if (!acc[categoria]) acc[categoria] = { quantidade: 0, arrecadacao: 0 };
    acc[categoria].quantidade  += vendidos;
    acc[categoria].arrecadacao += arrecadacao;
  }

  return Object.entries(acc).map(([categoria, { quantidade, arrecadacao }]) => ({
    categoria,
    quantidade,
    valorUnitario: null, // mixed prices per row
    valorTotal: arrecadacao > 0 ? arrecadacao : null,
  }));
}

// ─── Súmula de Arbitragem parser ──────────────────────────────────────────────

/**
 * Extract match events from the Súmula de Arbitragem PDF.
 *
 * Actual CBF súmula layout (observed from production PDFs):
 *
 *   Page 1 — header + player list:
 *     "Jogo: {N}  CBF - CONFEDERAÇÃO BRASILEIRA DE FUTEBOL"
 *     "Campeonato: {name}  Rodada: {N}"
 *     "Jogo: {HomeTeam} X {AwayTeam}"
 *     "Data: DD/MM/YYYY  Horário: HH:MM  Estádio: NAME / City"
 *     Arbitragem section:
 *       "Arbitro: Name (CATEGORY / UF)"
 *       "Arbitro Assistente 1: Name (...)"
 *       ...
 *     "Relação de Jogadores"
 *     {HomeTeamName}
 *     "Nº  Apelido  Nome Completo  T/R  P/A  CBF"
 *     "22  Everson   Everson Felipe Marqu ...  T(g)  P  188398"
 *     ...  (T = titular, R = reserva)
 *     {AwayTeamName}
 *     ...
 *
 *   Page 2 — goals and cards:
 *     "Gols" section table:
 *       "mm:ss  1T/2T  Nº  Type  Nome do Jogador  Equipe"
 *     "Cartões Amarelos" table
 *     "Cartões Vermelhos" table
 *
 *   Page 3 — substitutions:
 *     "Substituições"
 *     "Tempo  1T/2T  Equipe  Entrou  Saiu"
 *       "15:00  2T  Team  28 - Name  92 - Name"
 */
export async function parseSumula(
  buffer: ArrayBuffer,
  idJogo: string,
): Promise<CbfSumulaData> {
  const { extractText } = await import('unpdf');
  const { text: pages } = await extractText(new Uint8Array(buffer), { mergePages: false });
  const page1 = pages[0] ?? '';
  const page2 = pages[1] ?? '';
  const page3 = pages[2] ?? '';
  const fullText = pages.join('\n');

  // ── Header ────────────────────────────────────────────────────────────────
  // "Campeonato: Campeonato Brasileiro - Série A/2026  Rodada: 1"
  const campeonatoMatch = page1.match(/Campeonato:\s*(.+?)\s+Rodada:/i);
  const rodadaMatch     = page1.match(/Rodada:\s*(\d+)/i);
  // "Data: 28/01/2026  Horário: 19:00  Estádio: ARENA MRV / Belo Horizonte"
  const dataMatch       = page1.match(/Data:\s*(\d{2}\/\d{2}\/\d{4})/i);
  const horaMatch       = page1.match(/Hor[aá]rio:\s*(\d{2}:\d{2})/i);
  const estadioMatch    = page1.match(/Est[aá]dio:\s*([^/\n]+)/i);
  const cidadeMatch     = page1.match(/Est[aá]dio:[^/]+\/\s*([^\n]+)/i);

  // ── Referees ─────────────────────────────────────────────────────────────
  const arbitros = parseReferees(page1);

  // ── Teams + players ───────────────────────────────────────────────────────
  // "Jogo: HomeTeam X AwayTeam"
  const jogoMatch = page1.match(/Jogo:\s*(.+?)\s+X\s+(.+?)(?:\n|Data:)/i);
  const homeNome  = jogoMatch?.[1]?.trim() ?? '';
  const awayNome  = jogoMatch?.[2]?.trim() ?? '';

  // Score from result line: "Resultado Final: 2 X 2"
  const resultMatch   = page1.match(/Resultado\s+Final:\s*(\d+)\s+X\s+(\d+)/i);
  const homeGols = resultMatch ? parseInt(resultMatch[1], 10) : 0;
  const awayGols = resultMatch ? parseInt(resultMatch[2], 10) : 0;

  // "Relação de Jogadores" section: each team block starts with the team name
  // followed by header row "Nº Apelido Nome Completo T/R P/A CBF"
  // then player rows until the next team block or end of section
  const { mandantePlayers, visitantePlayers } = parsePlayerList(page1, homeNome, awayNome);

  // ── Substitutions (page 3) ────────────────────────────────────────────────
  const allSubs = parseSubstitutions(page3, homeNome, awayNome);

  const mandante: CbfSumulaTeam = {
    nome: homeNome,
    gols: homeGols,
    titulares:    mandantePlayers.filter((p) => p.titular),
    reservas:     mandantePlayers.filter((p) => !p.titular),
    substituicoes: allSubs.filter((s) => s._team === 'mandante').map(({ _team: _, ...s }) => s),
  };

  const visitante: CbfSumulaTeam = {
    nome: awayNome,
    gols: awayGols,
    titulares:    visitantePlayers.filter((p) => p.titular),
    reservas:     visitantePlayers.filter((p) => !p.titular),
    substituicoes: allSubs.filter((s) => s._team === 'visitante').map(({ _team: _, ...s }) => s),
  };

  // ── Goals (page 2) ────────────────────────────────────────────────────────
  const gols = parseGoals(page2, homeNome, awayNome);

  // ── Cards (page 2) ────────────────────────────────────────────────────────
  const cartoes = parseCards(page2, homeNome, awayNome);

  return {
    idJogo,
    parsedAt: new Date().toISOString(),
    campeonato: campeonatoMatch?.[1]?.trim() ?? '',
    rodada:     rodadaMatch?.[1] ?? '',
    data:       dataMatch?.[1]?.trim() ?? '',
    hora:       horaMatch?.[1]?.trim() ?? '',
    estadio:    estadioMatch?.[1]?.trim() ?? '',
    cidade:     cidadeMatch?.[1]?.trim() ?? '',
    mandante,
    visitante,
    arbitros,
    gols,
    cartoes,
  };
}

function parseReferees(page1: string): CbfSumulaReferee[] {
  const refs: CbfSumulaReferee[] = [];

  // Format: "Arbitro: Bruno Arleu de Araujo (FIFA / RJ)"
  //         "Arbitro Assistente 1: Name (CAT / UF)"
  //         "Quarto Arbitro: ..."  "VAR: ..."  "AVAR: ..."
  const refPattern = /^(Arbitro(?:\s+Assistente\s+\d)?|Quarto\s+Arbitro|VAR\d?|AVAR\d?|Inspetor|Assessor|Observador[^:]*|Cronometrista):\s*(.+?)(?:\s*\(([^)]+)\))?$/gmi;

  let m: RegExpExecArray | null;
  while ((m = refPattern.exec(page1)) !== null) {
    const funcao = m[1].trim();
    const nome   = m[2].trim();
    // "(FIFA / RJ)" → uf = "RJ"
    const uf     = m[3]?.split('/').pop()?.trim() ?? '';
    refs.push({ funcao, nome, uf });
  }
  return refs;
}

interface PlayerWithRole extends CbfSumulaPlayer {
  titular: boolean;
}

/**
 * Parse the "Relação de Jogadores" section on page 1.
 *
 * Format after the header row:
 *   "22  Everson  Everson Felipe Marqu ...  T(g)  P  188398"
 * T = Titular, R = Reserva. The apelido is the short name (column 2).
 * Full name may be truncated with "...".
 */
function parsePlayerList(
  page1: string,
  homeNome: string,
  awayNome: string,
): { mandantePlayers: PlayerWithRole[]; visitantePlayers: PlayerWithRole[] } {
  // Find the section after "Relação de Jogadores"
  const sectionStart = page1.search(/Rela[çc][aã]o\s+de\s+Jogadores/i);
  if (sectionStart === -1) return { mandantePlayers: [], visitantePlayers: [] };

  const section = page1.slice(sectionStart);

  // Split into team blocks: look for the team names as section headers
  // The section header is the team name on its own line after "Relação de Jogadores"
  // or after the previous team block ends
  const homeEscaped = homeNome.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const awayEscaped = awayNome.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const homeIdx = section.search(new RegExp(homeEscaped, 'i'));
  const awayIdx = section.search(new RegExp(awayEscaped, 'i'));

  let homeBlock = '';
  let awayBlock = '';

  if (homeIdx !== -1 && awayIdx !== -1) {
    if (homeIdx < awayIdx) {
      homeBlock = section.slice(homeIdx, awayIdx);
      awayBlock = section.slice(awayIdx);
    } else {
      awayBlock = section.slice(awayIdx, homeIdx);
      homeBlock = section.slice(homeIdx);
    }
  } else if (homeIdx !== -1) {
    homeBlock = section.slice(homeIdx);
  } else if (awayIdx !== -1) {
    awayBlock = section.slice(awayIdx);
  }

  return {
    mandantePlayers: extractPlayers(homeBlock),
    visitantePlayers: extractPlayers(awayBlock),
  };
}

/**
 * Extract players from a team block.
 * Row format: "Nº  Apelido  Nome Completo  T/R  P/A  CBF"
 *   "22  Everson  Everson Felipe Marqu ...  T(g)  P  188398"
 * The T/R column marks titular (T) or reserva (R), optionally with "(g)" for goalkeeper.
 */
function extractPlayers(block: string): PlayerWithRole[] {
  const players: PlayerWithRole[] = [];
  // Match: number(1-2 digits)  apelido(non-space word(s))  ... T or R marker
  // Row ends at line break. T/R is followed by P/A and CBF number.
  const rowPattern = /^\s*(\d{1,2})\s+(\S+(?:\s+\S+)?)\s+.+?\s+(T(?:\(g\))?|R(?:\(g\))?)\s+[PA]/gm;
  let m: RegExpExecArray | null;
  while ((m = rowPattern.exec(block)) !== null) {
    const numero  = parseInt(m[1], 10);
    const apelido = m[2].trim();
    const titular = m[3].startsWith('T');
    players.push({ numero, nome: apelido, apelido, titular });
  }
  return players;
}

interface SubWithTeam extends CbfSumulaSubstitution {
  _team: 'mandante' | 'visitante';
}

/**
 * Parse the Substituições table on page 3.
 *
 * Format:
 *   "Substituições"
 *   "Tempo  1T/2T  Equipe  Entrou  Saiu"
 *   "15:00  2T  Atlético Mineiro Saf/MG  28 - Tomas Esteban Cuello  92 - Eduardo Pereira Rodrigues"
 *
 * Note: Entrou comes before Saiu in the table (confirmed from actual PDF).
 */
function parseSubstitutions(page3: string, homeNome: string, awayNome: string): SubWithTeam[] {
  const subs: SubWithTeam[] = [];

  // Find the "Substituições" section
  const subStart = page3.search(/Substitui[çc][oõ]es/i);
  if (subStart === -1) return subs;

  const subSection = page3.slice(subStart);

  // Row: "mm:ss  periodo  teamName  entrouNum - entrouName  saiuNum - saiuName"
  // The minute column uses "mm:ss" format; period 1T or 2T; rest is text
  const rowPattern = /^(\d{1,3}:\d{2})\s+(1T|2T|PE)\s+(.+?)\s+(\d{1,3})\s+-\s+(.+?)\s+(\d{1,3})\s+-\s+(.+)$/gm;
  let m: RegExpExecArray | null;
  while ((m = rowPattern.exec(subSection)) !== null) {
    const minutos   = m[1].split(':')[0]; // "15:00" → "15"
    const periodo   = m[2];
    const teamName  = m[3].trim();
    const entrouNum = parseInt(m[4], 10);
    const saiuNum   = parseInt(m[6], 10);

    const _team: 'mandante' | 'visitante' = isTeamMatch(teamName, homeNome) ? 'mandante' : 'visitante';

    subs.push({ saiuNumero: saiuNum, entrouNumero: entrouNum, minuto: minutos, periodo, _team });
  }

  return subs;
}

function isTeamMatch(teamName: string, expected: string): boolean {
  // Normalize: remove state suffix " - XX" or "/XX" and compare
  const normalize = (s: string) =>
    s.toLowerCase().replace(/\s*[-/]\s*[a-z]{2}\s*$/i, '').trim();
  return normalize(teamName).startsWith(normalize(expected).slice(0, 10));
}

/**
 * Parse the Gols table on page 2.
 * Format: "26:00  1T  42  NR  Jose Manuel Alberto Lopez  Palmeiras/SP"
 * Types: NR = Normal, PN = Penalti, CT = Contra, FT = Falta
 */
function parseGoals(page2: string, homeNome: string, awayNome: string): CbfSumulaGoal[] {
  const goals: CbfSumulaGoal[] = [];

  const golsStart = page2.search(/^Gols$/im);
  if (golsStart === -1) return goals;

  const section = page2.slice(golsStart);

  // Row: "mm:ss  1T/2T  Nº  TYPE  Nome do Jogador  Equipe"
  const rowPattern = /^(\d{1,3}:\d{2})\s+(1T|2T|PE|AC)\s+\d+\s+(NR|PN|CT|FT)\s+(.+?)\s+([\w\s/]+(?:SA|MG|SP|RJ|RS|PR|BA|CE|GO|PE|SC|MT|MS|AM|PA|RN|PI|MA|AL|SE|RO|AC|AP|TO|DF|PB|ES|RR)(?:[-/][A-Z]{2})?)$/gm;
  let m: RegExpExecArray | null;
  while ((m = rowPattern.exec(section)) !== null) {
    const minuto  = m[1].split(':')[0];
    const periodo = m[2];
    const tipo_raw = m[3];
    const jogador = m[4].trim();
    const equipe  = m[5].trim();

    const tipo = tipo_raw === 'PN' ? 'penalti' : tipo_raw === 'CT' ? 'contra' : 'normal';
    const time: 'mandante' | 'visitante' = isTeamMatch(equipe, homeNome) ? 'mandante' : 'visitante';

    goals.push({ jogador, minuto, periodo, tipo, time });
  }

  return goals;
}

/**
 * Parse Cartões sections on page 2.
 * Format: "01:00  2T  21  Alan Steven Franco Palma  Atlético Mineiro Saf/MG"
 * Section headers: "Cartões Amarelos", "Cartões Vermelhos"
 */
function parseCards(page2: string, homeNome: string, awayNome: string): CbfSumulaCard[] {
  const cards: CbfSumulaCard[] = [];

  const sections: Array<[string, CbfSumulaCard['tipo']]> = [
    ['Cartões Amarelos',  'amarelo'],
    ['Cartões Vermelhos', 'vermelho'],
  ];

  for (const [header, tipo] of sections) {
    const escaped = header.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const sectionStart = page2.search(new RegExp(escaped, 'i'));
    if (sectionStart === -1) continue;

    // Find next section boundary
    const nextSection = page2.slice(sectionStart + header.length).search(
      /Cartões\s+(?:Amarelos|Vermelhos)|Ocorrências|Substituições/i,
    );
    const sectionText = nextSection !== -1
      ? page2.slice(sectionStart, sectionStart + header.length + nextSection)
      : page2.slice(sectionStart);

    // Row: "mm:ss  1T/2T  Nº  Name  Team"  (followed by Motivo line)
    // Also: "-  PJ  Nº  Name  Team" for post-match cards
    const rowPattern = /^(?:(\d{1,3}:\d{2})|\+\d+:\d{2}|-)\s+(1T|2T|PE|AC|PJ)\s+(?:\d+|TC)\s+([A-ZÁÉÍÓÚÂÃÊÔÕÇÀ].+?)\s+([\w\s/]+(?:SA|MG|SP|RJ|RS|PR|BA|CE|GO|PE|SC|MT|MS|AM|PA|RN|PI|MA|AL|SE|RO|AC|AP|TO|DF|PB|ES|RR))$/gm;

    let m: RegExpExecArray | null;
    while ((m = rowPattern.exec(sectionText)) !== null) {
      const minuto  = (m[1] ?? '').split(':')[0] || '90+';
      const periodo = m[2];
      const jogador = m[3].trim();
      const equipe  = m[4].trim();
      const time: 'mandante' | 'visitante' = isTeamMatch(equipe, homeNome) ? 'mandante' : 'visitante';

      // Check if this is a second yellow (red from double yellow) — scan for "2º Cartão Amarelo" near this match
      let finalTipo: CbfSumulaCard['tipo'] = tipo;
      if (tipo === 'vermelho') {
        const nearbyText = sectionText.slice(Math.max(0, m.index - 50), m.index + 200);
        if (/2[oº]\s*Cart[aã]o\s*Amarelo/i.test(nearbyText)) {
          finalTipo = 'segundo_amarelo';
        }
      }

      cards.push({ jogador, minuto, periodo, tipo: finalTipo, time });
    }
  }

  return cards;
}

// ─── Orchestration ────────────────────────────────────────────────────────────

/**
 * Full pipeline: resolve URLs → download → parse → cache → return.
 *
 * Called by the API route on a cache miss.
 * On success, stores results permanently in Redis.
 * On "not yet published", stores sentinel with 2h TTL.
 */
export async function processMatchDocuments(
  match: CbfMatchDetail,
): Promise<CbfMatchDocsResult> {
  const { idJogo } = match;

  // ── Check sentinel cache ─────────────────────────────────────────────────
  const statusCached = await getCache<CbfDocStatus>(statusKey(idJogo));
  if (statusCached) {
    if (!statusCached.available) {
      // Sentinel says not published — return early if checked recently
      const ageMs = Date.now() - new Date(statusCached.checkedAt).getTime();
      if (ageMs < TTL_NOT_AVAILABLE * 1000) {
        return { available: false };
      }
    } else {
      // Documents were found before — check if parsed data is cached
      const [sumula, boletim] = await Promise.all([
        getCache<CbfSumulaData>(sumulaKey(idJogo)),
        getCache<CbfBoletimData>(boletimKey(idJogo)),
      ]);
      if (sumula || boletim) {
        return { available: true, sumula: sumula ?? undefined, boletim: boletim ?? undefined };
      }
    }
  }

  // ── Resolve PDF URLs ─────────────────────────────────────────────────────
  const urls = await resolvePdfUrls(match);

  if (!urls.sumula && !urls.boletim) {
    // Documents not published yet
    const sentinel: CbfDocStatus = { available: false, checkedAt: new Date().toISOString(), urls: {} };
    void setCache(statusKey(idJogo), sentinel, TTL_NOT_AVAILABLE);
    return { available: false };
  }

  // ── Download and parse (parallel) ───────────────────────────────────────
  const [sumulaResult, boletimResult] = await Promise.all([
    urls.sumula
      ? downloadPdf(urls.sumula).then((buf) => buf ? parseSumula(buf, idJogo) : null)
      : Promise.resolve(null),
    urls.boletim
      ? downloadPdf(urls.boletim).then((buf) => buf ? parseBoletim(buf, idJogo) : null)
      : Promise.resolve(null),
  ]);

  // ── Store results permanently ────────────────────────────────────────────
  const sentinel: CbfDocStatus = {
    available: true,
    checkedAt: new Date().toISOString(),
    urls,
  };
  const writes: Promise<void>[] = [setCachePermanent(statusKey(idJogo), sentinel)];
  if (sumulaResult)  writes.push(setCachePermanent(sumulaKey(idJogo),  sumulaResult));
  if (boletimResult) writes.push(setCachePermanent(boletimKey(idJogo), boletimResult));
  await Promise.all(writes);

  return {
    available: true,
    sumula:  sumulaResult  ?? undefined,
    boletim: boletimResult ?? undefined,
  };
}
