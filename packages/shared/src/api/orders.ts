import { ACTIVE_STATUSES } from "../domain/status";
import { sb } from "../supabase";
import type { DashboardStats, DriverHistoryEntry, OrderDetail, OrderDriverInfo, OrderStatus, OrderWithItems } from "../types";

const WITH_ITEMS = "*, order_items(*)";
const WITH_DETAIL = "*, order_items(*), order_status_history(id, status, note, created_at)";

function sortDetail(order: OrderDetail): OrderDetail {
  order.order_status_history.sort((a, b) => a.id - b.id);
  return order;
}

// ----------------------------------------------------------------- client

export interface PlaceOrderInput {
  name: string;
  phone: string;
  address: string;
  wilaya: string;
  commune: string;
  latitude: number;
  longitude: number;
  delivery_instructions: string;
  additional_info: string;
  items: { product_id: string; quantity: number; option_ids: string[] }[];
}

export interface PlacedOrder {
  id: string;
  order_number: string;
  subtotal: number;
  delivery_fee: number;
  total: number;
}

export async function placeOrder(input: PlaceOrderInput): Promise<PlacedOrder> {
  const { data, error } = await sb().rpc("place_order", { p_order: input });
  if (error) throw error;
  return data as PlacedOrder;
}

export async function fetchOrderDetail(id: string): Promise<OrderDetail | null> {
  const { data, error } = await sb().from("orders").select(WITH_DETAIL).eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? sortDetail(data as OrderDetail) : null;
}

export async function fetchCustomerOrders(userId: string): Promise<OrderWithItems[]> {
  const { data, error } = await sb()
    .from("orders")
    .select(WITH_ITEMS)
    .eq("customer_user_id", userId)
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) throw error;
  return data as OrderWithItems[];
}

export async function cancelMyOrder(id: string, reason?: string) {
  const { error } = await sb().rpc("customer_cancel_order", { p_order_id: id, p_reason: reason ?? null });
  if (error) throw error;
}

export async function fetchOrderDriver(orderId: string): Promise<OrderDriverInfo | null> {
  const { data, error } = await sb().rpc("get_order_driver", { p_order_id: orderId });
  if (error) throw error;
  return ((data as OrderDriverInfo[] | null) ?? [])[0] ?? null;
}

// ----------------------------------------------------------------- administration

/** Commandes en cours + toutes celles créées depuis `sinceIso`. */
export async function fetchBoardOrders(sinceIso: string): Promise<OrderWithItems[]> {
  const { data, error } = await sb()
    .from("orders")
    .select(WITH_ITEMS)
    .or(`status.in.(${ACTIVE_STATUSES.join(",")}),created_at.gte."${sinceIso}"`)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  return data as OrderWithItems[];
}

/** Historique : commandes créées entre deux dates. */
export async function fetchOrdersBetween(fromIso: string, toIso: string): Promise<OrderWithItems[]> {
  const { data, error } = await sb()
    .from("orders")
    .select(WITH_ITEMS)
    .gte("created_at", fromIso)
    .lt("created_at", toIso)
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) throw error;
  return data as OrderWithItems[];
}

export async function fetchOrderWithItems(id: string): Promise<OrderWithItems | null> {
  const { data, error } = await sb().from("orders").select(WITH_ITEMS).eq("id", id).maybeSingle();
  if (error) throw error;
  return data as OrderWithItems | null;
}

export async function setOrderStatus(id: string, status: OrderStatus, reason?: string) {
  const { error } = await sb().rpc("admin_set_order_status", {
    p_order_id: id, p_status: status, p_reason: reason ?? null,
  });
  if (error) throw error;
}

export async function assignDriver(orderId: string, driverId: string) {
  const { error } = await sb().rpc("admin_assign_driver", { p_order_id: orderId, p_driver_id: driverId });
  if (error) throw error;
}

export async function fetchDashboardStats(): Promise<DashboardStats> {
  const { data, error } = await sb().rpc("admin_dashboard_stats");
  if (error) throw error;
  return data as DashboardStats;
}

// ----------------------------------------------------------------- livreur

export async function fetchDriverOrders(driverId: string): Promise<OrderWithItems[]> {
  const { data, error } = await sb()
    .from("orders")
    .select(WITH_ITEMS)
    .eq("driver_id", driverId)
    .order("assigned_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return data as OrderWithItems[];
}

export async function startDelivery(orderId: string) {
  const { error } = await sb().rpc("driver_start_delivery", { p_order_id: orderId });
  if (error) throw error;
}

export async function completeDelivery(orderId: string) {
  const { error } = await sb().rpc("driver_complete_delivery", { p_order_id: orderId });
  if (error) throw error;
}

/** Historique complet des courses terminées du livreur connecté (sans données personnelles des clients). */
export async function fetchDriverHistory(limit = 200): Promise<DriverHistoryEntry[]> {
  const { data, error } = await sb().rpc("driver_delivery_history", { p_limit: limit });
  if (error) throw error;
  return data as DriverHistoryEntry[];
}
