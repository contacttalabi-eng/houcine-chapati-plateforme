import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cx } from "./cx";

const CONTROL =
  "w-full rounded-xl border border-line bg-surface-2 px-3.5 py-3 text-fg placeholder:text-fg-muted/70 " +
  "outline-none transition focus:border-flame focus:ring-2 focus:ring-flame/25 disabled:opacity-60 " +
  "aria-[invalid=true]:border-red-500 aria-[invalid=true]:ring-red-500/20";

interface FieldProps {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  className?: string;
  children: (props: { id: string; "aria-invalid"?: boolean; "aria-describedby"?: string }) => ReactNode;
}

/** Libellé + champ + aide + erreur, reliés pour les lecteurs d'écran. */
export function Field({ label, hint, error, required, className, children }: FieldProps) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={cx("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-sm font-bold">
        {label}
        {required && <span className="text-brand" aria-hidden> *</span>}
      </label>
      {children({ id, "aria-invalid": error ? true : undefined, "aria-describedby": describedBy })}
      {error ? (
        <p id={`${id}-error`} className="text-sm font-semibold text-red-500" role="alert">{error}</p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-fg-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx(CONTROL, className)} {...rest} />;
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx(CONTROL, "min-h-24 resize-y", className)} {...rest} />;
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cx(CONTROL, "appearance-none bg-[length:1.1em] bg-[right_.9rem_center] bg-no-repeat pr-10", className)}
      style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23a8a29e' stroke-width='2.5'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")" }}
      {...rest}
    >
      {children}
    </select>
  );
}

export function Switch({
  checked, onChange, label, description, disabled,
}: { checked: boolean; onChange: (value: boolean) => void; label: ReactNode; description?: ReactNode; disabled?: boolean }) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <label htmlFor={id} className="text-sm font-bold">{label}</label>
        {description && <p className="text-xs text-fg-muted">{description}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx(
          "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition disabled:opacity-50",
          checked ? "bg-emerald-500" : "bg-surface-3",
        )}
      >
        <span className={cx("inline-block size-5 rounded-full bg-white shadow transition", checked ? "translate-x-6" : "translate-x-1")} />
      </button>
    </div>
  );
}
