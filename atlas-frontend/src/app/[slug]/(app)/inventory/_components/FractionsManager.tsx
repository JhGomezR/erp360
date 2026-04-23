'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notify } from '@/lib/notify';
import {
  Plus, Trash2, Edit2, Save, X, Lock, Layers,
  ScanBarcode,
} from 'lucide-react';

import { fractionsApi, type ProductFractionItem } from '@/lib/api/tenant.api';
import { billingApi } from '@/lib/api/tenant.api';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);

// ─── Inline fraction row ──────────────────────────────────────────────────────

interface FractionRowProps {
  fraction: ProductFractionItem;
  productId: number;
  slug: string;
}

function FractionRow({ fraction, productId, slug }: FractionRowProps) {
  const [editing, setEditing] = useState(false);
  const [form, setForm]       = useState({
    name:       fraction.name,
    barcode:    fraction.barcode ?? '',
    factor:     String(fraction.factor),
    sale_price: String(fraction.sale_price),
    is_active:  fraction.is_active,
  });
  const qc = useQueryClient();

  const updateMutation = useMutation({
    mutationFn: () =>
      fractionsApi.update(productId, fraction.id, {
        name:       form.name,
        barcode:    form.barcode || undefined,
        factor:     Number(form.factor),
        sale_price: Number(form.sale_price),
        is_active:  form.is_active,
      }),
    onSuccess: () => {
      notify.success('Fracción actualizada');
      qc.invalidateQueries({ queryKey: ['fractions', slug, productId] });
      setEditing(false);
    },
    onError: (err) => notify.error(err, 'Error al actualizar'),
  });

  const deleteMutation = useMutation({
    mutationFn: () => fractionsApi.destroy(productId, fraction.id),
    onSuccess: () => {
      notify.success('Fracción eliminada');
      qc.invalidateQueries({ queryKey: ['fractions', slug, productId] });
    },
    onError: (err) => notify.error(err, 'Error al eliminar'),
  });

  if (!editing) {
    return (
      <tr className="hover:bg-muted/30 transition-colors">
        <td className="px-3 py-2 font-medium">{fraction.name}</td>
        <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{fraction.barcode || '—'}</td>
        <td className="px-3 py-2 text-right text-muted-foreground">{fraction.factor}x</td>
        <td className="px-3 py-2 text-right font-medium">{fmt(fraction.sale_price)}</td>
        <td className="px-3 py-2 text-center">
          <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
            fraction.is_active
              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
              : 'bg-muted text-muted-foreground'
          }`}>
            {fraction.is_active ? 'Activa' : 'Inactiva'}
          </span>
        </td>
        <td className="px-3 py-2">
          <div className="flex items-center justify-end gap-1">
            <Button size="icon" variant="ghost" className="size-7" onClick={() => setEditing(true)}>
              <Edit2 className="size-3.5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="size-7"
              disabled={deleteMutation.isPending}
              onClick={() => {
                if (window.confirm(`¿Eliminar la fracción "${fraction.name}"?`)) {
                  deleteMutation.mutate();
                }
              }}
            >
              <Trash2 className="size-3.5 text-destructive" />
            </Button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="bg-muted/20">
      <td className="px-2 py-2">
        <Input
          value={form.name}
          onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
          className="h-7 text-sm"
          autoFocus
        />
      </td>
      <td className="px-2 py-2">
        <Input
          value={form.barcode}
          onChange={(e) => setForm((p) => ({ ...p, barcode: e.target.value }))}
          className="h-7 text-sm font-mono"
          placeholder="Código de barras"
        />
      </td>
      <td className="px-2 py-2">
        <Input
          type="number"
          min={0.000001}
          step="any"
          value={form.factor}
          onChange={(e) => setForm((p) => ({ ...p, factor: e.target.value }))}
          className="h-7 text-sm w-20 ml-auto"
        />
      </td>
      <td className="px-2 py-2">
        <Input
          type="number"
          min={0}
          value={form.sale_price}
          onChange={(e) => setForm((p) => ({ ...p, sale_price: e.target.value }))}
          className="h-7 text-sm w-28 ml-auto"
        />
      </td>
      <td className="px-2 py-2 text-center">
        <label className="flex items-center justify-center gap-1.5 cursor-pointer text-xs">
          <input
            type="checkbox"
            checked={form.is_active}
            onChange={(e) => setForm((p) => ({ ...p, is_active: e.target.checked }))}
            className="size-3.5 rounded accent-primary"
          />
          Activa
        </label>
      </td>
      <td className="px-2 py-2">
        <div className="flex items-center justify-end gap-1">
          <Button
            size="icon"
            variant="ghost"
            className="size-7"
            disabled={updateMutation.isPending}
            onClick={() => updateMutation.mutate()}
          >
            <Save className="size-3.5" />
          </Button>
          <Button size="icon" variant="ghost" className="size-7" onClick={() => setEditing(false)}>
            <X className="size-3.5" />
          </Button>
        </div>
      </td>
    </tr>
  );
}

// ─── Add Fraction Form ────────────────────────────────────────────────────────

interface AddFormProps {
  productId: number;
  productUnit: string;
  slug: string;
  onDone: () => void;
}

function AddFractionForm({ productId, productUnit, slug, onDone }: AddFormProps) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: '', barcode: '', factor: '', sale_price: '',
  });

  const createMutation = useMutation({
    mutationFn: () =>
      fractionsApi.create(productId, {
        name:       form.name,
        barcode:    form.barcode || undefined,
        factor:     Number(form.factor),
        sale_price: Number(form.sale_price),
      }),
    onSuccess: () => {
      notify.success('Fracción creada');
      qc.invalidateQueries({ queryKey: ['fractions', slug, productId] });
      onDone();
    },
    onError: (err) => notify.error(err, 'Error al crear la fracción'),
  });

  const isValid = form.name.trim() && Number(form.factor) > 0 && Number(form.sale_price) >= 0;

  return (
    <tr className="bg-primary/5 border-t-2 border-primary/20">
      <td className="px-2 py-2">
        <Input
          value={form.name}
          onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
          placeholder={`Ej: Docena de ${productUnit}s`}
          className="h-7 text-sm"
          autoFocus
        />
      </td>
      <td className="px-2 py-2">
        <div className="relative">
          <ScanBarcode className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
          <Input
            value={form.barcode}
            onChange={(e) => setForm((p) => ({ ...p, barcode: e.target.value }))}
            placeholder="Código (opcional)"
            className="h-7 text-sm pl-7 font-mono"
          />
        </div>
      </td>
      <td className="px-2 py-2">
        <div className="flex flex-col gap-0.5">
          <Input
            type="number"
            min={0.000001}
            step="any"
            value={form.factor}
            onChange={(e) => setForm((p) => ({ ...p, factor: e.target.value }))}
            placeholder="Ej: 12"
            className="h-7 text-sm w-20 ml-auto"
          />
          <p className="text-[10px] text-muted-foreground text-right pr-1">
            ¿Cuántas por {productUnit}?
          </p>
        </div>
      </td>
      <td className="px-2 py-2">
        <Input
          type="number"
          min={0}
          value={form.sale_price}
          onChange={(e) => setForm((p) => ({ ...p, sale_price: e.target.value }))}
          placeholder="Precio venta"
          className="h-7 text-sm w-28 ml-auto"
        />
      </td>
      <td className="px-2 py-2" />
      <td className="px-2 py-2">
        <div className="flex items-center justify-end gap-1">
          <Button
            size="sm"
            className="h-7 text-xs gap-1"
            disabled={!isValid || createMutation.isPending}
            onClick={() => createMutation.mutate()}
          >
            <Save className="size-3.5" />
            Guardar
          </Button>
          <Button size="icon" variant="ghost" className="size-7" onClick={onDone}>
            <X className="size-3.5" />
          </Button>
        </div>
      </td>
    </tr>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface FractionsManagerProps {
  productId: number;
  productName: string;
  productUnit: string;
  slug: string;
}

export function FractionsManager({
  productId,
  productName,
  productUnit,
  slug,
}: FractionsManagerProps) {
  const [adding, setAdding] = useState(false);

  // Check if tenant has fractions addon
  const { data: addonsData } = useQuery({
    queryKey: ['billing-addons', slug],
    queryFn: () => billingApi.addons().then((r) => r.data),
    staleTime: 5 * 60_000,
  });

  const addons: any[] = (addonsData as any) ?? [];
  const fractionsAddon = addons.find((a: any) => a.module_key === 'fractions');
  const hasAddon = fractionsAddon?.pivot?.status === 'approved';

  const { data, isLoading } = useQuery({
    queryKey: ['fractions', slug, productId],
    queryFn: () => fractionsApi.list(productId).then((r) => r.data),
    staleTime: 30_000,
    enabled: hasAddon,
  });

  const fractions: ProductFractionItem[] = (data as any)?.fractions ?? [];

  // ── Addon locked state ────────────────────────────────────────────────────
  if (!fractionsAddon) {
    return null; // addon doesn't exist in catalog — hide silently
  }

  if (!hasAddon) {
    return (
      <div className="rounded-xl border border-dashed p-6 flex flex-col items-center gap-3 text-center">
        <div className="size-10 rounded-full bg-muted flex items-center justify-center">
          <Lock className="size-5 text-muted-foreground" />
        </div>
        <div>
          <p className="font-medium text-sm">Fraccionamiento de productos</p>
          <p className="text-xs text-muted-foreground mt-1">
            Este add-on permite vender partes de un producto (docenas, unidades, medias cajas)
            con su propio código de barras y precio. Disponible como complemento de tu plan.
          </p>
        </div>
        <a
          href={`/${slug}/billing`}
          className="text-xs text-primary underline underline-offset-2"
        >
          Ver add-ons disponibles →
        </a>
      </div>
    );
  }

  // ── Full manager ──────────────────────────────────────────────────────────
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">Fracciones de &ldquo;{productName}&rdquo;</span>
        </div>
        {!adding && (
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setAdding(true)}>
            <Plus className="size-3.5" />
            Agregar fracción
          </Button>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Define cómo se puede vender este producto en unidades menores. El campo <strong>Factor</strong> indica
        cuántas fracciones caben en 1 {productUnit || 'unidad base'}. Ejemplo: un panal de 30 huevos → docena tiene factor 2.5 (30 ÷ 12).
      </p>

      <div className="rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-muted-foreground text-xs uppercase">
            <tr>
              <th className="px-3 py-2 text-left">Nombre</th>
              <th className="px-3 py-2 text-left">Código de barras</th>
              <th className="px-3 py-2 text-right">Factor</th>
              <th className="px-3 py-2 text-right">Precio venta</th>
              <th className="px-3 py-2 text-center">Estado</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading &&
              Array.from({ length: 2 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 6 }).map((__, j) => (
                    <td key={j} className="px-3 py-2"><Skeleton className="h-4 w-full" /></td>
                  ))}
                </tr>
              ))}

            {!isLoading && fractions.length === 0 && !adding && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground text-xs">
                  Sin fracciones configuradas. Agrega una para empezar a vender en unidades menores.
                </td>
              </tr>
            )}

            {!isLoading &&
              fractions.map((f) => (
                <FractionRow key={f.id} fraction={f} productId={productId} slug={slug} />
              ))}

            {adding && (
              <AddFractionForm
                productId={productId}
                productUnit={productUnit}
                slug={slug}
                onDone={() => setAdding(false)}
              />
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
