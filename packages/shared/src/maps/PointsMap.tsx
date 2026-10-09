import { AdvancedMarker, Map, useMap, useMapsLibrary } from "@vis.gl/react-google-maps";
import { useEffect, useRef, type ReactNode } from "react";
import { env } from "../env";
import type { LatLng } from "../types";
import { cx } from "../ui/cx";
import { MapFallback, useMapsState } from "./MapsProvider";

export interface MapPoint {
  id: string;
  position: LatLng;
  emoji: string;
  /** classe de fond Tailwind, ex. "bg-brand" */
  color: string;
  label?: string;
  pulse?: boolean;
  onClick?: () => void;
}

export interface RouteInfo {
  distanceMeters: number | null;
  durationMillis: number | null;
}

/** Pastille de carte : emoji dans un rond coloré + pointe + étiquette. */
export function PinBadge({ emoji, color, label, pulse }: Pick<MapPoint, "emoji" | "color" | "label" | "pulse">) {
  return (
    <div className="flex flex-col items-center">
      {label && (
        <span className="mb-1 max-w-36 truncate rounded-md bg-black/80 px-1.5 py-0.5 text-[11px] font-bold text-white shadow">
          {label}
        </span>
      )}
      <div className={cx("grid size-10 place-items-center rounded-full border-[3px] border-white text-lg shadow-lg", color, pulse && "animate-ring")}>
        <span aria-hidden>{emoji}</span>
      </div>
      <div className="-mt-1.5 size-3 rotate-45 border-b-[3px] border-r-[3px] border-white" aria-hidden />
    </div>
  );
}

/** Cadre la carte sur tous les points (seulement quand la liste des points change). */
function FitToPoints({ points }: { points: MapPoint[] }) {
  const map = useMap();
  const key = points.map((p) => p.id).sort().join("|");
  useEffect(() => {
    if (!map || points.length === 0) return;
    if (points.length === 1) {
      map.setCenter(points[0]!.position);
      map.setZoom(15);
      return;
    }
    const bounds = new google.maps.LatLngBounds();
    points.forEach((p) => bounds.extend(p.position));
    map.fitBounds(bounds, 56);
    // positions volontairement ignorées : la carte ne saute pas quand un livreur bouge
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key]);
  return null;
}

/**
 * Itinéraire routier dessiné dans la carte (Routes API, classe Route).
 * Recalculé seulement quand la destination ou `requestKey` change, pour
 * limiter les appels facturés.
 */
function RouteLayer({
  from, to, requestKey, onInfo,
}: { from: LatLng; to: LatLng; requestKey: number; onInfo?: (info: RouteInfo | null) => void }) {
  const map = useMap();
  const routes = useMapsLibrary("routes");
  const fromRef = useRef(from);
  fromRef.current = from;
  const infoRef = useRef(onInfo);
  infoRef.current = onInfo;

  useEffect(() => {
    if (!map || !routes) return;
    let cancelled = false;
    let lines: google.maps.Polyline[] = [];
    routes.Route.computeRoutes({
      origin: fromRef.current,
      destination: to,
      travelMode: "DRIVING",
      fields: ["path", "distanceMeters", "durationMillis", "viewport"],
    })
      .then(({ routes: found }) => {
        const route = found?.[0];
        if (cancelled || !route) {
          if (!cancelled) infoRef.current?.(null);
          return;
        }
        lines = route.createPolylines({
          polylineOptions: { strokeColor: "#D9281C", strokeOpacity: 0.9, strokeWeight: 6 },
        });
        lines.forEach((line) => line.setMap(map));
        if (route.viewport) map.fitBounds(route.viewport, 56);
        infoRef.current?.({ distanceMeters: route.distanceMeters ?? null, durationMillis: route.durationMillis ?? null });
      })
      .catch((error: unknown) => {
        console.warn("Itinéraire Google indisponible (Routes API activée ?)", error);
        if (!cancelled) infoRef.current?.(null);
      });
    return () => {
      cancelled = true;
      lines.forEach((line) => line.setMap(null));
    };
  }, [map, routes, to.lat, to.lng, requestKey]);

  return null;
}

interface PointsMapProps {
  points: MapPoint[];
  className?: string;
  /** centre si aucun point */
  fallbackCenter?: LatLng;
  route?: { from: LatLng; to: LatLng; requestKey?: number; onInfo?: (info: RouteInfo | null) => void } | null;
  children?: ReactNode;
  id?: string;
}

/** Carte affichant des points (restaurant, client, livreurs…) et un itinéraire optionnel. */
export function PointsMap({ points, className, fallbackCenter, route, children, id }: PointsMapProps) {
  const state = useMapsState();
  const first = points[0]?.position ?? fallbackCenter ?? null;
  if (state !== "ready") {
    return state === "loading"
      ? <div className={cx("animate-pulse rounded-2xl bg-surface-2", className)} />
      : <MapFallback className={className} point={first} />;
  }
  return (
    <div className={cx("overflow-hidden rounded-2xl", className)}>
      <Map
        id={id}
        mapId={env.mapId}
        defaultCenter={first ?? { lat: 36.7169, lng: 4.0497 }}
        defaultZoom={14}
        gestureHandling="greedy"
        disableDefaultUI
        zoomControl
        fullscreenControl
        clickableIcons={false}
        className="size-full"
      >
        {points.map((p) => (
          <AdvancedMarker key={p.id} position={p.position} onClick={p.onClick} clickable={Boolean(p.onClick)} title={p.label}>
            <PinBadge emoji={p.emoji} color={p.color} label={p.label} pulse={p.pulse} />
          </AdvancedMarker>
        ))}
        <FitToPoints points={points} />
        {route && <RouteLayer from={route.from} to={route.to} requestKey={route.requestKey ?? 0} onInfo={route.onInfo} />}
        {children}
      </Map>
    </div>
  );
}
