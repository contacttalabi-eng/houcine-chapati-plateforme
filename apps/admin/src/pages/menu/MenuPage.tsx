import {
  Button, Card, EmptyState, ErrorState, Field, Input, Sheet, Spinner, Switch, createCategory, cx, deleteCategory,
  errorMessage, fetchMenu, formatDA, fromPrice, toast, updateCategory, updateProduct, useRealtime,
  type MenuCategory, type Product,
} from "@hc/shared";
import { ArrowDown, ArrowUp, Layers, Pencil, Plus, Search, Trash2, UtensilsCrossed } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PageTitle } from "../../components/Shell";
import { ProductEditor } from "./ProductEditor";

function CategoriesSheet({ categories, onClose, onChanged }: { categories: MenuCategory[]; onClose: () => void; onChanged: () => void }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const run = async (action: () => Promise<void>, message: string) => {
    setBusy(true);
    try {
      await action();
      toast.success(message);
      onChanged();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const swap = (i: number, j: number) => {
    const a = categories[i];
    const b = categories[j];
    if (!a || !b) return;
    void run(async () => {
      await updateCategory(a.id, { sort_order: j + 1 });
      await updateCategory(b.id, { sort_order: i + 1 });
    }, "Ordre mis à jour");
  };

  return (
    <Sheet open onClose={onClose} title="Catégories" subtitle="Ordre d'affichage, visibilité, ajout et suppression.">
      <ul className="flex flex-col gap-2">
        {categories.map((c, i) => (
          <li key={c.id} className="flex items-center gap-2 rounded-2xl border border-line p-3">
            <div className="flex flex-col">
              <button type="button" aria-label="Monter" disabled={busy || i === 0} onClick={() => swap(i, i - 1)} className="disabled:opacity-30"><ArrowUp className="size-4" /></button>
              <button type="button" aria-label="Descendre" disabled={busy || i === categories.length - 1} onClick={() => swap(i, i + 1)} className="disabled:opacity-30"><ArrowDown className="size-4" /></button>
            </div>
            <Input aria-label="Nom de la catégorie" defaultValue={c.name} className="flex-1 py-2"
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v && v !== c.name) void run(() => updateCategory(c.id, { name: v }), "Catégorie renommée");
              }} />
            <label className="flex items-center gap-1.5 text-sm font-bold">
              <input type="checkbox" className="size-4 accent-brand" checked={c.active} disabled={busy}
                onChange={(e) => void run(() => updateCategory(c.id, { active: e.target.checked }), e.target.checked ? "Catégorie visible" : "Catégorie masquée")} />
              Visible
            </label>
            <Button variant="ghost" size="sm" aria-label={`Supprimer ${c.name}`} disabled={busy}
              onClick={() => {
                if (c.products.length > 0) return toast.error(`Videz d'abord « ${c.name} » (${c.products.length} produit(s)).`);
                void run(() => deleteCategory(c.id), "Catégorie supprimée");
              }}>
              <Trash2 className="size-4 text-red-600" />
            </Button>
          </li>
        ))}
      </ul>
      <form className="mt-4 flex gap-2" onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return;
        void run(() => createCategory({ name: name.trim(), image: null, active: true, sort_order: categories.length + 1 }), "Catégorie ajoutée")
          .then(() => setName(""));
      }}>
        <Field label="Nouvelle catégorie" className="flex-1">{(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex. Desserts" />}</Field>
        <Button type="submit" className="self-end" loading={busy} icon={<Plus className="size-4" />}>Ajouter</Button>
      </form>
    </Sheet>
  );
}

