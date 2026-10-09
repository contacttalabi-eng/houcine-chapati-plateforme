// Configuration
export { env, isDemoMode, isMapsConfigured, isSupabaseConfigured } from "./env";
export { configureSupabase, sb, type AppName } from "./supabase";
export * from "./types";

// Domaine
export * from "./domain/status";
export * from "./domain/format";
export * from "./domain/phone";
export * from "./domain/algeria";
export * from "./domain/cart";
export { errorMessage } from "./domain/errors";

// Données
export * from "./api/menu";
export * from "./api/orders";
export * from "./api/people";

// Hooks
export * from "./hooks/realtime";
export * from "./hooks/session";
export * from "./hooks/customerAccount";
export * from "./hooks/geolocation";
export * from "./hooks/alerts";
export * from "./hooks/now";
export * from "./router";

// Interface
export { Button, ButtonLink, type ButtonProps } from "./ui/Button";
export { cx } from "./ui/cx";
export * from "./ui/primitives";
export { Sheet, ConfirmSheet } from "./ui/Sheet";
export { Field, Input, Select, Switch, Textarea } from "./ui/form";
export { StaffGate } from "./auth/StaffGate";
export { Toaster, toast } from "sonner";
