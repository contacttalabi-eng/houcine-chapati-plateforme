import { ProductBrowser } from "../components/catalog";
import { PageHeader } from "../components/ui";

/** Onglet Recherche : le catalogue avec le champ de recherche actif dès l'ouverture. */
export function SearchPage() {
  return (
    <div className="min-h-dvh pb-nav">
      <PageHeader title="Recherche" subtitle="Tout le menu Houcine Chapati" />
      <main className="mx-auto max-w-5xl px-4 pt-4">
        <ProductBrowser autoFocusSearch />
      </main>
    </div>
  );
}
