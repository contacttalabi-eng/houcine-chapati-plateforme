import { cx, formatDA, selectionProblem, unitPrice, type OptionGroup, type Product, type ProductOption } from "@hc/shared";
import { Check } from "lucide-react";
import { useLayoutEffect, useMemo, useState, type ChangeEvent } from "react";

/**
 * Choix d'un plat (taille + suppléments) : état, prix, et les éléments
 * d'interface communs à la fiche produit et au menu en assiettes.
 */

function defaultSelection(product: Product): string[] {
  // Taille obligatoire : la première option disponible est présélectionnée
  return product.groups
    .filter((g) => g.required && g.selection === "SINGLE")
    .flatMap((g) => g.options.find((o) => o.available)?.id ?? []);
}

export function groupRule(group: OptionGroup): string {
  if (group.selection === "SINGLE") return group.required ? "Obligatoire · 1 choix" : "Facultatif · 1 choix";
  if (group.max_select) return `${group.required ? "Obligatoire" : "Facultatif"} · ${group.max_select} max`;
  return group.required ? "Obligatoire" : "Facultatif";
}

/** Icône de chaque supplément, d'après son nom. */
const TOPPING_ICONS: [RegExp, string][] = [
  [/frite/i, "🍟"],
  [/champignon/i, "🍄"],
  [/olive/i, "🫒"],
  [/tomate/i, "🍅"],
  [/oignon/i, "🧅"],
  [/poivron/i, "🫑"],
  [/thon|œuf|oeuf/i, "🥚"],
  [/salami|jambon|merguez|pepperoni/i, "🥓"],
  [/poulet/i, "🍗"],
  [/viande|steak|kebab|abat/i, "🥩"],
  [/fromage|cheddar|mozza|gruy|camembert|kiri|emmental|ch[eè]vre/i, "🧀"],
  [/sauce|ketchup|mayo|harissa/i, "🥫"],
];

export function toppingIcon(name: string): string {
  return TOPPING_ICONS.find(([re]) => re.test(name))?.[1] ?? "✨";
}

/**
 * Trois emplacements (en % du plat) où un supplément se pose : répartis
 * autour du centre, différents pour chaque supplément.
 */
function toppingSpots(index: number): { x: number; y: number }[] {
  return [0, 1, 2].map((k) => {
    const angle = ((index * 137.5 + k * 120) * Math.PI) / 180;
    const radius = 15 + ((index + k) % 3) * 9;
    return { x: 50 + Math.cos(angle) * radius, y: 50 + Math.sin(angle) * radius };
  });
}

interface Flight {
  id: string;
  from: DOMRect;
  icon: string;
  n: number;
}

