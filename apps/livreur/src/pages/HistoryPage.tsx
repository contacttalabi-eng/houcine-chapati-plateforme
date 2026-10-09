import {
  EmptyState, ErrorState, Spinner, algiersDateInput, cx, errorMessage, fetchDriverHistory, formatDA, formatTime,
  useResyncOnFocus, type DriverHistoryEntry,
} from "@hc/shared";
import { CheckCircle2, History, Package, ShieldCheck, Wallet, XCircle } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "../components/nav";

type Filter = "all" | "DELIVERED" | "CANCELLED";

const dayFmt = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "Africa/Algiers" });

function dayLabel(key: string): string {
  const today = algiersDateInput();
  const yesterday = algiersDateInput(new Date(Date.now() - 86_400_000));
  if (key === today) return "Aujourd'hui";
  if (key === yesterday) return "Hier";
  const label = dayFmt.format(new Date(`${key}T12:00:00Z`));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

const endOf = (e: DriverHistoryEntry) => e.delivered_at ?? e.cancelled_at ?? e.assigned_at ?? "";

export function HistoryRow({ entry }: { entry: DriverHistoryEntry }) {
  const delivered = entry.status === "DELIVERED";
  return (
    <li className="flex items-center gap-3 py-3">
      <span className={cx("grid size-10 shrink-0 place-items-center rounded-2xl",
        delivered ? "bg-emerald-500/12 text-emerald-500" : "bg-red-500/12 text-red-500")} aria-hidden>
        {delivered ? <CheckCircle2 className="size-5" /> : <XCircle className="size-5" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-mono text-sm font-bold">{entry.order_number}</span>
        <span className="block truncate text-xs text-fg-muted">
          {formatTime(endOf(entry))} · {entry.commune} · {entry.items_count} article{entry.items_count > 1 ? "s" : ""}
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span className={cx("block font-extrabold tabular-nums", !delivered && "text-fg-muted line-through")}>{formatDA(entry.total)}</span>
        <span className={cx("block text-[11px] font-bold", delivered ? "text-emerald-500" : "text-red-500")}>
          {delivered ? "Livrée" : "Annulée"}
        </span>
      </span>
    </li>
  );
}

/**
 * Historique de toutes les courses terminées du livreur, groupées par jour,
 * avec les totaux. Aucune donnée personnelle des clients (la base ne les
 * renvoie pas) : numéro, heure, commune, articles, montant.
 */
export function HistoryPage() {
  const [entries, setEntries] = useState<DriverHistoryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  const load = useCallback(() => {
    fetchDriverHistory().then((e) => { setEntries(e); setError(null); }, (e: unknown) => setError(errorMessage(e)));
  }, []);
  useEffect(load, [load]);
  useResyncOnFocus(load);

  const stats = useMemo(() => {
    const delivered = (entries ?? []).filter((e) => e.status === "DELIVERED");
    const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
    return {
      count: delivered.length,
      cash: delivered.reduce((sum, e) => sum + e.total, 0),
      week: delivered.filter((e) => (e.delivered_at ?? "") >= weekAgo).length,
    };
  }, [entries]);

  const groups = useMemo(() => {
    const map = new Map<string, DriverHistoryEntry[]>();
    for (const e of entries ?? []) {
      if (filter !== "all" && e.status !== filter) continue;
      const end = endOf(e);
      const key = end ? algiersDateInput(new Date(end)) : "?";
      map.set(key, [...(map.get(key) ?? []), e]);
    }
    return [...map.entries()];
  }, [entries, filter]);

  return (
    <div className="mx-auto min-h-dvh max-w-xl px-4 pb-nav pt-[max(1.25rem,env(safe-area-inset-top))]">
      <PageHeader title="Historique" subtitle="Toutes vos courses terminées" />

      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : entries === null ? (
        <div className="grid place-items-center py-20"><Spinner className="size-8" /></div>
      ) : (
        <>
          <section aria-label="Totaux" className="grid grid-cols-3 gap-2.5">
            <div className="rounded-3xl border border-line bg-surface p-4 card-shadow">
              <Package className="size-5 text-accent" aria-hidden />
              <p className="mt-2 text-2xl font-extrabold tabular-nums">{stats.count}</p>
              <p className="text-xs text-fg-muted">courses livrées</p>
            </div>
            <div className="rounded-3xl border border-line bg-surface p-4 card-shadow">
              <History className="size-5 text-sky-500" aria-hidden />
              <p className="mt-2 text-2xl font-extrabold tabular-nums">{stats.week}</p>
              <p className="text-xs text-fg-muted">ces 7 jours</p>
            </div>
            <div className="rounded-3xl border border-line bg-surface p-4 card-shadow">
              <Wallet className="size-5 text-gold" aria-hidden />
              <p className="mt-2 truncate text-xl font-extrabold tabular-nums">{formatDA(stats.cash)}</p>
              <p className="text-xs text-fg-muted">encaissés</p>
            </div>
          </section>

          <div className="mt-5 flex gap-2" role="group" aria-label="Filtrer">
            {([["all", "Toutes"], ["DELIVERED", "Livrées"], ["CANCELLED", "Annulées"]] as const).map(([key, label]) => (
              <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)}
                className={cx("rounded-full px-4 py-2 text-sm font-extrabold transition",
                  filter === key ? "bg-fg text-bg" : "bg-surface-2 text-fg-muted hover:text-fg")}>
                {label}
              </button>
            ))}
          </div>

          {groups.length === 0 ? (
            <EmptyState className="mt-6" icon={<History className="size-7" />} title="Aucune course pour l'instant">
              Vos courses terminées apparaîtront ici, jour par jour.
            </EmptyState>
          ) : (
            groups.map(([key, list]) => (
              <section key={key} className="mt-5 rounded-3xl border border-line bg-surface px-4 py-1 card-shadow animate-fade-up">
                <h2 className="flex items-center justify-between border-b border-line py-3 text-sm font-extrabold">
                  {dayLabel(key)}
                  <span className="font-semibold text-fg-muted">
                    {list.length} course{list.length > 1 ? "s" : ""} · {formatDA(list.filter((e) => e.status === "DELIVERED").reduce((s, e) => s + e.total, 0))}
                  </span>
                </h2>
                <ul className="divide-y divide-line">{list.map((e) => <HistoryRow key={e.order_id} entry={e} />)}</ul>
              </section>
            ))
          )}
          <p className="mt-5 flex items-start gap-2 text-xs text-fg-muted">
            <ShieldCheck className="size-4 shrink-0 text-emerald-500" />
            Par respect pour les clients, leurs nom, téléphone et adresse ne sont plus visibles 24 h après une course.
          </p>
        </>
      )}
    </div>
  );
}
