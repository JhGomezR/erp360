'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { FileX2, Send, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import { notify } from '@/lib/notify';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { creditNotesApi, setTenantSlug } from '@/lib/api/tenant.api';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);

const STATUS_LABEL: Record<string, string> = {
  draft: 'Borrador', issued: 'Emitida', accepted: 'Aceptada', rejected: 'Rechazada',
};
const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive'> = {
  draft: 'secondary', issued: 'default', accepted: 'default', rejected: 'destructive',
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CreditNotesPage() {
  const { slug } = useParams<{ slug: string }>();
  setTenantSlug(slug);
  const qc = useQueryClient();

  const [page, setPage] = useState(1);
  const [filterStatus, setFilterStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['credit-notes', slug, page, filterStatus, from, to],
    queryFn: () =>
      creditNotesApi.list({ page, ...(filterStatus ? { status: filterStatus } : {}), ...(from ? { from } : {}), ...(to ? { to } : {}) })
        .then((r) => r.data),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['credit-notes', slug] });

  const issueMutation = useMutation({
    mutationFn: (id: number) => creditNotesApi.issue(id).then((r) => r.data),
    onSuccess: () => { notify.success('Nota crédito emitida.'); invalidate(); },
    onError: () => notify.error('Error al emitir.'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => creditNotesApi.destroy(id),
    onSuccess: () => { notify.success('Nota crédito eliminada.'); invalidate(); },
    onError: () => notify.error('Error al eliminar.'),
  });

  const notes: any[] = (data as any)?.data ?? [];
  const lastPage: number = (data as any)?.last_page ?? 1;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileX2 className="h-6 w-6" />
            Notas Crédito Electrónicas
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            NC-FE — Anulación o corrección de facturas electrónicas DIAN.
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <Select value={filterStatus || '_all'} onValueChange={(v) => { setFilterStatus(v === '_all' ? '' : v); setPage(1); }}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">Todos</SelectItem>
            {Object.entries(STATUS_LABEL).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} className="w-36" placeholder="Desde" />
        <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} className="w-36" placeholder="Hasta" />
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="border-b">
              <tr className="text-left text-muted-foreground">
                <th className="px-4 py-3">Número</th>
                <th className="px-4 py-3">Venta ref.</th>
                <th className="px-4 py-3">Razón</th>
                <th className="px-4 py-3 text-right">Monto</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3">CUDE</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i} className="border-b">
                      {Array.from({ length: 7 }).map((_, j) => (
                        <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                      ))}
                    </tr>
                  ))
                : notes.map((n) => (
                    <tr key={n.id} className="border-b hover:bg-muted/30">
                      <td className="px-4 py-3 font-mono font-medium">{n.note_number}</td>
                      <td className="px-4 py-3 text-xs">#{n.sale_id}</td>
                      <td className="px-4 py-3 text-xs max-w-xs truncate">{n.reason}</td>
                      <td className="px-4 py-3 text-right">{fmt(n.amount)}</td>
                      <td className="px-4 py-3">
                        <Badge variant={STATUS_VARIANT[n.status]}>{STATUS_LABEL[n.status]}</Badge>
                      </td>
                      <td className="px-4 py-3 text-xs font-mono max-w-24 truncate" title={n.cude ?? ''}>
                        {n.cude ? n.cude.slice(0, 12) + '…' : '-'}
                      </td>
                      <td className="px-4 py-3 text-right space-x-1">
                        {n.status === 'draft' && (
                          <>
                            <Button
                              size="sm" variant="ghost"
                              onClick={() => issueMutation.mutate(n.id)}
                              disabled={issueMutation.isPending}
                            >
                              <Send className="h-4 w-4 text-blue-500" />
                            </Button>
                            <Button
                              size="sm" variant="ghost"
                              onClick={() => { if (confirm('¿Eliminar?')) deleteMutation.mutate(n.id); }}
                              disabled={deleteMutation.isPending}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
              {!isLoading && notes.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                    No hay notas crédito registradas.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {lastPage > 1 && (
        <div className="flex justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm self-center">Página {page} / {lastPage}</span>
          <Button variant="outline" size="sm" disabled={page >= lastPage} onClick={() => setPage((p) => p + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
