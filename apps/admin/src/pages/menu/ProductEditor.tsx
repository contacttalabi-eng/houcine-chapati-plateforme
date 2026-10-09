import {
  Button, ConfirmSheet, Field, Input, Select, Sheet, Switch, Textarea, createProduct, cx, deleteProduct, errorMessage,
  saveProductOptions, toast, updateProduct, uploadMenuImage,
  type MenuCategory, type OptionGroupInput, type OptionSelection, type Product,
} from "@hc/shared";
import { ArrowDown, ArrowUp, ImagePlus, Plus, Trash2 } from "lucide-react";
import { useRef, useState } from "react";

interface Draft {
  name: string;
  description: string;
  price: string;
  category_id: string;
  available: boolean;
  image_url: string | null;
  groups: OptionGroupInput[];
}

const toDraft = (p: Product | null, categoryId: string): Draft => ({
  name: p?.name ?? "",
  description: p?.description ?? "",
  price: p ? String(p.price) : "",
  category_id: p?.category_id ?? categoryId,
  available: p?.available ?? true,
  image_url: p?.image_url ?? null,
  groups: (p?.groups ?? []).map((g) => ({
    id: g.id, name: g.name, selection: g.selection, required: g.required, max_select: g.max_select,
    options: g.options.map((o) => ({ id: o.id, name: o.name, price_delta: o.price_delta, available: o.available })),
  })),
});

const TEMPLATES: Record<string, OptionGroupInput> = {
  Taille: { name: "Taille", selection: "SINGLE", required: true, max_select: null,
    options: [{ name: "Normal", price_delta: 0, available: true }, { name: "Grand", price_delta: 0, available: true }] },
  Suppléments: { name: "Suppléments", selection: "MULTIPLE", required: false, max_select: null,
    options: [{ name: "Fromage", price_delta: 0, available: true }] },
};

function move<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return list;
  const copy = [...list];
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item!);
  return copy;
}

