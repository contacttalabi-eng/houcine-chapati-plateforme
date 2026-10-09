/**
 * Types du domaine, alignés sur supabase/migrations.
 * (Pour des types générés automatiquement : npx supabase gen types typescript.)
 */

export type AppRole = "CUSTOMER" | "DRIVER" | "ADMIN";

export type OrderStatus =
  | "PENDING"
  | "CONFIRMED"
  | "PREPARING"
  | "READY"
  | "ASSIGNED"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "CANCELLED";

export type DriverStatus = "AVAILABLE" | "BUSY" | "OFFLINE";

export type OptionSelection = "SINGLE" | "MULTIPLE";

export interface LatLng {
  lat: number;
  lng: number;
}

export interface Profile {
  id: string;
  user_id: string;
  name: string | null;
  phone: string | null;
  role: AppRole;
}

export interface RestaurantSettings {
  id: number;
  name: string;
  phone: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  accepting_orders: boolean;
  delivery_fee: number;
  free_delivery_threshold: number | null;
  min_order_amount: number;
  delivery_radius_km: number | null;
  share_driver_location: boolean;
  updated_at: string;
}

export interface Category {
  id: string;
  name: string;
  image: string | null;
  sort_order: number;
  active: boolean;
}

export interface ProductOption {
  id: string;
  group_id: string;
  name: string;
  price_delta: number;
  available: boolean;
  sort_order: number;
}

export interface OptionGroup {
  id: string;
  product_id: string;
  name: string;
  selection: OptionSelection;
  required: boolean;
  max_select: number | null;
  sort_order: number;
  options: ProductOption[];
}

export interface Product {
  id: string;
  category_id: string;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  available: boolean;
  sort_order: number;
  groups: OptionGroup[];
}

export interface MenuCategory extends Category {
  products: Product[];
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  address: string;
  wilaya: string;
  commune: string;
  latitude: number | null;
  longitude: number | null;
  delivery_instructions: string | null;
}

export interface OrderItemOption {
  id: string;
  group: string;
  name: string;
  price: number;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string | null;
  product_name: string;
  options: OrderItemOption[];
  quantity: number;
  unit_price: number;
  total: number;
}

export interface StatusHistoryEntry {
  id: number;
  status: OrderStatus;
  note: string | null;
  created_at: string;
}

export interface Order {
  id: string;
  order_number: string;
  customer_id: string;
  customer_user_id: string;
  driver_id: string | null;
  status: OrderStatus;
  subtotal: number;
  delivery_fee: number;
  total: number;
  customer_name: string;
  customer_phone: string;
  customer_address: string;
  wilaya: string;
  commune: string;
  customer_latitude: number;
  customer_longitude: number;
  delivery_instructions: string | null;
  additional_info: string | null;
  cancel_reason: string | null;
  confirmed_at: string | null;
  preparing_at: string | null;
  ready_at: string | null;
  assigned_at: string | null;
  out_for_delivery_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrderWithItems extends Order {
  order_items: OrderItem[];
}

export interface OrderDetail extends OrderWithItems {
  order_status_history: StatusHistoryEntry[];
}

export interface Driver {
  id: string;
  profile_id: string;
  name: string;
  phone: string;
  email: string | null;
  status: DriverStatus;
  active: boolean;
  current_latitude: number | null;
  current_longitude: number | null;
  last_location_update: string | null;
  created_at: string;
}

export type DriverApplicationStatus = "PENDING" | "APPROVED" | "REJECTED";

/** Demande d'inscription d'un livreur (Google + prénom/nom/téléphone), validée par l'administration. */
export interface DriverApplication {
  id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  status: DriverApplicationStatus;
  created_at: string;
  decided_at: string | null;
}

/** Course terminée d'un livreur, sans aucune donnée personnelle du client. */
export interface DriverHistoryEntry {
  order_id: string;
  order_number: string;
  status: OrderStatus;
  wilaya: string;
  commune: string;
  total: number;
  items_count: number;
  assigned_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
}

export interface OrderDriverInfo {
  name: string;
  phone: string;
  latitude: number | null;
  longitude: number | null;
  last_location_update: string | null;
}

export interface AppNotification {
  id: number;
  audience: AppRole;
  recipient_user_id: string | null;
  order_id: string | null;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}

export interface DashboardStats {
  orders_today: number;
  pending: number;
  confirmed: number;
  preparing: number;
  ready: number;
  in_delivery: number;
  delivered_today: number;
  cancelled_today: number;
  revenue_today: number;
  revenue_expected: number;
  day_start: string;
}
