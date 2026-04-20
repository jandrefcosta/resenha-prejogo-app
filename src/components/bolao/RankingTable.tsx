'use client';

export interface RankingEntry {
  userId: string;
  username: string;
  displayName: string;
  totalPts: number;
  position: number;
}

interface Props {
  entries: RankingEntry[];
  myUserId?: string;
}

export function RankingTable({ entries, myUserId }: Props) {
  if (entries.length === 0) {
    return <p className="text-center text-sm text-zinc-500 py-6">Nenhum participante ainda.</p>;
  }

  return (
    <div className="rounded-xl border border-zinc-800 overflow-hidden">
      {entries.map((entry) => {
        const isMe = entry.userId === myUserId;
        return (
          <div
            key={entry.userId}
            className={`flex items-center justify-between px-4 py-3 border-b border-zinc-800 last:border-0 ${
              isMe ? 'bg-blue-950/40' : ''
            }`}
          >
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <span className="text-sm font-bold text-zinc-500 w-6 shrink-0 text-right">
                {entry.position}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-zinc-100 truncate">
                  {entry.displayName}
                  {isMe && <span className="ml-1 text-blue-400 text-xs">(você)</span>}
                </p>
                <p className="text-xs text-zinc-500 truncate">@{entry.username}</p>
              </div>
            </div>
            <span className="shrink-0 text-sm font-bold text-zinc-100">{entry.totalPts} pts</span>
          </div>
        );
      })}
    </div>
  );
}
