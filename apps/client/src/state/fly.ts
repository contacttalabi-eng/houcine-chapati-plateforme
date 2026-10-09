/** Événement envoyé quand un plat « arrive » dans le panier : le bouton panier rebondit. */
export const CART_BUMP_EVENT = "hc:panier";

function bumpCart() {
  window.dispatchEvent(new Event(CART_BUMP_EVENT));
}

/**
 * Animation d'ajout au panier : une copie ronde de la photo du plat (ou de son
 * pictogramme, pour les produits sans photo) s'envole en arc jusqu'au bouton
 * panier de la barre du bas, puis le panier rebondit. Sans bouton panier
 * visible ou si le téléphone demande moins d'animations, le panier rebondit
 * simplement.
 */
export function flyToCart(source: Element | null | undefined) {
  const target = document.querySelector("[data-cart-target]");
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (!(source instanceof HTMLElement) || !target || reduced || typeof source.animate !== "function") {
    bumpCart();
    return;
  }
  const from = source.getBoundingClientRect();
  const to = target.getBoundingClientRect();
  const size = Math.min(from.width, from.height, 150);
  if (size === 0) {
    bumpCart();
    return;
  }

  const ghost = source.cloneNode(true) as HTMLElement;
  ghost.removeAttribute("data-product-image");
  ghost.setAttribute("aria-hidden", "true");
  ghost.setAttribute("data-fly", "");
  Object.assign(ghost.style, {
    position: "fixed",
    left: `${from.left + from.width / 2 - size / 2}px`,
    top: `${from.top + from.height / 2 - size / 2}px`,
    width: `${size}px`,
    height: `${size}px`,
    borderRadius: "9999px",
    objectFit: "cover",
    zIndex: "70",
    pointerEvents: "none",
    boxShadow: "0 12px 30px -8px rgb(0 0 0 / 0.45)",
    border: "3px solid #fff",
    margin: "0",
    transition: "none",
    animation: "none",
  });
  document.body.appendChild(ghost);

  const dx = to.left + to.width / 2 - (from.left + from.width / 2);
  const dy = to.top + to.height / 2 - (from.top + from.height / 2);
  const lift = Math.min(140, Math.abs(dy) * 0.35 + 40);
  const end = 30 / size;
  const flight = ghost.animate(
    [
      { transform: "translate(0, 0) scale(1) rotate(0deg)", opacity: 1 },
      { transform: `translate(${dx * 0.35}px, ${dy * 0.35 - lift}px) scale(0.75) rotate(120deg)`, opacity: 1, offset: 0.4 },
      { transform: `translate(${dx}px, ${dy}px) scale(${end}) rotate(300deg)`, opacity: 0.6 },
    ],
    { duration: 700, easing: "cubic-bezier(0.45, 0, 0.55, 1)", fill: "forwards" },
  );
  const done = () => {
    ghost.remove();
    bumpCart();
  };
  flight.finished.then(done, done);
}
