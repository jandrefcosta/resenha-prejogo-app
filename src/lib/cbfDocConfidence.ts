import type { CbfBoletimData, CbfSumulaData } from '@/lib/cbfDocTypes';

export const CONFIDENCE_THRESHOLD = 0.4;

export function scoreSumula(data: CbfSumulaData): number {
  const checks = [
    data.mandante.titulares.length > 0,
    data.visitante.titulares.length > 0,
    Array.isArray(data.gols),
    Array.isArray(data.cartoes),
    data.arbitros.length > 0,
  ];
  return checks.filter(Boolean).length / checks.length;
}

export function scoreBoletim(data: CbfBoletimData): number {
  const checks = [
    data.publico.geral !== null,
    data.renda.bruta !== null,
    data.ingressos.length > 0,
  ];
  return checks.filter(Boolean).length / checks.length;
}
