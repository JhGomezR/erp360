'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { notify } from '@/lib/notify';
import {
  Plus, Search, AlertTriangle, CheckCircle2, Clock,
  Package, Calendar, Pencil,
} from 'lucide-react';
import { batchesApi, productsApi, type ProductBatch } from '@/lib/api/tenant.api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 }).format(n);

const fmtDate = (s: string | null) =>
  s ? new Date(s + 'T00:00:00').toLocaleDateString('es-CO') : '—';

function expiryBadge(batch: ProductBatch) {
  if (!batch.expiry_date) return <Badge variant="secondary">Sin fecha</Badge>;
  if (batch.is_expired)
    return <Badge variant="destructive" className="gap-1"><AlertTriangle className="size-3" />Vencido</Badge>;
  if ((batch.days_until_expiry ?? 999) <= 30)
    return (
      <Badge className="gap-1 bg-amber-100 text-amber-700 border-amber-300">
        <Clock className="size-3" />Vence en {batch.days_until_expiry}d
      </Badge>
    );
  return (
    <Badge className="gap-1 bg-green-100 text-green-700 border-green-300">
      <CheckCircle2 className="size-3" />{batch.days_until_expiry}d restantes
    </Badge>
  );
}

// ─── Schemas ──────────────────────────────────────────────────────────────────

const newBatchSchema = z.object({
  product_id:       z.number({ error: 'Selecciona un producto' }).positive(),
  batch_number:     z.string().min(1, 'Número de lote requerido').max(100),
  quantity:         z.number({ error: 'Cantidad requerida' }).positive('Debe ser mayor a 0'),
  unit_cost:        z.number().min(0).optional(),
  expiry_date:      z.string().optional(),
  manufacture_date: z.string().optional(),
  notes:            z.string().optional(),
});

const adjustSchema = z.object({
  quantity_remaining: z.number({ error: 'Cantidad requerida' }).min(0),
  notes:              z.string().min(5, 'Describe el motivo (mín. 5 caracteres)'),
});

type NewBatchForm  = z.infer<typeof newBatchSchema>;
type AdjustForm    = z.infer<typeof adjustSchema>;

// ─── New Batch Dialog ─────────────────────────────────────────────────────────

