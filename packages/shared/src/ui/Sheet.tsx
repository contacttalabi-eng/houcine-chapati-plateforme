import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Button } from "./Button";
import { cx } from "./cx";

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: "md" | "lg" | "xl";
}

/**
 * Panneau modal : feuille qui monte du bas sur téléphone, fenêtre centrée
 * sur grand écran. Échap et clic à l'extérieur ferment ; le focus est piégé.
 */
export function Sheet({ open, onClose, title, subtitle, children, footer, size = "md" }: SheetProps) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const first = panel.current?.querySelector<HTMLElement>("input, select, textarea, button:not([data-close])");
    (first ?? panel.current)?.focus({ preventScroll: true });

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
      if (e.key === "Tab" && panel.current) {
        const items = [...panel.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
        )];
        const head = items[0];
        const tail = items[items.length - 1];
        if (!head || !tail) return;
        if (e.shiftKey && document.activeElement === head) { e.preventDefault(); tail.focus(); }
        else if (!e.shiftKey && document.activeElement === tail) { e.preventDefault(); head.focus(); }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.({ preventScroll: true });
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-[2px] animate-fade-in sm:items-center sm:p-6"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cx(
          "flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-line bg-surface text-fg shadow-2xl outline-none",
          "animate-sheet-up sm:animate-fade-up sm:rounded-3xl",
          size === "md" && "sm:max-w-lg", size === "lg" && "sm:max-w-2xl", size === "xl" && "sm:max-w-4xl",
        )}
      >
        <div className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-surface-3 sm:hidden" aria-hidden />
        <header className="flex items-start gap-3 border-b border-line px-5 pb-4 pt-3 sm:pt-5">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-lg font-extrabold leading-tight">{title}</h2>
            {subtitle && <div className="mt-0.5 text-sm text-fg-muted">{subtitle}</div>}
          </div>
          <Button variant="ghost" size="sm" data-close onClick={onClose} aria-label="Fermer" className="-mr-2 size-9 px-0">
            <X className="size-5" />
          </Button>
        </header>
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4">{children}</div>
        {footer && <footer className="border-t border-line px-5 pt-4 safe-bottom">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}

/** Confirmation explicite avant une action importante. */
export function ConfirmSheet({
  open, onClose, onConfirm, title, children, confirmLabel = "Confirmer", variant = "primary", loading,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  children?: ReactNode;
  confirmLabel?: string;
  variant?: "primary" | "danger" | "success";
  loading?: boolean;
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <div className="flex gap-3">
          <Button variant="secondary" size="lg" className="flex-1" onClick={onClose}>Retour</Button>
          <Button variant={variant} size="lg" className="flex-[2]" onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </div>
      }
    >
      <div className="text-fg-muted">{children}</div>
    </Sheet>
  );
}
