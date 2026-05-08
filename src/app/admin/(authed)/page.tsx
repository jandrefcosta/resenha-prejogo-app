import { DashboardCards } from '@/components/admin/DashboardCards';

export const metadata = {
  title: 'Admin · Dashboard',
  robots: { index: false, follow: false },
};

export default function AdminDashboardPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-2xl font-extrabold tracking-tight">Dashboard</h1>
      <DashboardCards />
    </div>
  );
}
