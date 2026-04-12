/**
 * Types for CBF official document data extracted from PDFs.
 *
 * These types represent the structured output of parsing the official PDFs
 * published at conteudo.cbf.com.br after each match:
 *   - Súmula de Arbitragem (se.pdf)  — match events, lineups, referees
 *   - Boletim Financeiro / Borderô (b.pdf) — attendance, revenue
 *   - Relatório de Jogo (rdj.pdf) — administrative report (future)
 */

// ─── URL resolution ───────────────────────────────────────────────────────────

export interface PdfUrlSet {
  sumula?: string;
  boletim?: string;
  relatorio?: string;
}

// ─── Processing status sentinel ───────────────────────────────────────────────

/**
 * Stored in Redis at `cbf:match:{idJogo}:docs:status`.
 * Prevents repeated download attempts when documents aren't published yet.
 */
export interface CbfDocStatus {
  available: boolean;
  checkedAt: string; // ISO timestamp
  urls: PdfUrlSet;
}

// ─── Súmula de Arbitragem (se.pdf) ───────────────────────────────────────────

export interface CbfSumulaPlayer {
  numero: number;
  nome: string;
  apelido: string;
}

export interface CbfSumulaSubstitution {
  /** Shirt number of outgoing player */
  saiuNumero: number;
  /** Shirt number of incoming player */
  entrouNumero: number;
  /** "67", "45+2", etc. */
  minuto: string;
  /** "1T" | "2T" | "PE" (prorrogação) */
  periodo: string;
}

export interface CbfSumulaGoal {
  /** Shirt number or player name */
  jogador: string;
  minuto: string;
  periodo: string;
  /** "normal" | "penalti" | "contra" */
  tipo: string;
  /** "mandante" | "visitante" */
  time: 'mandante' | 'visitante';
}

export interface CbfSumulaCard {
  jogador: string;
  minuto: string;
  periodo: string;
  /** "amarelo" | "vermelho" | "segundo_amarelo" */
  tipo: 'amarelo' | 'vermelho' | 'segundo_amarelo';
  /** "mandante" | "visitante" */
  time: 'mandante' | 'visitante';
}

export interface CbfSumulaReferee {
  funcao: string;
  nome: string;
  uf: string;
}

export interface CbfSumulaTeam {
  nome: string;
  gols: number;
  titulares: CbfSumulaPlayer[];
  reservas: CbfSumulaPlayer[];
  substituicoes: CbfSumulaSubstitution[];
}

export interface CbfSumulaData {
  idJogo: string;
  parsedAt: string;
  campeonato: string;
  rodada: string;
  data: string;
  hora: string;
  estadio: string;
  cidade: string;
  /** Attendance from súmula — may be absent; authoritative value is in boletim */
  publico?: number;
  mandante: CbfSumulaTeam;
  visitante: CbfSumulaTeam;
  arbitros: CbfSumulaReferee[];
  gols: CbfSumulaGoal[];
  cartoes: CbfSumulaCard[];
}

// ─── Boletim Financeiro / Borderô (b.pdf) ────────────────────────────────────

export interface CbfBoletimTicketCategory {
  /** e.g. "Inteira", "Meia Entrada", "Gratuidade" */
  categoria: string;
  quantidade: number;
  /** Unit price in BRL */
  valorUnitario: number | null;
  /** Total value in BRL */
  valorTotal: number | null;
}

export interface CbfBoletimData {
  idJogo: string;
  parsedAt: string;
  estadio: string;
  data: string;
  publico: {
    /** Total people in the stadium */
    geral: number | null;
    /** Paying public */
    pagante: number | null;
    /** Non-paying (complimentary, press, etc.) */
    naoPagente: number | null;
  };
  renda: {
    /** Gross revenue in BRL */
    bruta: number | null;
    /** Net revenue in BRL */
    liquida: number | null;
  };
  /** Individual ticket categories — may be empty if not parseable */
  ingressos: CbfBoletimTicketCategory[];
}

// ─── Aggregate result ─────────────────────────────────────────────────────────

export interface CbfMatchDocsResult {
  /** Whether any documents were found and parsed */
  available: boolean;
  sumula?: CbfSumulaData;
  boletim?: CbfBoletimData;
}
