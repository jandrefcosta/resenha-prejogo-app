import { AdminLoginForm } from '@/components/admin/AdminLoginForm';

export const metadata = {
  title: 'Admin · Login',
  robots: { index: false, follow: false },
};

export default function AdminLoginPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center px-4 py-6">
        <h1 className="font-display mb-1 text-3xl font-extrabold tracking-tight">Admin</h1>
        <p className="mb-6 text-sm text-zinc-400 font-sans">Acesso restrito</p>
        <AdminLoginForm />
      </div>
    </div>
  );
}