function OptionsEditor({ groups, onChange }: { groups: OptionGroupInput[]; onChange: (g: OptionGroupInput[]) => void }) {
  const patchGroup = (i: number, patch: Partial<OptionGroupInput>) => onChange(groups.map((g, n) => (n === i ? { ...g, ...patch } : g)));
  const patchOption = (gi: number, oi: number, patch: Partial<OptionGroupInput["options"][number]>) =>
    patchGroup(gi, { options: groups[gi]!.options.map((o, n) => (n === oi ? { ...o, ...patch } : o)) });

  return (
    <div className="flex flex-col gap-4">
      {groups.map((g, gi) => (
        <div key={g.id ?? `new-${gi}`} className="rounded-2xl border border-line bg-surface-2/50 p-4">
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Nom du groupe" className="min-w-40 flex-1">
              {(p) => <Input {...p} value={g.name} onChange={(e) => patchGroup(gi, { name: e.target.value })} placeholder="Taille, Suppléments…" />}
            </Field>
            <Field label="Choix">
              {(p) => (
                <Select {...p} value={g.selection} onChange={(e) => patchGroup(gi, { selection: e.target.value as OptionSelection })}>
                  <option value="SINGLE">Un seul</option>
                  <option value="MULTIPLE">Plusieurs</option>
                </Select>
              )}
            </Field>
            {g.selection === "MULTIPLE" && (
              <Field label="Max">
                {(p) => <Input {...p} type="number" min={1} className="w-20" value={g.max_select ?? ""}
                  onChange={(e) => patchGroup(gi, { max_select: e.target.value ? Number(e.target.value) : null })} placeholder="∞" />}
              </Field>
            )}
            <label className="flex h-12 items-center gap-2 text-sm font-bold">
              <input type="checkbox" className="size-5 accent-brand" checked={g.required} onChange={(e) => patchGroup(gi, { required: e.target.checked })} />
              Obligatoire
            </label>
            <div className="ml-auto flex gap-1">
              <Button variant="ghost" size="sm" aria-label="Monter le groupe" onClick={() => onChange(move(groups, gi, gi - 1))}><ArrowUp className="size-4" /></Button>
              <Button variant="ghost" size="sm" aria-label="Descendre le groupe" onClick={() => onChange(move(groups, gi, gi + 1))}><ArrowDown className="size-4" /></Button>
              <Button variant="ghost" size="sm" aria-label="Supprimer le groupe" onClick={() => onChange(groups.filter((_, n) => n !== gi))}>
                <Trash2 className="size-4 text-red-600" />
              </Button>
            </div>
          </div>
          <ul className="mt-3 flex flex-col gap-2">
            {g.options.map((o, oi) => (
              <li key={o.id ?? `new-${oi}`} className="flex flex-wrap items-center gap-2">
                <Input aria-label="Nom de l'option" className="min-w-36 flex-1 py-2" value={o.name} onChange={(e) => patchOption(gi, oi, { name: e.target.value })} />
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-fg-muted">+</span>
                  <Input aria-label="Prix en plus (DA)" type="number" min={0} className="w-28 py-2 pl-6 pr-10" value={o.price_delta}
                    onChange={(e) => patchOption(gi, oi, { price_delta: Math.max(0, Number(e.target.value) || 0) })} />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-fg-muted">DA</span>
                </div>
                <label className="flex items-center gap-1.5 text-sm font-semibold">
                  <input type="checkbox" className="size-4 accent-brand" checked={o.available} onChange={(e) => patchOption(gi, oi, { available: e.target.checked })} />
                  Dispo
                </label>
                <Button variant="ghost" size="sm" aria-label="Supprimer l'option"
                  onClick={() => patchGroup(gi, { options: g.options.filter((_, n) => n !== oi) })}>
                  <Trash2 className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
          <Button variant="ghost" size="sm" className="mt-2" icon={<Plus className="size-4" />}
            onClick={() => patchGroup(gi, { options: [...g.options, { name: "", price_delta: 0, available: true }] })}>
            Ajouter une option
          </Button>
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        {Object.entries(TEMPLATES).map(([label, template]) => (
          <Button key={label} variant="outline" size="sm" icon={<Plus className="size-4" />}
            onClick={() => onChange([...groups, structuredClone(template)])}>
            Groupe « {label} »
          </Button>
        ))}
        <Button variant="outline" size="sm" icon={<Plus className="size-4" />}
          onClick={() => onChange([...groups, { name: "", selection: "MULTIPLE", required: false, max_select: null, options: [] }])}>
          Groupe vide
        </Button>
      </div>
    </div>
  );
}

export function ProductEditor({
  product, categories, defaultCategoryId, onClose, onSaved,
}: {
  product: Product | null;
  categories: MenuCategory[];
  defaultCategoryId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(product, defaultCategoryId));
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const upload = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast.error("Choisissez une image (JPG, PNG, WebP).");
    setUploading(true);
    try {
      set("image_url", await uploadMenuImage(file));
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    const price = Number(draft.price);
    if (!draft.name.trim()) return toast.error("Le nom est obligatoire.");
    if (!Number.isInteger(price) || price < 0) return toast.error("Prix invalide (nombre entier en DA).");
    const groups = draft.groups
      .map((g) => ({ ...g, name: g.name.trim(), options: g.options.filter((o) => o.name.trim()).map((o) => ({ ...o, name: o.name.trim() })) }))
      .filter((g) => g.name);
    if (groups.some((g) => g.required && g.options.length === 0)) return toast.error("Un groupe obligatoire doit avoir au moins une option.");

    setSaving(true);
    try {
      const fields = {
        name: draft.name.trim(), description: draft.description.trim() || null, price,
        category_id: draft.category_id, available: draft.available, image_url: draft.image_url,
      };
      let id = product?.id;
      if (id) await updateProduct(id, fields);
      else {
        const sort = (categories.find((c) => c.id === draft.category_id)?.products.length ?? 0) + 1;
        id = await createProduct({ ...fields, sort_order: sort });
      }
      await saveProductOptions(id, groups);
      toast.success(product ? "Produit mis à jour — visible immédiatement côté client" : "Produit ajouté au menu");
      onSaved();
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!product) return;
    setSaving(true);
    try {
      await deleteProduct(product.id);
      toast.success("Produit supprimé");
      onSaved();
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
      setSaving(false);
    }
  };

  return (
    <Sheet open onClose={onClose} size="lg" title={product ? `Modifier « ${product.name} »` : "Nouveau produit"}
      footer={
        <div className="flex gap-2">
          {product && <Button variant="outline" onClick={() => setConfirmDelete(true)} icon={<Trash2 className="size-4 text-red-600" />}>Supprimer</Button>}
          <Button className="ml-auto min-w-40" size="lg" loading={saving} onClick={save}>Enregistrer</Button>
        </div>
      }>
      <div className="grid gap-5 md:grid-cols-[200px_1fr]">
        <div>
          <button type="button" onClick={() => fileInput.current?.click()}
            className={cx("group relative grid aspect-square w-full place-items-center overflow-hidden rounded-2xl border-2 border-dashed border-line bg-surface-2",
              uploading && "animate-pulse")}>
            {draft.image_url ? <img src={draft.image_url} alt="" className="size-full object-cover" /> : (
              <span className="flex flex-col items-center gap-1 text-sm font-bold text-fg-muted"><ImagePlus className="size-8" /> Ajouter une photo</span>
            )}
            {draft.image_url && <span className="absolute inset-x-0 bottom-0 bg-black/60 py-1.5 text-center text-xs font-bold text-white opacity-0 transition group-hover:opacity-100">Changer la photo</span>}
          </button>
          <input ref={fileInput} type="file" accept="image/*" hidden onChange={(e) => void upload(e.target.files?.[0])} />
          {draft.image_url && <Button variant="ghost" size="sm" className="mt-1 w-full" onClick={() => set("image_url", null)}>Retirer la photo</Button>}
        </div>
        <div className="flex flex-col gap-4">
          <Field label="Nom" required>{(p) => <Input {...p} value={draft.name} maxLength={120} onChange={(e) => set("name", e.target.value)} />}</Field>
          <Field label="Description">{(p) => <Textarea {...p} rows={2} maxLength={500} value={draft.description} onChange={(e) => set("description", e.target.value)} />}</Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Prix de base (DA)" required hint="Prix sans option (ex. taille la plus petite).">
              {(p) => <Input {...p} type="number" min={0} inputMode="numeric" value={draft.price} onChange={(e) => set("price", e.target.value)} />}
            </Field>
            <Field label="Catégorie">
              {(p) => (
                <Select {...p} value={draft.category_id} onChange={(e) => set("category_id", e.target.value)}>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}{c.active ? "" : " (masquée)"}</option>)}
                </Select>
              )}
            </Field>
          </div>
          <Switch checked={draft.available} onChange={(v) => set("available", v)} label="Disponible"
            description="Indisponible : visible mais grisé, impossible à commander." />
        </div>
      </div>
      <h3 className="mb-3 mt-6 text-lg font-extrabold">Options</h3>
      <OptionsEditor groups={draft.groups} onChange={(g) => set("groups", g)} />

      <ConfirmSheet open={confirmDelete} onClose={() => setConfirmDelete(false)} onConfirm={remove} loading={saving}
        variant="danger" title={`Supprimer « ${product?.name} » ?`} confirmLabel="Supprimer définitivement">
        Le produit disparaît du menu. Les anciennes commandes gardent leur détail. Pour le retirer temporairement, rendez-le plutôt indisponible.
      </ConfirmSheet>
    </Sheet>
  );
}
