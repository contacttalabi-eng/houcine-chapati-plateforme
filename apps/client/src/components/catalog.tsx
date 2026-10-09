import {
  Button, EmptyState, ErrorState, Link, Sheet, Spinner, Switch, cx, formatDA, fromPrice, hasChoices, navigate, toast,
  type MenuCategory, type Product,
} from "@hc/shared";
import { ArrowRight, Check, Plus, Search, SearchX, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useCart } from "../state/cart";
import { flyToCart } from "../state/fly";
import { useMenu } from "../state/menu";
import { PlateCarousel, type PlateItem } from "./PlateCarousel";
import { ProductSheet } from "./ProductSheet";
import { ProductImage, emojiFor } from "./ui";

// ----------------------------------------------------------------- filtres

export type SortOrder = "menu" | "price-asc" | "price-desc";

export interface CatalogFilters {
  availableOnly: boolean;
  sort: SortOrder;
  maxPrice: number | null;
}

export const DEFAULT_FILTERS: CatalogFilters = { availableOnly: false, sort: "menu", maxPrice: null };

const SORT_LABELS: Record<SortOrder, string> = {
  menu: "Ordre du menu",
  "price-asc": "Prix croissant",
  "price-desc": "Prix décroissant",
};

const PRICE_LIMITS = [null, 300, 500, 1000] as const;

export function activeFilterCount(f: CatalogFilters): number {
  return Number(f.availableOnly) + Number(f.sort !== "menu") + Number(f.maxPrice !== null);
}

/** Minuscules sans accents : « Végétarienne » se trouve en tapant « vegetarienne ». */
const normalize = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

interface Entry {
  product: Product;
  category: MenuCategory;
  order: number;
}

function filterEntries(menu: MenuCategory[], query: string, categoryId: string, filters: CatalogFilters): Entry[] {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  let order = 0;
  const entries = menu.flatMap((category) => category.products.map((product) => ({ product, category, order: order++ })));
  const result = entries.filter(({ product, category }) => {
    if (categoryId !== "all" && category.id !== categoryId) return false;
    if (filters.availableOnly && !product.available) return false;
    if (filters.maxPrice !== null && fromPrice(product) > filters.maxPrice) return false;
    if (words.length === 0) return true;
    const haystack = normalize(`${product.name} ${product.description ?? ""} ${category.name}`);
    return words.every((w) => haystack.includes(w));
  });
  if (filters.sort === "price-asc") result.sort((a, b) => fromPrice(a.product) - fromPrice(b.product) || a.order - b.order);
  if (filters.sort === "price-desc") result.sort((a, b) => fromPrice(b.product) - fromPrice(a.product) || a.order - b.order);
  return result;
}

// ----------------------------------------------------------------- recherche

export function SearchBar({
  value, onChange, filterCount, onOpenFilters, inputRef, autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  filterCount: number;
  onOpenFilters: () => void;
  inputRef?: RefObject<HTMLInputElement | null>;
  autoFocus?: boolean;
}) {
  return (
    <div role="search" className="flex items-center gap-2">
      <label className="relative flex min-w-0 flex-1 items-center">
        <span className="sr-only">Rechercher un produit</span>
        <Search className="pointer-events-none absolute left-4 size-5 text-fg-muted" aria-hidden />
        <input
          ref={inputRef}
          type="search"
          enterKeyHint="search"
          autoFocus={autoFocus}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Rechercher un chapati, une pizza..."
          className={cx("h-13 w-full rounded-2xl border border-transparent bg-accent/[0.07] pl-12 text-fg outline-none transition placeholder:text-fg-muted/80 focus:border-accent focus:ring-2 focus:ring-accent/25 [&::-webkit-search-cancel-button]:hidden placeholder:text-sm", value ? "pr-11" : "pr-3")}
        />
        {value && (
          <button type="button" onClick={() => { onChange(""); inputRef?.current?.focus(); }}
            className="absolute right-2 grid size-9 place-items-center rounded-full text-fg-muted hover:bg-surface-3 hover:text-fg"
            aria-label="Effacer la recherche">
            <X className="size-4" />
          </button>
        )}
      </label>
      <button type="button" onClick={onOpenFilters}
        className="relative grid size-13 shrink-0 place-items-center rounded-2xl bg-brand text-white shadow-md shadow-brand/30 transition hover:bg-brand-hi active:scale-95"
        aria-label={filterCount ? `Filtres (${filterCount} actif${filterCount > 1 ? "s" : ""})` : "Filtres"}>
        <SlidersHorizontal className="size-5" />
        {filterCount > 0 && (
          <span className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full bg-fg text-[11px] font-extrabold text-bg ring-2 ring-bg">
            {filterCount}
          </span>
        )}
      </button>
    </div>
  );
}

