'use client';

import * as z from 'zod';
import { useEffect, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { standardSchemaResolver as zodResolver } from '@hookform/resolvers/standard-schema';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notify } from '@/lib/notify';
import {
  Tag, Plus, Pencil, Trash2, ToggleLeft, ToggleRight,
  Percent, DollarSign, ShoppingCart, Layers,
} from 'lucide-react';

import { promotionsApi, productsApi, categoriesApi } from '@/lib/api/tenant.api';
import type { Promotion } from '@/types';

import { Button }   from '@/components/ui/button';
import { Input }    from '@/components/ui/input';
import { Label }    from '@/components/ui/label';
import { Badge }    from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

// ─── Types ────────────────────────────────────────────────────────────────────

const promotionSchema = z.object({
  name:           z.string().min(2, 'El nombre debe tener al menos 2 caracteres'),
  type:           z.enum(['percentage', 'fixed', 'bogo', 'quantity_discount']),
  discount_value: z.number().min(0, 'El valor no puede ser negativo'),
  applies_to:     z.enum(['all', 'category', 'product']),
  entity_id:      z.number().optional(),
  min_quantity:   z.number().int().min(1).optional(),
  min_amount:     z.number().min(0).optional(),
  bogo_buy:       z.number().int().min(1).optional(),
  bogo_get:       z.number().int().min(1).optional(),
  starts_at:      z.string().optional(),
  ends_at:        z.string().optional(),
  is_active:      z.boolean(),
  notes:          z.string().optional(),
});

