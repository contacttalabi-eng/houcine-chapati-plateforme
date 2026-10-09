import {
  Button, DEFAULT_WILAYA, Field, Input, Select, TIZI_OUZOU_COMMUNES, Textarea, WILAYAS, cx,
  errorMessage, formatDA, geoErrorMessage, getCurrentPosition, navigate, normalizeDzPhone,
  placeOrder, toast, type LatLng,
} from "@hc/shared";
import { LocationPicker } from "@hc/shared/maps";
import { CircleCheck, MapPin } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Section, TopBar } from "../components/ui";
import { rememberOrder, useCart } from "../state/cart";
import { ensureGuestSession } from "../state/guest";
import { useMenu } from "../state/menu";
import { TotalsBlock } from "./CartPage";

interface Draft {
  name: string;
  phone: string;
  address: string;
  wilaya: string;
  commune: string;
  additional_info: string;
  delivery_instructions: string;
}

type Errors = Partial<Record<keyof Draft | "location", string>>;

const EMPTY: Draft = {
  name: "", phone: "", address: "", wilaya: DEFAULT_WILAYA, commune: "", additional_info: "", delivery_instructions: "",
};

/** Ancien brouillon des coordonnées : plus rien n'est gardé sur le téléphone, on efface ce qui restait. */
function forgetOldDraft() {
  try {
    localStorage.removeItem("hc-coordonnees");
  } catch {
    // stockage indisponible
  }
}

function validate(draft: Draft, location: LatLng | null, confirmed: boolean): Errors {
  const errors: Errors = {};
  if (draft.name.trim().length < 2) errors.name = "Indiquez votre nom.";
  if (!normalizeDzPhone(draft.phone)) errors.phone = "Numéro mobile invalide (05, 06 ou 07 + 8 chiffres).";
  if (draft.address.trim().length < 5) errors.address = "Indiquez une adresse complète.";
  if (!draft.wilaya) errors.wilaya = "Choisissez votre wilaya.";
  if (draft.commune.trim().length < 2) errors.commune = "Indiquez votre commune.";
  if (!location) errors.location = "Indiquez votre position : bouton GPS ou toucher la carte.";
  else if (!confirmed) errors.location = "Vérifiez le marqueur puis confirmez votre position.";
  return errors;
}

