import { AdvancedMarker, Map, useMap } from "@vis.gl/react-google-maps";
import { useEffect, useState } from "react";
import { env } from "../env";
import type { LatLng } from "../types";
import { cx } from "../ui/cx";
import { useMapsState } from "./MapsProvider";
import { OsmLocationPicker } from "./OsmLocationPicker";
import { PinBadge } from "./PointsMap";

/** "36.7118, 4.0459" (copié depuis Google Maps) → point, sinon null */
export function parseCoordinates(text: string): LatLng | null {
  const m = text.trim().match(/^(-?\d{1,2}(?:\.\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)$/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
}

/** Sans carte : coller les coordonnées réelles du lieu (Google Maps → appui long → copier). */
function CoordinatesInput({ onChange }: { onChange: (point: LatLng) => void }) {
  const [text, setText] = useState("");
  const [invalid, setInvalid] = useState(false);
  // pas de <form> : ce bloc est placé dans le formulaire de commande
  const apply = () => {
    const point = parseCoordinates(text);
    setInvalid(!point);
    if (point) onChange(point);
  };
  return (
    <div className="mt-3 flex gap-2">
      <input value={text} onChange={(e) => { setText(e.target.value); setInvalid(false); }} inputMode="decimal"
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); apply(); } }}
        aria-label="Coordonnées GPS" aria-invalid={invalid || undefined} placeholder="Coordonnées GPS, ex. 36.71180, 4.04590"
        className="min-w-0 flex-1 rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-fg outline-none focus:border-flame aria-[invalid=true]:border-red-500" />
      <button type="button" onClick={apply} className="rounded-xl bg-surface-3 px-4 font-bold text-fg">Valider</button>
    </div>
  );
}

function Recenter({ target, signal }: { target: LatLng | null; signal: number }) {
  const map = useMap();
  useEffect(() => {
    if (!map || !target) return;
    map.panTo(target);
    if ((map.getZoom() ?? 0) < 16) map.setZoom(17);
    // ne recentre que sur demande (signal), pas à chaque déplacement du marqueur
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, signal]);
  return null;
}

interface LocationPickerProps {
  value: LatLng | null;
  onChange: (point: LatLng) => void;
  /** Centre initial si aucune position (ex. le restaurant) */
  initialCenter: LatLng;
  /** Incrémenter pour recentrer la carte sur `value` (ex. après le GPS) */
  recenterSignal: number;
  className?: string;
}

/**
 * Carte de confirmation de position : le client déplace le marqueur ou touche
 * la carte pour corriger sa position. Google Maps si une clé est configurée,
 * sinon OpenStreetMap. Aucune coordonnée n'est inventée : sans GPS ni action
 * du client, `value` reste null.
 */
export function LocationPicker({ value, onChange, initialCenter, recenterSignal, className }: LocationPickerProps) {
  const state = useMapsState();
  if (state === "loading") return <div className={cx("animate-pulse rounded-2xl bg-surface-2", className)} />;
  if (state === "unavailable") {
    // Sans clé Google Maps (ou si elle échoue) : carte OpenStreetMap, même fonctionnement
    return (
      <div>
        <OsmLocationPicker value={value} onChange={onChange} initialCenter={initialCenter} recenterSignal={recenterSignal}
          className={className} />
        <details className="mt-2 text-sm text-fg-muted">
          <summary className="cursor-pointer font-semibold">Saisir des coordonnées GPS</summary>
          <CoordinatesInput onChange={onChange} />
        </details>
      </div>
    );
  }
  return (
    <div className={cx("relative overflow-hidden rounded-2xl ring-1 ring-line", className)}>
      <Map
        mapId={env.mapId}
        defaultCenter={value ?? initialCenter}
        defaultZoom={value ? 17 : 14}
        gestureHandling="greedy"
        disableDefaultUI
        zoomControl
        clickableIcons={false}
        className="size-full"
        onClick={(e) => {
          const point = e.detail.latLng;
          if (point) onChange(point);
        }}
      >
        {value && (
          <AdvancedMarker
            position={value}
            draggable
            title="Déplacez-moi sur votre porte"
            onDragEnd={(e) => {
              if (e.latLng) onChange({ lat: e.latLng.lat(), lng: e.latLng.lng() });
            }}
          >
            <PinBadge emoji="🏠" color="bg-brand" label="Livrer ici" pulse />
          </AdvancedMarker>
        )}
        <Recenter target={value} signal={recenterSignal} />
      </Map>
      {!value && (
        <div className="pointer-events-none absolute inset-x-3 top-3 rounded-xl bg-black/75 px-3 py-2 text-center text-sm font-semibold text-white">
          Touchez la carte à l'endroit de livraison
        </div>
      )}
    </div>
  );
}
