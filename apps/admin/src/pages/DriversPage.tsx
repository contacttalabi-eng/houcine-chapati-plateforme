import {
  Button, ButtonLink, Card, ConfirmSheet, DriverStatusBadge, EmptyState, Field, Input, Sheet, StatusBadge, Switch,
  createDriverAccount, cx, decideDriverApplication, errorMessage, formatPhone, formatTime,
  normalizeDzPhone, setDriverPassword, telHref, timeAgo, toast, updateDriver,
  type Driver, type DriverApplication, type DriverStatus,
} from "@hc/shared";
import { Bike, Check, KeyRound, Pencil, Phone, Plus, ShieldCheck, UserPlus, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import { PageTitle } from "../components/Shell";
import { useAdmin } from "../state/admin";

function NewDriverSheet({ onClose }: { onClose: () => void }) {
  const { refreshDrivers } = useAdmin();
  const [form, setForm] = useState({ name: "", phone: "", email: "", password: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const found: Record<string, string> = {};
    if (form.name.trim().length < 2) found.name = "Nom requis.";
    if (!normalizeDzPhone(form.phone)) found.phone = "Numéro mobile invalide.";
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim())) found.email = "Email invalide.";
    if (form.password.length < 8) found.password = "8 caractères minimum.";
    setErrors(found);
    if (Object.keys(found).length) return;
    setSaving(true);
    try {
      await createDriverAccount({ ...form, phone: normalizeDzPhone(form.phone)!, email: form.email.trim().toLowerCase() });
      await refreshDrivers();
      toast.success(`Livreur ${form.name} créé. Il peut se connecter avec ${form.email}.`);
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open onClose={onClose} title="Ajouter un livreur" subtitle="Crée son compte de connexion à l'application livreur."
      footer={<Button type="submit" form="new-driver" size="lg" full loading={saving}>Créer le livreur</Button>}>
      <form id="new-driver" onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <Field label="Nom" required error={errors.name}>{(p) => <Input {...p} value={form.name} onChange={(e) => set("name", e.target.value)} />}</Field>
        <Field label="Téléphone" required error={errors.phone}>{(p) => <Input {...p} type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="0661 00 00 00" />}</Field>
        <Field label="Email (identifiant de connexion)" required error={errors.email}>
          {(p) => <Input {...p} type="email" autoComplete="off" value={form.email} onChange={(e) => set("email", e.target.value)} />}
        </Field>
        <Field label="Mot de passe provisoire" required error={errors.password} hint="À communiquer au livreur ; 8 caractères minimum.">
          {(p) => <Input {...p} type="text" autoComplete="new-password" value={form.password} onChange={(e) => set("password", e.target.value)} />}
        </Field>
      </form>
    </Sheet>
  );
}

function EditDriverSheet({ driver, onClose }: { driver: Driver; onClose: () => void }) {
  const { refreshDrivers, orders } = useAdmin();
  const [name, setName] = useState(driver.name);
  const [phone, setPhone] = useState(driver.phone);
  const [active, setActive] = useState(driver.active);
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const busy = orders.some((o) => o.driver_id === driver.id && (o.status === "ASSIGNED" || o.status === "OUT_FOR_DELIVERY"));

  const save = async () => {
    const normalized = normalizeDzPhone(phone);
    if (name.trim().length < 2 || !normalized) {
      toast.error("Nom ou téléphone invalide.");
      return;
    }
    setSaving(true);
    try {
      await updateDriver(driver.id, { name: name.trim(), phone: normalized, active });
      if (password) {
        if (password.length < 8) throw new Error("Le mot de passe doit faire 8 caractères minimum.");
        await setDriverPassword(driver.id, password);
      }
      await refreshDrivers();
      toast.success("Livreur mis à jour");
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open onClose={onClose} title={`Modifier ${driver.name}`} subtitle={driver.email ?? undefined}
      footer={<Button size="lg" full loading={saving} onClick={save}>Enregistrer</Button>}>
      <div className="flex flex-col gap-4">
        <Field label="Nom">{(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
        <Field label="Téléphone">{(p) => <Input {...p} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />}</Field>
        <Card className="p-4">
          <Switch checked={active} onChange={setActive} label={active ? "Compte actif" : "Compte désactivé"}
            description="Un livreur désactivé passe hors ligne et ne voit plus aucune commande." />
          {!active && busy && <p className="mt-2 text-sm font-bold text-orange-600">⚠ Ce livreur a des livraisons en cours : réassignez-les.</p>}
        </Card>
        <Field label="Nouveau mot de passe (facultatif)" hint="Laisser vide pour ne pas changer.">
          {(p) => (
            <div className="relative">
              <KeyRound className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-fg-muted" />
              <Input {...p} type="text" autoComplete="new-password" className="pl-10" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
          )}
        </Field>
      </div>
    </Sheet>
  );
}

const FILTERS: { key: "ALL" | DriverStatus; label: string }[] = [
  { key: "ALL", label: "Tous" }, { key: "AVAILABLE", label: "Disponibles" }, { key: "BUSY", label: "Occupés" }, { key: "OFFLINE", label: "Hors ligne" },
];

/**
 * Demandes d'inscription des livreurs (code reçu par email + prénom/nom/téléphone),
 * en direct (voir useAdmin). Approuver crée le compte livreur ; refuser le laisse client.
 */
function DriverApplications({ applications, refresh }: { applications: DriverApplication[]; refresh: () => Promise<void> }) {
  const [confirm, setConfirm] = useState<{ app: DriverApplication; approve: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const pending = applications.filter((a) => a.status === "PENDING");
  if (pending.length === 0) return null;

  const decide = async () => {
    if (!confirm) return;
    setBusy(true);
    try {
      await decideDriverApplication(confirm.app.id, confirm.approve);
      toast.success(confirm.approve
        ? `${confirm.app.first_name} ${confirm.app.last_name} est maintenant livreur`
        : "Demande refusée");
      setConfirm(null);
      await refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mb-6 rounded-3xl border-2 border-amber/50 bg-amber/5 p-4" aria-label="Demandes d'inscription">
      <h2 className="mb-3 flex items-center gap-2 text-lg font-extrabold">
        <UserPlus className="size-5 text-amber" /> Demandes d'inscription ({pending.length})
      </h2>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {pending.map((a) => (
          <Card key={a.id} className="p-4">
            <p className="text-lg font-extrabold">{a.first_name} {a.last_name}</p>
            <p className="mt-1 text-sm">📞 {formatPhone(a.phone)}</p>
            <p className="flex items-center gap-1.5 truncate text-sm text-fg-muted">
              <ShieldCheck className="size-4 shrink-0 text-emerald-500" aria-label="Email confirmé" /> {a.email}
            </p>
            <p className="mt-1 text-xs text-fg-muted">Demande envoyée {timeAgo(a.created_at)}</p>
            <div className="mt-3 flex gap-2">
              <Button size="sm" icon={<Check className="size-4" />} onClick={() => setConfirm({ app: a, approve: true })}>Approuver</Button>
              <Button size="sm" variant="outline" icon={<X className="size-4" />} onClick={() => setConfirm({ app: a, approve: false })}>Refuser</Button>
              <ButtonLink href={telHref(a.phone)} size="sm" variant="secondary" icon={<Phone className="size-4" />}>Appeler</ButtonLink>
            </div>
          </Card>
        ))}
      </div>
      <ConfirmSheet open={confirm !== null} onClose={() => setConfirm(null)} loading={busy}
        title={confirm?.approve ? "Approuver ce livreur ?" : "Refuser cette demande ?"}
        confirmLabel={confirm?.approve ? "Oui, approuver" : "Refuser la demande"}
        variant={confirm?.approve ? "success" : "danger"} onConfirm={() => void decide()}>
        {confirm?.approve
          ? <>{confirm.app.first_name} {confirm.app.last_name} pourra se connecter à l'application livreur et recevoir des commandes (adresses et téléphones des clients).</>
          : <>{confirm?.app.first_name} {confirm?.app.last_name} n'aura pas accès à l'application livreur. Il pourra envoyer une nouvelle demande.</>}
      </ConfirmSheet>
    </section>
  );
}

export function DriversPage() {
  const { drivers, orders, driverApplications, refreshApplications } = useAdmin();
  const [filter, setFilter] = useState<"ALL" | DriverStatus>("ALL");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Driver | null>(null);

  const list = drivers
    .filter((d) => filter === "ALL" || (d.active && d.status === filter))
    .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
  const count = (s: DriverStatus) => drivers.filter((d) => d.active && d.status === s).length;

  return (
    <>
      <PageTitle title="Livreurs" subtitle={`${count("AVAILABLE")} disponible(s) · ${count("BUSY")} occupé(s) · ${count("OFFLINE")} hors ligne`}
        actions={<Button icon={<Plus className="size-4" />} onClick={() => setAdding(true)}>Ajouter un livreur</Button>} />

      <DriverApplications applications={driverApplications} refresh={refreshApplications} />

      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button key={f.key} type="button" onClick={() => setFilter(f.key)}
            className={cx("rounded-full px-4 py-2 text-sm font-extrabold", filter === f.key ? "bg-fg text-bg" : "bg-surface-2 text-fg-muted")}>
            {f.label}
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <EmptyState icon={<Bike className="size-7" />} title="Aucun livreur"
          action={filter === "ALL" && <Button onClick={() => setAdding(true)}>Ajouter un livreur</Button>} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {list.map((d) => {
            const current = orders.filter((o) => o.driver_id === d.id && (o.status === "ASSIGNED" || o.status === "OUT_FOR_DELIVERY"));
            return (
              <Card key={d.id} className={cx("p-5", !d.active && "opacity-60")}>
                <div className="flex items-start gap-3">
                  <span className="grid size-12 place-items-center rounded-full bg-surface-2 text-xl font-extrabold">{d.name.slice(0, 1)}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-lg font-extrabold">{d.name}</p>
                    <p className="truncate text-sm text-fg-muted">{d.email}</p>
                  </div>
                  {d.active ? <DriverStatusBadge status={d.status} /> : <span className="rounded-full bg-stone-200 px-2.5 py-0.5 text-xs font-bold text-stone-600">Désactivé</span>}
                </div>
                <p className="mt-3 text-sm">
                  📞 {formatPhone(d.phone)}
                  {d.last_location_update && <span className="text-fg-muted"> · 📍 vu {timeAgo(d.last_location_update)}</span>}
                </p>
                <div className="mt-3">
                  <p className="text-xs font-extrabold uppercase text-fg-muted">Commandes attribuées</p>
                  {current.length === 0 ? <p className="text-sm text-fg-muted">Aucune</p> : (
                    <ul className="mt-1 flex flex-col gap-1">
                      {current.map((o) => (
                        <li key={o.id} className="flex items-center justify-between gap-2 text-sm">
                          <span className="whitespace-nowrap font-mono font-bold">{o.order_number}</span>
                          <span className="truncate text-fg-muted">{o.commune} · {formatTime(o.assigned_at)}</span>
                          <StatusBadge status={o.status} />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="mt-4 flex gap-2">
                  <ButtonLink href={telHref(d.phone)} variant="secondary" size="sm" icon={<Phone className="size-4" />}>Appeler</ButtonLink>
                  <Button variant="outline" size="sm" icon={<Pencil className="size-4" />} onClick={() => setEditing(d)}>Modifier</Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {adding && <NewDriverSheet onClose={() => setAdding(false)} />}
      {editing && <EditDriverSheet driver={editing} onClose={() => setEditing(null)} />}
    </>
  );
}