type PromotionFormValues = z.infer<typeof promotionSchema>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TYPE_META: Record<Promotion['type'], { label: string; icon: React.ElementType; color: string }> = {
  percentage:        { label: 'Descuento %',          icon: Percent,      color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  fixed:             { label: 'Descuento fijo $',      icon: DollarSign,   color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
  bogo:              { label: '2x1 / BOGO',            icon: ShoppingCart, color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  quantity_discount: { label: 'Por cantidad mínima',   icon: Layers,       color: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400' },
};

function fmtDate(iso?: string): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('es-CO', { dateStyle: 'short' }).format(new Date(iso));
}

// ─── Dialog ───────────────────────────────────────────────────────────────────

interface DialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: Promotion | null;
  slug: string;
}

function PromotionDialog({ open, onOpenChange, editing, slug }: DialogProps) {
  const qc   = useQueryClient();
  const isEdit = Boolean(editing);

  const { data: categories = [] } = useQuery({
    queryKey: ['categories', slug],
    queryFn: () => categoriesApi.list().then((r) => r.data),
    enabled: open,
  });

  const { data: productsData } = useQuery({
    queryKey: ['products-simple', slug],
    queryFn: () => productsApi.list({ per_page: 300 }).then((r) => r.data.data ?? []),
    enabled: open,
    staleTime: 60_000,
  });
  const products = productsData ?? [];

  const {
    register, handleSubmit, control, reset, watch,
    formState: { errors, isSubmitting },
  } = useForm<PromotionFormValues>({
    resolver: zodResolver(promotionSchema),
    defaultValues: {
      name: '', type: 'percentage', discount_value: 0,
      applies_to: 'all', is_active: true,
      min_quantity: 1, bogo_buy: 2, bogo_get: 1,
    },
  });

  const appliesTo  = watch('applies_to');
  const promoType  = watch('type');

  useEffect(() => {
    if (!open) return;
    if (editing) {
      reset({
        name:           editing.name,
        type:           editing.type,
        discount_value: editing.discount_value,
        applies_to:     editing.applies_to,
        entity_id:      editing.entity_id,
        min_quantity:   editing.min_quantity ?? 1,
        min_amount:     editing.min_amount ?? undefined,
        bogo_buy:       editing.bogo_buy ?? 2,
        bogo_get:       editing.bogo_get ?? 1,
        starts_at:      editing.starts_at?.slice(0, 10) ?? '',
        ends_at:        editing.ends_at?.slice(0, 10) ?? '',
        is_active:      editing.is_active,
        notes:          editing.notes ?? '',
      });
    } else {
      reset({
        name: '', type: 'percentage', discount_value: 0,
        applies_to: 'all', is_active: true,
        min_quantity: 1, bogo_buy: 2, bogo_get: 1,
      });
    }
  }, [open, editing, reset]);

  const createMutation = useMutation({
    mutationFn: (data: Partial<Promotion>) => promotionsApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['promotions', slug] });
      notify.success('Promoción creada');
      onOpenChange(false);
    },
    onError: (err) => notify.error(err, 'Error al crear la promoción'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Promotion> }) =>
      promotionsApi.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['promotions', slug] });
      notify.success('Promoción actualizada');
      onOpenChange(false);
    },
    onError: (err) => notify.error(err, 'Error al actualizar'),
  });

  const onSubmit = (values: PromotionFormValues) => {
    const payload: Partial<Promotion> = {
      ...values,
      discount_value: values.discount_value,
      entity_id:      appliesTo !== 'all' ? values.entity_id : undefined,
      min_amount:     values.min_amount ?? undefined,
      starts_at:      values.starts_at || undefined,
      ends_at:        values.ends_at || undefined,
    };

    if (editing) {
      updateMutation.mutate({ id: editing.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending || isSubmitting;

  // Compute display value for entity selector (Radix SelectValue fix)
  const entityIdValue = watch('entity_id');
  const entityDisplayName = (() => {
    if (appliesTo === 'category') {
      return (categories as { id: number; name: string }[]).find(c => c.id === entityIdValue)?.name ?? 'Seleccionar categoría';
    }
    if (appliesTo === 'product') {
      return (products as { id: number; name: string }[]).find(p => p.id === entityIdValue)?.name ?? 'Seleccionar producto';
    }
    return '';
  })();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar promoción' : 'Nueva promoción'}</DialogTitle>
        </DialogHeader>

        <form id="promo-form" onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          {/* Nombre */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="promo-name">Nombre *</Label>
            <Input id="promo-name" {...register('name')} placeholder="Ej: Descuento IVA medicamentos" />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>

          {/* Tipo */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Tipo *</Label>
              <Controller control={control} name="type" render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue>
                      {TYPE_META[field.value as Promotion['type']]?.label ?? 'Seleccionar'}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(TYPE_META) as Promotion['type'][]).map((k) => (
                      <SelectItem key={k} value={k}>{TYPE_META[k].label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )} />
            </div>

            {/* Valor del descuento */}
            {promoType !== 'bogo' && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="discount_value">
                  {promoType === 'percentage' ? 'Descuento (%)' : promoType === 'fixed' ? 'Descuento ($)' : 'Descuento (%)'}
                </Label>
                <Input
                  id="discount_value"
                  type="number"
                  step="0.01"
                  min="0"
                  {...register('discount_value', { valueAsNumber: true })}
                />
              </div>
            )}
          </div>

          {/* Configuración BOGO */}
          {promoType === 'bogo' && (
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="bogo_buy">Compra N unidades</Label>
                <Input id="bogo_buy" type="number" min="1" {...register('bogo_buy', { valueAsNumber: true })} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="bogo_get">Lleva M unidades</Label>
                <Input id="bogo_get" type="number" min="1" {...register('bogo_get', { valueAsNumber: true })} />
              </div>
            </div>
          )}

          {/* Aplica a */}
          <div className="flex flex-col gap-1.5">
            <Label>Aplica a *</Label>
            <Controller control={control} name="applies_to" render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger>
                  <SelectValue>
                    {field.value === 'all' ? 'Todos los productos' : field.value === 'category' ? 'Una categoría' : 'Un producto específico'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los productos</SelectItem>
                  <SelectItem value="category">Una categoría</SelectItem>
                  <SelectItem value="product">Un producto específico</SelectItem>
                </SelectContent>
              </Select>
            )} />
          </div>

          {/* Selector de entidad */}
          {appliesTo !== 'all' && (
            <div className="flex flex-col gap-1.5">
              <Label>{appliesTo === 'category' ? 'Categoría' : 'Producto'}</Label>
              <Controller control={control} name="entity_id" render={({ field }) => (
                <Select
                  value={field.value ? String(field.value) : ''}
                  onValueChange={(v) => field.onChange(Number(v))}
                >
                  <SelectTrigger>
                    <SelectValue>{entityDisplayName}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {appliesTo === 'category'
                      ? (categories as { id: number; name: string }[]).map((c) => (
                          <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                        ))
                      : (products as { id: number; name: string; sku: string }[]).map((p) => (
                          <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                        ))
                    }
                  </SelectContent>
                </Select>
              )} />
            </div>
          )}

          {/* Cantidad mínima */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="min_quantity">Cantidad mínima</Label>
              <Input id="min_quantity" type="number" min="1"
                {...register('min_quantity', { valueAsNumber: true })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="min_amount">
                Monto mínimo ($)
                <span className="ml-1 text-xs text-muted-foreground">(opcional)</span>
              </Label>
              <Input id="min_amount" type="number" min="0" step="1000"
                {...register('min_amount', { valueAsNumber: true })} placeholder="0" />
            </div>
          </div>

          {/* Vigencia */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="starts_at">Fecha inicio <span className="text-xs text-muted-foreground">(opcional)</span></Label>
              <Input id="starts_at" type="date" {...register('starts_at')} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ends_at">Fecha fin <span className="text-xs text-muted-foreground">(opcional)</span></Label>
              <Input id="ends_at" type="date" {...register('ends_at')} />
            </div>
          </div>

          {/* Notas */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="promo-notes">Notas <span className="text-xs text-muted-foreground">(opcional)</span></Label>
            <textarea
              id="promo-notes"
              {...register('notes')}
              placeholder="Información adicional sobre la promoción"
              className="min-h-[60px] w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </div>

          {/* Activa */}
          <div className="flex items-center gap-2">
            <input
              id="promo-active"
              type="checkbox"
              {...register('is_active')}
              className="size-4 rounded border border-input accent-primary"
            />
            <Label htmlFor="promo-active">Promoción activa</Label>
          </div>
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>Cancelar</Button>
          <Button type="submit" form="promo-form" disabled={isPending}>
            {isPending ? 'Guardando...' : 'Guardar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function PromotionsTab({ slug }: { slug: string }) {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen]   = useState(false);
  const [editing, setEditing]         = useState<Promotion | null>(null);

  const { data: promotions = [], isLoading } = useQuery<Promotion[]>({
    queryKey: ['promotions', slug],
    queryFn: () => promotionsApi.list().then((r) => r.data),
    staleTime: 30_000,
  });

  const toggleMutation = useMutation({
    mutationFn: (id: number) => promotionsApi.toggle(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['promotions', slug] }),
    onError: (err) => notify.error(err, 'Error al cambiar estado'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => promotionsApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['promotions', slug] });
      notify.success('Promoción eliminada');
    },
    onError: (err) => notify.error(err, 'Error al eliminar'),
  });

  const handleNew = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const handleEdit = (p: Promotion) => {
    setEditing(p);
    setDialogOpen(true);
  };

  const handleDelete = (p: Promotion) => {
    if (window.confirm(`¿Eliminar la promoción "${p.name}"?`)) {
      deleteMutation.mutate(p.id);
    }
  };

  const active   = promotions.filter((p) => p.is_active).length;
  const inactive = promotions.filter((p) => !p.is_active).length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            {active} activa{active !== 1 ? 's' : ''} · {inactive} inactiva{inactive !== 1 ? 's' : ''}
          </p>
        </div>
        <Button size="sm" onClick={handleNew} className="gap-2">
          <Plus className="size-4" />
          Nueva promoción
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-muted-foreground text-xs uppercase">
            <tr>
              <th className="px-4 py-3 text-left">Nombre</th>
              <th className="px-4 py-3 text-left">Tipo</th>
              <th className="px-4 py-3 text-left">Descuento</th>
              <th className="px-4 py-3 text-left">Aplica a</th>
              <th className="px-4 py-3 text-left">Vigencia</th>
              <th className="px-4 py-3 text-center">Estado</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading && Array.from({ length: 4 }).map((_, i) => (
              <tr key={i}>
                {Array.from({ length: 7 }).map((__, j) => (
                  <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                ))}
              </tr>
            ))}

            {!isLoading && promotions.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-16 text-center text-muted-foreground">
                  <Tag className="mx-auto mb-2 size-8 opacity-30" />
                  <p className="text-sm">No hay promociones. Crea la primera.</p>
                </td>
              </tr>
            )}

            {!isLoading && promotions.map((p) => {
              const meta  = TYPE_META[p.type];
              const Icon  = meta.icon;

              const discountLabel = (() => {
                if (p.type === 'percentage')        return `${p.discount_value}%`;
                if (p.type === 'fixed')             return `$${Number(p.discount_value).toLocaleString('es-CO')}`;
                if (p.type === 'bogo')              return `${p.bogo_buy ?? 2}x${(p.bogo_buy ?? 2) + (p.bogo_get ?? 1)}`;
                if (p.type === 'quantity_discount') return `${p.discount_value}% (mín. ${p.min_quantity})`;
                return '—';
              })();

              const appliesToLabel = (() => {
                if (p.applies_to === 'all')      return 'Todos';
                if (p.applies_to === 'category') return `Cat: ${p.entity_name ?? p.entity_id}`;
                if (p.applies_to === 'product')  return `Prod: ${p.entity_name ?? p.entity_id}`;
                return '—';
              })();

              return (
                <tr key={p.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-medium">
                    {p.name}
                    {p.notes && <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-[180px]">{p.notes}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${meta.color}`}>
                      <Icon className="size-3" />
                      {meta.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-semibold tabular-nums">{discountLabel}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{appliesToLabel}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">
                    {p.starts_at || p.ends_at
                      ? `${fmtDate(p.starts_at)} → ${fmtDate(p.ends_at)}`
                      : 'Sin límite'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Badge variant={p.is_active ? 'default' : 'outline'}>
                      {p.is_active ? 'Activa' : 'Inactiva'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost" size="icon-sm"
                        title={p.is_active ? 'Desactivar' : 'Activar'}
                        disabled={toggleMutation.isPending}
                        onClick={() => toggleMutation.mutate(p.id)}
                      >
                        {p.is_active
                          ? <ToggleRight className="size-4 text-emerald-600" />
                          : <ToggleLeft  className="size-4 text-muted-foreground" />}
                      </Button>
                      <Button variant="ghost" size="icon-sm" onClick={() => handleEdit(p)} title="Editar">
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost" size="icon-sm"
                        onClick={() => handleDelete(p)}
                        className="text-destructive hover:text-destructive"
                        title="Eliminar"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <PromotionDialog
        open={dialogOpen}
        onOpenChange={(v) => {
          setDialogOpen(v);
          if (!v) setEditing(null);
        }}
        editing={editing}
        slug={slug}
      />
    </div>
  );
}
