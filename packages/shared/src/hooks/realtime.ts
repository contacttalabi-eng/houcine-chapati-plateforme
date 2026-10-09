import { useEffect, useRef, useState } from "react";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { sb } from "../supabase";

export interface TableWatch {
  table: string;
  /** Filtre Realtime, ex. "id=eq.<uuid>" ou "driver_id=eq.<uuid>" */
  filter?: string;
}

export type ChangePayload = RealtimePostgresChangesPayload<Record<string, unknown>>;

/**
 * Abonnement Supabase Realtime (postgres_changes) à une ou plusieurs tables.
 * - Chaque abonné ne reçoit que les lignes autorisées par la RLS.
 * - Après une coupure réseau, `onResync` est appelé pour recharger les données
 *   (les événements manqués pendant la coupure ne sont pas rejoués).
 * Retourne true quand le canal est connecté ("En direct").
 */
export function useRealtime(
  name: string | null,
  watches: TableWatch[],
  onChange: (payload: ChangePayload) => void,
  onResync?: () => void,
): boolean {
  const [live, setLive] = useState(false);
  const handlers = useRef({ onChange, onResync });
  useEffect(() => {
    handlers.current = { onChange, onResync };
  });

  const signature = name ? `${name}::${watches.map((w) => `${w.table}?${w.filter ?? ""}`).join("|")}` : null;

  useEffect(() => {
    if (!signature || !name) return;
    const client = sb();
    const channel = client.channel(`${name}-${Math.random().toString(36).slice(2, 10)}`);
    for (const watch of watches) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table: watch.table, ...(watch.filter ? { filter: watch.filter } : {}) },
        (payload) => handlers.current.onChange(payload as ChangePayload),
      );
    }
    let subscribedBefore = false;
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        if (subscribedBefore) handlers.current.onResync?.();
        subscribedBefore = true;
        setLive(true);
      } else {
        setLive(false);
      }
    });
    return () => {
      setLive(false);
      void client.removeChannel(channel);
    };
    // la signature résume name + watches
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  return live;
}

/** Recharge quand l'onglet redevient visible ou que le réseau revient. */
export function useResyncOnFocus(resync: () => void, intervalMs?: number) {
  const ref = useRef(resync);
  useEffect(() => {
    ref.current = resync;
  });
  useEffect(() => {
    const run = () => {
      if (document.visibilityState === "visible") ref.current();
    };
    document.addEventListener("visibilitychange", run);
    window.addEventListener("online", run);
    const timer = intervalMs ? window.setInterval(run, intervalMs) : undefined;
    return () => {
      document.removeEventListener("visibilitychange", run);
      window.removeEventListener("online", run);
      if (timer) window.clearInterval(timer);
    };
  }, [intervalMs]);
}
