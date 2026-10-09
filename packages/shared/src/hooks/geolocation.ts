import { useEffect, useRef, useState } from "react";

export interface GeoFix {
  lat: number;
  lng: number;
  accuracy: number;
  at: number;
}

/** Message clair selon l'erreur ; `fallback` = que faire sans GPS (client : placer le marqueur). */
export function geoErrorMessage(error: unknown, fallback = "placez le marqueur sur la carte"): string {
  if (typeof window !== "undefined" && !window.isSecureContext) {
    return "La localisation nécessite une connexion sécurisée (https).";
  }
  const code = (error as GeolocationPositionError | null)?.code;
  if (code === 1) {
    return `Localisation refusée. Autorisez-la dans les réglages du navigateur (icône 🔒 à côté de l'adresse), sinon ${fallback}.`;
  }
  if (code === 2) return `Position introuvable. Activez le GPS du téléphone, sinon ${fallback}.`;
  if (code === 3) return `La localisation prend trop de temps. Réessayez à l'extérieur, sinon ${fallback}.`;
  return `Localisation indisponible sur cet appareil : ${fallback}.`;
}

/** Demande la position actuelle (avec l'autorisation du navigateur / téléphone). */
export function getCurrentPosition(): Promise<GeoFix> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("unsupported"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy, at: p.timestamp }),
      reject,
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 },
    );
  });
}

/** Suit la position en continu tant que `enabled` est vrai. */
export function useWatchPosition(enabled: boolean, onFix?: (fix: GeoFix) => void, fallback?: string) {
  const [fix, setFix] = useState<GeoFix | null>(null);
  const [error, setError] = useState<string | null>(null);
  const callback = useRef(onFix);
  useEffect(() => {
    callback.current = onFix;
  });

  useEffect(() => {
    if (!enabled) return;
    if (!("geolocation" in navigator)) {
      setError(geoErrorMessage(null, fallback));
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (p) => {
        const next = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy, at: p.timestamp };
        setFix(next);
        setError(null);
        callback.current?.(next);
      },
      (e) => setError(geoErrorMessage(e, fallback)),
      { enableHighAccuracy: true, timeout: 30_000, maximumAge: 5_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [enabled]);

  return { fix, error };
}

/** Distance en mètres entre deux points (haversine). */
export function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const h =
    Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

/** Garde l'écran allumé (livreur en course). */
export function useWakeLock(enabled: boolean) {
  useEffect(() => {
    if (!enabled || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const request = () => {
      if (document.visibilityState !== "visible") return;
      navigator.wakeLock.request("screen").then(
        (l) => {
          if (cancelled) void l.release();
          else lock = l;
        },
        () => undefined,
      );
    };
    request();
    document.addEventListener("visibilitychange", request);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", request);
      void lock?.release();
    };
  }, [enabled]);
}
