import { DocsReprocessCard } from '@/components/admin/DocsReprocessCard';

export const metadata = {
  title: 'Admin · Documentos',
  robots: { index: false, follow: false },
};

export default function AdminDocsPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-2xl font-extrabold tracking-tight">Documentos</h1>
      <DocsReprocessCard />
    </div>
  );
}
