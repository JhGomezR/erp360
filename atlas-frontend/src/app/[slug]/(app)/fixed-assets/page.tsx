'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { standardSchemaResolver as zodResolver } from '@hookform/resolvers/standard-schema';
import { z } from 'zod';
import { notify } from '@/lib/notify';
import {
  Building2, Plus, TrendingDown, AlertCircle, CheckCircle, BarChart3,
  Trash2, Eye, X, ChevronDown,
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
import { fixedAssetsApi, setTenantSlug } from '@/lib/api/tenant.api';
import { AddonGate } from '@/components/shared/AddonPaywall';

// ─── Types ────────────────────────────────────────────────────────────────────
interface FixedAsset {
  id: number; asset_code: string; name: string; category: string;
  acquisition_date: string; acquisition_cost: number; residual_value: number;
  useful_life_years: number; depreciation_method: string;
  accumulated_depreciation: number; book_value: number;
  last_depreciation_date?: string; status: string;
  location?: string; serial_number?: string; notes?: string;
}

interface Summary {
  totals: { total_assets: number; total_cost: number; total_depreciation: number; total_book_value: number };
  by_category: { category: string; count: number; book_value: number }[];
}

// ─── Schemas ─────────────────────────────────────────────────────────────────
const assetSchema = z.object({
  name:                z.string().min(2, 'Nombre requerido'),
  category:            z.string().min(1, 'Categoría requerida'),
  acquisition_date:    z.string().min(1, 'Fecha de adquisición requerida'),
  acquisition_cost:    z.string().min(1, 'Costo requerido'),
  residual_value:      z.string().optional(),
  useful_life_years:   z.string().min(1, 'Vida útil requerida'),
  depreciation_method: z.enum(['straight_line', 'declining_balance']),
  location:            z.string().optional(),
  serial_number:       z.string().optional(),
  supplier:            z.string().optional(),
  notes:               z.string().optional(),
});
type AssetForm = z.infer<typeof assetSchema>;

const CATEGORIES = [
  { value: 'maquinaria',       label: 'Maquinaria y Equipo' },
  { value: 'vehiculo',         label: 'Vehículos' },
  { value: 'mueble',           label: 'Muebles y Enseres' },
  { value: 'equipo_computo',   label: 'Equipo de Cómputo' },
  { value: 'edificio',         label: 'Edificios' },
  { value: 'terreno',          label: 'Terrenos' },
  { value: 'otro',             label: 'Otro' },
];

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  active:            'default',
  fully_depreciated: 'secondary',
  disposed:          'destructive',
  inactive:          'outline',
};

const STATUS_LABEL: Record<string, string> = {
  active:            'Activo',
  fully_depreciated: 'Depreciado',
  disposed:          'Dado de baja',
  inactive:          'Inactivo',
};

const fmt = (n: number) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);
const fmtPct = (n: number) => `${n.toFixed(1)}%`;

const TABS = [
  { id: 'assets',      label: 'Activos',       icon: Building2 },
  { id: 'depreciate',  label: 'Depreciar',     icon: TrendingDown },
];

