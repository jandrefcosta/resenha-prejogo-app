import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/index';
import { pdfFiles } from '@/lib/db/schema';

export type PdfType = 'sumula' | 'boletim' | 'relatorio';

export async function savePdf(
  idJogo: string,
  type: PdfType,
  content: ArrayBuffer,
  url?: string,
): Promise<void> {
  await db.insert(pdfFiles).values({
    idJogo,
    type,
    content: Buffer.from(content),
    url: url ?? null,
  }).onConflictDoNothing();
}

export async function getPdf(
  idJogo: string,
  type: PdfType,
): Promise<ArrayBuffer | null> {
  const rows = await db
    .select({ content: pdfFiles.content })
    .from(pdfFiles)
    .where(and(eq(pdfFiles.idJogo, idJogo), eq(pdfFiles.type, type)))
    .limit(1);

  if (rows.length === 0) return null;

  const buf = rows[0].content as Buffer;
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

export async function deletePdfs(idJogo: string): Promise<void> {
  await db.delete(pdfFiles).where(eq(pdfFiles.idJogo, idJogo));
}

export async function hasPdf(idJogo: string, type: PdfType): Promise<boolean> {
  const rows = await db
    .select({ idJogo: pdfFiles.idJogo })
    .from(pdfFiles)
    .where(and(eq(pdfFiles.idJogo, idJogo), eq(pdfFiles.type, type)))
    .limit(1);
  return rows.length > 0;
}
