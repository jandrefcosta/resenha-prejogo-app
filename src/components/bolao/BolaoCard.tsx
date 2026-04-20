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
      className="flex items-center justify-between p-4 rounded-xl border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-colors"
    >
      <div>
        <p className="font-semibold text-gray-900">{nome}</p>
        <p className="text-xs text-gray-400 mt-0.5">
          Código: <span className="font-mono font-bold">{codigo}</span> · {memberCount} participante
          {memberCount !== 1 ? 's' : ''}
        </p>
      </div>
      <div className="text-right">
        {position !== null ? (
          <>
            <p className="text-sm font-bold text-gray-900">{totalPts} pts</p>
            <p className="text-xs text-gray-400">{position}º lugar</p>
          </>
        ) : (
          <p className="text-xs text-gray-400">Sem palpites</p>
        )}
      </div>
    </Link>
  );
}