function NewBatchDialog({ open, onOpenChange, slug }: { open: boolean; onOpenChange: (v: boolean) => void; slug: string }) {
  const qc = useQueryClient();

  const { data: productsData } = useQuery({
    queryKey: ['products-simple', slug],
    queryFn: () => productsApi.list({ per_page: 200 }).then((r) => r.data.data ?? []),
    enabled: open,
  });

  const { register, handleSubmit, control, reset, formState: { errors, isSubmitting } } =
    useForm<NewBatchForm>({ resolver: zodResolver(newBatchSchema) });

  const mutation = useMutation({
    mutationFn: (d: NewBatchForm) => batchesApi.create({
      ...d,
      expiry_date:      d.expiry_date      || undefined,
      manufacture_date: d.manufacture_date || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['batches', slug] });
      qc.invalidateQueries({ queryKey: ['products', slug] });
      notify.success('Lote registrado correctamente');
      onOpenChange(false);
      reset();
    },
    onError: (e: unknown) => {
      notify.error(e, 'Error al registrar lote');
    },
  });

  const products = productsData ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Nuevo lote</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4">

          {/* Producto */}
          <div className="space-y-1.5">
            <Label>Producto *</Label>
            <Controller
              control={control}
              name="product_id"
              render={({ field }) => (
                <Select
                  value={field.value ? String(field.value) : ''}
                  onValueChange={(v) => field.onChange(Number(v))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar producto..." />
                  </SelectTrigger>
                  <SelectContent>
                    {products.map((p) => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {p.name} <span className="text-muted-foreground text-xs ml-1">({p.sku})</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.product_id && <p className="text-xs text-destructive">{errors.product_id.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Número de lote */}
            <div className="space-y-1.5">
              <Label>Número de lote *</Label>
              <Input {...register('batch_number')} placeholder="Ej: L2026-001" />
              {errors.batch_number && <p className="text-xs text-destructive">{errors.batch_number.message}</p>}
            </div>

            {/* Cantidad */}
            <div className="space-y-1.5">
              <Label>Cantidad *</Label>
              <Input type="number" step="0.01" {...register('quantity', { valueAsNumber: true })} placeholder="0" />
              {errors.quantity && <p className="text-xs text-destructive">{errors.quantity.message}</p>}
            </div>

            {/* Costo unitario */}
            <div className="space-y-1.5">
              <Label>Costo unitario <span className="text-xs text-muted-foreground">(opcional)</span></Label>
              <Input type="number" step="0.01" {...register('unit_cost', { valueAsNumber: true })} placeholder="0" />
            </div>

            {/* Fecha de fabricación */}
            <div className="space-y-1.5">
              <Label>Fecha fabricación <span className="text-xs text-muted-foreground">(opcional)</span></Label>
              <Input type="date" {...register('manufacture_date')} />
            </div>

            {/* Fecha de vencimiento */}
            <div className="col-span-2 space-y-1.5">
              <Label>Fecha de vencimiento <span className="text-xs text-muted-foreground">(obligatorio para medicamentos)</span></Label>
              <Input type="date" {...register('expiry_date')} />
            </div>
          </div>

          {/* Notas */}
          <div className="space-y-1.5">
            <Label>Notas <span className="text-xs text-muted-foreground">(opcional)</span></Label>
            <Input {...register('notes')} placeholder="Proveedor, referencia OC, etc." />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={mutation.isPending || isSubmitting}>
              {mutation.isPending ? 'Registrando…' : 'Registrar lote'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Adjust Dialog ────────────────────────────────────────────────────────────

function AdjustBatchDialog({
  batch, onClose,
}: { batch: ProductBatch | null; onClose: () => void }) {
  const qc = useQueryClient();

  const { register, handleSubmit, formState: { errors, isSubmitting } } =
    useForm<AdjustForm>({
      resolver: zodResolver(adjustSchema),
      defaultValues: { quantity_remaining: batch?.quantity_remaining ?? 0, notes: '' },
    });

  const mutation = useMutation({
    mutationFn: (d: AdjustForm) => batchesApi.adjust(batch!.id, d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['batches'] });
      qc.invalidateQueries({ queryKey: ['products'] });
      notify.success('Lote ajustado');
      onClose();
    },
    onError: (err) => notify.error(err, 'Error al ajustar el lote'),
  });

  if (!batch) return null;

  return (
    <Dialog open={!!batch} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Ajustar lote — {batch.batch_number}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
          <div className="rounded-md bg-muted/50 p-3 text-sm space-y-1">
            <p><span className="text-muted-foreground">Producto:</span> {batch.product?.name}</p>
            <p><span className="text-muted-foreground">Stock actual:</span> {fmt(batch.quantity_remaining)}</p>
          </div>

          <div className="space-y-1.5">
            <Label>Nueva cantidad en existencia *</Label>
            <Input
              type="number"
              step="0.01"
              min={0}
              {...register('quantity_remaining', { valueAsNumber: true })}
            />
            {errors.quantity_remaining && <p className="text-xs text-destructive">{errors.quantity_remaining.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label>Motivo del ajuste *</Label>
            <Input {...register('notes')} placeholder="Ej: Conteo físico 29-Mar-2026" />
            {errors.notes && <p className="text-xs text-destructive">{errors.notes.message}</p>}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={mutation.isPending || isSubmitting}>
              {mutation.isPending ? 'Ajustando…' : 'Guardar ajuste'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main tab ─────────────────────────────────────────────────────────────────

export function BatchesTab({ slug }: { slug: string }) {
  const [newOpen, setNewOpen]       = useState(false);
  const [adjustBatch, setAdjust]    = useState<ProductBatch | null>(null);
  const [search, setSearch]         = useState('');
  const [filter, setFilter]         = useState<'all' | 'expiring' | 'expired'>('all');

  const { data, isLoading } = useQuery<unknown>({
    queryKey: ['batches', slug, filter],
    queryFn: () => {
      if (filter === 'expiring') return batchesApi.expiring(60).then((r) => r.data);
      return batchesApi.list({ expired: filter === 'expired' || undefined }).then((r) => r.data);
    },
  });

  const batches: ProductBatch[] = filter === 'expiring'
    ? ((data as { batches?: ProductBatch[] })?.batches ?? [])
    : ((data as { data?: ProductBatch[] })?.data ?? []);

  const filtered = batches.filter((b) =>
    !search ||
    b.batch_number.toLowerCase().includes(search.toLowerCase()) ||
    b.product?.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-semibold text-base">Lotes y Vencimientos</h2>
          <p className="text-xs text-muted-foreground">Control de lotes por fecha de vencimiento (FEFO)</p>
        </div>
        <Button size="sm" onClick={() => setNewOpen(true)} className="gap-1.5">
          <Plus className="size-4" /> Nuevo lote
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input
            placeholder="Buscar lote o producto..."
            className="pl-8 w-60"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {(['all', 'expiring', 'expired'] as const).map((f) => (
          <Button
            key={f}
            size="sm"
            variant={filter === f ? 'default' : 'outline'}
            onClick={() => setFilter(f)}
          >
            {f === 'all' ? 'Todos' : f === 'expiring' ? 'Próximos a vencer (60d)' : 'Vencidos'}
          </Button>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-xl border overflow-hidden bg-card">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40 text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Lote</th>
              <th className="text-left px-4 py-3 font-medium">Producto</th>
              <th className="text-right px-4 py-3 font-medium">Stock</th>
              <th className="text-left px-4 py-3 font-medium">Fabricación</th>
              <th className="text-left px-4 py-3 font-medium">Vencimiento</th>
              <th className="text-left px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {isLoading && Array.from({ length: 5 }).map((_, i) => (
              <tr key={i} className="border-b">
                {Array.from({ length: 7 }).map((_, j) => (
                  <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                ))}
              </tr>
            ))}
            {!isLoading && filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                  <Package className="size-8 mx-auto mb-2 opacity-40" />
                  {filter === 'expired' ? 'No hay lotes vencidos' : filter === 'expiring' ? 'No hay lotes próximos a vencer' : 'Sin lotes registrados'}
                </td>
              </tr>
            )}
            {!isLoading && filtered.map((batch) => (
              <tr key={batch.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                <td className="px-4 py-3 font-mono font-medium text-sm">{batch.batch_number}</td>
                <td className="px-4 py-3">
                  <div className="font-medium">{batch.product?.name ?? '—'}</div>
                  <div className="text-xs text-muted-foreground">{batch.product?.sku}</div>
                </td>
                <td className="px-4 py-3 text-right font-medium tabular-nums">
                  {fmt(batch.quantity_remaining)}
                  <span className="text-muted-foreground text-xs ml-1">{batch.product?.unit}</span>
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Calendar className="size-3.5" />
                    {fmtDate(batch.manufacture_date)}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Calendar className="size-3.5" />
                    {fmtDate(batch.expiry_date)}
                  </span>
                </td>
                <td className="px-4 py-3">{expiryBadge(batch)}</td>
                <td className="px-4 py-3">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    onClick={() => setAdjust(batch)}
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <NewBatchDialog open={newOpen} onOpenChange={setNewOpen} slug={slug} />
      <AdjustBatchDialog batch={adjustBatch} onClose={() => setAdjust(null)} />
    </div>
  );
}
