'use client';
import { ShareIcon } from '@heroicons/react/20/solid';

interface Props {
  nome: string;
  codigo: string;
  id: string;
}

export function ShareBolaoButton({ nome, codigo, id }: Props) {
  async function handleShare() {
    const url = `${window.location.origin}/bolao/${id}`;
    const text = `Participe do meu bolão da Copa 2026: "${nome}"\nCódigo: ${codigo}\n${url}`;
    if (navigator.share) {
      await navigator.share({ title: nome, text, url });
    } else {
      await navigator.clipboard.writeText(text);
      alert('Link copiado!');
    }
  }

  return (
    <button
      onClick={handleShare}
      className="px-4 py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium rounded-xl text-sm transition-colors"
    >
      <span className="flex items-center gap-1.5">
        <ShareIcon className="h-4 w-4" />
        Compartilhar
      </span>
    </button>
  );
}
