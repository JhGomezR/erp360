'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { notify } from '@/lib/notify';
import { Plus, CheckCircle2, XCircle, Trash2 } from 'lucide-react';

import { debitNotesApi, setTenantSlug } from '@/lib/api/tenant.api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DebitNote {
  id: number;
  note_number: string;
  sale_id?: number;
  sales_order_id?: number;
  reason: string;
  amount: number;
  exchange_difference: number;
  currency_code: string;
  exchange_rate: number;
  status: 'draft' | 'issued' | 'cancelled';
  issued_at?: string;
  created_at: string;
}

interface CreateForm {
  reason: string;
  amount: string;
  sale_id: string;
  currency_code: string;
  exchange_rate: string;
  exchange_difference: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_META: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  draft:     { label: 'Borrador',   variant: 'secondary' },
  issued:    { label: 'Emitida',    variant: 'default' },
  cancelled: { label: 'Cancelada',  variant: 'outline' },
};

const fmt = (n: number, currency = 'COP') =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency, maximumFractionDigits: 2 }).format(n);

const fmtDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString('es-CO') : '—';

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DebitNotesPage() {
  const params = useParams();
  const slug   = params.slug as string;
  const qc     = useQueryClient();

  setTenantSlug(slug);

  const [createOpen, setCreateOpen] = useState(false);
  const [deleteId, setDeleteId]     = useState<number | null>(null);
  const [page, setPage]             = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['debit-notes', slug, page],
    queryFn: async () => {
      const r = await debitNotesApi.list({ page });
      return r.data as { data: DebitNote[]; last_page: number; total: number };
    },
  });

  const notes: DebitNote[] = data?.data ?? [];
  const lastPage = data?.last_page ?? 1;

  const form = useForm<CreateForm>({
    defaultValues: {
      reason: '', amount: '', sale_id: '',
      currency_code: 'COP', exchange_rate: '1', exchange_difference: '0',
    },
  });

  const createMutation = useMutation({
    mutationFn: (d: CreateForm) => debitNotesApi.create({
      reason:              d.reason,
      amount:              Number(d.amount),
      sale_id:             d.sale_id ? Number(d.sale_id) : undefined,
      currency_code:       d.currency_code || 'COP',
      exchange_rate:       Number(d.exchange_rate) || 1,
      exchange_difference: Number(d.exchange_difference) || 0,
    }),
    onSuccess: () => {
      notify.success('Nota de débito creada');
      qc.invalidateQueries({ queryKey: ['debit-notes', slug] });
      setCreateOpen(false);
      form.reset();
    },
    onError: (e) => notify.error(e, 'Error al crear'),
  });

  const issueMutation = useMutation({
    mutationFn: (id: number) => debitNotesApi.issue(id),
    onSuccess: () => { notify.success('Nota emitida'); qc.invalidateQueries({ queryKey: ['debit-notes', slug] }); },
    onError: (e) => notify.error(e, 'Error al emitir'),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: number) => debitNotesApi.cancel(id),
    onSuccess: () => { notify.success('Nota cancelada'); qc.invalidateQueries({ queryKey: ['debit-notes', slug] }); },
    onError: (e) => notify.error(e, 'Error al cancelar'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => debitNotesApi.destroy(id),
    onSuccess: () => {
      notify.success('Eliminada');
      qc.invalidateQueries({ queryKey: ['debit-notes', slug] });
      setDeleteId(null);
    },
    onError: (e) => notify.error(e, 'Error al eliminar'),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Notas de Débito</h1>
          <p className="text-muted-foreground text-sm">Ajustes de cargo y diferencias cambiarias</p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-2">
          <Plus className="size-4" />Nueva nota de débito
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">N°</th>
                  <th className="text-left px-4 py-3 font-medium">Venta ref.</th>
                  <th className="text-left px-4 py-3 font-medium">Razón</th>
                  <th className="text-right px-4 py-3 font-medium">Importe</th>
                  <th className="text-right px-4 py-3 font-medium">Dif. cambio</th>
                  <th className="text-left px-4 py-3 font-medium">Moneda</th>
                  <th className="text-left px-4 py-3 font-medium">Estado</th>
                  <th className="text-left px-4 py-3 font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {isLoading
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i}>{Array.from({ length: 8 }).map((__, j) => (
                        <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-16" /></td>
                      ))}</tr>
                    ))
                  : notes.map((note) => {
                      const meta = STATUS_META[note.status] ?? STATUS_META.draft;
                      return (
                        <tr key={note.id} className="hover:bg-muted/30">
                          <td className="px-4 py-3 font-mono text-xs font-medium">{note.note_number}</td>
                          <td className="px-4 py-3 text-muted-foreground text-xs">
                            {note.sale_id ? `#${note.sale_id}` : note.sales_order_id ? `OV-${note.sales_order_id}` : '—'}
                          </td>
                          <td className="px-4 py-3">
                            <p className="line-clamp-2 text-xs">{note.reason}</p>
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-xs">
                            {fmt(note.amount, note.currency_code)}
                          </td>
                          <td className="px-4 py-3 text-right text-xs text-muted-foreground">
                            {note.exchange_difference !== 0 ? fmt(note.exchange_difference, note.currency_code) : '—'}
                          </td>
                          <td className="px-4 py-3 font-mono text-xs">{note.currency_code}</td>
                          <td className="px-4 py-3">
                            <Badge variant={meta.variant}>{meta.label}</Badge>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex gap-1">
                              {note.status === 'draft' && (
                                <>
                                  <Button variant="outline" size="sm" className="gap-1 h-7 text-xs text-green-700 border-green-300"
                                    onClick={() => issueMutation.mutate(note.id)}
                                    disabled={issueMutation.isPending}>
                                    <CheckCircle2 className="size-3" />Emitir
                                  </Button>
                                  <Button variant="outline" size="sm" className="gap-1 h-7 text-xs text-orange-700 border-orange-300"
                                    onClick={() => cancelMutation.mutate(note.id)}
                                    disabled={cancelMutation.isPending}>
                                    <XCircle className="size-3" />Cancelar
                                  </Button>
                                  <Button variant="ghost" size="sm" className="gap-1 h-7 text-xs text-destructive"
                                    onClick={() => setDeleteId(note.id)}>
                                    <Trash2 className="size-3" />
                                  </Button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                {!isLoading && notes.length === 0 && (
                  <tr><td colSpan={8} className="text-center py-8 text-muted-foreground text-sm">No hay notas de débito</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {lastPage > 1 && (
        <div className="flex items-center gap-2 text-sm">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Anterior</Button>
          <span>{page} / {lastPage}</span>
          <Button size="sm" variant="outline" disabled={page >= lastPage} onClick={() => setPage((p) => p + 1)}>Siguiente</Button>
        </div>
      )}

      {/* ── Create Dialog ── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Nueva nota de débito</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit((d) => createMutation.mutate(d))} className="flex flex-col gap-4">
            <div className="space-y-1.5">
              <Label>Razón <span className="text-destructive">*</span></Label>
              <Textarea {...form.register('reason', { required: true })} rows={3}
                placeholder="Describe el motivo de la nota de débito..." />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Importe <span className="text-destructive">*</span></Label>
                <Input type="number" step="0.01" min="0.01" {...form.register('amount', { required: true })}
                  placeholder="0.00" />
              </div>
              <div className="space-y-1.5">
                <Label>Venta ref. (ID)</Label>
                <Input type="number" {...form.register('sale_id')} placeholder="ID de la venta" />
              </div>
              <div className="space-y-1.5">
                <Label>Moneda</Label>
                <Input {...form.register('currency_code')} placeholder="COP" maxLength={3} className="uppercase" />
              </div>
              <div className="space-y-1.5">
                <Label>Tasa de cambio</Label>
                <Input type="number" step="0.00000001" min="0" {...form.register('exchange_rate')} placeholder="1" />
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label>Diferencia cambiaria</Label>
                <Input type="number" step="0.01" {...form.register('exchange_difference')} placeholder="0.00" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setCreateOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Creando...' : 'Crear nota'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation ── */}
      <Dialog open={!!deleteId} onOpenChange={(v) => { if (!v) setDeleteId(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-destructive">Eliminar nota de débito</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Esta acción no se puede deshacer.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancelar</Button>
            <Button variant="destructive" disabled={deleteMutation.isPending}
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}>
              {deleteMutation.isPending ? 'Eliminando...' : 'Eliminar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
