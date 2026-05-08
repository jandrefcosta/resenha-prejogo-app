import { AdminNav } from '@/components/admin/AdminNav';

export default function AuthedAdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto w-full max-w-2xl px-4 py-6">
        <AdminNav />
        {children}
      </div>
    </div>
  );
}
