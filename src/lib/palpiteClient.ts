export type SubmitResult = { ok: true } | { ok: false; error: string };

/**
 * PUTs a palpite to the API, returning a discriminated result instead of
 * throwing. Checks `res.ok` (fetch does not reject on HTTP error status) and
 * extracts the backend's `{ error }` message so the caller can show it. Any
 * failure — HTTP error or network throw — becomes `{ ok: false, error }`.
 */
export async function submitPalpite(
  fixtureId: string,
  home: number,
  away: number,
): Promise<SubmitResult> {
  try {
    const res = await fetch(`/api/palpites/${fixtureId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ home, away }),
    });
    if (res.ok) return { ok: true };
    const body = await res.json().catch(() => null);
    return { ok: false, error: body?.error ?? `Erro ${res.status}` };
  } catch {
    return { ok: false, error: 'Falha de conexão' };
  }
}
