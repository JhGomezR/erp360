'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { notify } from '@/lib/notify';
import { Plus, RefreshCw } from 'lucide-react';

import { currenciesApi } from '@/lib/api/central.api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tabs, TabsList, TabsTrigger, TabsContent,
} from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Currency {
  code: string;
  name: string;
  symbol: string;
  decimal_places: number;
  is_active: boolean;
}

interface ExchangeRate {
  id: number;
  base_code: string;
  target_code: string;
  rate: number;
  effective_date: string;
  source: string;
}

interface CurrencyForm {
  code: string;
  name: string;
  symbol: string;
  decimal_places: string;
}

interface RateForm {
  base_code: string;
  target_code: string;
  rate: string;
  effective_date: string;
}

// ─── Currencies Tab ───────────────────────────────────────────────────────────

function CurrenciesTab() {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['currencies'],
    queryFn: () => currenciesApi.list().then((r) => r.data as Currency[]),
  });
  const currencies = data ?? [];

  const form = useForm<CurrencyForm>({
    defaultValues: { code: '', name: '', symbol: '', decimal_places: '2' },
  });

  const createMutation = useMutation({
    mutationFn: (d: CurrencyForm) => currenciesApi.create({
      code:           d.code.toUpperCase(),
      name:           d.name,
      symbol:         d.symbol,
      decimal_places: Number(d.decimal_places),
    }),
    onSuccess: () => {
      notify.success('Moneda creada');
      qc.invalidateQueries({ queryKey: ['currencies'] });
      setCreateOpen(false);
      form.reset();
    },
    onError: (e) => notify.error(e, 'Error al crear'),
  });

  const toggleMutation = useMutation({
    mutationFn: (c: Currency) => currenciesApi.update(c.code, { is_active: !c.is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['currencies'] }),
    onError: (err) => notify.error(err, 'Error al actualizar'),
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setCreateOpen(true)} size="sm" className="gap-2">
          <Plus className="size-4" />Agregar moneda
        </Button>
      </div>

      <div className="rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Código</th>
              <th className="text-left px-4 py-3 font-medium">Nombre</th>
              <th className="text-left px-4 py-3 font-medium">Símbolo</th>
              <th className="text-left px-4 py-3 font-medium">Decimales</th>
              <th className="text-center px-4 py-3 font-medium">Activa</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading
              ? Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i}>{Array.from({ length: 5 }).map((__, j) => (
                    <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-20" /></td>
                  ))}</tr>
                ))
              : currencies.map((c) => (
                  <tr key={c.code} className="hover:bg-muted/30">
                    <td className="px-4 py-3 font-mono font-bold">{c.code}</td>
                    <td className="px-4 py-3">{c.name}</td>
                    <td className="px-4 py-3 font-bold">{c.symbol}</td>
                    <td className="px-4 py-3">{c.decimal_places}</td>
                    <td className="px-4 py-3 text-center">
                      <button
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${c.is_active ? 'bg-green-500' : 'bg-muted-foreground/30'}`}
                        onClick={() => toggleMutation.mutate(c)}
                        disabled={toggleMutation.isPending}
                      >
                        <span className={`inline-block h-4 w-4 rounded-full bg-white transition-transform shadow ${c.is_active ? 'translate-x-4' : 'translate-x-0.5'}`} />
                      </button>
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Nueva moneda</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit((d) => createMutation.mutate(d))} className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Código ISO <span className="text-destructive">*</span></Label>
                <Input {...form.register('code', { required: true })} placeholder="USD" maxLength={3} className="uppercase" />
              </div>
              <div className="space-y-1.5">
                <Label>Símbolo <span className="text-destructive">*</span></Label>
                <Input {...form.register('symbol', { required: true })} placeholder="$" maxLength={5} />
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label>Nombre <span className="text-destructive">*</span></Label>
                <Input {...form.register('name', { required: true })} placeholder="Dólar Americano" />
              </div>
              <div className="space-y-1.5">
                <Label>Decimales</Label>
                <Input type="number" min={0} max={8} {...form.register('decimal_places')} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setCreateOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Creando...' : 'Crear'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Exchange Rates Tab ───────────────────────────────────────────────────────

function ExchangeRatesTab() {
  const qc = useQueryClient();
  const [filterBase, setFilterBase] = useState('');

  const { data: currencies } = useQuery({
    queryKey: ['currencies'],
    queryFn: () => currenciesApi.list().then((r) => r.data as Currency[]),
  });

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['exchange-rates', filterBase],
    queryFn: () => currenciesApi.rateList(filterBase ? { base: filterBase } : undefined).then((r) => r.data as ExchangeRate[]),
  });
  const rates = data ?? [];

  const form = useForm<RateForm>({
    defaultValues: { base_code: 'COP', target_code: 'USD', rate: '', effective_date: new Date().toISOString().split('T')[0] },
  });

  const createMutation = useMutation({
    mutationFn: (d: RateForm) => currenciesApi.rateCreate({
      base_code:      d.base_code.toUpperCase(),
      target_code:    d.target_code.toUpperCase(),
      rate:           Number(d.rate),
      effective_date: d.effective_date,
    }),
    onSuccess: () => {
      notify.success('Tasa guardada');
      qc.invalidateQueries({ queryKey: ['exchange-rates'] });
      form.reset({ base_code: 'COP', target_code: 'USD', rate: '', effective_date: new Date().toISOString().split('T')[0] });
    },
    onError: (e) => notify.error(e, 'Error al guardar'),
  });

  const currencyCodes = (currencies ?? []).map((c) => c.code);

  return (
    <div className="space-y-4">
      {/* Add rate form */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Agregar / actualizar tasa</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit((d) => createMutation.mutate(d))}
            className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
            <div className="space-y-1.5">
              <Label>Moneda base</Label>
              <Select value={form.watch('base_code')} onValueChange={(v) => form.setValue('base_code', v ?? 'COP')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {currencyCodes.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Moneda destino</Label>
              <Select value={form.watch('target_code')} onValueChange={(v) => form.setValue('target_code', v ?? 'USD')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {currencyCodes.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Tasa <span className="text-destructive">*</span></Label>
              <Input type="number" step="0.00000001" min="0.0000001"
                {...form.register('rate', { required: true })} placeholder="4200" />
            </div>
            <div className="space-y-1.5">
              <Label>Fecha efectiva</Label>
              <Input type="date" {...form.register('effective_date', { required: true })} />
            </div>
            <div className="col-span-2 sm:col-span-4 flex justify-end">
              <Button type="submit" size="sm" disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Guardando...' : 'Guardar tasa'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Filter */}
      <div className="flex items-center gap-2">
        <Select value={filterBase || 'all'} onValueChange={(v) => setFilterBase(v === 'all' || v === null ? '' : v)}>
          <SelectTrigger className="w-40 h-9"><SelectValue placeholder="Base" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las bases</SelectItem>
            {currencyCodes.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5">
          <RefreshCw className="size-3" />Actualizar
        </Button>
      </div>

      <div className="rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Base</th>
              <th className="text-left px-4 py-3 font-medium">Destino</th>
              <th className="text-right px-4 py-3 font-medium">Tasa</th>
              <th className="text-left px-4 py-3 font-medium">Fecha</th>
              <th className="text-left px-4 py-3 font-medium">Fuente</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>{Array.from({ length: 5 }).map((__, j) => (
                    <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-16" /></td>
                  ))}</tr>
                ))
              : rates.map((r) => (
                  <tr key={r.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3 font-mono font-bold">{r.base_code}</td>
                    <td className="px-4 py-3 font-mono font-bold">{r.target_code}</td>
                    <td className="px-4 py-3 text-right font-mono">{r.rate.toLocaleString('es-CO', { maximumFractionDigits: 8 })}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {new Date(r.effective_date).toLocaleDateString('es-CO')}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="secondary">{r.source}</Badge>
                    </td>
                  </tr>
                ))}
            {!isLoading && rates.length === 0 && (
              <tr><td colSpan={5} className="text-center py-8 text-muted-foreground text-sm">Sin tasas registradas</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CurrenciesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Monedas y Tasas de Cambio</h1>
        <p className="text-muted-foreground text-sm">Gestión de divisas para el sistema</p>
      </div>

      <Tabs defaultValue="currencies">
        <TabsList>
          <TabsTrigger value="currencies">Monedas</TabsTrigger>
          <TabsTrigger value="rates">Tasas de cambio</TabsTrigger>
        </TabsList>
        <TabsContent value="currencies" className="mt-4">
          <CurrenciesTab />
        </TabsContent>
        <TabsContent value="rates" className="mt-4">
          <ExchangeRatesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
