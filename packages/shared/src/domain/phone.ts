/**
 * Téléphones mobiles algériens (05, 06, 07). Même règle que
 * private.normalize_dz_phone côté base.
 *   "0556 72 56 81", "+213 556 72 56 81", "00213556725681" → "0556725681"
 */
export function normalizeDzPhone(input: string): string | null {
  const digits = input.replace(/[^0-9+]/g, "").replace(/^(\+213|00213|213)0?/, "0");
  return /^0[567][0-9]{8}$/.test(digits) ? digits : null;
}

/** "0556725681" → "0556 72 56 81" */
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return "";
  const p = phone.replace(/\s/g, "");
  return /^0\d{9}$/.test(p) ? `${p.slice(0, 4)} ${p.slice(4, 6)} ${p.slice(6, 8)} ${p.slice(8)}` : phone;
}

/** Lien d'appel au format international */
export function telHref(phone: string): string {
  const p = phone.replace(/\s/g, "");
  return `tel:${p.startsWith("0") ? `+213${p.slice(1)}` : p}`;
}
