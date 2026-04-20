'use client';

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
      className="px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-xl text-sm transition-colors"
    >
      Compartilhar 📤
    </button>
  );
}
