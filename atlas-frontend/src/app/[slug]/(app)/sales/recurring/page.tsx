'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, useFieldArray } from 'react-hook-form';
import { notify } from '@/lib/notify';
import { Plus, Play, Trash2, RefreshCw, X, RepeatIcon } from 'lucide-react';

import { recurringInvoicesApi, setTenantSlug } from '@/lib/api/tenant.api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RecurringItem {
  description: string;
  quantity: string;
  unit_price: string;
}

interface RecurringForm {
  name: string;
  customer_name: string;
  customer_email: string;
  frequency: 'weekly' | 'biweekly' | 'monthly';
  payment_method: string;
  next_run_date: string;
  notes: string;
  items: RecurringItem[];
}

interface RecurringInvoice {
  id: number;
  name: string;
  customer_name: string;
  customer_email?: string;
  frequency: string;
  next_run_date: string;
  last_run_date?: string;
  active: boolean;
  items: { description: string; quantity: number; unit_price: number }[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const FREQ_LABELS: Record<string, string> = {
  weekly: 'Semanal',
  biweekly: 'Quincenal',
  monthly: 'Mensual',
};

const fmtDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString('es-CO') : '—';

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function RecurringPage() {
  const params = useParams();
  const slug   = params.slug as string;
  const qc     = useQueryClient();

  setTenantSlug(slug);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem]     = useState<RecurringInvoice | null>(null);
  const [deleteId, setDeleteId]     = useState<number | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['recurring-invoices', slug],
    queryFn: async () => {
      const r = await recurringInvoicesApi.list();
      return (r.data as any)?.data ?? (r.data as RecurringInvoice[]) ?? [];
    },
  });
  const items: RecurringInvoice[] = data ?? [];

  const form = useForm<RecurringForm>({
    defaultValues: {
      name: '', customer_name: '', customer_email: '',
      frequency: 'monthly', payment_method: 'cash',
      next_run_date: '', notes: '',
      items: [{ description: '', quantity: '1', unit_price: '0' }],
    },
  });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'items' });

  const saveMutation = useMutation({
    mutationFn: (d: RecurringForm) => {
      const payload = {
        name:            d.name,
        customer_name:   d.customer_name,
        customer_email:  d.customer_email || undefined,
        frequency:       d.frequency,
        payment_method:  d.payment_method,
        next_run_date:   d.next_run_date,
        notes:           d.notes || undefined,
        items: d.items.map((i) => ({
          description: i.description,
          quantity:    Number(i.quantity),
          unit_price:  Number(i.unit_price),
        })),
      };
      if (editItem) return recurringInvoicesApi.update(editItem.id, payload);
      return recurringInvoicesApi.create(payload);
    },
    onSuccess: () => {
      notify.success(editItem ? 'Actualizado' : 'Creado');
      qc.invalidateQueries({ queryKey: ['recurring-invoices', slug] });
      setDialogOpen(false);
      setEditItem(null);
      form.reset();
    },
    onError: (e) => notify.error(e, 'Error al guardar'),
  });

  const toggleMutation = useMutation({
    mutationFn: (id: number) => recurringInvoicesApi.toggle(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recurring-invoices', slug] }),
    onError: (err) => notify.error(err, 'Error al cambiar estado'),
  });

  const runNowMutation = useMutation({
    mutationFn: (id: number) => recurringInvoicesApi.runNow(id),
    onSuccess: (res) => {
      notify.success((res.data as any)?.message ?? 'Ejecutado');
      qc.invalidateQueries({ queryKey: ['recurring-invoices', slug] });
    },
    onError: (e) => notify.error(e, 'Error al ejecutar'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => recurringInvoicesApi.destroy(id),
    onSuccess: () => {
      notify.success('Eliminado');
      qc.invalidateQueries({ queryKey: ['recurring-invoices', slug] });
      setDeleteId(null);
    },
    onError: (err) => notify.error(err, 'Error al eliminar'),
  });

  function openCreate() {
    setEditItem(null);
    form.reset({
      name: '', customer_name: '', customer_email: '',
      frequency: 'monthly', payment_method: 'cash',
      next_run_date: '', notes: '',
      items: [{ description: '', quantity: '1', unit_price: '0' }],
    });
    setDialogOpen(true);
  }

  function openEdit(ri: RecurringInvoice) {
    setEditItem(ri);
    form.reset({
      name:           ri.name,
      customer_name:  ri.customer_name,
      customer_email: ri.customer_email ?? '',
      frequency:      ri.frequency as RecurringForm['frequency'],
      payment_method: 'cash',
      next_run_date:  ri.next_run_date,
      notes:          '',
      items: ri.items.map((i) => ({
        description: i.description,
        quantity:    String(i.quantity),
        unit_price:  String(i.unit_price),
      })),
    });
    setDialogOpen(true);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Facturación Recurrente</h1>
          <p className="text-muted-foreground text-sm">Facturas automáticas periódicas</p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="size-4" />Nueva factura recurrente
        </Button>
      </div>

      <div className="flex flex-col gap-3">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-20 rounded-2xl bg-muted animate-pulse" />)
          : items.length === 0
          ? (
            <div className="flex flex-col items-center justify-center py-14 gap-3 text-muted-foreground">
              <div className="size-14 rounded-full bg-muted flex items-center justify-center">
                <RepeatIcon className="size-7 opacity-40" />
              </div>
              <p className="font-medium">No hay facturas recurrentes</p>
              <Button variant="outline" size="sm" onClick={openCreate}>
                <Plus className="size-4 mr-2" /> Nueva factura recurrente
              </Button>
            </div>
          )
          : items.map((ri) => (
            <div key={ri.id} className="rounded-2xl border bg-card p-4 flex items-center gap-4 hover:shadow-sm hover:border-primary/20 transition-all">
              <div className="size-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                <RepeatIcon className="size-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm">{ri.name}</p>
                <p className="text-xs text-muted-foreground truncate">{ri.customer_name}</p>
              </div>
              <div className="hidden sm:flex items-center gap-4 text-sm flex-shrink-0">
                <div className="text-center">
                  <p className="text-xs text-muted-foreground">Frecuencia</p>
                  <Badge variant="secondary" className="text-xs">{FREQ_LABELS[ri.frequency] ?? ri.frequency}</Badge>
                </div>
                <div className="text-center">
                  <p className="text-xs text-muted-foreground">Próximo</p>
                  <p className="text-xs font-medium">{fmtDate(ri.next_run_date)}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-muted-foreground">Último</p>
                  <p className="text-xs text-muted-foreground">{fmtDate(ri.last_run_date)}</p>
                </div>
              </div>
              <button
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0 ${ri.active ? 'bg-green-500' : 'bg-muted-foreground/30'}`}
                onClick={() => toggleMutation.mutate(ri.id)}
                disabled={toggleMutation.isPending}
              >
                <span className={`inline-block h-4 w-4 rounded-full bg-white transition-transform shadow ${ri.active ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </button>
              <div className="flex gap-1 flex-shrink-0">
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => openEdit(ri)}>
                  <RefreshCw className="size-3.5" />
                </Button>
                <Button variant="outline" size="sm" className="h-8 px-2 text-xs text-blue-700 border-blue-300"
                  onClick={() => runNowMutation.mutate(ri.id)}
                  disabled={runNowMutation.isPending}>
                  <Play className="size-3 mr-1" />Ejecutar
                </Button>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive"
                  onClick={() => setDeleteId(ri.id)}>
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </div>
          ))
        }
      </div>

      {/* ── Create/Edit Dialog ── */}
      <Dialog open={dialogOpen} onOpenChange={(v) => { if (!v) { setDialogOpen(false); setEditItem(null); } }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col gap-0 p-0">
          <DialogHeader className="px-6 pt-5 pb-3 border-b">
            <DialogTitle>{editItem ? 'Editar' : 'Nueva'} factura recurrente</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={form.handleSubmit((d) => saveMutation.mutate(d))}
            className="flex flex-col gap-4 overflow-y-auto flex-1 px-6 py-4"
          >
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Nombre <span className="text-destructive">*</span></Label>
                <Input {...form.register('name', { required: true })} placeholder="Ej. Arriendo mensual" />
              </div>
              <div className="space-y-1.5">
                <Label>Cliente <span className="text-destructive">*</span></Label>
                <Input {...form.register('customer_name', { required: true })} placeholder="Nombre del cliente" />
              </div>
              <div className="space-y-1.5">
                <Label>Email cliente</Label>
                <Input type="email" {...form.register('customer_email')} placeholder="correo@empresa.com" />
              </div>
              <div className="space-y-1.5">
                <Label>Frecuencia <span className="text-destructive">*</span></Label>
                <Select
                  value={form.watch('frequency')}
                  onValueChange={(v) => form.setValue('frequency', v as RecurringForm['frequency'])}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weekly">Semanal</SelectItem>
                    <SelectItem value="biweekly">Quincenal</SelectItem>
                    <SelectItem value="monthly">Mensual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Método de pago</Label>
                <Select
                  value={form.watch('payment_method')}
                  onValueChange={(v) => form.setValue('payment_method', v ?? 'cash')}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Efectivo</SelectItem>
                    <SelectItem value="card">Tarjeta</SelectItem>
                    <SelectItem value="transfer">Transferencia</SelectItem>
                    <SelectItem value="credit">Crédito</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Primer / próximo envío <span className="text-destructive">*</span></Label>
                <Input type="date" {...form.register('next_run_date', { required: true })} />
              </div>
            </div>

            {/* Items */}
            <div className="rounded-lg border overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2 bg-muted/30">
                <span className="text-sm font-medium">Ítems</span>
                <Button type="button" variant="outline" size="sm" className="gap-1 h-7 text-xs"
                  onClick={() => append({ description: '', quantity: '1', unit_price: '0' })}>
                  <Plus className="size-3" />Agregar
                </Button>
              </div>
              <div className="p-3 space-y-2">
                {fields.map((field, index) => (
                  <div key={field.id} className="grid grid-cols-[1fr_70px_90px_32px] gap-2 items-center">
                    <Input className="h-8 text-xs" placeholder="Descripción"
                      {...form.register(`items.${index}.description`)} />
                    <Input type="number" min={0.001} step="0.001" className="h-8 text-xs"
                      {...form.register(`items.${index}.quantity`)} />
                    <Input type="number" step="0.01" className="h-8 text-xs"
                      {...form.register(`items.${index}.unit_price`)} />
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8"
                      onClick={() => remove(index)} disabled={fields.length === 1}>
                      <X className="size-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <DialogFooter className="mt-auto pt-2">
              <Button variant="outline" type="button" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? 'Guardando...' : editItem ? 'Actualizar' : 'Crear'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation ── */}
      <Dialog open={!!deleteId} onOpenChange={(v) => { if (!v) setDeleteId(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-destructive">Eliminar factura recurrente</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Esta acción no se puede deshacer.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancelar</Button>
            <Button variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}>
              {deleteMutation.isPending ? 'Eliminando...' : 'Eliminar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
