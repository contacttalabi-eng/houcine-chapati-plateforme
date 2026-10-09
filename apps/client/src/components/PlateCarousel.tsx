import { cx } from "@hc/shared";
import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";

export interface PlateItem {
  id: string;
  /** Photo ronde du plat (vue de dessus) ; sinon le pictogramme est affiché. */
  image: string | null;
  emoji: string;
  label: string;
}

/** Glissement horizontal minimal du doigt pour changer de plat (px). */
const SWIPE_PX = 40;
/** Au-delà de ce déplacement, ce n'est plus un simple toucher (px). */
const TAP_PX = 10;
/** Durée des animations d'entrée / de sortie (ms), identique au CSS. */
const SWAP_MS = 700;

/**
 * Assiette ronde en « O » : un large bord blanc, puis le plat au centre qui
 * tourne lentement (avec ce qui est posé dessus : `overlay`), et un léger
 * va-et-vient vers le bas. `scale` : taille du plat (ex. pizza Mini → Mega).
 */
export function Plate({ item, priority = false, overlay, scale = 1 }: {
  item: PlateItem;
  priority?: boolean;
  overlay?: ReactNode;
  scale?: number;
}) {
  return (
    <div className="plate grid size-full place-items-center rounded-full animate-float transition-[scale] duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] motion-reduce:animate-none"
      style={scale !== 1 ? { scale: String(scale) } : undefined}>
      <div data-dish className="relative size-[70%] animate-turn motion-reduce:animate-none">
        {item.image ? (
          <img src={item.image} alt="" width={800} height={800} fetchPriority={priority ? "high" : "auto"} draggable={false}
            className="size-full rounded-full object-cover shadow-[0_8px_18px_-4px_rgb(0_0_0/0.35)]" />
        ) : (
          <span className="grid size-full place-items-center rounded-full bg-stone-100 text-[min(18vw,6rem)] shadow-inner" aria-hidden>
            {item.emoji}
          </span>
        )}
        {overlay}
      </div>
    </div>
  );
}

/**
 * Carrousel d'assiettes en triangle « /\ » : on glisse le doigt (ou on
 * choisit un point / une étiquette) ; la nouvelle assiette monte en ligne
 * droite depuis le bas d'un côté jusqu'au sommet, au centre, pendant que
 * l'ancienne redescend de l'autre côté. Vers l'arrière, l'arrivée se fait par
 * la gauche et le départ par la droite ; vers l'avant, c'est l'inverse.
 *
 * `anchorRef` : élément d'où sort la première assiette au lancement et dont la
 * hauteur donne le bas du triangle (le « V » de l'écran d'ouverture). Sans lui,
 * le bas du triangle est juste sous l'assiette.
 */
export function PlateCarousel({
  items, index, direction, onChange, onTap, anchorRef, riseOnMount = false, label, className, sizeClass, overlay, scale,
}: {
  items: PlateItem[];
  index: number;
  direction: 1 | -1;
  onChange: (next: number, direction: 1 | -1) => void;
  onTap?: (index: number) => void;
  anchorRef?: RefObject<HTMLElement | null>;
  riseOnMount?: boolean;
  label: string;
  className?: string;
  sizeClass: string;
  /** Posé sur le plat affiché (ex. les suppléments choisis). */
  overlay?: ReactNode;
  /** Taille du plat affiché. */
  scale?: number;
}) {
  const stage = useRef<HTMLDivElement>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const [origin, setOrigin] = useState({ x: 0, y: 260, left: -400, right: 400 });

  // Assiette qui part : dérivée du changement d'index (pas d'image vide entre les deux)
  const [shown, setShown] = useState(index);
  const [leaving, setLeaving] = useState<number | null>(null);
  const [swaps, setSwaps] = useState(0);
  if (index !== shown) {
    setLeaving(shown);
    setShown(index);
    setSwaps((n) => n + 1);
  }

  useLayoutEffect(() => {
    if (leaving === null) return;
    const timer = window.setTimeout(() => setLeaving(null), SWAP_MS);
    return () => window.clearTimeout(timer);
  }, [leaving, swaps]);

  useLayoutEffect(() => {
    const measure = () => {
      const s = stage.current?.getBoundingClientRect();
      if (!s) return;
      const a = anchorRef?.current?.getBoundingClientRect();
      setOrigin({
        x: a ? Math.round(a.left + a.width / 2 - (s.left + s.width / 2)) : 0,
        y: a ? Math.round(a.top + a.height / 2 - (s.top + s.height / 2)) : Math.round(s.height * 0.75),
        // décalages qui sortent entièrement l'assiette de l'écran, à gauche ou à droite
        left: -Math.ceil(s.left + s.width + 16),
        right: Math.ceil(window.innerWidth - s.left + 16),
      });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [anchorRef]);

  const step = (delta: 1 | -1) => onChange((index + delta + items.length) % items.length, delta);

  const vars = {
    "--from-x": `${origin.x}px`,
    "--from-y": `${origin.y}px`,
    "--in-x": `${direction < 0 ? origin.left : origin.right}px`,
    "--in-y": `${origin.y}px`,
    "--out-x": `${direction < 0 ? origin.right : origin.left}px`,
    "--out-y": `${origin.y}px`,
  } as CSSProperties;

  return (
    <div role="region" aria-roledescription="carrousel" aria-label={label} tabIndex={0}
      className={cx("flex touch-pan-y select-none justify-center outline-none", onTap && "cursor-pointer", className)}
      onPointerDown={(e) => { start.current = { x: e.clientX, y: e.clientY }; }}
      onPointerCancel={() => { start.current = null; }}
      onPointerUp={(e) => {
        const from = start.current;
        start.current = null;
        if (!from) return;
        const dx = e.clientX - from.x;
        const dy = e.clientY - from.y;
        if (Math.abs(dx) >= SWIPE_PX && Math.abs(dx) > Math.abs(dy)) step(dx < 0 ? 1 : -1);
        else if (onTap && Math.abs(dx) < TAP_PX && Math.abs(dy) < TAP_PX) onTap(index);
      }}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") step(1);
        if (e.key === "ArrowLeft") step(-1);
        if (onTap && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onTap(index);
        }
      }}>
      <div ref={stage} style={vars} className={cx("relative", sizeClass)}>
        {items.map((item, i) => {
          const isShown = i === index;
          if (!isShown && i !== leaving) return null;
          // Triangle « /\ » : montée en ligne droite pour celle qui arrive, descente pour celle qui part
          const motion = !isShown
            ? "animate-plate-exit"
            : swaps === 0 ? (riseOnMount ? "animate-plate-rise" : "") : "animate-plate-enter";
          return (
            <div key={isShown ? `in-${i}-${swaps}` : `out-${i}-${swaps}`}
              role="group" aria-roledescription="plat" aria-label={`${i + 1} sur ${items.length} : ${item.label}`}
              aria-hidden={!isShown}
              className={cx("absolute inset-0 motion-reduce:animate-none", isShown && "z-[1]", motion)}>
              <Plate item={item} priority={i === 0} overlay={isShown ? overlay : undefined} scale={isShown ? scale : 1} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
