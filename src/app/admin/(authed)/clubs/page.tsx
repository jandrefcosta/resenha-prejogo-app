import { ClubsTable } from '@/components/admin/ClubsTable';

export const metadata = {
  title: 'Admin · Clubes',
  robots: { index: false, follow: false },
};

export default function AdminClubsPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-2xl font-extrabold tracking-tight">Clubes</h1>
      <ClubsTable />
    </div>
  );
}
