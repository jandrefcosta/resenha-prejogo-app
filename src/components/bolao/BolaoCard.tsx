'use client';
import Link from 'next/link';

interface Props {
  id: string;
  nome: string;
  codigo: string;
  memberCount: number;
  position: number | null;
  totalPts: number;
}

export function BolaoCard({ id, nome, codigo, memberCount, position, totalPts }: Props) {
  return (
    <Link
      href={`/bolao/${id}`}
      className="flex items-center justify-between gap-3 p-4 rounded-xl border border-zinc-800 hover:border-zinc-600 hover:bg-zinc-800/50 transition-colors"
    >
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-zinc-100 truncate">{nome}</p>
        <p className="text-xs text-zinc-500 mt-0.5 truncate">
          Código: <span className="font-mono font-bold text-zinc-300">{codigo}</span> · {memberCount} participante
          {memberCount !== 1 ? 's' : ''}
        </p>
      </div>
      <div className="shrink-0 text-right">
        {position !== null ? (
          <>
            <p className="text-sm font-bold text-zinc-100">{totalPts} pts</p>
            <p className="text-xs text-zinc-500">{position}º lugar</p>
          </>
        ) : (
          <p className="text-xs text-zinc-500">Sem palpites</p>
        )}
      </div>
    </Link>
  );
}