/** État du choix d'un plat ; repart des valeurs par défaut quand le plat change. */
export function useProductChoice(product: Product) {
  const [state, setState] = useState(() => ({ productId: product.id, selected: defaultSelection(product) }));
  const [flight, setFlight] = useState<Flight | null>(null);
  let selected = state.selected;
  if (state.productId !== product.id) {
    selected = defaultSelection(product);
    setState({ productId: product.id, selected });
  }

  const chosen = useMemo(
    () => product.groups.flatMap((g) => g.options).filter((o) => selected.includes(o.id)),
    [product, selected],
  );
  const unit = unitPrice(product, chosen);
  const problem = selectionProblem(product, selected);
  // Choix unique obligatoire (taille…) : boutons ; le reste (suppléments) : icônes
  const sizeGroups = product.groups.filter((g) => g.required && g.selection === "SINGLE");
  const extraGroups = product.groups.filter((g) => !sizeGroups.includes(g));
  const extraOptions = extraGroups.flatMap((g) => g.options);

  // Taille choisie : le plat grandit un peu (Mini → Mega)
  const sizeGroup = sizeGroups[0];
  const sizeIndex = sizeGroup ? Math.max(0, sizeGroup.options.findIndex((o) => selected.includes(o.id))) : 0;
  const plateScale = sizeGroup && sizeGroup.options.length > 1 ? 0.84 + (0.16 * sizeIndex) / (sizeGroup.options.length - 1) : 1;

  const toggle = (group: OptionGroup, optionId: string) => {
    setState((s) => {
      const current = s.selected;
      const inGroup = new Set(group.options.map((o) => o.id));
      let next = current;
      if (group.selection === "SINGLE") next = [...current.filter((id) => !inGroup.has(id)), optionId];
      else if (current.includes(optionId)) next = current.filter((id) => id !== optionId);
      else if (!group.max_select || current.filter((id) => inGroup.has(id)).length < group.max_select) next = [...current, optionId];
      return { ...s, selected: next };
    });
  };

  /** Supplément touché : il s'envole depuis son icône pour se poser sur le plat. */
  const toggleExtra = (group: OptionGroup, option: ProductOption, e: ChangeEvent<HTMLInputElement>) => {
    const adding = !selected.includes(option.id);
    toggle(group, option.id);
    if (!adding) return;
    const icon = e.currentTarget.closest("label")?.querySelector("[data-topping-icon]");
    if (icon) setFlight((f) => ({ id: option.id, from: icon.getBoundingClientRect(), icon: toppingIcon(option.name), n: (f?.n ?? 0) + 1 }));
  };

  const reset = () => setState({ productId: product.id, selected: defaultSelection(product) });

  useLayoutEffect(() => {
    if (!flight) return;
    const spot = document.querySelector(`[data-topping="${flight.id}"]`);
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (!spot || reduced) return;
    const to = spot.getBoundingClientRect();
    const ghost = document.createElement("span");
    ghost.textContent = flight.icon;
    ghost.setAttribute("aria-hidden", "true");
    ghost.setAttribute("data-topping-flight", "");
    Object.assign(ghost.style, {
      position: "fixed", left: `${flight.from.left}px`, top: `${flight.from.top}px`, width: `${flight.from.width}px`,
      height: `${flight.from.height}px`, display: "grid", placeItems: "center", fontSize: `${flight.from.height * 0.62}px`,
      zIndex: "60", pointerEvents: "none", filter: "drop-shadow(0 6px 8px rgb(0 0 0 / 0.35))",
    });
    document.body.appendChild(ghost);
    const dx = to.left + to.width / 2 - (flight.from.left + flight.from.width / 2);
    const dy = to.top + to.height / 2 - (flight.from.top + flight.from.height / 2);
    const end = Math.max(0.4, to.height / flight.from.height);
    const anim = ghost.animate(
      [
        { transform: "translate(0, 0) scale(1) rotate(0deg)" },
        { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 60}px) scale(1.25) rotate(160deg)`, offset: 0.5 },
        { transform: `translate(${dx}px, ${dy}px) scale(${end}) rotate(360deg)` },
      ],
      { duration: 520, easing: "cubic-bezier(0.45, 0, 0.55, 1)", fill: "forwards" },
    );
    const done = () => ghost.remove();
    anim.finished.then(done, done);
    return () => ghost.remove();
  }, [flight]);

  return { selected, toggle, toggleExtra, reset, unit, problem, sizeGroups, extraGroups, extraOptions, plateScale, flightId: flight?.id ?? null };
}

/** Suppléments posés sur le plat (à placer par-dessus la photo ronde). */
export function ToppingLayer({ options, selected, flightId }: { options: ProductOption[]; selected: string[]; flightId: string | null }) {
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      {options.map((option, i) => selected.includes(option.id) && toppingSpots(i).map((p, k) => (
        <span key={`${option.id}-${k}`} {...(k === 0 ? { "data-topping": option.id } : {})}
          className="absolute grid size-[22%] -translate-x-1/2 -translate-y-1/2 place-items-center text-[clamp(1rem,7vw,1.9rem)] drop-shadow-[0_3px_3px_rgb(0_0_0/0.4)] animate-topping-land"
          style={{ left: `${p.x}%`, top: `${p.y}%`, animationDelay: `${(flightId === option.id ? 450 : 0) + k * 90}ms` }}>
          {toppingIcon(option.name)}
        </span>
      )))}
    </div>
  );
}

/** Taille (Mini / Normal / Mega…) : boutons côte à côte. */
export function SizePicker({ groups, selected, onToggle }: {
  groups: OptionGroup[];
  selected: string[];
  onToggle: (group: OptionGroup, optionId: string) => void;
}) {
  return groups.map((group) => (
    <fieldset key={group.id} className="min-w-0">
      <legend className="mb-2 flex w-full items-baseline justify-between gap-2">
        <span className="text-base font-extrabold">{group.name}</span>
        <span className="text-xs font-bold text-accent">{groupRule(group)}</span>
      </legend>
      <div className="grid auto-cols-fr grid-flow-col gap-1 rounded-2xl bg-surface-2 p-1">
        {group.options.map((option) => {
          const isOn = selected.includes(option.id);
          return (
            <label key={option.id}
              className={cx("flex min-h-12 cursor-pointer flex-col items-center justify-center rounded-xl px-2 py-1.5 text-center transition",
                isOn ? "bg-brand text-white shadow-md shadow-brand/30" : "text-fg hover:bg-surface-3",
                !option.available && "cursor-not-allowed opacity-45")}>
              <input type="radio" name={group.id} className="sr-only" checked={isOn} disabled={!option.available}
                onChange={() => onToggle(group, option.id)} />
              <span className="text-sm font-extrabold">{option.name}</span>
              <span className={cx("text-[11px] font-bold", isOn ? "text-white/85" : "text-fg-muted")}>
                {!option.available ? "Épuisé" : option.price_delta > 0 ? `+ ${formatDA(option.price_delta)}` : "inclus"}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  ));
}

/** Suppléments en icônes : un toucher envoie le supplément se poser sur le plat. */
export function SupplementTray({ groups, selected, onToggle, inset = "px-5" }: {
  groups: OptionGroup[];
  selected: string[];
  onToggle: (group: OptionGroup, option: ProductOption, e: ChangeEvent<HTMLInputElement>) => void;
  inset?: string;
}) {
  return groups.map((group) => (
    <fieldset key={group.id} className="min-w-0">
      <legend className={cx("mb-2 flex w-full items-baseline justify-between gap-2", inset)}>
        <span className="text-base font-extrabold">{group.name}</span>
        <span className="text-xs font-bold text-fg-muted">{groupRule(group)}</span>
      </legend>
      <div className={cx("no-scrollbar flex gap-2.5 overflow-x-auto pb-1", inset)}>
        {group.options.map((option) => {
          const isOn = selected.includes(option.id);
          return (
            <label key={option.id}
              className={cx("relative flex w-[4.6rem] shrink-0 cursor-pointer flex-col items-center gap-1 rounded-2xl border-2 px-1 pb-1.5 pt-2 text-center transition active:scale-95",
                isOn ? "border-brand bg-brand/[0.08]" : "border-transparent bg-surface-2",
                !option.available && "cursor-not-allowed opacity-45")}>
              <input type={group.selection === "SINGLE" ? "radio" : "checkbox"} name={group.id} className="sr-only"
                checked={isOn} disabled={!option.available} onChange={(e) => onToggle(group, option, e)} />
              <span data-topping-icon
                className={cx("grid size-11 place-items-center rounded-full bg-surface text-2xl shadow-sm transition", isOn && "scale-90 opacity-60")}
                aria-hidden>
                {toppingIcon(option.name)}
              </span>
              <span className="line-clamp-2 text-[11px] font-bold leading-tight">{option.name}</span>
              <span className="text-[10px] font-bold text-fg-muted">
                {!option.available ? "Épuisé" : option.price_delta > 0 ? `+${formatDA(option.price_delta)}` : "inclus"}
              </span>
              {isOn && (
                <span className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full bg-brand text-white animate-nav-pop" aria-hidden>
                  <Check className="size-3.5" strokeWidth={3} />
                </span>
              )}
            </label>
          );
        })}
      </div>
    </fieldset>
  ));
}

/**
 * Tailles en ronds, sans barre ni titre : le rond grandit avec la taille
 * (Mini → Mega). Le prix de chaque taille est lu par les lecteurs d'écran ;
 * à l'écran, c'est le prix final qui change.
 */
export function SizeCircles({ groups, selected, onToggle }: {
  groups: OptionGroup[];
  selected: string[];
  onToggle: (group: OptionGroup, optionId: string) => void;
}) {
  return groups.map((group) => (
    <fieldset key={group.id} className="min-w-0">
      <legend className="sr-only">{group.name}</legend>
      <div className="flex items-end justify-center gap-4">
        {group.options.map((option, i) => {
          const isOn = selected.includes(option.id);
          const size = 2.9 + i * 0.45;
          const price = !option.available ? "épuisé" : option.price_delta > 0 ? `+ ${formatDA(option.price_delta)}` : "inclus";
          return (
            <label key={option.id} title={`${option.name} · ${price}`} style={{ width: `${size}rem`, height: `${size}rem` }}
              className={cx("grid shrink-0 cursor-pointer place-items-center rounded-full text-[11px] font-extrabold transition active:scale-90",
                isOn ? "scale-105 bg-brand text-white shadow-lg shadow-brand/30" : "bg-surface-2 text-fg-muted hover:text-fg",
                !option.available && "cursor-not-allowed opacity-45")}>
              <input type="radio" name={group.id} className="sr-only" checked={isOn} disabled={!option.available}
                onChange={() => onToggle(group, option.id)} />
              {option.name}
              <span className="sr-only">{price}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  ));
}

/**
 * Suppléments en icônes avec leur nom dessous (sans cadre ni prix) : un
 * toucher envoie le supplément se poser dans l'assiette. Le prix est lu par
 * les lecteurs d'écran ; à l'écran, c'est le prix final qui change.
 */
export function SupplementIcons({ groups, selected, onToggle }: {
  groups: OptionGroup[];
  selected: string[];
  onToggle: (group: OptionGroup, option: ProductOption, e: ChangeEvent<HTMLInputElement>) => void;
}) {
  return groups.map((group) => (
    <fieldset key={group.id} className="min-w-0">
      <legend className="sr-only">{group.name}</legend>
      <div className="no-scrollbar overflow-x-auto">
        <div className="mx-auto flex w-max gap-2 px-4 py-1">
          {group.options.map((option) => {
            const isOn = selected.includes(option.id);
            const price = !option.available ? "épuisé" : option.price_delta > 0 ? `+ ${formatDA(option.price_delta)}` : "inclus";
            return (
              <label key={option.id} title={`${option.name} · ${price}`}
                className={cx("relative flex w-16 shrink-0 cursor-pointer flex-col items-center gap-0.5 transition active:scale-90",
                  !option.available && "cursor-not-allowed opacity-40")}>
                <input type={group.selection === "SINGLE" ? "radio" : "checkbox"} name={group.id} className="sr-only"
                  checked={isOn} disabled={!option.available} onChange={(e) => onToggle(group, option, e)} />
                <span data-topping-icon aria-hidden
                  className={cx("grid size-12 place-items-center text-[2.1rem] leading-none drop-shadow-[0_3px_4px_rgb(0_0_0/0.25)] transition",
                    isOn && "scale-75 opacity-40")}>
                  {toppingIcon(option.name)}
                </span>
                <span className={cx("line-clamp-2 text-center text-[11px] font-bold leading-tight", isOn ? "text-accent" : "text-fg-muted")}>
                  {option.name}
                </span>
                <span className="sr-only">{price}</span>
                {isOn && (
                  <span className="absolute right-1 top-0 grid size-5 place-items-center rounded-full bg-brand text-white animate-nav-pop" aria-hidden>
                    <Check className="size-3.5" strokeWidth={3} />
                  </span>
                )}
              </label>
            );
          })}
        </div>
      </div>
    </fieldset>
  ));
}
