import { APILoadingStatus, APIProvider, useApiLoadingStatus } from "@vis.gl/react-google-maps";
import { MapPinOff } from "lucide-react";
import type { ReactNode } from "react";
import { env, isMapsConfigured } from "../env";
import type { LatLng } from "../types";
import { cx } from "../ui/cx";
import { placeUrl } from "./links";

/**
 * Charge Google Maps Platform une seule fois pour toute l'application
 * (langue française, région Algérie). Sans clé, les cartes affichent un
 * encadré de repli et l'application reste utilisable.
 */
export function MapsProvider({ children }: { children: ReactNode }) {
  if (!isMapsConfigured) return <>{children}</>;
  return (
    <APIProvider apiKey={env.mapsApiKey} language="fr" region="DZ" libraries={["marker", "routes"]}>
      {children}
    </APIProvider>
  );
}

/** "ready" | "loading" | "unavailable" */
export function useMapsState(): "ready" | "loading" | "unavailable" {
  // useApiLoadingStatus exige un APIProvider : on ne l'appelle que si une clé existe
  // (isMapsConfigured est constant pendant toute la vie de l'application).
  if (!isMapsConfigured) return "unavailable";
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const status = useApiLoadingStatus();
  if (status === APILoadingStatus.LOADED) return "ready";
  if (status === APILoadingStatus.FAILED || status === APILoadingStatus.AUTH_FAILURE) return "unavailable";
  return "loading";
}

export function MapFallback({
  className, point, message,
}: { className?: string; point?: LatLng | null; message?: string }) {
  return (
    <div className={cx("grid place-items-center rounded-2xl border border-dashed border-line bg-surface-2 p-5 text-center", className)}>
      <div className="flex max-w-xs flex-col items-center gap-2 text-sm text-fg-muted">
        <MapPinOff className="size-7" aria-hidden />
        <p>{message ?? (isMapsConfigured
          ? "La carte Google Maps n'a pas pu se charger (clé ou connexion)."
          : "Carte indisponible : clé Google Maps non configurée (VITE_GOOGLE_MAPS_API_KEY).")}</p>
        {point && (
          <a href={placeUrl(point)} target="_blank" rel="noopener noreferrer" className="font-bold text-flame underline">
            {point.lat.toFixed(5)}, {point.lng.toFixed(5)} — ouvrir dans Google Maps
          </a>
        )}
      </div>
    </div>
  );
}
