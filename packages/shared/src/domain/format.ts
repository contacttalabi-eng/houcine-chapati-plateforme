const TZ = "Africa/Algiers";

const money = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });

/** 1130 → "1 130 DA" */
export function formatDA(amount: number): string {
  return `${money.format(amount)} DA`;
}

const timeFmt = new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
const dateTimeFmt = new Intl.DateTimeFormat("fr-FR", {
  timeZone: TZ, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
});
const dayFmt = new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });

/** Heure à Alger : "14:05" */
export function formatTime(iso: string | null | undefined): string {
  return iso ? timeFmt.format(new Date(iso)) : "";
}

/** "07 oct., 14:05" (ou seulement l'heure si c'est aujourd'hui) */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  return dayFmt.format(date) === dayFmt.format(new Date()) ? `Aujourd'hui, ${timeFmt.format(date)}` : dateTimeFmt.format(date);
}

/** "il y a 3 min" */
export function timeAgo(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "";
  const minutes = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours} h ${String(minutes % 60).padStart(2, "0")}`;
  return formatDateTime(iso);
}

/** Minutes écoulées depuis une date */
export function minutesSince(iso: string | null | undefined, now = Date.now()): number {
  return iso ? Math.floor((now - new Date(iso).getTime()) / 60_000) : 0;
}

export function formatDistance(meters: number): string {
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1).replace(".", ",")} km`;
}

export function formatDuration(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")}`;
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count > 1 ? plural : singular}`;
}

/** Minuit (heure d'Alger, UTC+1 toute l'année) du jour de `date`, en ISO UTC. */
export function algiersDayStart(date = new Date(), offsetDays = 0): string {
  const local = new Date(date.getTime() + 3_600_000);
  local.setUTCHours(0, 0, 0, 0);
  return new Date(local.getTime() - 3_600_000 + offsetDays * 86_400_000).toISOString();
}

/** "2026-10-07" (date du jour à Alger), pour les champs <input type="date"> */
export function algiersDateInput(date = new Date()): string {
  return new Date(date.getTime() + 3_600_000).toISOString().slice(0, 10);
}