function FilterSheet({
  open, onClose, filters, onChange, resultCount,
}: {
  open: boolean;
  onClose: () => void;
  filters: CatalogFilters;
  onChange: (f: CatalogFilters) => void;
  resultCount: number;
}) {
  const chip = (on: boolean) => cx(
    "rounded-full border px-4 py-2 text-sm font-bold transition",
    on ? "border-accent bg-accent/10 text-accent" : "border-line bg-surface-2 text-fg hover:bg-surface-3",
  );
  return (
    <Sheet open={open} onClose={onClose} title="Filtres"
      footer={
        <div className="flex gap-3">
          <Button variant="secondary" size="lg" className="flex-1" onClick={() => onChange(DEFAULT_FILTERS)}
            disabled={activeFilterCount(filters) === 0}>
            Réinitialiser
          </Button>
          <Button size="lg" className="flex-[2]" onClick={onClose}>
            Voir {resultCount} produit{resultCount > 1 ? "s" : ""}
          </Button>
        </div>
      }>
      <div className="flex flex-col gap-6">
        <Switch checked={filters.availableOnly} onChange={(v) => onChange({ ...filters, availableOnly: v })}
          label="Disponibles uniquement" description="Masquer les produits épuisés aujourd'hui." />
        <fieldset>
          <legend className="mb-2 text-sm font-bold">Trier par</legend>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(SORT_LABELS) as SortOrder[]).map((s) => (
              <button key={s} type="button" aria-pressed={filters.sort === s} className={chip(filters.sort === s)}
                onClick={() => onChange({ ...filters, sort: s })}>
                {SORT_LABELS[s]}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="mb-2 text-sm font-bold">Prix maximum</legend>
          <div className="flex flex-wrap gap-2">
            {PRICE_LIMITS.map((p) => (
              <button key={p ?? "all"} type="button" aria-pressed={filters.maxPrice === p} className={chip(filters.maxPrice === p)}
                onClick={() => onChange({ ...filters, maxPrice: p })}>
                {p === null ? "Tous les prix" : `Jusqu'à ${formatDA(p)}`}
              </button>
            ))}
          </div>
        </fieldset>
      </div>
    </Sheet>
  );
}

// ----------------------------------------------------------------- catégories

export function CategoryTabs({
  categories, selected, onSelect,
}: { categories: MenuCategory[]; selected: string; onSelect: (id: string) => void }) {
  const tabs = [{ id: "all", name: "Tout", image: null as string | null },
    ...categories.map((c) => ({ id: c.id, name: c.name, image: c.image }))];
  return (
    <div className="no-scrollbar -mx-4 flex gap-5 overflow-x-auto px-4" role="group" aria-label="Catégories">
      {tabs.map((t) => {
        const on = selected === t.id;
        return (
          <button key={t.id} type="button" aria-pressed={on} onClick={() => onSelect(t.id)}
            className={cx("relative flex shrink-0 items-center gap-1.5 pb-2.5 pt-1 text-[15px] transition",
              on ? "font-extrabold text-accent" : "font-semibold text-fg-muted hover:text-fg")}>
            {t.id !== "all" && (t.image
              ? <img src={t.image} alt="" className="size-6 object-contain" loading="lazy" />
              : <span className="text-lg leading-none" aria-hidden>{emojiFor(t.name)}</span>)}
            {t.name}
            <span className={cx("absolute inset-x-1 bottom-0 h-[3px] rounded-full transition", on ? "bg-accent" : "bg-transparent")} aria-hidden />
          </button>
        );
      })}
    </div>
  );
}

// ----------------------------------------------------------------- produits

function ProductCard({
  product, categoryName, onOpen,
}: { product: Product; categoryName: string; onOpen: () => void }) {
  const { add } = useCart();
  const photo = useRef<HTMLSpanElement>(null);
  const [added, setAdded] = useState(0);
  const requiresChoice = product.groups.some((g) => g.required);
  const optionsHint = product.groups.filter((g) => g.options.length > 0).map((g) => g.name).join(" · ");

  // Le bouton « + » affiche ✓ un instant après l'ajout
  useEffect(() => {
    if (!added) return;
    const timer = window.setTimeout(() => setAdded(0), 1200);
    return () => window.clearTimeout(timer);
  }, [added]);

  const quickAdd = () => {
    if (hasChoices(product)) return onOpen();
    add(product.id, []);
    flyToCart(photo.current?.querySelector("[data-product-image]"));
    setAdded((n) => n + 1);
    toast.success(`${product.name} ajouté au panier`, { duration: 1500 });
  };
  return (
    <article className={cx("relative flex flex-col overflow-hidden rounded-3xl bg-surface-2 transition duration-300 hover:-translate-y-1 hover:shadow-[0_16px_30px_-16px_rgb(0_0_0/0.35)] has-[button:active]:scale-[.97]",
      added > 0 && "animate-card-added")}>
      <button type="button" onClick={onOpen} disabled={!product.available}
        className="group flex flex-1 flex-col items-center px-3 pb-14 pt-4 text-center" aria-label={`Voir ${product.name}`}>
        <span ref={photo} className="relative block w-[78%] max-w-40">
          <ProductImage product={product} categoryName={categoryName}
            className={cx("block aspect-square h-auto w-full rounded-full shadow-[0_10px_24px_-8px_rgb(0_0_0/0.35)] ring-4 ring-surface transition duration-700 ease-out group-hover:rotate-[25deg] group-hover:scale-105 group-active:scale-95",
              !product.available && "grayscale")} />
          {!product.available && (
            <span className="absolute inset-x-0 bottom-1 mx-auto w-fit rounded-full bg-black/75 px-2.5 py-1 text-[11px] font-bold text-white">Indisponible</span>
          )}
        </span>
        <h3 className="mt-3 line-clamp-2 text-[15px] font-extrabold leading-snug">{product.name}</h3>
        {product.description && <p className="mt-0.5 line-clamp-1 text-xs text-fg-muted">{product.description}</p>}
        {optionsHint && <p className="mt-0.5 truncate text-[11px] font-bold text-accent">{optionsHint}</p>}
      </button>
      <p className="pointer-events-none absolute bottom-3.5 left-4 font-extrabold leading-tight">
        {requiresChoice && <span className="block text-[10px] font-bold uppercase tracking-wide text-fg-muted">dès</span>}
        {formatDA(fromPrice(product))}
      </p>
      {product.available && (
        <button type="button" onClick={quickAdd}
          className={cx("group/add absolute bottom-0 right-0 grid size-12 place-items-center rounded-br-3xl rounded-tl-2xl text-white transition-colors duration-300 active:scale-95",
            added ? "bg-emerald-600" : "bg-brand hover:bg-brand-hi")}
          aria-label={`Ajouter ${product.name}`}>
          {added
            ? <Check key={`ok-${added}`} className="size-6 animate-nav-pop" strokeWidth={3} />
            : <Plus key="plus" className="size-6 transition-transform duration-300 group-hover/add:rotate-90" strokeWidth={3} />}
        </button>
      )}
    </article>
  );
}

const GRID = "grid grid-cols-1 gap-3.5 min-[300px]:grid-cols-2 sm:gap-4 md:grid-cols-3 lg:grid-cols-4";

/**
 * Grille de cartes produits + fiche produit. Chaque grille gère sa propre
 * fiche (accueil, recherche, page d'une catégorie).
 */
export function ProductGrid({ entries }: { entries: { product: Product; category: MenuCategory }[] }) {
  const { add } = useCart();
  const [open, setOpen] = useState<{ product: Product; categoryName: string } | null>(null);
  return (
    <>
      <div className={GRID}>
        {entries.map((e) => (
          <ProductCard key={e.product.id} product={e.product} categoryName={e.category.name}
            onOpen={() => setOpen({ product: e.product, categoryName: e.category.name })} />
        ))}
      </div>
      {open && (
        <ProductSheet
          product={open.product}
          categoryName={open.categoryName}
          onClose={() => setOpen(null)}
          onAdd={(optionIds, quantity) => {
            add(open.product.id, optionIds, quantity);
            toast.success(`${open.product.name} ajouté au panier`, { duration: 1500 });
            setOpen(null);
          }}
        />
      )}
    </>
  );
}

// ----------------------------------------------------------------- catégories en assiettes

/** Photos rondes (vue de dessus) pour présenter chaque catégorie dans une assiette. */
const ROUND_IMAGES: [RegExp, string][] = [
  [/pizza/i, "/menu/pizza-ronde.webp"],
  [/chapati/i, "/menu/chapati-rond.webp"],
  [/snack|bol|poutine|pasta/i, "/menu/bol-rond.webp"],
];

export function categoryPlate(category: MenuCategory): PlateItem {
  const round = ROUND_IMAGES.find(([re]) => re.test(category.name))?.[1];
  return { id: category.id, image: round ?? null, emoji: emojiFor(category.name), label: category.name };
}

/**
 * Accueil : les catégories présentées une à une dans une assiette, en
 * triangle « /\ » quand on glisse le doigt ; toucher l'assiette (ou le
 * bouton) ouvre le menu de la catégorie.
 */
function CategoryCarousel({ categories }: { categories: MenuCategory[] }) {
  const [index, setIndex] = useState(0);
  const [dir, setDir] = useState<1 | -1>(1);
  const items = useMemo(() => categories.map(categoryPlate), [categories]);
  const current = categories[Math.min(index, categories.length - 1)];
  if (!current) return null;
  const goTo = (next: number, direction: 1 | -1 = next > index ? 1 : -1) => {
    if (next === index) return;
    setDir(direction);
    setIndex(next);
  };
  const enter = () => navigate(`/categorie/${current.id}`);
  const from = Math.min(...current.products.map(fromPrice));

  return (
    <section className="mt-6" aria-label="Catégories">
      <div className="flex items-end justify-between gap-3">
        <h2 className="text-xl font-extrabold">Nos catégories</h2>
        <Link to="/recherche" className="shrink-0 text-sm font-bold text-accent hover:underline">Tout le menu</Link>
      </div>

      {/* Étiquettes des catégories : la choisie passe au centre en triangle */}
      <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1" role="group" aria-label="Choisir une catégorie">
        {categories.map((c, i) => (
          <button key={c.id} type="button" aria-pressed={i === index} onClick={() => goTo(i)}
            className={cx("flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-sm font-bold transition",
              i === index ? "bg-brand text-white shadow-md shadow-brand/30" : "bg-surface-2 text-fg-muted hover:text-fg")}>
            <span aria-hidden>{emojiFor(c.name)}</span>{c.name}
          </button>
        ))}
      </div>

      <div className="relative mt-2 overflow-hidden rounded-[2rem] bg-surface-2 px-4 pb-5 pt-6">
        <PlateCarousel items={items} index={index} direction={dir} onChange={goTo} onTap={enter}
          label="Catégories du menu" className="pb-2" sizeClass="size-[min(62vw,15rem)]" />
        <div className="relative z-10 mt-3 text-center">
          <p className="text-2xl font-extrabold" aria-live="polite">{current.name}</p>
          <p className="mt-0.5 text-sm text-fg-muted">
            {current.products.length} produit{current.products.length > 1 ? "s" : ""}
            {Number.isFinite(from) && <> · dès <span className="font-bold text-price">{formatDA(from)}</span></>}
          </p>
          <button type="button" onClick={enter}
            className="mx-auto mt-4 flex h-12 items-center gap-2 rounded-2xl bg-brand px-6 font-extrabold text-white shadow-lg shadow-brand/30 transition hover:bg-brand-hi active:scale-95">
            Voir le menu {current.name} <ArrowRight className="size-5" />
          </button>
          <p className="mt-3 text-xs text-fg-muted">Glissez l'assiette pour changer de catégorie</p>
        </div>
      </div>
    </section>
  );
}

/**
 * Catalogue : recherche + filtres + catégories + cartes produits.
 * - accueil (`mode="home"`) : sans recherche en cours, les catégories en
 *   assiettes ; avec une recherche ou un filtre, la liste des résultats.
 * - onglet Recherche (`mode="search"`) : tout le menu, groupé par catégorie.
 * Mêmes données partout : le menu en direct de Supabase, mêmes prix, même panier.
 */
export function ProductBrowser({ autoFocusSearch = false, id, mode = "search" }: {
  autoFocusSearch?: boolean;
  id?: string;
  mode?: "home" | "search";
}) {
  const { menu, loading, error, reload } = useMenu();
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState("all");
  const [filters, setFilters] = useState<CatalogFilters>(DEFAULT_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const categories = useMemo(() => menu.filter((c) => c.products.length > 0), [menu]);
  const results = useMemo(() => filterEntries(categories, query, categoryId, filters), [categories, query, categoryId, filters]);
  const filterCount = activeFilterCount(filters);
  const searching = Boolean(query.trim()) || filterCount > 0;
  const grouped = !searching && categoryId === "all";

  const reset = () => {
    setQuery("");
    setCategoryId("all");
    setFilters(DEFAULT_FILTERS);
  };

  return (
    <section id={id} className="scroll-mt-20" aria-label="Menu">
      <SearchBar value={query} onChange={setQuery} filterCount={filterCount} onOpenFilters={() => setFiltersOpen(true)}
        inputRef={inputRef} autoFocus={autoFocusSearch} />

      {loading ? (
        <div className="grid place-items-center py-20"><Spinner className="size-8" /></div>
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : mode === "home" && !searching ? (
        <CategoryCarousel categories={categories} />
      ) : (
        <>
          {mode === "search" && (
            <div className="mt-5">
              <CategoryTabs categories={categories} selected={categoryId} onSelect={setCategoryId} />
            </div>
          )}

          {results.length === 0 ? (
            <EmptyState className="mt-4 rounded-3xl border border-dashed border-line" icon={<SearchX className="size-7" />}
              title="Aucun produit trouvé"
              action={<Button variant="secondary" onClick={reset}>Réinitialiser la recherche</Button>}>
              {query.trim()
                ? <>Aucun produit ne correspond à « {query.trim()} »{filterCount || categoryId !== "all" ? " avec ces filtres" : ""}.</>
                : "Aucun produit ne correspond à ces filtres."}
            </EmptyState>
          ) : grouped ? (
            categories.map((category) => (
              <div key={category.id} className="mt-8">
                <div className="mb-3 flex items-end justify-between gap-3">
                  <h2 className="text-xl font-extrabold">{category.name}</h2>
                  <button type="button" onClick={() => setCategoryId(category.id)}
                    className="shrink-0 text-sm font-bold text-accent hover:underline">
                    Voir tout ({category.products.length})
                  </button>
                </div>
                <ProductGrid entries={results.filter((e) => e.category.id === category.id)} />
              </div>
            ))
          ) : (
            <div className="mt-6">
              <p className="mb-3 text-sm font-semibold text-fg-muted" aria-live="polite">
                {results.length} produit{results.length > 1 ? "s" : ""}
                {categoryId !== "all" && ` · ${categories.find((c) => c.id === categoryId)?.name ?? ""}`}
              </p>
              <ProductGrid entries={results} />
            </div>
          )}
        </>
      )}
      {!(mode === "home" && !searching) && (
        <p className="py-8 text-center text-xs text-fg-muted">Prix en dinars algériens (DA). Photos non contractuelles.</p>
      )}

      <FilterSheet open={filtersOpen} onClose={() => setFiltersOpen(false)} filters={filters} onChange={setFilters}
        resultCount={results.length} />
    </section>
  );
}
