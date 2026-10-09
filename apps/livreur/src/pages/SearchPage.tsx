import {
  Link, StatusBadge, cx, errorMessage, fetchDriverHistory, formatDA, formatTime, type DriverHistoryEntry, type OrderWithItems,
} from "@hc/shared";
import { ChevronRight, Clock, MapPin, Search, SearchX, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { DriverContext } from "../App";
import { PageHeader } from "../components/nav";
import { HistoryRow } from "./HistoryPage";

const RECENT_KEY = "hc-livreur-recherches";
const MAX_RECENT = 8;

/** Minuscules sans accents ni espaces superflus : « Draâ » se trouve en tapant « draa ». */
const normalize = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const digits = (s: string) => s.replace(/\D/g, "");

function readRecent(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string").slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

function saveRecent(list: string[]) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    // stockage indisponible : l'historique des recherches vaut pour cette visite
  }
}

function matches(query: string, fields: (string | null | undefined)[]): boolean {
  const words = normalize(query).split(" ").filter(Boolean);
  const haystack = normalize(fields.filter(Boolean).join(" "));
  const phone = digits(fields.filter(Boolean).join(" "));
  return words.every((w) => haystack.includes(w) || (digits(w).length >= 3 && phone.includes(digits(w))));
}

function OrderResult({ order }: { order: OrderWithItems }) {
  return (
    <Link to={`/commande/${order.id}`}
      className="flex items-center gap-3 rounded-3xl border border-line bg-surface p-4 card-shadow transition active:scale-[.99]">
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="font-mono text-sm font-bold">{order.order_number}</span>
          <StatusBadge status={order.status} />
        </span>
        <span className="mt-1 block truncate font-extrabold">{order.customer_name}</span>
        <span className="mt-0.5 flex items-center gap-1 truncate text-sm text-fg-muted">
          <MapPin className="size-3.5 shrink-0 text-accent" /> {order.customer_address}, {order.commune}
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span className="block font-extrabold">{formatDA(order.total)}</span>
        <span className="block text-xs text-fg-muted">{formatTime(order.assigned_at)}</span>
      </span>
      <ChevronRight className="size-5 shrink-0 text-fg-muted" />
    </Link>
  );
}

/**
 * Recherche des courses : par numéro, client, téléphone, adresse ou commune
 * pour les commandes en cours et des dernières 24 h ; par numéro ou commune
 * dans tout l'historique. Les dernières recherches restent sur le téléphone.
 */
export function SearchPage({ ctx }: { ctx: DriverContext }) {
  const [query, setQuery] = useState("");
  const [recent, setRecent] = useState<string[]>(readRecent);
  const [history, setHistory] = useState<DriverHistoryEntry[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchDriverHistory().then(setHistory, (e: unknown) => setHistoryError(errorMessage(e)));
  }, []);

  const remember = (value: string) => {
    const term = value.trim();
    if (term.length < 2) return;
    const next = [term, ...recent.filter((r) => normalize(r) !== normalize(term))].slice(0, MAX_RECENT);
    setRecent(next);
    saveRecent(next);
  };

  const q = query.trim();
  const orderResults = useMemo(() => (q ? ctx.orders.filter((o) =>
    matches(q, [o.order_number, o.customer_name, o.customer_phone, o.customer_address, o.commune, o.wilaya])) : []), [q, ctx.orders]);
  const recentIds = useMemo(() => new Set(ctx.orders.map((o) => o.id)), [ctx.orders]);
  const historyResults = useMemo(() => (q ? history.filter((h) =>
    !recentIds.has(h.order_id) && matches(q, [h.order_number, h.commune, h.wilaya])) : []), [q, history, recentIds]);

  return (
    <div className="mx-auto min-h-dvh max-w-xl px-4 pb-nav pt-[max(1.25rem,env(safe-area-inset-top))]">
      <PageHeader title="Recherche" subtitle="Numéro, client, téléphone, adresse ou commune" />

      <form role="search" onSubmit={(e) => { e.preventDefault(); remember(query); input.current?.blur(); }}
        className="relative flex items-center">
        <Search className="pointer-events-none absolute left-4 size-5 text-fg-muted" aria-hidden />
        <input ref={input} type="search" enterKeyHint="search" autoFocus value={query} onChange={(e) => setQuery(e.target.value)}
          aria-label="Rechercher une course" placeholder="Ex. HC-261009, Nouvelle ville, 0555…"
          className="h-14 w-full rounded-2xl border border-line bg-surface pl-12 pr-12 text-fg card-shadow outline-none transition placeholder:text-sm placeholder:text-fg-muted/80 focus:border-accent focus:ring-2 focus:ring-accent/25 [&::-webkit-search-cancel-button]:hidden" />
        {query && (
          <button type="button" onClick={() => { setQuery(""); input.current?.focus(); }} aria-label="Effacer la recherche"
            className="absolute right-2 grid size-10 place-items-center rounded-full text-fg-muted hover:bg-surface-2 hover:text-fg">
            <X className="size-4" />
          </button>
        )}
      </form>

      {!q ? (
        <section className="mt-6" aria-label="Recherches récentes">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-extrabold"><Clock className="size-4 text-fg-muted" /> Recherches récentes</h2>
            {recent.length > 0 && (
              <button type="button" onClick={() => { setRecent([]); saveRecent([]); }}
                className="flex items-center gap-1 text-sm font-bold text-fg-muted hover:text-fg">
                <Trash2 className="size-4" /> Effacer
              </button>
            )}
          </div>
          {recent.length === 0 ? (
            <p className="rounded-3xl border border-dashed border-line p-5 text-center text-sm text-fg-muted">
              Vos dernières recherches apparaîtront ici.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {recent.map((r) => (
                <button key={r} type="button" onClick={() => setQuery(r)}
                  className="flex items-center gap-1.5 rounded-full border border-line bg-surface px-4 py-2 text-sm font-bold card-shadow transition hover:border-accent/50">
                  <Search className="size-3.5 text-fg-muted" />{r}
                </button>
              ))}
            </div>
          )}
        </section>
      ) : orderResults.length + historyResults.length === 0 ? (
        <div className="mt-10 flex flex-col items-center text-center">
          <span className="grid size-14 place-items-center rounded-full bg-surface-2 text-fg-muted"><SearchX className="size-7" /></span>
          <p className="mt-3 font-extrabold">Aucune course trouvée</p>
          <p className="mt-1 text-sm text-fg-muted">Rien ne correspond à « {q} ».</p>
          {historyError && <p className="mt-2 text-xs text-red-500">{historyError}</p>}
        </div>
      ) : (
        <div className="mt-5 flex flex-col gap-5" aria-live="polite">
          {orderResults.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-extrabold uppercase tracking-wide text-fg-muted">En cours et dernières 24 h ({orderResults.length})</h2>
              <div className="flex flex-col gap-3" onClick={() => remember(q)}>
                {orderResults.map((o) => <OrderResult key={o.id} order={o} />)}
              </div>
            </section>
          )}
          {historyResults.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-extrabold uppercase tracking-wide text-fg-muted">Historique ({historyResults.length})</h2>
              <ul className={cx("divide-y divide-line rounded-3xl border border-line bg-surface px-4 card-shadow")}>
                {historyResults.map((h) => <HistoryRow key={h.order_id} entry={h} />)}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
