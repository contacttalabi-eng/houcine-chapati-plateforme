import { LoaderCircle, TriangleAlert } from "lucide-react";
import type { HTMLAttributes, ReactNode } from "react";
import { DRIVER_STATUS_META, STATUS_META, TONE_CLASSES, type Tone } from "../domain/status";
import type { DriverStatus, OrderStatus } from "../types";
import { Button } from "./Button";
import { cx } from "./cx";

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx("rounded-2xl border border-line bg-surface", className)} {...rest} />;
}

export function Badge({ tone = "gray", className, children }: { tone?: Tone; className?: string; children: ReactNode }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold ring-1 ring-inset",
        TONE_CLASSES[tone], className,
      )}
    >
      {children}
    </span>
  );
}

export function StatusBadge({
  status, audience = "staff", className,
}: { status: OrderStatus; audience?: "staff" | "customer"; className?: string }) {
  const meta = STATUS_META[status];
  return (
    <Badge tone={meta.tone} className={className}>
      <span aria-hidden>{meta.emoji}</span>
      {audience === "customer" ? meta.customerLabel : meta.label}
    </Badge>
  );
}

export function DriverStatusBadge({ status, className }: { status: DriverStatus; className?: string }) {
  const meta = DRIVER_STATUS_META[status];
  return (
    <Badge tone={meta.tone} className={className}>
      <span className={cx("size-2 rounded-full", meta.dot)} aria-hidden />
      {meta.label}
    </Badge>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <LoaderCircle className={cx("size-6 animate-spin text-flame", className)} aria-label="Chargement" />;
}

export function FullScreenLoader({ label = "Chargement…" }: { label?: string }) {
  return (
    <div className="grid min-h-dvh place-items-center p-6" role="status">
      <div className="flex flex-col items-center gap-4 text-fg-muted">
        <img src="/brand/logo.webp" alt="" className="size-20 animate-pulse rounded-full bg-white ring-2 ring-amber" width={80} height={80} />
        <span className="text-sm font-semibold">{label}</span>
      </div>
    </div>
  );
}

export function EmptyState({
  icon, title, children, action, className,
}: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cx("flex flex-col items-center px-6 py-12 text-center", className)}>
      {icon && <div className="mb-4 grid size-16 place-items-center rounded-full bg-surface-2 text-3xl text-fg-muted">{icon}</div>}
      <h3 className="text-lg font-extrabold">{title}</h3>
      {children && <div className="mt-1.5 max-w-sm text-sm text-fg-muted">{children}</div>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <EmptyState icon={<TriangleAlert className="size-7 text-brand" />} title="Oups…" action={
      onRetry && <Button variant="secondary" onClick={onRetry}>Réessayer</Button>
    }>
      {message}
    </EmptyState>
  );
}

export function Logo({ className, size = 44 }: { className?: string; size?: number }) {
  return (
    <img src="/brand/logo.webp" alt="Houcine Chapati" width={size} height={size}
      className={cx("shrink-0 rounded-full bg-white object-cover ring-2 ring-amber", className)} />
  );
}

/** Indicateur de connexion temps réel */
export function LiveIndicator({ live, className }: { live: boolean; className?: string }) {
  return (
    <span
      className={cx("inline-flex items-center gap-1.5 text-xs font-bold", live ? "text-emerald-500" : "text-fg-muted", className)}
      title={live ? "Connecté en temps réel" : "Reconnexion…"}
    >
      <span className="relative flex size-2.5">
        {live && <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />}
        <span className={cx("relative inline-flex size-2.5 rounded-full", live ? "bg-emerald-500" : "bg-stone-400")} />
      </span>
      {live ? "En direct" : "Connexion…"}
    </span>
  );
}

/** Configuration manquante (.env) : message clair plutôt qu'un écran blanc. */
export function ConfigMissing({ app }: { app: string }) {
  return (
    <div className="grid min-h-dvh place-items-center p-6">
      <Card className="max-w-lg p-6">
        <div className="mb-4 flex items-center gap-3">
          <Logo size={48} />
          <h1 className="text-xl font-extrabold">{app} : configuration requise</h1>
        </div>
        <p className="text-sm text-fg-muted">
          Copiez <code className="rounded bg-surface-2 px-1">.env.example</code> en{" "}
          <code className="rounded bg-surface-2 px-1">.env</code> à la racine du dossier{" "}
          <code className="rounded bg-surface-2 px-1">plateforme/</code>, renseignez{" "}
          <code className="rounded bg-surface-2 px-1">VITE_SUPABASE_URL</code> et{" "}
          <code className="rounded bg-surface-2 px-1">VITE_SUPABASE_ANON_KEY</code> (clé publique), puis relancez.
          Détails dans le README.
        </p>
      </Card>
    </div>
  );
}
