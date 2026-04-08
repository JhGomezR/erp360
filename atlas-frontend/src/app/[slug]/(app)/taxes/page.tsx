'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { standardSchemaResolver as zodResolver } from '@hookform/resolvers/standard-schema';
import { z } from 'zod';
import { notify } from '@/lib/notify';
import {
  Plus, Pencil, Trash2, Sparkles, Percent, ShieldCheck,
  BarChart3, AlertCircle, CheckCircle2, RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { taxesApi, accountingApi, type TaxRecord, setTenantSlug } from '@/lib/api/tenant.api';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCurrency(v: number) {
  return `$${Number(v).toLocaleString('es-CO', { minimumFractionDigits: 0 })}`;
}

function thisMonth() {
  const now = new Date();
  const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const to   = `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`;
  return { from, to };
}

// ─── Schemas ──────────────────────────────────────────────────────────────────

const taxSchema = z.object({
  name:         z.string().min(2, 'Mínimo 2 caracteres'),
  code:         z.string().optional(),
  type:         z.enum(['iva', 'ico', 'ipc', 'other']),
  rate:         z.string().min(1, 'Requerido'),
  account_code: z.string().optional(),
  is_active:    z.boolean().default(true),
  is_default:   z.boolean().default(false),
});
type TaxForm = z.infer<typeof taxSchema>;

const retentionSchema = z.object({
  name:                 z.string().min(2, 'Mínimo 2 caracteres'),
  type:                 z.enum(['retefte', 'reteiva', 'reteica', 'other']),
  concept_code:         z.string().optional(),
  concept_name:         z.string().optional(),
  rate:                 z.string().min(1, 'Requerido'),
  base_minimum:         z.string().optional(),
  applies_to_purchases: z.boolean().default(true),
  applies_to_sales:     z.boolean().default(false),
  is_active:            z.boolean().default(true),
  notes:                z.string().optional(),
});
type RetentionForm = z.infer<typeof retentionSchema>;

// ─── Constants ────────────────────────────────────────────────────────────────

const TAX_TYPE_LABEL: Record<string, string> = {
  iva: 'IVA', ico: 'ICO', ipc: 'IPC', other: 'Otro',
};

const RETENTION_TYPE_LABEL: Record<string, string> = {
  retefte: 'Retención en la Fuente',
  reteiva: 'Retención IVA',
  reteica: 'Retención ICA',
  other:   'Otra',
};

// ═══════════════════════════════════════════════════════════════════════════
// TAB 1 — Impuestos
// ═══════════════════════════════════════════════════════════════════════════

function TaxesTab() {
  const { slug } = useParams() as { slug: string };
  const qc = useQueryClient();

  const [dialog, setDialog]   = useState(false);
  const [editing, setEditing] = useState<TaxRecord | null>(null);

  const { data: taxes = [], isLoading } = useQuery<TaxRecord[]>({
    queryKey: ['taxes', slug],
    queryFn: async () => {
      const r = await taxesApi.list();
      return (r.data as TaxRecord[]) ?? [];
    },
  });

  const form = useForm<TaxForm>({ resolver: zodResolver(taxSchema) });

  const openCreate = () => {
    setEditing(null);
    form.reset({ name: '', code: '', type: 'iva', rate: '', account_code: '', is_active: true, is_default: false });
    setDialog(true);
  };

  const openEdit = (tax: TaxRecord) => {
    setEditing(tax);
    form.reset({
      name:         tax.name,
      code:         tax.code ?? '',
      type:         tax.type,
      rate:         String(tax.rate),
      account_code: tax.account_code ?? '',
      is_active:    tax.is_active,
      is_default:   tax.is_default,
    });
    setDialog(true);
  };

  const save = useMutation({
    mutationFn: (d: TaxForm) => {
      const payload = { ...d, rate: Number(d.rate) };
      return editing ? taxesApi.update(editing.id, payload) : taxesApi.create(payload);
    },
    onSuccess: () => {
      notify.success(editing ? 'Impuesto actualizado' : 'Impuesto creado');
      setDialog(false);
      qc.invalidateQueries({ queryKey: ['taxes', slug] });
    },
    onError: (err) => notify.error(err, 'Error al guardar'),
  });

  const remove = useMutation({
    mutationFn: (id: number) => taxesApi.delete(id),
    onSuccess: () => {
      notify.success('Impuesto eliminado');
      qc.invalidateQueries({ queryKey: ['taxes', slug] });
    },
    onError: (err) => notify.error(err, 'No se puede eliminar — puede estar en uso'),
  });

  const seedDefaults = useMutation({
    mutationFn: () => taxesApi.seedDefaults(),
    onSuccess: () => {
      notify.success('Impuestos colombianos estándar cargados');
      qc.invalidateQueries({ queryKey: ['taxes', slug] });
    },
    onError: (err) => notify.error(err, 'Error al cargar predeterminados'),
  });

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">
          Configura IVA, ICO e IPC. Estos impuestos se asignan a productos y se aplican automáticamente en ventas y facturas electrónicas.
        </p>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={() => seedDefaults.mutate()} disabled={seedDefaults.isPending}>
            <Sparkles className="h-4 w-4 mr-1.5" />
            {seedDefaults.isPending ? 'Cargando...' : 'Cargar colombianos'}
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1.5" />
            Nuevo impuesto
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : taxes.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground space-y-2">
              <Percent className="size-10 mx-auto opacity-20" />
              <p className="text-sm">No hay impuestos configurados.</p>
              <p className="text-xs">Usa "Cargar colombianos" para los impuestos estándar (IVA 19%, IVA 5%, Exento 0%).</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Código</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Tasa (%)</TableHead>
                  <TableHead>Cuenta PUC</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Por defecto</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {taxes.map((tax) => (
                  <TableRow key={tax.id}>
                    <TableCell className="font-medium">{tax.name}</TableCell>
                    <TableCell>
                      {tax.code ? <Badge variant="secondary">{tax.code}</Badge> : <span className="text-muted-foreground text-xs">—</span>}
                    </TableCell>
                    <TableCell>{TAX_TYPE_LABEL[tax.type] ?? tax.type}</TableCell>
                    <TableCell className="text-right tabular-nums">{Number(tax.rate).toFixed(2)}%</TableCell>
                    <TableCell className="text-xs text-muted-foreground font-mono">{tax.account_code ?? '—'}</TableCell>
                    <TableCell>
                      <Badge variant={tax.is_active ? 'default' : 'secondary'}>{tax.is_active ? 'Activo' : 'Inactivo'}</Badge>
                    </TableCell>
                    <TableCell>
                      {tax.is_default && <Badge variant="outline">Predeterminado</Badge>}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1 justify-end">
                        <Button size="icon" variant="ghost" onClick={() => openEdit(tax)}>
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          size="icon" variant="ghost"
                          className="text-destructive hover:text-destructive"
                          onClick={() => { if (confirm('¿Eliminar este impuesto?')) remove.mutate(tax.id); }}
                          disabled={remove.isPending}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Dialog create / edit */}
      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar impuesto' : 'Nuevo impuesto'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit((d) => save.mutate(d))} className="space-y-4">
            <div className="space-y-1">
              <Label>Nombre <span className="text-destructive">*</span></Label>
              <Input placeholder="IVA 19%" {...form.register('name')} />
              {form.formState.errors.name && <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Código interno</Label>
                <Input placeholder="IVA_19" {...form.register('code')} />
              </div>
              <div className="space-y-1">
                <Label>Tipo <span className="text-destructive">*</span></Label>
                <Select value={form.watch('type')} onValueChange={(v) => form.setValue('type', v as TaxForm['type'])}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="iva">IVA</SelectItem>
                    <SelectItem value="ico">ICO</SelectItem>
                    <SelectItem value="ipc">IPC</SelectItem>
                    <SelectItem value="other">Otro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Tasa (%) <span className="text-destructive">*</span></Label>
                <Input type="number" step="0.01" min={0} max={100} placeholder="19" {...form.register('rate')} />
                {form.formState.errors.rate && <p className="text-xs text-destructive">{form.formState.errors.rate.message}</p>}
              </div>
              <div className="space-y-1">
                <Label>Cuenta PUC</Label>
                <Input placeholder="2408" {...form.register('account_code')} />
              </div>
            </div>
            <div className="flex gap-6">
              <div className="flex items-center gap-2">
                <Switch id="is_active_tax" checked={form.watch('is_active')} onCheckedChange={(v) => form.setValue('is_active', v)} />
                <Label htmlFor="is_active_tax">Activo</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch id="is_default_tax" checked={form.watch('is_default')} onCheckedChange={(v) => form.setValue('is_default', v)} />
                <Label htmlFor="is_default_tax">Predeterminado</Label>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialog(false)}>Cancelar</Button>
              <Button type="submit" disabled={save.isPending}>{save.isPending ? 'Guardando...' : (editing ? 'Actualizar' : 'Crear')}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB 2 — Retenciones
// ═══════════════════════════════════════════════════════════════════════════

interface RetentionRecord {
  id: number;
  name: string;
  type: 'retefte' | 'reteiva' | 'reteica' | 'other';
  concept_code?: string;
  concept_name?: string;
  rate: number;
  base_minimum: number;
  applies_to_purchases: boolean;
  applies_to_sales: boolean;
  is_active: boolean;
  notes?: string;
}

function RetentionsTab() {
  const { slug } = useParams() as { slug: string };
  const qc = useQueryClient();

  const [dialog, setDialog]   = useState(false);
  const [editing, setEditing] = useState<RetentionRecord | null>(null);

  const { data: retentions = [], isLoading } = useQuery<RetentionRecord[]>({
    queryKey: ['retentions', slug],
    queryFn: async () => {
      const r = await accountingApi.retentions();
      return (r.data as RetentionRecord[]) ?? [];
    },
  });

  const form = useForm<RetentionForm>({ resolver: zodResolver(retentionSchema) });

  const openCreate = () => {
    setEditing(null);
    form.reset({
      name: '', type: 'retefte', concept_code: '', concept_name: '',
      rate: '', base_minimum: '0',
      applies_to_purchases: true, applies_to_sales: false,
      is_active: true, notes: '',
    });
    setDialog(true);
  };

  const openEdit = (r: RetentionRecord) => {
    setEditing(r);
    form.reset({
      name:                 r.name,
      type:                 r.type,
      concept_code:         r.concept_code ?? '',
      concept_name:         r.concept_name ?? '',
      rate:                 String(r.rate),
      base_minimum:         String(r.base_minimum),
      applies_to_purchases: r.applies_to_purchases,
      applies_to_sales:     r.applies_to_sales,
      is_active:            r.is_active,
      notes:                r.notes ?? '',
    });
    setDialog(true);
  };

  const save = useMutation({
    mutationFn: (d: RetentionForm) => {
      const payload = {
        ...d,
        rate:         Number(d.rate),
        base_minimum: Number(d.base_minimum ?? 0),
      };
      return editing
        ? accountingApi.updateRetention(editing.id, payload)
        : accountingApi.createRetention(payload);
    },
    onSuccess: () => {
      notify.success(editing ? 'Retención actualizada' : 'Retención creada');
      setDialog(false);
      qc.invalidateQueries({ queryKey: ['retentions', slug] });
    },
    onError: (err) => notify.error(err, 'Error al guardar'),
  });

  const remove = useMutation({
    mutationFn: (id: number) => accountingApi.deleteRetention(id),
    onSuccess: () => {
      notify.success('Retención eliminada');
      qc.invalidateQueries({ queryKey: ['retentions', slug] });
    },
    onError: (err) => notify.error(err, 'Error al eliminar'),
  });

  const seedDefaults = useMutation({
    mutationFn: () => accountingApi.seedRetentionDefaults(),
    onSuccess: () => {
      notify.success('Retenciones colombianas estándar cargadas');
      qc.invalidateQueries({ queryKey: ['retentions', slug] });
    },
    onError: (err) => notify.error(err, 'Error al cargar predeterminados'),
  });

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">
          Configura Retefte, Reteiva y Reteica. Se aplican automáticamente en compras y ventas según los mínimos legales vigentes.
        </p>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={() => seedDefaults.mutate()} disabled={seedDefaults.isPending}>
            <Sparkles className="h-4 w-4 mr-1.5" />
            {seedDefaults.isPending ? 'Cargando...' : 'Cargar colombianas'}
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1.5" />
            Nueva retención
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : retentions.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground space-y-2">
              <ShieldCheck className="size-10 mx-auto opacity-20" />
              <p className="text-sm">No hay retenciones configuradas.</p>
              <p className="text-xs">Usa "Cargar colombianas" para Retefte, Reteiva y Reteica estándar.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Concepto</TableHead>
                  <TableHead className="text-right">Tasa</TableHead>
                  <TableHead className="text-right">Base mínima</TableHead>
                  <TableHead>Aplica en</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {retentions.map((ret) => (
                  <TableRow key={ret.id}>
                    <TableCell className="font-medium">{ret.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">{RETENTION_TYPE_LABEL[ret.type] ?? ret.type}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {ret.concept_code && <span className="font-mono mr-1">{ret.concept_code}</span>}
                      {ret.concept_name}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{(ret.rate * 100).toFixed(2)}%</TableCell>
                    <TableCell className="text-right tabular-nums text-xs text-muted-foreground">
                      {ret.base_minimum > 0 ? formatCurrency(ret.base_minimum) : 'Sin mínimo'}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1 flex-wrap">
                        {ret.applies_to_purchases && <Badge variant="secondary" className="text-xs">Compras</Badge>}
                        {ret.applies_to_sales && <Badge variant="secondary" className="text-xs">Ventas</Badge>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={ret.is_active ? 'default' : 'secondary'}>{ret.is_active ? 'Activa' : 'Inactiva'}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1 justify-end">
                        <Button size="icon" variant="ghost" onClick={() => openEdit(ret)}>
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          size="icon" variant="ghost"
                          className="text-destructive hover:text-destructive"
                          onClick={() => { if (confirm('¿Eliminar esta retención?')) remove.mutate(ret.id); }}
                          disabled={remove.isPending}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Dialog */}
      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar retención' : 'Nueva retención'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit((d) => save.mutate(d))} className="space-y-4">
            <div className="space-y-1">
              <Label>Nombre <span className="text-destructive">*</span></Label>
              <Input placeholder="Retefte Servicios 4%" {...form.register('name')} />
              {form.formState.errors.name && <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Tipo <span className="text-destructive">*</span></Label>
                <Select value={form.watch('type')} onValueChange={(v) => form.setValue('type', v as RetentionForm['type'])}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="retefte">Retención en la Fuente</SelectItem>
                    <SelectItem value="reteiva">Retención IVA</SelectItem>
                    <SelectItem value="reteica">Retención ICA</SelectItem>
                    <SelectItem value="other">Otra</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Código de concepto</Label>
                <Input placeholder="01" {...form.register('concept_code')} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Nombre del concepto</Label>
              <Input placeholder="Servicios en general" {...form.register('concept_name')} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Tasa (decimal) <span className="text-destructive">*</span></Label>
                <Input type="number" step="0.0001" min={0} max={1} placeholder="0.04 = 4%" {...form.register('rate')} />
                {form.formState.errors.rate && <p className="text-xs text-destructive">{form.formState.errors.rate.message}</p>}
                <p className="text-xs text-muted-foreground">Ej: 0.04 para 4%</p>
              </div>
              <div className="space-y-1">
                <Label>Base mínima ($)</Label>
                <Input type="number" min={0} placeholder="0" {...form.register('base_minimum')} />
                <p className="text-xs text-muted-foreground">0 = sin mínimo</p>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Notas</Label>
              <Input placeholder="Observaciones adicionales..." {...form.register('notes')} />
            </div>
            <div className="flex flex-wrap gap-5">
              <div className="flex items-center gap-2">
                <Switch id="applies_to_purchases" checked={form.watch('applies_to_purchases')} onCheckedChange={(v) => form.setValue('applies_to_purchases', v)} />
                <Label htmlFor="applies_to_purchases">Aplica en compras</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch id="applies_to_sales" checked={form.watch('applies_to_sales')} onCheckedChange={(v) => form.setValue('applies_to_sales', v)} />
                <Label htmlFor="applies_to_sales">Aplica en ventas</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch id="is_active_ret" checked={form.watch('is_active')} onCheckedChange={(v) => form.setValue('is_active', v)} />
                <Label htmlFor="is_active_ret">Activa</Label>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialog(false)}>Cancelar</Button>
              <Button type="submit" disabled={save.isPending}>{save.isPending ? 'Guardando...' : (editing ? 'Actualizar' : 'Crear')}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB 3 — Informe tributario
// ═══════════════════════════════════════════════════════════════════════════

function TaxReportTab() {
  const { slug } = useParams() as { slug: string };
  const { from: defaultFrom, to: defaultTo } = thisMonth();

  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo]     = useState(defaultTo);
  const [applied, setApplied] = useState({ from: defaultFrom, to: defaultTo });

  const { data: summary, isLoading: loadingSummary, refetch: refetchSummary } = useQuery({
    queryKey: ['tax-report-summary', slug, applied.from, applied.to],
    queryFn: async () => {
      const r = await taxesApi.reportSummary(applied.from, applied.to);
      return (r as any).data ?? r;
    },
  });

  const { data: byTax, isLoading: loadingByTax } = useQuery({
    queryKey: ['tax-report-by-tax', slug, applied.from, applied.to],
    queryFn: async () => {
      const r = await taxesApi.reportByTax(applied.from, applied.to);
      return ((r as any).data?.rows ?? []) as any[];
    },
  });

  function applyFilter() {
    if (!from || !to) { notify.error('Selecciona un período válido'); return; }
    if (from > to)    { notify.error('La fecha de inicio debe ser anterior al fin'); return; }
    setApplied({ from, to });
  }

  const ivaGenerated  = (summary as any)?.iva_generated;
  const ivaDeductible = (summary as any)?.iva_deductible;
  const balance       = (summary as any)?.balance ?? 0;
  const balanceLabel  = (summary as any)?.balance_label ?? '';

  return (
    <div className="space-y-5">
      {/* Period filter */}
      <Card>
        <CardContent className="pt-5">
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>Desde</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Hasta</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
            </div>
            <Button onClick={applyFilter}>
              <RefreshCw className="size-4 mr-1.5" />
              Consultar
            </Button>
            <p className="text-xs text-muted-foreground">
              Período: <span className="font-medium">{applied.from}</span> al <span className="font-medium">{applied.to}</span>
            </p>
          </div>
        </CardContent>
      </Card>

      {/* IVA Summary cards */}
      {loadingSummary ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-lg" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground font-normal">IVA Generado (ventas)</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-green-600">{formatCurrency(ivaGenerated?.total ?? 0)}</p>
              <p className="text-xs text-muted-foreground mt-1">{ivaGenerated?.breakdown?.length ?? 0} tarifas · {ivaGenerated?.breakdown?.reduce((s: number, r: any) => s + (r.invoice_count ?? 0), 0) ?? 0} facturas</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground font-normal">IVA Descontable (compras)</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-blue-600">{formatCurrency(ivaDeductible?.total ?? 0)}</p>
              <p className="text-xs text-muted-foreground mt-1">{ivaDeductible?.breakdown?.length ?? 0} tarifas</p>
            </CardContent>
          </Card>
          <Card className={balance > 0 ? 'border-orange-300 dark:border-orange-700' : balance < 0 ? 'border-green-300 dark:border-green-700' : ''}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground font-normal flex items-center gap-1.5">
                {balance > 0 ? <AlertCircle className="size-4 text-orange-500" /> : <CheckCircle2 className="size-4 text-green-500" />}
                Saldo IVA
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className={`text-2xl font-bold ${balance > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                {formatCurrency(Math.abs(balance))}
              </p>
              <p className="text-xs text-muted-foreground mt-1">{balanceLabel}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* IVA Breakdown table */}
      {!loadingSummary && ivaGenerated?.breakdown?.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Desglose IVA generado por tarifa</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Impuesto</TableHead>
                  <TableHead className="text-right">Tasa</TableHead>
                  <TableHead className="text-right">Base gravable</TableHead>
                  <TableHead className="text-right">IVA generado</TableHead>
                  <TableHead className="text-right">Facturas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ivaGenerated.breakdown.map((row: any, i: number) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{row.tax_name}</TableCell>
                    <TableCell className="text-right tabular-nums">{Number(row.rate).toFixed(2)}%</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(row.base)}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium text-green-600">{formatCurrency(row.tax_amount)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{row.invoice_count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Monthly breakdown */}
      {!loadingByTax && byTax && byTax.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Desglose mensual por impuesto</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mes</TableHead>
                  <TableHead>Impuesto</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Tasa</TableHead>
                  <TableHead className="text-right">Base</TableHead>
                  <TableHead className="text-right">Impuesto</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {byTax.map((row: any, i: number) => (
                  <TableRow key={i}>
                    <TableCell className="font-mono text-sm">{row.month}</TableCell>
                    <TableCell>{row.tax_name}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">{TAX_TYPE_LABEL[row.tax_type] ?? row.tax_type}</Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{Number(row.rate).toFixed(2)}%</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(row.base)}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{formatCurrency(row.tax_amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {!loadingSummary && !loadingByTax && (!byTax || byTax.length === 0) && (
        <div className="py-10 text-center text-muted-foreground">
          <BarChart3 className="size-10 mx-auto opacity-20 mb-2" />
          <p className="text-sm">No hay datos de impuestos en este período.</p>
          <p className="text-xs mt-1">Verifica que los productos tengan impuestos asignados y existan ventas completadas.</p>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════

export default function TaxesPage() {
  const params = useParams();
  const slug   = params.slug as string;

  useEffect(() => { setTenantSlug(slug); }, [slug]);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Percent className="h-6 w-6" />
          Impuestos y Retenciones
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configuración tributaria: IVA, ICO, IPC, Retefte, Reteiva, Reteica e informes de impuestos por período.
        </p>
      </div>

      <Separator />

      {/* Tabs */}
      <Tabs defaultValue="taxes">
        <TabsList className="mb-6">
          <TabsTrigger value="taxes" className="flex items-center gap-1.5">
            <Percent className="size-3.5" />
            Impuestos
          </TabsTrigger>
          <TabsTrigger value="retentions" className="flex items-center gap-1.5">
            <ShieldCheck className="size-3.5" />
            Retenciones
          </TabsTrigger>
          <TabsTrigger value="report" className="flex items-center gap-1.5">
            <BarChart3 className="size-3.5" />
            Informe tributario
          </TabsTrigger>
        </TabsList>

        <TabsContent value="taxes">
          <TaxesTab />
        </TabsContent>
        <TabsContent value="retentions">
          <RetentionsTab />
        </TabsContent>
        <TabsContent value="report">
          <TaxReportTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
