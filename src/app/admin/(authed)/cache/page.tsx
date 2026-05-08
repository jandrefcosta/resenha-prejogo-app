import { CacheExplorer } from '@/components/admin/CacheExplorer';

export const metadata = {
  title: 'Admin · Cache',
  robots: { index: false, follow: false },
};

export default function AdminCachePage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-2xl font-extrabold tracking-tight">Cache Redis</h1>
      <CacheExplorer />
    </div>
  );
}
