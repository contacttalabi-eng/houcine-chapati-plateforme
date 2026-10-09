import { Button, EmptyState, ErrorState, Link, Spinner, formatDA, toast, type MenuCategory, type Product } from "@hc/shared";
import { ChevronLeft, UtensilsCrossed } from "lucide-react";
import { useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { PlateCarousel, type PlateItem } from "../components/PlateCarousel";
import { SizeCircles, SupplementIcons, ToppingLayer, useProductChoice } from "../components/ProductChoice";
import { categoryPlate } from "../components/catalog";
import { QuantityStepper, emojiFor } from "../components/ui";
import { packAndShip } from "../state/box";
import { useCart } from "../state/cart";
import { useMenu } from "../state/menu";

/**
 * Menu d'une catégorie, en assiettes : un seul plat à la fois (ex. « Chapati
 * S-2 3 Fromages »), sans barre ni texte superflu : l'assiette, le nom du
 * plat, son prix, les tailles en ronds et les suppléments en icônes (chacun
 * s'envole se poser dans l'assiette). On glisse le doigt pour passer au plat
 * suivant ou précédent, en triangle « /\ ». « Ajouter au panier » met le plat
 * en boîte.
 */
export function CategoryPage({ id }: { id: string }) {
  const { menu, loading, error, reload } = useMenu();
  const category = menu.find((c) => c.id === id && c.products.length > 0);

  return (
    <div className="min-h-dvh overflow-x-clip pb-nav">
      <h1 className="sr-only">{category?.name ?? "Catégorie"}</h1>

      <main className="mx-auto max-w-lg px-4 pt-[max(1rem,env(safe-area-inset-top))]">
        {loading ? (
          <><BackHome /><div className="grid place-items-center py-24"><Spinner className="size-8" /></div></>
        ) : error ? (
          <><BackHome /><ErrorState message={error} onRetry={reload} /></>
        ) : !category ? (
          <EmptyState icon={<UtensilsCrossed className="size-7" />} title="Catégorie introuvable"
            action={<Link to="/" className="font-bold text-accent">Revenir au menu</Link>}>
            Cette catégorie n'existe plus ou est vide.
          </EmptyState>
        ) : (
          <PlateMenu category={category} />
        )}
      </main>
    </div>
  );
}

function BackHome() {
  return (
    <Link to="/" aria-label="Retour à l'accueil"
      className="grid size-11 shrink-0 place-items-center rounded-full bg-surface text-fg shadow-md ring-1 ring-line transition hover:bg-surface-2 active:scale-90">
      <ChevronLeft className="size-6" />
    </Link>
  );
}

function PlateMenu({ category }: { category: MenuCategory }) {
  const products = category.products;
  const [index, setIndex] = useState(0);
  const [dir, setDir] = useState<1 | -1>(1);
  const product = products[Math.min(index, products.length - 1)]!;
  // Photo ronde de la catégorie (celle du menu : chapati, pizza, bol) pour chaque plat ; sinon sa photo ou son pictogramme
  const items = useMemo<PlateItem[]>(() => {
    const round = categoryPlate(category).image;
    return products.map((p) => ({ id: p.id, image: round ?? p.image_url, emoji: emojiFor(`${category.name} ${p.name}`), label: p.name }));
  }, [products, category]);
  const goTo = (next: number, direction: 1 | -1) => {
    setDir(direction);
    setIndex(next);
  };

  return (
    <PlateDish product={product}
      carousel={(overlay, scale, stageRef) => (
        <div ref={stageRef}>
          <PlateCarousel items={items} index={index} direction={dir} onChange={goTo} riseOnMount
            label={`${category.name} : un plat par assiette`} sizeClass="size-[min(76vw,36dvh,19rem)]"
            overlay={overlay} scale={scale} />
        </div>
      )} />
  );
}

/**
 * Le plat affiché : son état (taille, suppléments, quantité) repart de zéro
 * à chaque changement de plat. (Pas de clé React ici : le carrousel doit
 * rester monté pour animer le passage d'une assiette à l'autre.)
 */
function PlateDish({ product, carousel }: {
  product: Product;
  carousel: (overlay: ReactNode, scale: number, stageRef: RefObject<HTMLDivElement | null>) => ReactNode;
}) {
  const { add } = useCart();
  const choice = useProductChoice(product);
  const [quantity, setQuantity] = useState(1);
  const [packing, setPacking] = useState(false);
  const [shownId, setShownId] = useState(product.id);
  if (shownId !== product.id) {
    setShownId(product.id);
    setQuantity(1);
  }
  const stage = useRef<HTMLDivElement>(null);
  const { selected, unit, problem, sizeGroups, extraGroups, extraOptions, plateScale } = choice;

  const validate = () => {
    if (problem || packing || !product.available) return;
    setPacking(true);
    const dish = stage.current?.querySelector<HTMLElement>('[aria-roledescription="plat"]:not([aria-hidden="true"]) [data-dish]');
    packAndShip(dish, () => {
      add(product.id, selected, quantity);
      toast.success(`${product.name} ajouté au panier`, { duration: 1500 });
      choice.reset();
      setQuantity(1);
      setPacking(false);
    });
  };

  return (
    <>
      {/* En haut : retour + nom du plat affiché */}
      <div className="flex items-center gap-3">
        <BackHome />
        <div key={product.id} className="min-w-0 flex-1 text-center animate-fade-up">
          <h2 className="text-2xl font-extrabold leading-tight">{product.name}</h2>
          {/* Prix final : mis à jour à chaque taille, supplément ou quantité */}
          <p key={unit * quantity} className="mt-0.5 text-2xl font-extrabold tabular-nums text-price animate-nav-pop" aria-live="polite">
            {formatDA(unit * quantity)}
          </p>
          {!product.available && (
            <p className="mx-auto mt-1 w-fit rounded-full bg-red-500/12 px-3 py-1 text-xs font-bold text-danger">Indisponible aujourd'hui</p>
          )}
        </div>
        <span className="size-11 shrink-0" aria-hidden />
      </div>

      <div className="mt-10">
        {carousel(<ToppingLayer options={extraOptions} selected={selected} flightId={choice.flightId} />, plateScale, stage)}
      </div>

      {sizeGroups.length > 0 && (
        <div className="mt-4"><SizeCircles groups={sizeGroups} selected={selected} onToggle={choice.toggle} /></div>
      )}

      {extraGroups.length > 0 && (
        <div className="-mx-4 mt-3"><SupplementIcons groups={extraGroups} selected={selected} onToggle={choice.toggleExtra} /></div>
      )}

      <div className="mt-5 flex items-center gap-3 pb-4">
        <QuantityStepper value={quantity} onChange={setQuantity} label={product.name} solid />
        <Button size="lg" className="h-14 flex-1 rounded-2xl text-base" disabled={Boolean(problem) || !product.available}
          loading={packing} onClick={validate}>
          {!product.available ? "Indisponible" : problem ? `Choisir : ${problem}` : "Ajouter au panier"}
        </Button>
      </div>
    </>
  );
}
