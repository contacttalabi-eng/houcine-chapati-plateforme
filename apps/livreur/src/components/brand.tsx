import { cx } from "@hc/shared";
import { LoaderCircle } from "lucide-react";
import { useId, type ButtonHTMLAttributes, type ReactNode } from "react";

/** Icônes et éléments graphiques de la maquette « couverture application livreur ». */

export function CubeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <g fill="#0d0d0d" stroke="var(--neon)" strokeWidth="2.4" strokeLinejoin="round">
        <path d="M24 3 43 13.5 24 24 5 13.5Z" />
        <path d="M5 13.5 24 24v21L5 34.5Z" />
        <path d="M43 13.5 24 24v21l19-10.5Z" />
      </g>
      <path d="m24 34.5 19-10.5" stroke="var(--neon)" strokeWidth="2.4" />
    </svg>
  );
}

/** Variante pour fond clair : faces noires séparées par des traits blancs. */
export function CubeTileIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <g fill="#0d0d0d" stroke="#fff" strokeWidth="2.2" strokeLinejoin="round">
        <path d="M24 3 43 13.5 24 24 5 13.5Z" />
        <path d="M5 13.5 24 24v21L5 34.5Z" />
        <path d="M43 13.5 24 24v21l19-10.5Z" />
      </g>
    </svg>
  );
}

export function CalcIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <rect x="4" y="4" width="40" height="40" rx="10" fill="#0d0d0d" />
      <g stroke="#fff" strokeWidth="3" strokeLinecap="round">
        <path d="M15 12.5v9M10.5 17h9M28.5 17h9M11.5 28.5l7 7M18.5 28.5l-7 7M28.5 29h9M28.5 35h9" />
      </g>
    </svg>
  );
}

export function ReceiptIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <path d="M9 7a4 4 0 0 1 4-4h22a4 4 0 0 1 4 4v38l-5-3.5-5 3.5-5-3.5-5 3.5-5-3.5L9 45Z" fill="#0d0d0d" />
      <g stroke="#fff" strokeWidth="3" strokeLinecap="round">
        <path d="M16 14h16M16 22h16M16 30h9" />
      </g>
    </svg>
  );
}

/** Épingle de carte noire au cœur jaune fluo. */
export function PinIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 66" className={className} aria-hidden>
      <ellipse cx="24" cy="62" rx="9" ry="3" fill="#000" opacity=".22" />
      <path d="M24 2C12.4 2 3 11.3 3 22.8 3 38.4 24 59 24 59s21-20.6 21-36.2C45 11.3 35.6 2 24 2Z" fill="#111" />
      <circle cx="24" cy="22.5" r="9" fill="var(--neon)" />
    </svg>
  );
}

/** Drapeau algérien dans un rond. */
export function DzFlag({ className }: { className?: string }) {
  const id = useId().replace(/:/g, "");
  const star = Array.from({ length: 10 }, (_, i) => {
    const r = i % 2 ? 1.55 : 3.7;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    return `${(22.3 + r * Math.cos(a)).toFixed(2)},${(18 + r * Math.sin(a)).toFixed(2)}`;
  }).join(" ");
  return (
    <svg viewBox="0 0 36 36" className={cx("rounded-full shadow-[0_1px_4px_rgb(0_0_0/0.18)]", className)} role="img" aria-label="Algérie">
      <defs>
        <clipPath id={`c${id}`}><circle cx="18" cy="18" r="18" /></clipPath>
        <mask id={`m${id}`}>
          <rect width="36" height="36" fill="#fff" />
          <circle cx="20.6" cy="18" r="6.6" fill="#000" />
        </mask>
      </defs>
      <g clipPath={`url(#c${id})`}>
        <rect width="18" height="36" fill="#006233" />
        <rect x="18" width="18" height="36" fill="#fff" />
        <circle cx="18" cy="18" r="8.2" fill="#d21034" mask={`url(#m${id})`} />
        <polygon points={star} fill="#d21034" />
      </g>
    </svg>
  );
}

export function LogoCutout({ className }: { className?: string }) {
  return <img src="/brand/logo-cutout.webp" alt="Houcine Chapati" width={436} height={497} className={cx("w-auto select-none", className)} draggable={false} />;
}

/** Bouton pilule noir (« Get Started » de la maquette). */
export function Pill({
  loading, icon, className, children, disabled, type = "button", ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean; icon?: ReactNode }) {
  return (
    <button type={type} disabled={disabled || loading} aria-busy={loading || undefined}
      className={cx("flex h-14 w-full items-center justify-center gap-2.5 rounded-full bg-black text-lg font-bold text-white shadow-xl shadow-black/20 transition active:scale-[.98] disabled:opacity-40", className)}
      {...rest}>
      {loading ? <LoaderCircle className="size-5 animate-spin" aria-hidden /> : null}
      {children}
      {!loading && icon}
    </button>
  );
}
