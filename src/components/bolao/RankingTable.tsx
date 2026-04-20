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
    return <p className="text-center text-sm text-gray-400 py-6">Nenhum participante ainda.</p>;
  }

  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden">
      {entries.map((entry) => {
        const isMe = entry.userId === myUserId;
        return (
          <div
            key={entry.userId}
            className={`flex items-center justify-between px-4 py-3 border-b border-gray-100 last:border-0 ${
              isMe ? 'bg-blue-50' : ''
            }`}
          >
            <div className="flex items-center gap-3">
              <span className="text-sm font-bold text-gray-400 w-6 text-right">
                {entry.position}
              </span>
              <div>
                <p className="text-sm font-semibold text-gray-900">
                  {entry.displayName}
                  {isMe && <span className="ml-1 text-blue-600 text-xs">(você)</span>}
                </p>
                <p className="text-xs text-gray-400">@{entry.username}</p>
              </div>
            </div>
            <span className="text-sm font-bold text-gray-900">{entry.totalPts} pts</span>
          </div>
        );
      })}
    </div>
  );
}
