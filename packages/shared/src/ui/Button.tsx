import { LoaderCircle } from "lucide-react";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "./cx";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "success" | "info" | "outline";
export type ButtonSize = "sm" | "md" | "lg" | "xl";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-fire text-white shadow-lg shadow-brand/25 hover:brightness-110",
  secondary: "bg-surface-2 text-fg hover:bg-surface-3",
  ghost: "bg-transparent text-fg hover:bg-surface-2",
  outline: "bg-transparent text-fg ring-1 ring-inset ring-line hover:bg-surface-2",
  danger: "bg-red-600 text-white hover:bg-red-500",
  success: "bg-emerald-600 text-white hover:bg-emerald-500 shadow-lg shadow-emerald-600/25",
  info: "bg-sky-600 text-white hover:bg-sky-500 shadow-lg shadow-sky-600/25",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-9 px-3 text-sm gap-1.5 rounded-xl",
  md: "h-11 px-4 text-[15px] gap-2 rounded-xl",
  lg: "h-13 px-5 text-base gap-2.5 rounded-2xl",
  xl: "min-h-16 px-6 py-3 text-lg gap-3 rounded-2xl", // livreur : grosses cibles tactiles
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
  full?: boolean;
}

export function Button({
  variant = "primary", size = "md", loading, icon, full, className, children, disabled, type = "button", ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        "inline-flex select-none items-center justify-center font-bold transition duration-150 active:scale-[.98]",
        "disabled:pointer-events-none disabled:opacity-50",
        VARIANTS[variant], SIZES[size], full && "w-full", className,
      )}
      {...rest}
    >
      {loading ? <LoaderCircle className="size-5 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
}

/** Lien stylé comme un bouton (téléphone, Google Maps…) */
export function ButtonLink({
  variant = "primary", size = "md", icon, full, className, children, ...rest
}: AnchorHTMLAttributes<HTMLAnchorElement> & { variant?: ButtonVariant; size?: ButtonSize; icon?: ReactNode; full?: boolean }) {
  return (
    <a
      className={cx(
        "inline-flex select-none items-center justify-center font-bold transition duration-150 active:scale-[.98]",
        VARIANTS[variant], SIZES[size], full && "w-full", className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </a>
  );
}
