import { FunctionsHttpError } from "@supabase/supabase-js";
import { sb } from "../supabase";
import type { AppNotification, Customer, Driver, DriverApplication, DriverStatus, Profile, RestaurantSettings } from "../types";

// ----------------------------------------------------------------- profils

export async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await sb()
    .from("profiles")
    .select("id, user_id, name, phone, role")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data as Profile | null;
}

/** Fiche client (dernières coordonnées de livraison) pour pré-remplir le formulaire. */
export async function fetchMyCustomer(userId: string): Promise<Customer | null> {
  const { data, error } = await sb().from("customers").select("*").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return data as Customer | null;
}

export interface DeliveryAddressInput {
  address: string;
  wilaya: string;
  commune: string;
  delivery_instructions: string;
}

/** Enregistre l'adresse de livraison du client connecté (profil). La position GPS reste à confirmer à chaque commande. */
export async function saveMyDeliveryAddress(input: DeliveryAddressInput): Promise<Customer> {
  const { data, error } = await sb().rpc("customer_save_address", {
    p_address: input.address,
    p_wilaya: input.wilaya,
    p_commune: input.commune,
    p_instructions: input.delivery_instructions || null,
  });
  if (error) throw error;
  return data as Customer;
}

// ----------------------------------------------------------------- réglages

export async function fetchSettings(): Promise<RestaurantSettings> {
  const { data, error } = await sb().from("restaurant_settings").select("*").eq("id", 1).single();
  if (error) throw error;
  return data as RestaurantSettings;
}

export type SettingsPatch = Partial<Omit<RestaurantSettings, "id" | "updated_at">>;

export async function updateSettings(patch: SettingsPatch) {
  const { error } = await sb().from("restaurant_settings").update(patch).eq("id", 1);
  if (error) throw error;
}

// ----------------------------------------------------------------- livreurs

export async function fetchDrivers(): Promise<Driver[]> {
  const { data, error } = await sb().from("drivers").select("*").order("name");
  if (error) throw error;
  return data as Driver[];
}

export async function fetchDriverByProfile(profileId: string): Promise<Driver | null> {
  const { data, error } = await sb().from("drivers").select("*").eq("profile_id", profileId).maybeSingle();
  if (error) throw error;
  return data as Driver | null;
}

export async function updateDriver(id: string, patch: Partial<Pick<Driver, "name" | "phone" | "active">>) {
  const { error } = await sb().from("drivers").update(patch).eq("id", id);
  if (error) throw error;
}

async function invokeManageDrivers(body: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await sb().functions.invoke("manage-drivers", { body });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const payload = (await error.context.json().catch(() => null)) as { error?: string } | null;
      throw new Error(payload?.error ?? "Erreur du service de gestion des livreurs.");
    }
    throw new Error(
      "Service de gestion des livreurs injoignable. Vérifiez que l'Edge Function « manage-drivers » est déployée (voir README).",
    );
  }
  return data;
}

export interface NewDriverInput {
  name: string;
  phone: string;
  email: string;
  password: string;
}

/** Crée le compte Auth + la fiche livreur (Edge Function : la clé secrète reste côté serveur). */
export async function createDriverAccount(input: NewDriverInput) {
  await invokeManageDrivers({ action: "create", ...input });
}

export async function setDriverPassword(driverId: string, password: string) {
  await invokeManageDrivers({ action: "set-password", driver_id: driverId, password });
}

export async function setDriverAvailability(available: boolean): Promise<DriverStatus> {
  const { data, error } = await sb().rpc("driver_set_availability", { p_available: available });
  if (error) throw error;
  return data as DriverStatus;
}

export async function reportDriverLocation(latitude: number, longitude: number, accuracy?: number) {
  const { error } = await sb().rpc("driver_report_location", {
    p_latitude: latitude, p_longitude: longitude, p_accuracy: accuracy ?? null,
  });
  if (error) throw error;
}

// ----------------------------------------------------------------- notifications

export async function fetchNotifications(limit = 30): Promise<AppNotification[]> {
  const { data, error } = await sb()
    .from("notifications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data as AppNotification[];
}

export async function markNotificationsRead(ids: number[]) {
  if (!ids.length) return;
  const { error } = await sb().from("notifications").update({ read_at: new Date().toISOString() }).in("id", ids);
  if (error) throw error;
}

// ----------------------------------------------------------------- inscription des livreurs

/** Demande de l'utilisateur connecté (null s'il n'en a pas). */
export async function fetchMyDriverApplication(userId: string): Promise<DriverApplication | null> {
  const { data, error } = await sb().from("driver_applications").select("*").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return data as DriverApplication | null;
}

/** Envoie (ou renvoie après un refus) la demande d'inscription — compte Google obligatoire. */
export async function applyAsDriver(input: { firstName: string; lastName: string; phone: string }): Promise<DriverApplication> {
  const { data, error } = await sb().rpc("driver_apply", {
    p_first_name: input.firstName, p_last_name: input.lastName, p_phone: input.phone,
  });
  if (error) throw error;
  return data as DriverApplication;
}

/** Administration : toutes les demandes, les plus récentes d'abord. */
export async function fetchDriverApplications(): Promise<DriverApplication[]> {
  const { data, error } = await sb().from("driver_applications").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data as DriverApplication[];
}

/** Administration : approuver (crée le compte livreur) ou refuser une demande. */
export async function decideDriverApplication(id: string, approve: boolean): Promise<DriverApplication> {
  const { data, error } = await sb().rpc("admin_decide_driver_application", { p_application_id: id, p_approve: approve });
  if (error) throw error;
  return data as DriverApplication;
}
