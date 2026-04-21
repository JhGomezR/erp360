'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notify } from '@/lib/notify';
import { addonHistoryApi } from '@/lib/api/central.api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { History, PowerOff, Power } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AddonRecord {
  tenant_id:      string;
  addon_id:       number;
  tenant_name:    string;
  tenant_slug:    string;
  addon_name:     string;
  module_key:     string;
  price:          number;
  is_active:      boolean;
  activated_at:   string | null;
  deactivated_at: string | null;
  expires_at:     string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const fmt = (n: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AddonHistoryPage() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('active');
  const [confirmAction, setConfirmAction] = useState<{ record: AddonRecord; action: 'deactivate' | 'activate' } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['addon-history', statusFilter],
    queryFn: () =>
      addonHistoryApi
        .list({ status: statusFilter })
        .then((r) => {
          const body = r.data as { data?: AddonRecord[]; total?: number } | AddonRecord[];
          return Array.isArray(body) ? body : (body.data ?? []);
        }),
  });

  const records = (data ?? []) as AddonRecord[];

  const deactivateMutation = useMutation({
    mutationFn: ({ tenantId, addonId }: { tenantId: string; addonId: number }) =>
      addonHistoryApi.deactivate(tenantId, addonId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['addon-history'] });
      notify.success('Add-on desactivado');
    },
    onError: (err) => notify.error(err, 'Error al desactivar'),
  });

  const activateMutation = useMutation({
    mutationFn: ({ tenantId, addonId }: { tenantId: string; addonId: number }) =>
      addonHistoryApi.activate(tenantId, addonId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['addon-history'] });
      notify.success('Add-on reactivado');
    },
    onError: (err) => notify.error(err, 'Error al reactivar'),
  });

  const isPending = deactivateMutation.isPending || activateMutation.isPending;

  function handleConfirm() {
    if (!confirmAction) return;
    const { record, action } = confirmAction;
    if (action === 'deactivate') {
      deactivateMutation.mutate({ tenantId: record.tenant_id, addonId: record.addon_id });
    } else {
      activateMutation.mutate({ tenantId: record.tenant_id, addonId: record.addon_id });
    }
    setConfirmAction(null);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Historial de Add-ons</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Seguimiento de add-ons activos e inactivos por tenant — activaciones, cancelaciones y vencimientos
        </p>
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-3">
        <Select value={statusFilter} onValueChange={(v) => v && setStatusFilter(v)}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Activos</SelectItem>
            <SelectItem value="inactive">Inactivos</SelectItem>
            <SelectItem value="all">Todos</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Tabla */}
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Tenant</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Add-on</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Precio/mes</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Estado</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">F. Activación</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">F. Vencimiento / Cancelación</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <Skeleton className="h-4 w-20" />
                      </td>
                    ))}
                  </tr>
                ))
              : records.length === 0
              ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                    <div className="flex flex-col items-center gap-2">
                      <History className="size-8 opacity-40" />
                      <span className="text-sm">
                        No hay add-ons {statusFilter === 'active' ? 'activos' : statusFilter === 'inactive' ? 'inactivos' : ''} registrados
                      </span>
                    </div>
                  </td>
                </tr>
              )
              : records.map((rec) => (
                <tr key={`${rec.tenant_id}-${rec.addon_id}`} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium">{rec.tenant_name ?? '—'}</p>
                    <p className="text-xs text-muted-foreground font-mono">{rec.tenant_slug}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium">{rec.addon_name}</p>
                    <code className="text-xs text-muted-foreground">{rec.module_key}</code>
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {rec.price === 0
                      ? <span className="text-green-600 font-medium">Gratis</span>
                      : <span>{fmt(rec.price)}</span>}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={rec.is_active ? 'default' : 'secondary'}>
                      {rec.is_active ? 'Activo' : 'Inactivo'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground tabular-nums">
                    {fmtDate(rec.activated_at)}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground tabular-nums">
                    {rec.is_active
                      ? rec.expires_at
                        ? <span className="text-amber-600">{fmtDate(rec.expires_at)}</span>
                        : <span className="text-xs italic">Sin vencimiento</span>
                      : fmtDate(rec.deactivated_at)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {rec.is_active ? (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setConfirmAction({ record: rec, action: 'deactivate' })}
                        disabled={isPending}
                        aria-label="Desactivar"
                      >
                        <PowerOff className="size-4" />
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-green-600 hover:text-green-600"
                        onClick={() => setConfirmAction({ record: rec, action: 'activate' })}
                        disabled={isPending}
                        aria-label="Reactivar"
                      >
                        <Power className="size-4" />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {/* Confirm Dialog */}
      <AlertDialog open={!!confirmAction} onOpenChange={(v) => !v && setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction?.action === 'deactivate' ? 'Desactivar add-on' : 'Reactivar add-on'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction?.action === 'deactivate'
                ? <>¿Desactivar <strong>&ldquo;{confirmAction?.record.addon_name}&rdquo;</strong> para <strong>{confirmAction?.record.tenant_name}</strong>? El tenant perderá acceso inmediatamente al módulo.</>
                : <>¿Reactivar <strong>&ldquo;{confirmAction?.record.addon_name}&rdquo;</strong> para <strong>{confirmAction?.record.tenant_name}</strong>? El tenant recuperará acceso al módulo.</>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending} />
            <AlertDialogAction onClick={handleConfirm} disabled={isPending}>
              {confirmAction?.action === 'deactivate' ? 'Desactivar' : 'Reactivar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
