import { useEffect } from "react";

/**
 * Couleur de la barre d'état (heure, batterie) quand l'app est ajoutée à
 * l'écran d'accueil de l'iPhone : iOS la lit dans <meta name="theme-color">
 * et choisit seul un texte noir ou blanc lisible. Le thème fixe une couleur de
 * base ; un écran plein (accueil vert, couverture jaune fluo…) la remplace
 * tant qu'il est affiché, pour que l'app semble prendre tout l'écran.
 */
let base: string | null = null;
const overrides: string[] = [];

function apply() {
  const color = overrides.at(-1) ?? base;
  if (color) document.querySelector('meta[name="theme-color"]')?.setAttribute("content", color);
}

export function setBaseStatusBarColor(color: string) {
  base = color;
  apply();
}

export function useStatusBarColor(color: string) {
  useEffect(() => {
    overrides.push(color);
    apply();
    return () => {
      const i = overrides.lastIndexOf(color);
      if (i >= 0) overrides.splice(i, 1);
      apply();
    };
  }, [color]);
}
