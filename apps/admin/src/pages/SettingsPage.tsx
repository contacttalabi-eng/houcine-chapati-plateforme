import {
  Button, Card, Field, Input, Spinner, Switch, errorMessage, geoErrorMessage, getCurrentPosition, toast,
  updateSettings, type LatLng, type RestaurantSettings,
} from "@hc/shared";
import { LocationPicker } from "@hc/shared/maps";
import { LocateFixed } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { PageTitle } from "../components/Shell";
import { useAdmin } from "../state/admin";

const num = (v: string): number | null => (v.trim() === "" ? null : Number(v));

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="p-5">
      <h2 className="mb-4 text-lg font-extrabold">{title}</h2>
      <div className="flex flex-col gap-4">{children}</div>
    </Card>
  );
}

export function SettingsPage() {
  const { settings, setSettings } = useAdmin();
  const [form, setForm] = useState<RestaurantSettings | null>(settings);
  const [money, setMoney] = useState({ fee: "", free: "", min: "", radius: "" });
  const [recenter, setRecenter] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!settings || form) return;
    setForm(settings);
  }, [settings, form]);

  useEffect(() => {
    if (!form) return;
    setMoney({
      fee: String(form.delivery_fee),
      free: form.free_delivery_threshold?.toString() ?? "",
      min: String(form.min_order_amount),
      radius: form.delivery_radius_km?.toString() ?? "",
    });
    // initialisation unique
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form?.id]);

  if (!form) return <Spinner />;
  const set = <K extends keyof RestaurantSettings>(k: K, v: RestaurantSettings[K]) => setForm({ ...form, [k]: v });
  const position: LatLng | null = form.latitude != null && form.longitude != null ? { lat: form.latitude, lng: form.longitude } : null;

  const save = async () => {
    const fee = num(money.fee) ?? 0;
    const free = num(money.free);
    const min = num(money.min) ?? 0;
    const radius = num(money.radius);
    if ([fee, free ?? 0, min].some((n) => !Number.isInteger(n) || n < 0)) return toast.error("Montants invalides (nombres entiers en DA).");
    if (radius !== null && (!(radius > 0) || radius > 500)) return toast.error("Rayon invalide (en km).");
    setSaving(true);
    try {
      const patch = {
        name: form.name.trim() || "Houcine Chapati", phone: form.phone?.trim() || null, address: form.address?.trim() || null,
        latitude: form.latitude, longitude: form.longitude, accepting_orders: form.accepting_orders,
        delivery_fee: fee, free_delivery_threshold: free, min_order_amount: min, delivery_radius_km: radius,
        share_driver_location: form.share_driver_location,
      };
      await updateSettings(patch);
      setSettings({ ...form, ...patch });
      toast.success("Réglages enregistrés");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageTitle title="Réglages" actions={<Button size="lg" loading={saving} onClick={save}>Enregistrer</Button>} />
      <div className="grid gap-6 xl:grid-cols-2">
        <div className="flex flex-col gap-6">
          <Block title="Commandes">
            <Switch checked={form.accepting_orders} onChange={(v) => set("accepting_orders", v)} label="Accepter les commandes en ligne"
              description="Désactivez pendant la fermeture ou en cas de rush." />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Frais de livraison (DA)">{(p) => <Input {...p} type="number" min={0} value={money.fee} onChange={(e) => setMoney({ ...money, fee: e.target.value })} />}</Field>
              <Field label="Livraison offerte dès (DA)" hint="Vide = jamais offerte.">
                {(p) => <Input {...p} type="number" min={0} value={money.free} onChange={(e) => setMoney({ ...money, free: e.target.value })} />}
              </Field>
              <Field label="Minimum de commande (DA)">{(p) => <Input {...p} type="number" min={0} value={money.min} onChange={(e) => setMoney({ ...money, min: e.target.value })} />}</Field>
              <Field label="Rayon de livraison (km)" hint="Vide = pas de limite. Calculé depuis la position du restaurant.">
                {(p) => <Input {...p} type="number" min={0} step="0.5" value={money.radius} onChange={(e) => setMoney({ ...money, radius: e.target.value })} />}
              </Field>
            </div>
          </Block>
          <Block title="Restaurant">
            <Field label="Nom">{(p) => <Input {...p} value={form.name} onChange={(e) => set("name", e.target.value)} />}</Field>
            <Field label="Téléphone (affiché aux clients)">{(p) => <Input {...p} type="tel" value={form.phone ?? ""} onChange={(e) => set("phone", e.target.value)} />}</Field>
            <Field label="Adresse">{(p) => <Input {...p} value={form.address ?? ""} onChange={(e) => set("address", e.target.value)} />}</Field>
          </Block>
          <Block title="Suivi du livreur">
            <Switch checked={form.share_driver_location} onChange={(v) => set("share_driver_location", v)}
              label="Montrer la position du livreur au client"
              description="Pendant « Livreur en route », le client voit le livreur sur une carte (rafraîchie toutes les 20 s)." />
          </Block>
        </div>
        <Block title="Position du restaurant">
          <p className="text-sm text-fg-muted">
            Point de départ des itinéraires et centre de la zone de livraison. Touchez la carte ou déplacez le marqueur.
          </p>
          <Button variant="secondary" icon={<LocateFixed className="size-4" />} onClick={async () => {
            try {
              const fix = await getCurrentPosition();
              setForm({ ...form, latitude: fix.lat, longitude: fix.lng });
              setRecenter((n) => n + 1);
            } catch (e) {
              toast.error(geoErrorMessage(e));
            }
          }}>
            Utiliser ma position actuelle (si je suis au restaurant)
          </Button>
          <LocationPicker value={position} onChange={(p) => setForm({ ...form, latitude: p.lat, longitude: p.lng })}
            initialCenter={position ?? { lat: 36.7169, lng: 4.0497 }} recenterSignal={recenter} className="h-96" />
          {position && <p className="text-xs text-fg-muted">GPS : {position.lat.toFixed(6)}, {position.lng.toFixed(6)}</p>}
        </Block>
      </div>
    </>
  );
}
