import { cx } from "@hc/shared";
import { ArrowRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { PlateCarousel, type PlateItem } from "../components/PlateCarousel";

const DISHES: (PlateItem & { text: string })[] = [
  { id: "pizza", image: "/menu/pizza-ronde.webp", emoji: "🍕", label: "Nos pizzas", text: "Pâte fine, fromage fondant, cuites minute." },
  { id: "bol", image: "/menu/bol-rond.webp", emoji: "🍟", label: "Nos bols", text: "Frites, poulet croustillant et sauce maison." },
  { id: "chapati", image: "/menu/chapati-rond.webp", emoji: "🌯", label: "Nos chapatis", text: "La spécialité de la maison, garnie à votre goût." },
];

/**
 * Écran d'ouverture de l'application. Au lancement, la première assiette sort
 * du « V » de « Vos plats ». On change ensuite de plat en glissant le doigt ou
 * avec les points, en triangle « /\ » (voir PlateCarousel). « Commencer »
 * ouvre le menu ; aucun compte n'est demandé.
 */
export function WelcomePage({ onStart }: { onStart: () => void }) {
  const [index, setIndex] = useState(0);
  const [dir, setDir] = useState<1 | -1>(1);
  const letterV = useRef<HTMLSpanElement>(null);

  // Barre du navigateur du téléphone en vert, comme le fond, le temps de l'écran d'ouverture
  useEffect(() => {
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    const previous = meta?.content;
    meta?.setAttribute("content", "#2f9440");
    return () => {
      if (meta && previous) meta.setAttribute("content", previous);
    };
  }, []);

  const goTo = (next: number, direction: 1 | -1 = next > index ? 1 : -1) => {
    if (next === index) return;
    setDir(direction);
    setIndex(next);
  };

  const dish = DISHES[index]!;

  return (
    <div className="relative flex min-h-dvh flex-col items-center overflow-hidden bg-welcome pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))] text-center text-white">
      <div className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-white/10" aria-hidden />
      <div className="pointer-events-none absolute -bottom-32 -left-24 size-80 rounded-full bg-black/10" aria-hidden />

      <div className="relative flex items-center gap-2.5 px-6">
        <img src="/brand/logo.webp" alt="" width={40} height={40} className="size-10 rounded-full bg-white ring-2 ring-white/60" />
        <span className="font-display text-2xl uppercase leading-none tracking-wide">Houcine Chapati</span>
      </div>

      <div className="relative flex w-full max-w-md flex-1 flex-col justify-center gap-6 py-6">
        {/* Zone où l'on glisse le doigt pour changer de plat */}
        <PlateCarousel items={DISHES} index={index} direction={dir} onChange={goTo} anchorRef={letterV} riseOnMount
          label="Nos plats" className="py-2" sizeClass="size-[min(74vw,36dvh,20rem)]" />

        <div className="relative z-10 flex justify-center gap-2" role="group" aria-label="Choisir un plat">
          {DISHES.map((d, i) => (
            <button key={d.id} type="button" onClick={() => goTo(i)} aria-label={d.label} aria-current={i === index}
              className={cx("h-2.5 rounded-full transition-all", i === index ? "w-7 bg-white" : "w-2.5 bg-white/45 hover:bg-white/70")} />
          ))}
        </div>

        {/* Texte au-dessus des assiettes : la première sort de derrière le « V » */}
        <div className="relative z-10 px-6">
          <p className="text-sm font-extrabold uppercase tracking-[0.18em] text-white/80" aria-live="polite">{dish.label}</p>
          <h1 className="mt-2 text-[1.75rem] font-extrabold leading-tight sm:text-3xl">
            <span ref={letterV}>V</span>os plats préférés,<br />livrés chez vous
          </h1>
          <p className="mx-auto mt-2 max-w-xs text-[15px] leading-relaxed text-white/85">{dish.text}</p>
        </div>
      </div>

      <div className="relative z-10 flex w-full max-w-md flex-col gap-3 px-6">
        <button type="button" onClick={onStart}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-white text-lg font-extrabold text-welcome shadow-xl shadow-black/20 transition hover:bg-white/90 active:scale-[.98]">
          Commencer <ArrowRight className="size-5" strokeWidth={2.5} />
        </button>
        <p className="text-xs text-white/75">Sans compte : votre numéro et votre position vous seront demandés à la commande.</p>
      </div>
    </div>
  );
}
