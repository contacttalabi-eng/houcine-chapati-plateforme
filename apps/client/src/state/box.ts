import { CART_BUMP_EVENT } from "./fly";

/** Durées de l'animation « mise en boîte » (ms). */
const T = { open: 300, drop: 450, close: 420, squash: 160, pause: 120, fly: 650 } as const;

function bumpCart() {
  window.dispatchEvent(new Event(CART_BUMP_EVENT));
}

function el(style: Partial<CSSStyleDeclaration>, parent?: HTMLElement): HTMLDivElement {
  const div = document.createElement("div");
  Object.assign(div.style, style);
  parent?.appendChild(div);
  return div;
}

/**
 * Validation d'un plat : une boîte à pizza en carton s'ouvre sous le plat, le
 * plat (avec ses suppléments) descend dedans, le couvercle au logo se referme,
 * puis la boîte file jusqu'au bouton panier, qui rebondit.
 *
 * `onPacked` est appelé quand la boîte est fermée (c'est là que le plat entre
 * dans le panier, et que la fiche se ferme ou que l'assiette est remise à zéro) ; la boîte part ensuite vers le
 * bouton panier de la barre du bas. Si le téléphone demande moins
 * d'animations, `onPacked` est appelé tout de suite.
 */
export function packAndShip(source: HTMLElement | null | undefined, onPacked: () => void) {
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const rect = source?.getBoundingClientRect();
  if (!source || !rect || rect.width === 0 || reduced || typeof source.animate !== "function") {
    onPacked();
    bumpCart();
    return;
  }

  const size = Math.round(Math.min(rect.width * 1.12, window.innerWidth - 48, 300));
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const radius = Math.round(size * 0.07);

  // Conteneur en perspective, centré sur le plat
  const box = el({
    position: "fixed", left: `${cx - size / 2}px`, top: `${cy - size / 2}px`, width: `${size}px`, height: `${size}px`,
    zIndex: "70", pointerEvents: "none", perspective: `${size * 3}px`,
  });
  box.setAttribute("aria-hidden", "true");
  box.setAttribute("data-box", "");

  // Fond de la boîte (carton, vu de dessus)
  const base = el({
    position: "absolute", inset: "0", borderRadius: `${radius}px`,
    background: "linear-gradient(145deg, #dcae74, #c48f55)",
    boxShadow: "0 24px 50px -18px rgb(0 0 0 / 0.55), inset 0 0 0 3px rgb(0 0 0 / 0.06)",
  }, box);
  el({
    position: "absolute", inset: "7%", borderRadius: `${radius * 0.6}px`,
    background: "radial-gradient(circle at 50% 40%, #c9965c, #b47f45)",
    boxShadow: "inset 0 6px 14px rgb(0 0 0 / 0.28)",
  }, base);

  // Copie du plat (photo + suppléments) qui descend dans la boîte
  const dish = source.cloneNode(true) as HTMLElement;
  dish.removeAttribute("data-packing-source");
  Object.assign(dish.style, {
    position: "absolute", left: `${(size - rect.width) / 2}px`, top: `${(size - rect.height) / 2}px`,
    width: `${rect.width}px`, height: `${rect.height}px`, margin: "0", transform: "none", transition: "none", animation: "none",
  });
  // les suppléments sont déjà posés : pas de nouvelle animation d'arrivée dans la copie
  dish.querySelectorAll<HTMLElement>("*").forEach((n) => { n.style.animation = "none"; });
  box.appendChild(dish);

  // Couvercle : charnière en haut ; ouvert, il est retourné au-dessus de la boîte
  const lid = el({
    position: "absolute", inset: "0", transformOrigin: "50% 0%", transformStyle: "preserve-3d",
    transform: "rotateX(180deg)",
  }, box);
  const front = el({
    position: "absolute", inset: "0", borderRadius: `${radius}px`, backfaceVisibility: "hidden",
    background: "linear-gradient(145deg, #fffaf2, #f3e3cc)", border: "3px solid #e2c49a",
    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: `${size * 0.04}px`,
    boxShadow: "inset 0 0 0 6px #fffaf2, inset 0 0 0 8px #d9281c",
  }, lid);
  const logo = document.createElement("img");
  logo.src = "/brand/logo.webp";
  logo.alt = "";
  Object.assign(logo.style, {
    width: `${size * 0.36}px`, height: `${size * 0.36}px`, borderRadius: "9999px", background: "#fff",
    boxShadow: "0 0 0 3px #d9281c",
  });
  front.appendChild(logo);
  const brand = el({
    fontFamily: "inherit", fontWeight: "900", letterSpacing: "0.08em", color: "#d9281c",
    fontSize: `${Math.max(11, size * 0.075)}px`, textTransform: "uppercase",
  }, front);
  brand.textContent = "Houcine Chapati";
  el({
    position: "absolute", inset: "0", borderRadius: `${radius}px`, backfaceVisibility: "hidden",
    transform: "rotateX(180deg)", background: "linear-gradient(145deg, #e6bb82, #d4a266)",
    boxShadow: "inset 0 0 0 3px rgb(0 0 0 / 0.06)",
  }, lid);

  document.body.appendChild(box);
  source.style.visibility = "hidden";

  let t = 0;
  // 1. La boîte ouverte apparaît sous le plat
  base.animate([{ opacity: 0, transform: "scale(0.6)" }, { opacity: 1, transform: "scale(1)" }],
    { duration: T.open, easing: "cubic-bezier(0.34, 1.56, 0.64, 1)", fill: "both" });
  lid.animate([{ opacity: 0 }, { opacity: 1 }], { duration: T.open, fill: "both" });
  t += T.open;
  // 2. Le plat descend dans la boîte
  const fit = (size * 0.8) / rect.width;
  dish.animate(
    [{ transform: "translateY(0) scale(1)" }, { transform: `translateY(${-size * 0.06}px) scale(${fit * 1.08})`, offset: 0.4 },
      { transform: `translateY(0) scale(${fit})` }],
    { duration: T.drop, delay: t, easing: "cubic-bezier(0.45, 0, 0.55, 1)", fill: "both" },
  );
  t += T.drop;
  // 3. Le couvercle se referme
  lid.animate([{ transform: "rotateX(180deg)" }, { transform: "rotateX(0deg)" }],
    { duration: T.close, delay: t, easing: "cubic-bezier(0.55, 0, 0.35, 1.25)", fill: "forwards" });
  t += T.close;
  // 4. Petit tassement de la boîte fermée
  box.animate([{ transform: "scale(1)" }, { transform: "scale(1.06, 0.94)" }, { transform: "scale(1)" }],
    { duration: T.squash, delay: t, easing: "ease-out" });
  t += T.squash;

  window.setTimeout(() => {
    onPacked();
    // le plat d'origine réapparaît (cas du menu en assiettes, qui reste affiché)
    source.style.visibility = "";
    // 5. La boîte file vers le bouton panier (visible une fois la fiche fermée)
    window.setTimeout(() => {
      const target = document.querySelector("[data-cart-target]")?.getBoundingClientRect();
      const done = () => {
        box.remove();
        bumpCart();
      };
      if (!target) {
        box.animate([{ opacity: 1 }, { opacity: 0, transform: "scale(0.6)" }], { duration: 300, fill: "forwards" })
          .finished.then(done, done);
        return;
      }
      const dx = target.left + target.width / 2 - cx;
      const dy = target.top + target.height / 2 - cy;
      const end = 34 / size;
      box.animate(
        [
          { transform: "translate(0, 0) scale(1) rotate(0deg)" },
          { transform: `translate(${dx * 0.3}px, ${dy * 0.3 - 70}px) scale(0.6) rotate(-8deg)`, offset: 0.4 },
          { transform: `translate(${dx}px, ${dy}px) scale(${end}) rotate(-14deg)`, opacity: 0.85 },
        ],
        { duration: T.fly, easing: "cubic-bezier(0.45, 0, 0.55, 1)", fill: "forwards" },
      ).finished.then(done, done);
    }, T.pause);
  }, t);
}
