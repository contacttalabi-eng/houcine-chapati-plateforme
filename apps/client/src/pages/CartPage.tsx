import { Button, EmptyState, Link, cx, formatDA, navigate } from "@hc/shared";
import { ShoppingBag, Trash2, TriangleAlert } from "lucide-react";
import { ProductImage, QuantityStepper, TopBar } from "../components/ui";
import { useCart } from "../state/cart";
import { useMenu } from "../state/menu";

export function TotalsBlock({ subtotal, deliveryFee, total }: { subtotal: number; deliveryFee: number; total: number }) {
  return (
    <dl className="flex flex-col gap-2 text-sm">
      <div className="flex justify-between text-fg-muted"><dt>Sous-total</dt><dd className="tabular-nums">{formatDA(subtotal)}</dd></div>
      <div className="flex justify-between text-fg-muted">
        <dt>Livraison</dt><dd className="tabular-nums">{deliveryFee === 0 ? "Offerte" : formatDA(deliveryFee)}</dd>
      </div>
      <div className="mt-1 flex justify-between border-t border-line pt-3 text-lg font-extrabold">
        <dt>Total</dt><dd className="tabular-nums text-price">{formatDA(total)}</dd>
      </div>
    </dl>
  );
}

export function CartPage() {
  const { summary, setQuantity, remove } = useCart();
  const { menu, settings } = useMenu();
  const categoryName = (id: string) => menu.find((c) => c.id === id)?.name ?? "";

  if (summary.lines.length === 0) {
    return (
      <div className="min-h-dvh">
        <TopBar back="/" />
        <EmptyState className="pt-24" icon={<ShoppingBag className="size-7" />} title="Votre panier est vide"
          action={<Link to="/"><Button size="lg">Voir le menu</Button></Link>}>
          Ajoutez vos chapatis, pizzas et boissons préférés.
        </EmptyState>
      </div>
    );
  }

  const closed = settings && !settings.accepting_orders;
  const canOrder = !summary.blocked && summary.missingForMinimum === 0 && !closed;

  return (
    <div className="min-h-dvh pb-10">
      <TopBar back="/" />
      <main className="mx-auto grid max-w-5xl gap-6 px-4 pt-6 lg:grid-cols-[1fr_360px]">
        <section>
          <h1 className="mb-4 font-display text-3xl uppercase tracking-wide">Mon panier</h1>
          <ul className="flex flex-col gap-3">
            {summary.lines.map((line) => (
              <li key={line.key}
                className={cx("flex gap-3 rounded-2xl border bg-surface p-3 card-shadow animate-fade-up",
                  line.problem ? "border-red-500/60" : "border-line")}>
                {line.product && (
                  <ProductImage product={line.product} categoryName={categoryName(line.product.category_id)}
                    className="size-20 shrink-0 rounded-xl" />
                )}
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex items-start gap-2">
                    <h2 className="flex-1 font-extrabold leading-tight">{line.product?.name ?? "Produit retiré"}</h2>
                    <button type="button" onClick={() => remove(line.key)}
                      className="-mr-1 -mt-1 grid size-9 place-items-center rounded-full text-fg-muted hover:bg-surface-2 hover:text-danger"
                      aria-label={`Supprimer ${line.product?.name ?? "ce produit"}`}>
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                  {line.options.length > 0 && (
                    <p className="text-sm text-fg-muted">{line.options.map((o) => o.name).join(" · ")}</p>
                  )}
                  {line.problem ? (
                    <p className="mt-1 flex items-center gap-1 text-sm font-bold text-danger">
                      <TriangleAlert className="size-4" /> {line.problem}
                    </p>
                  ) : (
                    <p className="text-sm text-fg-muted">{formatDA(line.unit)} l'unité</p>
                  )}
                  <div className="mt-2 flex items-center justify-between">
                    <QuantityStepper value={line.quantity} min={0} onChange={(q) => setQuantity(line.key, q)}
                      label={line.product?.name ?? ""} />
                    <span className="font-extrabold tabular-nums">{formatDA(line.total)}</span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <Link to="/" className="mt-4 inline-block text-sm font-bold text-accent hover:underline">+ Ajouter d'autres produits</Link>
        </section>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-3xl border border-line bg-surface card-shadow p-5">
            <TotalsBlock subtotal={summary.subtotal} deliveryFee={summary.deliveryFee} total={summary.total} />
            {summary.missingForMinimum > 0 && (
              <p className="mt-4 rounded-xl bg-amber/10 px-3 py-2 text-sm font-semibold text-warning">
                Minimum de commande : encore {formatDA(summary.missingForMinimum)}.
              </p>
            )}
            {summary.blocked && (
              <p className="mt-4 rounded-xl bg-red-500/10 px-3 py-2 text-sm font-semibold text-danger">
                Retirez ou corrigez les produits signalés pour continuer.
              </p>
            )}
            {closed && (
              <p className="mt-4 rounded-xl bg-red-500/10 px-3 py-2 text-sm font-semibold text-danger">
                Le restaurant ne prend pas de commandes pour le moment.
              </p>
            )}
            <Button size="lg" full className="mt-5" disabled={!canOrder} onClick={() => navigate("/commander")}>
              Commander · {formatDA(summary.total)}
            </Button>
          </div>
        </aside>
      </main>
    </div>
  );
}
