import { sb } from "../supabase";
import type { Category, MenuCategory, OptionGroup, OptionSelection, Product, ProductOption } from "../types";

const MENU_SELECT = `
  id, name, image, sort_order, active,
  products (
    id, category_id, name, description, price, image_url, available, sort_order,
    product_option_groups (
      id, product_id, name, selection, required, max_select, sort_order,
      product_options ( id, group_id, name, price_delta, available, sort_order )
    )
  )`;

interface RawGroup extends Omit<OptionGroup, "options"> {
  product_options: ProductOption[] | null;
}
interface RawProduct extends Omit<Product, "groups"> {
  product_option_groups: RawGroup[] | null;
}
interface RawCategory extends Category {
  products: RawProduct[] | null;
}

const bySort = <T extends { sort_order: number; name: string }>(a: T, b: T) =>
  a.sort_order - b.sort_order || a.name.localeCompare(b.name, "fr");

/** Menu complet trié. Public : catégories actives ; admin : tout (RLS). */
export async function fetchMenu(): Promise<MenuCategory[]> {
  const { data, error } = await sb().from("categories").select(MENU_SELECT).order("sort_order");
  if (error) throw error;
  return (data as unknown as RawCategory[])
    .map(({ products, ...category }) => ({
      ...category,
      products: (products ?? [])
        .map(({ product_option_groups, ...product }) => ({
          ...product,
          groups: (product_option_groups ?? [])
            .map(({ product_options, ...group }) => ({
              ...group,
              options: [...(product_options ?? [])].sort(bySort),
            }))
            .sort(bySort),
        }))
        .sort(bySort),
    }))
    .sort(bySort);
}

// ----------------------------------------------------------------- administration

export type CategoryInput = Pick<Category, "name" | "image" | "sort_order" | "active">;
export type ProductInput = Pick<Product, "category_id" | "name" | "description" | "price" | "image_url" | "available" | "sort_order">;

export async function createCategory(input: CategoryInput) {
  const { error } = await sb().from("categories").insert(input);
  if (error) throw error;
}

export async function updateCategory(id: string, patch: Partial<CategoryInput>) {
  const { error } = await sb().from("categories").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteCategory(id: string) {
  const { error } = await sb().from("categories").delete().eq("id", id);
  if (error) throw error;
}

export async function createProduct(input: ProductInput): Promise<string> {
  const { data, error } = await sb().from("products").insert(input).select("id").single();
  if (error) throw error;
  return (data as { id: string }).id;
}

export async function updateProduct(id: string, patch: Partial<ProductInput>) {
  const { error } = await sb().from("products").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteProduct(id: string) {
  const { error } = await sb().from("products").delete().eq("id", id);
  if (error) throw error;
}

export interface OptionGroupInput {
  id?: string;
  name: string;
  selection: OptionSelection;
  required: boolean;
  max_select: number | null;
  options: { id?: string; name: string; price_delta: number; available: boolean }[];
}

/** Remplace les groupes d'options d'un produit (transaction côté serveur). */
export async function saveProductOptions(productId: string, groups: OptionGroupInput[]) {
  const { error } = await sb().rpc("admin_save_product_options", { p_product_id: productId, p_groups: groups });
  if (error) throw error;
}

/** Réduit une photo (max 1200 px, WebP) avant envoi : plus léger sur mobile. */
export async function compressImage(file: File, maxSize = 1200): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.85));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}

/** Envoie une photo dans le bucket public "product-images" et retourne son URL publique. */
export async function uploadMenuImage(file: File, folder: "products" | "categories" = "products"): Promise<string> {
  const blob = await compressImage(file);
  const ext = blob.type === "image/webp" ? "webp" : (file.name.split(".").pop() ?? "jpg").toLowerCase();
  const path = `${folder}/${crypto.randomUUID()}.${ext}`;
  const bucket = sb().storage.from("product-images");
  const { error } = await bucket.upload(path, blob, { contentType: blob.type || file.type, cacheControl: "31536000" });
  if (error) throw error;
  return bucket.getPublicUrl(path).data.publicUrl;
}