export default function FixedAssetsPage() {
  const params = useParams();
  const slug   = params.slug as string;
  setTenantSlug(slug);

  const qc = useQueryClient();
  const [tab, setTab]             = useState('assets');
  const [createOpen, setCreate]   = useState(false);
  const [scheduleAsset, setScheduleAsset] = useState<FixedAsset | null>(null);
  const [disposeAsset, setDisposeAsset]   = useState<FixedAsset | null>(null);
  const [deprYear, setDeprYear]   = useState(new Date().getFullYear().toString());
  const [deprMonth, setDeprMonth] = useState((new Date().getMonth() + 1).toString());
  const [search, setSearch]       = useState('');
  const [statusFilter, setStatus] = useState('');

  const { data: summary } = useQuery<Summary>({
    queryKey: ['fixed-assets-summary', slug],
    queryFn: () => fixedAssetsApi.summary().then(r => r.data as Summary),
  });

  const { data: assetsData, isLoading } = useQuery<{ data: FixedAsset[] }>({
    queryKey: ['fixed-assets', slug, search, statusFilter],
    queryFn: () => fixedAssetsApi.list({ search: search || undefined, status: statusFilter || undefined }).then(r => r.data as { data: FixedAsset[] }),
  });

  const { data: scheduleData } = useQuery<{ asset: FixedAsset; schedule: { year: number; month: number; depreciation_amount: number; accumulated_depreciation: number; book_value_end: number }[] } | null>({
    queryKey: ['fixed-asset-schedule', scheduleAsset?.id],
    queryFn: () => scheduleAsset ? fixedAssetsApi.schedule(scheduleAsset.id).then(r => r.data as { asset: FixedAsset; schedule: { year: number; month: number; depreciation_amount: number; accumulated_depreciation: number; book_value_end: number }[] }) : null,
    enabled: !!scheduleAsset,
  });

  const assets = assetsData?.data ?? [];

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<AssetForm>({
    resolver: zodResolver(assetSchema),
    defaultValues: { depreciation_method: 'straight_line' },
  });

  const createMut = useMutation({
    mutationFn: (data: AssetForm) => fixedAssetsApi.create({
      ...data,
      acquisition_cost:  parseFloat(data.acquisition_cost),
      residual_value:    parseFloat(data.residual_value || '0'),
      useful_life_years: parseInt(data.useful_life_years),
    }),
    onSuccess: () => {
      notify.success('Activo creado');
      qc.invalidateQueries({ queryKey: ['fixed-assets', slug] });
      qc.invalidateQueries({ queryKey: ['fixed-assets-summary', slug] });
      setCreate(false); reset();
    },
    onError: (err) => notify.error(err, 'Error al crear el activo'),
  });

  const depreciateMut = useMutation({
    mutationFn: () => fixedAssetsApi.runDepreciation(parseInt(deprYear), parseInt(deprMonth)),
    onSuccess: (res) => {
      const r = (res as { data: { processed: number; total_depreciation: number } }).data;
      notify.success(`Depreciación ejecutada: ${r.processed} activos por ${fmt(r.total_depreciation)}`);
      qc.invalidateQueries({ queryKey: ['fixed-assets', slug] });
      qc.invalidateQueries({ queryKey: ['fixed-assets-summary', slug] });
    },
    onError: (err) => notify.error(err, 'Error al ejecutar depreciación'),
  });

  const disposeMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: unknown }) => fixedAssetsApi.dispose(id, data),
    onSuccess: () => {
      notify.success('Activo dado de baja');
      qc.invalidateQueries({ queryKey: ['fixed-assets', slug] });
      qc.invalidateQueries({ queryKey: ['fixed-assets-summary', slug] });
      setDisposeAsset(null);
    },
    onError: (err) => notify.error(err, 'Error al dar de baja el activo'),
  });

  const [disposeForm, setDisposeForm] = useState({ date: '', reason: 'sale', amount: '', notes: '' });

  return (
    <AddonGate moduleKey="fixed_assets" slug={slug}>
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Building2 className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold">Activos Fijos</h1>
        </div>
        <Button onClick={() => setCreate(true)}>
          <Plus className="w-4 h-4 mr-1" /> Nuevo Activo
        </Button>
      </div>

      {/* KPI Cards */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground">Total Activos</div>
              <div className="text-2xl font-bold">{summary.totals.total_assets}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground">Costo Histórico</div>
              <div className="text-2xl font-bold">{fmt(summary.totals.total_cost ?? 0)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground">Depreciación Acum.</div>
              <div className="text-2xl font-bold text-amber-600">{fmt(summary.totals.total_depreciation ?? 0)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground">Valor Libros</div>
              <div className="text-2xl font-bold text-green-600">{fmt(summary.totals.total_book_value ?? 0)}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === t.id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            <t.icon className="w-4 h-4" />{t.label}
          </button>
        ))}
      </div>

      {/* ── Tab: Assets ─────────────────────────────────────────────────────── */}
      {tab === 'assets' && (
        <div className="space-y-4">
          <div className="flex gap-2">
            <Input placeholder="Buscar activo..." value={search} onChange={e => setSearch(e.target.value)} className="max-w-xs" />
            <Select value={statusFilter} onValueChange={v => setStatus(v ?? '')}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Todos los estados" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Todos</SelectItem>
                <SelectItem value="active">Activos</SelectItem>
                <SelectItem value="fully_depreciated">Depreciados</SelectItem>
                <SelectItem value="disposed">Dados de baja</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
          ) : (
            <div className="rounded-md border overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-3 py-2">Código</th>
                    <th className="text-left px-3 py-2">Nombre</th>
                    <th className="text-left px-3 py-2">Categoría</th>
                    <th className="text-right px-3 py-2">Costo</th>
                    <th className="text-right px-3 py-2">Depreciación</th>
                    <th className="text-right px-3 py-2">Valor Libros</th>
                    <th className="text-center px-3 py-2">Estado</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {assets.map(asset => {
                    const pct = asset.acquisition_cost > 0 ? (asset.accumulated_depreciation / asset.acquisition_cost) * 100 : 0;
                    return (
                      <tr key={asset.id} className="border-t hover:bg-muted/30">
                        <td className="px-3 py-2 font-mono text-xs">{asset.asset_code}</td>
                        <td className="px-3 py-2 font-medium">{asset.name}</td>
                        <td className="px-3 py-2 text-muted-foreground capitalize">{asset.category.replace('_', ' ')}</td>
                        <td className="px-3 py-2 text-right">{fmt(asset.acquisition_cost)}</td>
                        <td className="px-3 py-2 text-right">
                          <div>{fmt(asset.accumulated_depreciation)}</div>
                          <div className="text-xs text-muted-foreground">{fmtPct(pct)}</div>
                        </td>
                        <td className="px-3 py-2 text-right font-medium">{fmt(asset.book_value)}</td>
                        <td className="px-3 py-2 text-center">
                          <Badge variant={STATUS_VARIANT[asset.status] ?? 'outline'}>
                            {STATUS_LABEL[asset.status] ?? asset.status}
                          </Badge>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex gap-1">
                            <Button size="sm" variant="ghost" onClick={() => setScheduleAsset(asset)}>
                              <Eye className="w-3.5 h-3.5" />
                            </Button>
                            {asset.status === 'active' && (
                              <Button size="sm" variant="ghost" className="text-destructive" onClick={() => { setDisposeAsset(asset); setDisposeForm({ date: new Date().toISOString().slice(0, 10), reason: 'sale', amount: '', notes: '' }); }}>
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {assets.length === 0 && (
                    <tr><td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">No hay activos registrados</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Depreciar ──────────────────────────────────────────────────── */}
      {tab === 'depreciate' && (
        <Card>
          <CardHeader>
            <CardTitle>Ejecutar Depreciación Mensual</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Calcula y registra la depreciación de todos los activos activos para el período seleccionado.
              Esta operación es idempotente — activos ya depreciados en el período serán omitidos.
            </p>
            <div className="flex gap-3 items-end">
              <div className="space-y-1">
                <Label>Año</Label>
                <Input type="number" value={deprYear} onChange={e => setDeprYear(e.target.value)} className="w-28" min="2000" max="2100" />
              </div>
              <div className="space-y-1">
                <Label>Mes</Label>
                <Select value={deprMonth} onValueChange={v => setDeprMonth(v ?? '')}>
                  <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'].map((m, i) => (
                      <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={() => depreciateMut.mutate()} disabled={depreciateMut.isPending}>
                <TrendingDown className="w-4 h-4 mr-1" />
                {depreciateMut.isPending ? 'Procesando...' : 'Ejecutar Depreciación'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Dialog: Crear Activo ─────────────────────────────────────────────── */}
      <Dialog open={createOpen} onOpenChange={setCreate}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Nuevo Activo Fijo</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit(d => createMut.mutate(d))} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1">
                <Label>Nombre *</Label>
                <Input {...register('name')} placeholder="Ej: Computador HP EliteBook" />
                {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
              </div>
              <div className="space-y-1">
                <Label>Categoría *</Label>
                <Select onValueChange={v => setValue('category', v ?? '')} defaultValue="">
                  <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                {errors.category && <p className="text-xs text-destructive">{errors.category.message}</p>}
              </div>
              <div className="space-y-1">
                <Label>Fecha de Adquisición *</Label>
                <Input type="date" {...register('acquisition_date')} />
              </div>
              <div className="space-y-1">
                <Label>Costo de Adquisición *</Label>
                <Input type="number" {...register('acquisition_cost')} placeholder="0" min="0" />
                {errors.acquisition_cost && <p className="text-xs text-destructive">{errors.acquisition_cost.message}</p>}
              </div>
              <div className="space-y-1">
                <Label>Valor Residual</Label>
                <Input type="number" {...register('residual_value')} placeholder="0" min="0" />
              </div>
              <div className="space-y-1">
                <Label>Vida Útil (años) *</Label>
                <Input type="number" {...register('useful_life_years')} placeholder="5" min="1" max="100" />
              </div>
              <div className="space-y-1">
                <Label>Método de Depreciación</Label>
                <Select onValueChange={v => setValue('depreciation_method', (v ?? 'straight_line') as AssetForm['depreciation_method'])} defaultValue="straight_line">
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="straight_line">Línea Recta</SelectItem>
                    <SelectItem value="declining_balance">Doble Saldo Decreciente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Ubicación</Label>
                <Input {...register('location')} placeholder="Oficina principal" />
              </div>
              <div className="space-y-1">
                <Label>Serial / Placa</Label>
                <Input {...register('serial_number')} placeholder="SN-XXXXXX" />
              </div>
              <div className="col-span-2 space-y-1">
                <Label>Proveedor</Label>
                <Input {...register('supplier')} />
              </div>
              <div className="col-span-2 space-y-1">
                <Label>Notas</Label>
                <Input {...register('notes')} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { setCreate(false); reset(); }}>Cancelar</Button>
              <Button type="submit" disabled={createMut.isPending}>
                {createMut.isPending ? 'Guardando...' : 'Crear Activo'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Tabla de Amortización ──────────────────────────────────────── */}
      <Dialog open={!!scheduleAsset} onOpenChange={v => !v && setScheduleAsset(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Tabla de Depreciación — {scheduleAsset?.name}</DialogTitle>
          </DialogHeader>
          {scheduleData ? (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div><span className="text-muted-foreground">Costo:</span> <strong>{fmt(scheduleAsset?.acquisition_cost ?? 0)}</strong></div>
                <div><span className="text-muted-foreground">Método:</span> <strong>{scheduleAsset?.depreciation_method === 'straight_line' ? 'Línea Recta' : 'Doble Saldo'}</strong></div>
                <div><span className="text-muted-foreground">Vida útil:</span> <strong>{scheduleAsset?.useful_life_years} años</strong></div>
              </div>
              <div className="overflow-auto max-h-96">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      <th className="text-left px-2 py-1.5">Año</th>
                      <th className="text-left px-2 py-1.5">Mes</th>
                      <th className="text-right px-2 py-1.5">Depreciación</th>
                      <th className="text-right px-2 py-1.5">Acumulada</th>
                      <th className="text-right px-2 py-1.5">Valor Libros</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scheduleData.schedule?.map((row, i) => (
                      <tr key={i} className="border-t text-xs">
                        <td className="px-2 py-1">{row.year}</td>
                        <td className="px-2 py-1">{row.month}</td>
                        <td className="px-2 py-1 text-right">{fmt(row.depreciation_amount)}</td>
                        <td className="px-2 py-1 text-right">{fmt(row.accumulated_depreciation)}</td>
                        <td className="px-2 py-1 text-right font-medium">{fmt(row.book_value_end)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : <Skeleton className="h-40" />}
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Dar de baja ─────────────────────────────────────────────── */}
      <Dialog open={!!disposeAsset} onOpenChange={v => !v && setDisposeAsset(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Dar de Baja — {disposeAsset?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="text-sm p-3 rounded-md bg-amber-50 border border-amber-200 text-amber-800">
              Valor en libros actual: <strong>{fmt(disposeAsset?.book_value ?? 0)}</strong>
            </div>
            <div className="space-y-1">
              <Label>Fecha de Baja *</Label>
              <Input type="date" value={disposeForm.date} onChange={e => setDisposeForm(f => ({ ...f, date: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Motivo *</Label>
              <Select value={disposeForm.reason} onValueChange={v => setDisposeForm(f => ({ ...f, reason: v ?? 'sale' }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sale">Venta</SelectItem>
                  <SelectItem value="scrap">Desecho / Chatarra</SelectItem>
                  <SelectItem value="donation">Donación</SelectItem>
                  <SelectItem value="loss">Pérdida / Siniestro</SelectItem>
                  <SelectItem value="other">Otro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {disposeForm.reason === 'sale' && (
              <div className="space-y-1">
                <Label>Valor de Venta</Label>
                <Input type="number" value={disposeForm.amount} onChange={e => setDisposeForm(f => ({ ...f, amount: e.target.value }))} min="0" />
              </div>
            )}
            <div className="space-y-1">
              <Label>Observaciones</Label>
              <Input value={disposeForm.notes} onChange={e => setDisposeForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDisposeAsset(null)}>Cancelar</Button>
            <Button variant="destructive" disabled={disposeMut.isPending || !disposeForm.date}
              onClick={() => disposeMut.mutate({ id: disposeAsset!.id, data: { disposal_date: disposeForm.date, reason: disposeForm.reason, sale_amount: parseFloat(disposeForm.amount || '0'), notes: disposeForm.notes } })}>
              {disposeMut.isPending ? 'Procesando...' : 'Confirmar Baja'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </AddonGate>
  );
}
