import { Button, formatDA, type Product } from "@hc/shared";
import { ChevronLeft, Ruler, Sparkles } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { packAndShip } from "../state/box";
import { SizePicker, SupplementTray, ToppingLayer, useProductChoice } from "./ProductChoice";
import { ProductImage, QuantityStepper, emojiFor } from "./ui";

/**
 * Fiche produit plein écran (onglet Recherche) : en-tête de couleur, grande
 * photo ronde, prix, quantité, taille, description ; les suppléments sont en
 * bas avec leurs icônes : en choisir un l'envoie se poser sur le plat.
 * « Ajouter au panier » met le plat dans une boîte qui se referme et part
 * vers le panier.
 */
export function ProductSheet({
  product, categoryName, onClose, onAdd,
}: {
  product: Product;
  categoryName: string;
  onClose: () => void;
  onAdd: (optionIds: string[], quantity: number) => void;
}) {
  const choice = useProductChoice(product);
  const [quantity, setQuantity] = useState(1);
  const [packing, setPacking] = useState(false);
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const dish = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  // Fenêtre modale : défilement de la page bloqué, Échap pour fermer, focus rendu à la fermeture.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeRef.current(); };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.({ preventScroll: true });
    };
  }, []);

  const { selected, unit, problem, sizeGroups, extraGroups, extraOptions, plateScale } = choice;
  const sizeGroup = sizeGroups[0];

  const validate = () => {
    if (problem || packing) return;
    setPacking(true);
    packAndShip(dish.current, () => onAdd(selected, quantity));
  };

  return createPortal(
    <div ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}
      className="fixed inset-0 z-50 flex justify-center bg-black/60 outline-none animate-fade-in sm:items-center sm:p-6"
      onMouseDown={(e) => { if (e.target === e.currentTarget && !packing) onClose(); }}>
      <div className="relative flex size-full flex-col overflow-hidden bg-surface text-fg animate-sheet-up sm:h-auto sm:max-h-[92dvh] sm:max-w-lg sm:rounded-3xl">
        <div className="flex-1 overflow-y-auto overscroll-contain">
          {/* En-tête de couleur ; la photo ronde déborde sur le contenu */}
          <div className="bg-brand px-4 pb-28 pt-[max(1rem,env(safe-area-inset-top))] text-white">
            <div className="flex items-center gap-3">
              <button type="button" onClick={onClose}
                className="grid size-10 place-items-center rounded-xl bg-white/20 transition hover:bg-white/30" aria-label="Fermer">
                <ChevronLeft className="size-6" />
              </button>
              <p className="flex-1 text-center text-[15px] font-bold">Détails du produit</p>
              <span className="size-10" aria-hidden />
            </div>
          </div>
          <div className="relative -mt-12 rounded-t-[2rem] bg-surface px-5 pb-6">
            {/* Le plat et les suppléments posés dessus (c'est lui qui part dans la boîte) */}
            <div className="relative mx-auto -mt-24 aspect-square w-60 max-w-[70%] transition-[scale] duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)]"
              style={{ scale: String(plateScale) }}>
              <div ref={dish} data-packing-source className="relative size-full">
                <ProductImage product={product} categoryName={categoryName}
                  className="size-full rounded-full shadow-[0_18px_40px_-12px_rgb(0_0_0/0.45)] ring-8 ring-surface" />
                <ToppingLayer options={extraOptions} selected={selected} flightId={choice.flightId} />
              </div>
            </div>

            <div className="mt-5 flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <h2 id={titleId} className="text-2xl font-extrabold leading-tight">{product.name}</h2>
                <p className="mt-1 text-2xl font-extrabold text-price">{formatDA(unit)}</p>
              </div>
              <QuantityStepper value={quantity} onChange={setQuantity} label={product.name} solid />
            </div>

            {sizeGroups.length > 0 && (
              <div className="mt-5"><SizePicker groups={sizeGroups} selected={selected} onToggle={choice.toggle} /></div>
            )}

            <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold text-fg-muted">
              <li className="flex items-center gap-1.5">
                <span aria-hidden>{emojiFor(`${categoryName} ${product.name}`)}</span>{categoryName}
              </li>
              {sizeGroup && (
                <li className="flex items-center gap-1.5"><Ruler className="size-4 text-accent" aria-hidden />{sizeGroup.options.length} tailles</li>
              )}
              {extraOptions.length > 0 && (
                <li className="flex items-center gap-1.5"><Sparkles className="size-4 text-accent" aria-hidden />{extraOptions.length} suppléments</li>
              )}
            </ul>

            {product.description && (
              <section className="mt-6">
                <h3 className="text-lg font-extrabold">À propos</h3>
                <p className="mt-1.5 leading-relaxed text-fg-muted">{product.description}</p>
              </section>
            )}
          </div>
        </div>

        <footer className="border-t border-line bg-surface pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
          {/* Suppléments, en bas, avec leurs icônes : un toucher les pose sur le plat */}
          {extraGroups.length > 0 && (
            <div className="mb-3"><SupplementTray groups={extraGroups} selected={selected} onToggle={choice.toggleExtra} /></div>
          )}
          <div className="px-5">
            <Button size="lg" full className="h-14 rounded-2xl text-base" disabled={Boolean(problem)} loading={packing} onClick={validate}>
              {problem ? `Choisir : ${problem}` : `Ajouter au panier · ${formatDA(unit * quantity)}`}
            </Button>
          </div>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
