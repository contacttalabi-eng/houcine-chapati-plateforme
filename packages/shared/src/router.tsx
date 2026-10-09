import { useSyncExternalStore, type AnchorHTMLAttributes, type MouseEvent } from "react";

/**
 * Routeur minimal par hash (#/chemin). Avantage : aucun réglage de réécriture
 * d'URL côté hébergeur, les liens de suivi fonctionnent partout.
 */
const subscribe = (callback: () => void) => {
  window.addEventListener("hashchange", callback);
  return () => window.removeEventListener("hashchange", callback);
};
const read = () => decodeURI(window.location.hash.replace(/^#/, "")) || "/";

export function usePath(): string {
  return useSyncExternalStore(subscribe, read, () => "/");
}

export function navigate(path: string, options: { replace?: boolean } = {}) {
  const url = `${window.location.pathname}${window.location.search}#${path}`;
  if (options.replace) {
    window.history.replaceState(null, "", url);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  } else {
    window.location.hash = path;
  }
  window.scrollTo({ top: 0 });
}

/** matchPath("/suivi/:id", "/suivi/abc") → { id: "abc" } */
export function matchPath(pattern: string, path: string): Record<string, string> | null {
  const p = pattern.split("/").filter(Boolean);
  const s = path.split("?")[0]!.split("/").filter(Boolean);
  if (p.length !== s.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < p.length; i++) {
    const part = p[i]!;
    const value = s[i]!;
    if (part.startsWith(":")) params[part.slice(1)] = decodeURIComponent(value);
    else if (part !== value) return null;
  }
  return params;
}

export function Link({ to, onClick, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) {
  return (
    <a
      href={`#${to}`}
      onClick={(e: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(e);
        if (!e.defaultPrevented) window.scrollTo({ top: 0 });
      }}
      {...rest}
    />
  );
}
