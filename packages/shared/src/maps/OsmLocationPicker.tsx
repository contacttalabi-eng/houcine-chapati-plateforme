import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import type { LatLng } from "../types";
import { cx } from "../ui/cx";

/** Marqueur « Livrer ici » (HTML, pas d'image à charger). */
const HOME_ICON = L.divIcon({
  className: "hc-osm-pin",
  html: '<span class="grid size-11 place-items-center rounded-full bg-brand text-xl shadow-lg ring-4 ring-white">🏠</span>',
  iconSize: [44, 44],
  iconAnchor: [22, 22],
});

/**
 * Carte OpenStreetMap (Leaflet) pour confirmer la position de livraison,
 * utilisée quand aucune clé Google Maps n'est configurée. Même comportement
 * que la carte Google : toucher la carte place le marqueur, on le fait
 * glisser pour corriger. Aucune coordonnée n'est inventée : sans GPS ni
 * action du client, `value` reste null.
 */
export function OsmLocationPicker({
  value, onChange, initialCenter, recenterSignal, className,
}: {
  value: LatLng | null;
  onChange: (point: LatLng) => void;
  initialCenter: LatLng;
  recenterSignal: number;
  className?: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const marker = useRef<L.Marker | null>(null);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  // Création de la carte (une seule fois)
  useEffect(() => {
    if (!container.current) return;
    const m = L.map(container.current, { zoomControl: true, attributionControl: true })
      .setView(value ?? initialCenter, value ? 17 : 14);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
    }).addTo(m);
    m.on("click", (e: L.LeafletMouseEvent) => onChangeRef.current({ lat: e.latlng.lat, lng: e.latlng.lng }));
    map.current = m;
    // la carte peut être créée avant que son conteneur ait sa taille définitive
    const timer = window.setTimeout(() => m.invalidateSize(), 200);
    return () => {
      window.clearTimeout(timer);
      m.remove();
      map.current = null;
      marker.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Marqueur « Livrer ici » : suit `value`, déplaçable au doigt
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (!value) {
      marker.current?.remove();
      marker.current = null;
      return;
    }
    if (marker.current) {
      marker.current.setLatLng(value);
      return;
    }
    marker.current = L.marker(value, { draggable: true, icon: HOME_ICON, title: "Déplacez-moi sur votre porte", autoPan: true })
      .on("dragend", (e) => {
        const p = (e.target as L.Marker).getLatLng();
        onChangeRef.current({ lat: p.lat, lng: p.lng });
      })
      .addTo(m);
  }, [value]);

  // Recentrer sur demande (ex. après le bouton GPS), pas à chaque déplacement
  useEffect(() => {
    const m = map.current;
    if (!m || !value || recenterSignal === 0) return;
    m.setView(value, Math.max(m.getZoom(), 17));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recenterSignal]);

  return (
    // isolate : les calques de Leaflet (z-index élevés) restent sous l'en-tête et la barre du bas
    <div className={cx("relative isolate overflow-hidden rounded-2xl ring-1 ring-line", className)}>
      <div ref={container} className="size-full" data-osm-map aria-label="Carte OpenStreetMap : touchez l'endroit de livraison" role="application" />
      {!value && (
        <div className="pointer-events-none absolute inset-x-3 top-3 z-[1000] rounded-xl bg-black/75 px-3 py-2 text-center text-sm font-semibold text-white">
          Touchez la carte à l'endroit de livraison
        </div>
      )}
    </div>
  );
}
