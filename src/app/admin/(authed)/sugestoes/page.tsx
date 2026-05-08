import { SuggestionsList } from '@/components/admin/SuggestionsList';

export const metadata = {
  title: 'Admin · Sugestões',
  robots: { index: false, follow: false },
};

export default function AdminSugestoesPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-2xl font-extrabold tracking-tight">Sugestões</h1>
      <SuggestionsList />
    </div>
  );
}
