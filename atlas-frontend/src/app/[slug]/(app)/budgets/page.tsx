'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { notify } from '@/lib/notify';
import {
  PieChart, Plus, CheckCircle, X, Trash2, ArrowUpDown, TrendingUp, TrendingDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { budgetsApi, setTenantSlug } from '@/lib/api/tenant.api';
import { AddonGate } from '@/components/shared/AddonPaywall';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Budget {
  id: number; name: string; type: string; year: number;
  period_from: string; period_to: string; status: string;
  total_budgeted: number; total_actual: number;
  lines_count?: number;
}

interface BudgetLine { month: number; category: string; subcategory?: string; amount_budgeted: number; amount_actual: number; }

// ─── Schemas ─────────────────────────────────────────────────────────────────
const lineSchema = z.object({
  month:           z.string().min(1),
  category:        z.string().min(1, 'Categoría requerida'),
  subcategory:     z.string().optional(),
  amount_budgeted: z.string().min(1, 'Monto requerido'),
});

const budgetSchema = z.object({
  name:        z.string().min(2, 'Nombre requerido'),
  type:        z.enum(['income', 'expense', 'cash_flow', 'master']),
  year:        z.string().min(4),
  period_from: z.string().min(1),
  period_to:   z.string().min(1),
  notes:       z.string().optional(),
  lines:       z.array(lineSchema),
});
type BudgetFormType = z.infer<typeof budgetSchema>;

const MONTHS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

const TYPE_LABEL: Record<string, string> = {
  income: 'Ingresos', expense: 'Gastos', cash_flow: 'Flujo de Caja', master: 'Maestro',
};
const STATUS_VARIANT: Record<string, 'default'|'secondary'|'outline'|'destructive'> = {
  draft: 'secondary', approved: 'default', active: 'default', closed: 'outline',
};
const STATUS_LABEL: Record<string, string> = {
  draft: 'Borrador', approved: 'Aprobado', active: 'Activo', closed: 'Cerrado',
};

const fmt = (n: number) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);

const varBadge = (variance: number) => {
  if (Math.abs(variance) < 1) return null;
  return variance > 0
    ? <span className="text-xs text-red-600 flex items-center gap-0.5"><TrendingUp className="w-3 h-3" />{fmt(variance)}</span>
    : <span className="text-xs text-green-600 flex items-center gap-0.5"><TrendingDown className="w-3 h-3" />{fmt(Math.abs(variance))}</span>;
};

const TABS = [
  { id: 'list',   label: 'Presupuestos', icon: PieChart },
  { id: 'detail', label: 'Detalle / Vs Real', icon: ArrowUpDown },
];

