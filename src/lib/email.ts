import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM = 'noreply@resenhaprejogo.app';
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://resenhaprejogo.app';

export async function sendPasswordResetEmail(email: string, token: string): Promise<void> {
  const link = `${BASE_URL}/reset-senha?token=${token}`;
  await resend.emails.send({
    from: FROM,
    to: email,
    subject: 'Recuperação de senha — Resenha Pré-Jogo',
    html: `
      <p>Você solicitou a recuperação de senha.</p>
      <p><a href="${link}">Clique aqui para criar uma nova senha</a> (válido por 1 hora).</p>
      <p>Se não foi você, ignore este email.</p>
    `,
    text: `Você solicitou a recuperação de senha.\n\nLink (válido por 1 hora):\n${link}\n\nSe não foi você, ignore este email.`,
  });
}