export function CheckoutPage() {
  const { summary, clear } = useCart();
  const { settings } = useMenu();
  // Pas de compte client : les coordonnées sont saisies à chaque commande et ne sont pas gardées.
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [location, setLocation] = useState<LatLng | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [recenter, setRecenter] = useState(0);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (summary.lines.length === 0 && !submitting) navigate("/", { replace: true });
  }, [summary.lines.length, submitting]);

  useEffect(forgetOldDraft, []);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const moveTo = (point: LatLng) => {
    setLocation(point);
    setConfirmed(false);
    setErrors((e) => ({ ...e, location: undefined }));
  };

  const useMyPosition = async () => {
    setLocating(true);
    setGeoError(null);
    try {
      const fix = await getCurrentPosition();
      moveTo({ lat: fix.lat, lng: fix.lng });
      setAccuracy(fix.accuracy);
      setRecenter((n) => n + 1);
    } catch (error) {
      setGeoError(geoErrorMessage(error));
    } finally {
      setLocating(false);
    }
  };

  const restaurant: LatLng = settings?.latitude != null && settings.longitude != null
    ? { lat: settings.latitude, lng: settings.longitude }
    : { lat: 36.7169, lng: 4.0497 }; // cadrage par défaut : Tizi Ouzou

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const found = validate(draft, location, confirmed);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      const first = Object.keys(found)[0];
      document.querySelector(`[data-field="${first}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (summary.blocked || summary.lines.length === 0) {
      navigate("/panier");
      return;
    }
    setSubmitting(true);
    try {
      await ensureGuestSession();
      const placed = await placeOrder({
        ...draft,
        phone: normalizeDzPhone(draft.phone)!,
        latitude: location!.lat,
        longitude: location!.lng,
        items: summary.lines.map((l) => ({ product_id: l.productId, quantity: l.quantity, option_ids: l.optionIds })),
      });
      try {
        sessionStorage.setItem("hc-commande-envoyee", placed.id);
      } catch {
        // stockage indisponible
      }
      rememberOrder(placed.id);
      clear();
      navigate(`/suivi/${placed.id}`, { replace: true });
    } catch (error) {
      toast.error(errorMessage(error));
      setSubmitting(false);
    }
  };

  const closed = settings !== null && !settings.accepting_orders;

  return (
    <div className="min-h-dvh pb-32 lg:pb-10">
      <TopBar back="/panier" />
      <form onSubmit={submit} noValidate className="mx-auto grid max-w-5xl gap-5 px-4 pt-6 lg:grid-cols-[1fr_360px]">
        <div className="flex flex-col gap-5">
          <h1 className="font-display text-3xl uppercase tracking-wide">Commander</h1>

          <Section title="Vos coordonnées">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nom" required error={errors.name}>
                {(p) => <Input {...p} data-field="name" autoComplete="name" value={draft.name}
                  onChange={(e) => set("name", e.target.value)} placeholder="Votre nom" maxLength={80} />}
              </Field>
              <Field label="Téléphone" required error={errors.phone} hint="Le livreur vous appellera sur ce numéro.">
                {(p) => <Input {...p} data-field="phone" type="tel" inputMode="tel" autoComplete="tel" value={draft.phone}
                  onChange={(e) => set("phone", e.target.value)} placeholder="05 55 12 34 56" maxLength={20} />}
              </Field>
            </div>
          </Section>

          <Section title="Adresse de livraison">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Adresse" required error={errors.address} className="sm:col-span-2">
                {(p) => <Input {...p} data-field="address" autoComplete="street-address" value={draft.address}
                  onChange={(e) => set("address", e.target.value)} placeholder="Rue, quartier, cité, numéro…" maxLength={300} />}
              </Field>
              <Field label="Wilaya" required error={errors.wilaya}>
                {(p) => (
                  <Select {...p} data-field="wilaya" value={draft.wilaya} onChange={(e) => set("wilaya", e.target.value)}>
                    {WILAYAS.map((w) => <option key={w.code} value={w.name}>{String(w.code).padStart(2, "0")} — {w.name}</option>)}
                  </Select>
                )}
              </Field>
              <Field label="Commune" required error={errors.commune}>
                {(p) => (
                  <>
                    <Input {...p} data-field="commune" value={draft.commune} list="communes" autoComplete="address-level2"
                      onChange={(e) => set("commune", e.target.value)} placeholder="Ex. Tizi Ouzou" maxLength={80} />
                    {draft.wilaya === DEFAULT_WILAYA && (
                      <datalist id="communes">{TIZI_OUZOU_COMMUNES.map((c) => <option key={c} value={c} />)}</datalist>
                    )}
                  </>
                )}
              </Field>
              <Field label="Informations supplémentaires" className="sm:col-span-2" hint="Une précision sur la commande (ex. sans oignons, bien cuit…).">
                {(p) => <Textarea {...p} value={draft.additional_info} maxLength={500}
                  onChange={(e) => set("additional_info", e.target.value)} rows={2} />}
              </Field>
            </div>
          </Section>

          <Section title={<span className="flex items-center gap-2"><MapPin className="size-5 text-accent" /> Position de livraison</span>}>
            <div data-field="location" className="flex flex-col gap-3">
              <Button variant={location ? "secondary" : "primary"} size="lg" full loading={locating} onClick={useMyPosition}>
                📍 Utiliser ma position actuelle
              </Button>
              {geoError && <p className="rounded-xl bg-amber/10 px-3 py-2 text-sm font-semibold text-warning" role="alert">{geoError}</p>}
              <LocationPicker value={location} onChange={moveTo} initialCenter={restaurant} recenterSignal={recenter}
                className="h-72 sm:h-80" />
              {location ? (
                <>
                  <p className="text-sm text-fg-muted">
                    Déplacez le marqueur 🏠 exactement sur votre porte si nécessaire.
                    {accuracy != null && accuracy > 80 && (
                      <span className="font-semibold text-warning"> Précision GPS faible (± {Math.round(accuracy)} m) : vérifiez bien.</span>
                    )}
                  </p>
                  <button type="button" onClick={() => { setConfirmed(true); setErrors((e) => ({ ...e, location: undefined })); }}
                    aria-pressed={confirmed}
                    className={cx("flex min-h-13 items-center justify-center gap-2 rounded-2xl border-2 px-4 font-extrabold transition",
                      confirmed ? "border-emerald-500 bg-emerald-500/15 text-success" : "border-flame text-accent hover:bg-flame/10")}>
                    {confirmed ? <><CircleCheck className="size-5" /> Position confirmée</> : "Je confirme cette position"}
                  </button>
                </>
              ) : null}
              {errors.location && <p className="text-sm font-semibold text-danger" role="alert">{errors.location}</p>}
            </div>
          </Section>

          <Section title="Instructions pour le livreur">
            <Field label="Instructions" hint="Étage, bâtiment, couleur du portail, point de repère…">
              {(p) => <Textarea {...p} value={draft.delivery_instructions} maxLength={500} rows={3}
                onChange={(e) => set("delivery_instructions", e.target.value)}
                placeholder="Ex. 3e étage, bâtiment B, à côté de la pharmacie" />}
            </Field>
          </Section>
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-3xl border border-line bg-surface card-shadow p-5">
            <h2 className="mb-3 text-lg font-extrabold">Ma commande</h2>
            <ul className="mb-4 flex flex-col gap-2 text-sm">
              {summary.lines.map((l) => (
                <li key={l.key} className="flex gap-2">
                  <span className="font-extrabold text-accent">{l.quantity}×</span>
                  <span className="flex-1">
                    {l.product?.name}
                    {l.options.length > 0 && <span className="block text-xs text-fg-muted">{l.options.map((o) => o.name).join(" · ")}</span>}
                  </span>
                  <span className="tabular-nums">{formatDA(l.total)}</span>
                </li>
              ))}
            </ul>
            <TotalsBlock subtotal={summary.subtotal} deliveryFee={summary.deliveryFee} total={summary.total} />
            {closed && (
              <p className="mt-3 rounded-xl bg-red-500/10 px-3 py-2 text-sm font-semibold text-danger">
                Le restaurant ne prend pas de commandes pour le moment.
              </p>
            )}
            <div className="mt-5 hidden lg:block">
              <Button type="submit" size="lg" full loading={submitting} disabled={closed}>
                Commander · {formatDA(summary.total)}
              </Button>
            </div>
          </div>
        </aside>

        {/* Bouton principal toujours accessible au pouce sur téléphone */}
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/95 px-4 pt-3 backdrop-blur-md safe-bottom lg:hidden">
          <Button type="submit" size="lg" full loading={submitting} disabled={closed}>
            Commander · {formatDA(summary.total)}
          </Button>
        </div>
      </form>
    </div>
  );
}