export default function BudgetsPage() {
  const params = useParams();
  const slug   = params.slug as string;
  setTenantSlug(slug);

  const qc = useQueryClient();
  const [tab, setTab]           = useState('list');
  const [createOpen, setCreate] = useState(false);
  const [selectedId, setSelected] = useState<number | null>(null);
  const [yearFilter, setYear]   = useState(new Date().getFullYear().toString());

  interface VsActualData {
    budget: { id: number; name: string; type: string; year: number; total_budgeted: number; total_actual: number };
    comparison: { category: string; total_budgeted: number; total_actual: number; variance: number; months: Record<string, { budgeted: number; actual: number; variance: number }> }[];
  }

  const { data: listData, isLoading } = useQuery<{ data: Budget[] }>({
    queryKey: ['budgets', slug, yearFilter],
    queryFn: () => budgetsApi.list({ year: parseInt(yearFilter) }).then(r => r.data as { data: Budget[] }),
  });

  const { data: detailData } = useQuery<VsActualData | null>({
    queryKey: ['budget-vs-actual', selectedId],
    queryFn: () => selectedId ? budgetsApi.vsActual(selectedId).then(r => r.data as VsActualData) : null,
    enabled: !!selectedId && tab === 'detail',
  });

  const budgets = listData?.data ?? [];

  const { register, handleSubmit, reset, setValue, watch, control, formState: { errors } } = useForm<BudgetFormType>({
    resolver: zodResolver(budgetSchema),
    defaultValues: {
      type: 'expense',
      year: new Date().getFullYear().toString(),
      period_from: `${new Date().getFullYear()}-01-01`,
      period_to:   `${new Date().getFullYear()}-12-31`,
      lines: [{ month: '1', category: '', subcategory: '', amount_budgeted: '' }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'lines' });

  const createMut = useMutation({
    mutationFn: (data: BudgetFormType) => budgetsApi.create({
      ...data,
      year: parseInt(data.year),
      lines: data.lines.map(l => ({ ...l, month: parseInt(l.month), amount_budgeted: parseFloat(l.amount_budgeted) })),
    }),
    onSuccess: () => {
      notify.success('Presupuesto creado');
      qc.invalidateQueries({ queryKey: ['budgets', slug] });
      setCreate(false); reset();
    },
    onError: (err) => notify.error(err, 'Error al crear el presupuesto'),
  });

  const approveMut = useMutation({
    mutationFn: (id: number) => budgetsApi.approve(id),
    onSuccess: () => { notify.success('Presupuesto aprobado'); qc.invalidateQueries({ queryKey: ['budgets', slug] }); },
    onError: (err) => notify.error(err, 'Error al aprobar'),
  });

  const closeMut = useMutation({
    mutationFn: (id: number) => budgetsApi.close(id),
    onSuccess: () => { notify.success('Presupuesto cerrado'); qc.invalidateQueries({ queryKey: ['budgets', slug] }); },
    onError: (err) => notify.error(err, 'Error al cerrar'),
  });

  const destroyMut = useMutation({
    mutationFn: (id: number) => budgetsApi.destroy(id),
    onSuccess: () => { notify.success('Presupuesto eliminado'); qc.invalidateQueries({ queryKey: ['budgets', slug] }); },
    onError: (err) => notify.error(err, 'Error al eliminar'),
  });

  return (
    <AddonGate moduleKey="budgets" slug={slug}>
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <PieChart className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold">Presupuestos</h1>
        </div>
        <Button onClick={() => setCreate(true)}>
          <Plus className="w-4 h-4 mr-1" /> Nuevo Presupuesto
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-0.5 p-1 rounded-lg bg-muted w-fit">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${tab === t.id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
            <t.icon className="w-3.5 h-3.5" />{t.label}
          </button>
        ))}
      </div>

      {/* ── Tab: List ────────────────────────────────────────────────────────── */}
      {tab === 'list' && (
        <div className="space-y-4">
          <div className="flex gap-2">
            <Input type="number" value={yearFilter} onChange={e => setYear(e.target.value)} className="w-28" placeholder="Año" />
          </div>

          {isLoading ? (
            <div className="flex flex-col gap-3">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-20 rounded-2xl bg-muted animate-pulse" />)}</div>
          ) : budgets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 gap-3 text-muted-foreground">
              <div className="size-14 rounded-full bg-muted flex items-center justify-center">
                <PieChart className="size-7 opacity-40" />
              </div>
              <p className="font-medium">No hay presupuestos para {yearFilter}</p>
              <Button variant="outline" size="sm" onClick={() => setCreate(true)}>
                <Plus className="w-4 h-4 mr-2" /> Nuevo Presupuesto
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {budgets.map(b => (
                <div key={b.id} className="rounded-2xl border bg-card p-4 flex items-center gap-4 hover:shadow-sm hover:border-primary/20 transition-all">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-sm">{b.name}</p>
                      <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{TYPE_LABEL[b.type]}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{b.period_from} → {b.period_to}</p>
                  </div>
                  <div className="hidden sm:flex items-center gap-6 text-sm flex-shrink-0">
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground">Presupuestado</p>
                      <p className="font-medium">{fmt(b.total_budgeted)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground">Real</p>
                      <p className="font-medium">{fmt(b.total_actual)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground">Variación</p>
                      {varBadge(b.total_actual - b.total_budgeted) ?? <span className="text-xs text-muted-foreground">—</span>}
                    </div>
                  </div>
                  <Badge variant={STATUS_VARIANT[b.status] ?? 'outline'} className="flex-shrink-0">{STATUS_LABEL[b.status] ?? b.status}</Badge>
                  <div className="flex gap-1 flex-shrink-0">
                    <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => { setSelected(b.id); setTab('detail'); }}>Ver</Button>
                    {b.status === 'draft' && (
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => approveMut.mutate(b.id)}>
                        <CheckCircle className="w-3.5 h-3.5 text-green-600" />
                      </Button>
                    )}
                    {['approved', 'active'].includes(b.status) && (
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => closeMut.mutate(b.id)}>
                        <X className="w-3.5 h-3.5 text-muted-foreground" />
                      </Button>
                    )}
                    {b.status === 'draft' && (
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => destroyMut.mutate(b.id)}>
                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Detail / Vs Actual ──────────────────────────────────────────── */}
      {tab === 'detail' && (
        <div className="space-y-4">
          <div className="flex gap-2 items-center">
            <Select value={selectedId?.toString() ?? ''} onValueChange={v => setSelected(v ? parseInt(v) : null)}>
              <SelectTrigger className="w-72"><SelectValue placeholder="Seleccionar presupuesto..." /></SelectTrigger>
              <SelectContent>
                {budgets.map(b => <SelectItem key={b.id} value={b.id.toString()}>{b.name} ({b.year})</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {selectedId && detailData ? (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <Card>
                  <CardContent className="p-4">
                    <div className="text-sm text-muted-foreground">Presupuestado</div>
                    <div className="text-xl font-bold">{fmt(detailData.budget?.total_budgeted ?? 0)}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="text-sm text-muted-foreground">Real</div>
                    <div className="text-xl font-bold">{fmt(detailData.budget?.total_actual ?? 0)}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="text-sm text-muted-foreground">Variación</div>
                    <div className={`text-xl font-bold ${((detailData.budget?.total_actual ?? 0) - (detailData.budget?.total_budgeted ?? 0)) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {fmt((detailData.budget?.total_actual ?? 0) - (detailData.budget?.total_budgeted ?? 0))}
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="rounded-md border overflow-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left px-3 py-2">Categoría</th>
                      <th className="text-right px-3 py-2">Presupuestado</th>
                      <th className="text-right px-3 py-2">Real</th>
                      <th className="text-right px-3 py-2">Variación</th>
                      {MONTHS.map((m, i) => <th key={i} className="text-right px-2 py-2 text-xs">{m}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {detailData.comparison?.map((row) => (
                      <tr key={row.category} className="border-t hover:bg-muted/30">
                        <td className="px-3 py-2 font-medium capitalize">{row.category}</td>
                        <td className="px-3 py-2 text-right">{fmt(row.total_budgeted)}</td>
                        <td className="px-3 py-2 text-right">{fmt(row.total_actual)}</td>
                        <td className="px-3 py-2 text-right">{varBadge(row.variance)}</td>
                        {Array.from({ length: 12 }, (_, i) => i + 1).map(m => {
                          const cell = row.months?.[String(m)];
                          return (
                            <td key={m} className="px-2 py-2 text-right text-xs">
                              <div>{cell ? fmt(cell.budgeted) : '—'}</div>
                              {cell?.actual > 0 && <div className="text-muted-foreground">{fmt(cell.actual)}</div>}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : selectedId ? (
            <Skeleton className="h-40" />
          ) : (
            <div className="text-center py-16 text-muted-foreground">Selecciona un presupuesto para ver el detalle</div>
          )}
        </div>
      )}

      {/* ── Dialog: Crear Presupuesto ──────────────────────────────────────────── */}
      <Dialog open={createOpen} onOpenChange={setCreate}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Nuevo Presupuesto</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit(d => createMut.mutate(d))} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1">
                <Label>Nombre *</Label>
                <Input {...register('name')} placeholder="Ej: Presupuesto Gastos 2026" />
                {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
              </div>
              <div className="space-y-1">
                <Label>Tipo *</Label>
                <Select onValueChange={v => setValue('type', (v ?? 'expense') as BudgetFormType['type'])} defaultValue="expense">
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="income">Ingresos</SelectItem>
                    <SelectItem value="expense">Gastos</SelectItem>
                    <SelectItem value="cash_flow">Flujo de Caja</SelectItem>
                    <SelectItem value="master">Maestro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Año *</Label>
                <Input type="number" {...register('year')} min="2000" max="2100" />
              </div>
              <div className="space-y-1">
                <Label>Desde *</Label>
                <Input type="date" {...register('period_from')} />
              </div>
              <div className="space-y-1">
                <Label>Hasta *</Label>
                <Input type="date" {...register('period_to')} />
              </div>
              <div className="col-span-2 space-y-1">
                <Label>Notas</Label>
                <Input {...register('notes')} />
              </div>
            </div>

            {/* Budget Lines */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Líneas del Presupuesto</Label>
                <Button type="button" size="sm" variant="outline"
                  onClick={() => append({ month: '1', category: '', subcategory: '', amount_budgeted: '' })}>
                  <Plus className="w-3.5 h-3.5 mr-1" /> Agregar Línea
                </Button>
              </div>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {fields.map((field, idx) => (
                  <div key={field.id} className="grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-2">
                      <Select onValueChange={v => setValue(`lines.${idx}.month`, v ?? '1')} defaultValue="1">
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {MONTHS.map((m, i) => <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-4">
                      <Input {...register(`lines.${idx}.category`)} placeholder="Categoría" className="h-8 text-xs" />
                    </div>
                    <div className="col-span-3">
                      <Input {...register(`lines.${idx}.subcategory`)} placeholder="Subcategoría" className="h-8 text-xs" />
                    </div>
                    <div className="col-span-2">
                      <Input type="number" {...register(`lines.${idx}.amount_budgeted`)} placeholder="Monto" className="h-8 text-xs" min="0" />
                    </div>
                    <div className="col-span-1">
                      <Button type="button" size="sm" variant="ghost" onClick={() => remove(idx)} className="h-8 w-8 p-0">
                        <X className="w-3.5 h-3.5 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { setCreate(false); reset(); }}>Cancelar</Button>
              <Button type="submit" disabled={createMut.isPending}>
                {createMut.isPending ? 'Guardando...' : 'Crear Presupuesto'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
    </AddonGate>
  );
}