export function MenuPage() {
  const [menu, setMenu] = useState<MenuCategory[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string>("ALL");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<{ product: Product | null } | null>(null);
  const [managing, setManaging] = useState(false);

  const load = useCallback(() => {
    fetchMenu().then((m) => { setMenu(m); setError(null); }, (e: unknown) => setError(errorMessage(e)));
  }, []);
  useEffect(load, [load]);
  useRealtime("admin-menu", [{ table: "categories" }, { table: "products" }, { table: "product_options" }], load, load);

  const rows = useMemo(() => {
    if (!menu) return [];
    const q = query.trim().toLowerCase();
    return menu
      .filter((c) => selected === "ALL" || c.id === selected)
      .flatMap((c) => c.products.map((p) => ({ product: p, category: c })))
      .filter(({ product }) => !q || product.name.toLowerCase().includes(q));
  }, [menu, selected, query]);

  const toggle = async (p: Product) => {
    try {
      await updateProduct(p.id, { available: !p.available });
      setMenu((m) => m?.map((c) => ({ ...c, products: c.products.map((x) => (x.id === p.id ? { ...x, available: !p.available } : x)) })) ?? m);
      toast.success(`${p.name} : ${p.available ? "indisponible" : "disponible"}`);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!menu) return <Spinner />;

  return (
    <>
      <PageTitle title="Menu" subtitle="Toute modification apparaît immédiatement dans l'application client."
        actions={<>
          <Button variant="secondary" icon={<Layers className="size-4" />} onClick={() => setManaging(true)}>Catégories</Button>
          <Button icon={<Plus className="size-4" />} disabled={menu.length === 0} onClick={() => setEditing({ product: null })}>Ajouter un produit</Button>
        </>} />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-fg-muted" />
          <Input aria-label="Rechercher un produit" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher…" className="py-2 pl-10" />
        </div>
        {[{ id: "ALL", name: "Tout", active: true }, ...menu].map((c) => (
          <button key={c.id} type="button" onClick={() => setSelected(c.id)}
            className={cx("rounded-full px-4 py-2 text-sm font-extrabold", selected === c.id ? "bg-fg text-bg" : "bg-surface-2 text-fg-muted", !c.active && "line-through")}>
            {c.name}
          </button>
        ))}
      </div>

      {menu.length === 0 ? (
        <EmptyState icon={<UtensilsCrossed className="size-7" />} title="Aucune catégorie" action={<Button onClick={() => setManaging(true)}>Créer une catégorie</Button>}>
          Commencez par créer une catégorie (ou exécutez supabase/seed.sql).
        </EmptyState>
      ) : (
        <Card className="divide-y divide-line">
          {rows.length === 0 && <p className="p-6 text-center text-fg-muted">Aucun produit.</p>}
          {rows.map(({ product: p, category: c }) => (
            <div key={p.id} className={cx("flex items-center gap-3 p-3 sm:p-4", !p.available && "bg-surface-2/60")}>
              {p.image_url ? <img src={p.image_url} alt="" className="size-14 shrink-0 rounded-xl object-cover" />
                : <span className="grid size-14 shrink-0 place-items-center rounded-xl bg-surface-2 text-2xl">🍽️</span>}
              <div className="min-w-0 flex-1">
                <p className={cx("truncate font-extrabold", !p.available && "text-fg-muted line-through")}>{p.name}</p>
                <p className="truncate text-sm text-fg-muted">
                  {c.name} · {p.groups.some((g) => g.required) ? "dès " : ""}{formatDA(fromPrice(p))}
                  {p.groups.length > 0 && ` · ${p.groups.map((g) => g.name).join(", ")}`}
                </p>
              </div>
              <div className="hidden sm:block"><Switch checked={p.available} onChange={() => void toggle(p)} label={<span className="sr-only">Disponible</span>} /></div>
              <Button variant="outline" size="sm" icon={<Pencil className="size-4" />} onClick={() => setEditing({ product: p })}>
                <span className="hidden sm:inline">Modifier</span>
              </Button>
            </div>
          ))}
        </Card>
      )}

      {editing && (
        <ProductEditor product={editing.product} categories={menu}
          defaultCategoryId={selected !== "ALL" ? selected : menu[0]?.id ?? ""}
          onClose={() => setEditing(null)} onSaved={load} />
      )}
      {managing && <CategoriesSheet categories={menu} onClose={() => setManaging(false)} onChanged={load} />}
    </>
  );
}
