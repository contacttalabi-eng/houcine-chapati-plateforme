import { useEffect, useRef } from "react";
import { toast } from "sonner";
import type { AppNotification } from "../types";
import { useRealtime } from "./realtime";

/**
 * Alertes locales : son, vibration, notification système du navigateur.
 * (Les notifications Push / WhatsApp / SMS passeront par l'Edge Function
 * dispatch-notification, voir README § Notifications.)
 */
let audioContext: AudioContext | null = null;

/** À appeler sur un geste utilisateur (clic) : les navigateurs bloquent le son sinon. */
export function unlockAudio() {
  try {
    audioContext ??= new AudioContext();
    if (audioContext.state === "suspended") void audioContext.resume();
  } catch {
    // pas de son sur cet appareil
  }
}

export const isAudioUnlocked = () => audioContext?.state === "running";

/** Petit carillon à deux notes (aucun fichier audio nécessaire). */
export function playChime(times = 1) {
  const ctx = audioContext;
  if (!ctx || ctx.state !== "running") return;
  for (let i = 0; i < times; i++) {
    [880, 1318.5].forEach((freq, n) => {
      const start = ctx.currentTime + i * 0.6 + n * 0.16;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.35, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.5);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.55);
    });
  }
}

export function vibrate(pattern: number | number[] = [200, 100, 200]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // non supporté
  }
}

export async function requestSystemNotifications(): Promise<boolean> {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  return (await Notification.requestPermission()) === "granted";
}

/** Notification système, seulement si l'onglet n'est pas au premier plan. */
export function systemNotify(title: string, body: string, tag?: string) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  if (document.visibilityState === "visible") return;
  try {
    new Notification(title, { body, tag, icon: "/brand/favicon.png" });
  } catch {
    // certains navigateurs mobiles imposent un Service Worker : ignoré
  }
}

interface AlertOptions {
  /** Son répété n fois (0 = muet) */
  chime?: number;
  vibrate?: boolean;
  toast?: boolean;
}

/**
 * Écoute en temps réel les notifications destinées à l'utilisateur connecté
 * (table public.notifications, filtrée par la RLS) et les présente.
 */
export function useNotificationFeed(
  userId: string | undefined,
  onNotification?: (n: AppNotification) => void,
  options: AlertOptions = {},
) {
  const opts = useRef(options);
  useEffect(() => {
    opts.current = options;
  });

  useRealtime(userId ? `notifications-${userId}` : null, [{ table: "notifications" }], (payload) => {
    if (payload.eventType !== "INSERT") return;
    const n = payload.new as unknown as AppNotification;
    const { chime = 1, vibrate: shake = false, toast: showToast = true } = opts.current;
    if (showToast) toast(n.title, { description: n.body });
    if (chime > 0) playChime(chime);
    if (shake) vibrate();
    systemNotify(n.title, n.body, n.order_id ?? undefined);
    onNotification?.(n);
  });
}

