'use client';

import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notify } from '@/lib/notify';
import { ChefHat, Clock, ArrowRight, CheckCheck } from 'lucide-react';

import { kdsApi } from '@/lib/api/tenant.api';
import { AddonGate } from '@/components/shared/AddonPaywall';
import type { TableOrderItem } from '@/types';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

// ─── Status columns ────────────────────────────────────────────────────────────

const COLUMNS: {
  status: TableOrderItem['status'];
  label: string;
  nextLabel: string;
  nextStatus: TableOrderItem['status'] | null;
  headerClass: string;
}[] = [
  {
    status: 'pending',
    label: 'Pendientes',
    nextLabel: 'Iniciar',
    nextStatus: 'preparing',
    headerClass: 'bg-yellow-50 border-yellow-200 text-yellow-800',
  },
  {
    status: 'preparing',
    label: 'Preparando',
    nextLabel: 'Listo',
    nextStatus: 'ready',
    headerClass: 'bg-blue-50 border-blue-200 text-blue-800',
  },
  {
    status: 'ready',
    label: 'Listos para servir',
    nextLabel: 'Servido',
    nextStatus: 'served',
    headerClass: 'bg-emerald-50 border-emerald-200 text-emerald-800',
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatElapsed(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (diff < 1) return '< 1 min';
  if (diff < 60) return `${diff} min`;
  return `${Math.floor(diff / 60)}h ${diff % 60}m`;
}

function urgencyClass(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (diff >= 20) return 'border-destructive/60 bg-destructive/5';
  if (diff >= 10) return 'border-orange-300 bg-orange-50/50';
  return '';
}

// ─── Item Card ─────────────────────────────────────────────────────────────────

interface ItemCardProps {
  item: TableOrderItem;
  nextLabel: string;
  onAdvance: (id: number) => void;
  isPending: boolean;
}

function ItemCard({ item, nextLabel, onAdvance, isPending }: ItemCardProps) {
  const createdAt = (item as any).created_at as string | undefined;
  const tableName = (item as any).table_name as string | undefined;
  const orderNumber = (item as any).order_number as string | number | undefined;

  return (
    <div
      className={`rounded-lg border bg-card p-3 flex flex-col gap-2 shadow-xs transition-colors ${
        createdAt ? urgencyClass(createdAt) : ''
      }`}
    >
      {/* Product name */}
      <p className="font-semibold text-sm leading-tight">
        {item.product?.name ?? `Producto #${item.product_id}`}
      </p>

      {/* Quantity */}
      <div className="flex items-center gap-2">
        <Badge variant="secondary" className="text-xs tabular-nums">
          × {item.quantity}
        </Badge>
        {tableName && (
          <span className="text-xs text-muted-foreground">
            Mesa: <strong>{tableName}</strong>
          </span>
        )}
        {orderNumber && (
          <span className="text-xs text-muted-foreground">#{orderNumber}</span>
        )}
      </div>

      {/* Notes */}
      {item.notes && (
        <p className="text-xs italic text-muted-foreground border-l-2 border-muted pl-2">
          {item.notes}
        </p>
      )}

      {/* Footer: elapsed + action */}
      <div className="flex items-center justify-between mt-auto pt-1">
        {createdAt ? (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="size-3" />
            {formatElapsed(createdAt)}
          </span>
        ) : (
          <span />
        )}
        <Button
          size="sm"
          variant="outline"
          className="h-7 px-2 text-xs"
          onClick={() => onAdvance(item.id)}
          disabled={isPending}
        >
          {nextLabel}
          <ArrowRight className="ml-1 size-3" />
        </Button>
      </div>
    </div>
  );
}

// ─── Served column ─────────────────────────────────────────────────────────────

function ServedCard({ item }: { item: TableOrderItem }) {
  const tableName = (item as any).table_name as string | undefined;
  return (
    <div className="rounded-lg border bg-muted/30 p-3 flex flex-col gap-1 opacity-60">
      <p className="font-medium text-sm">
        {item.product?.name ?? `Producto #${item.product_id}`}
      </p>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Badge variant="secondary" className="text-xs">× {item.quantity}</Badge>
        {tableName && <span>Mesa: {tableName}</span>}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function KitchenPage() {
  const { slug } = useParams<{ slug: string }>();
  const queryClient = useQueryClient();

  const { data: itemsData, isLoading, dataUpdatedAt } = useQuery({
    queryKey: ['kds-items', slug],
    queryFn: async () => {
      const res = await kdsApi.items();
      return res.data as TableOrderItem[];
    },
    refetchInterval: 10_000, // Poll every 10s
  });

  const items: TableOrderItem[] = itemsData ?? [];

  const advanceMutation = useMutation({
    mutationFn: (itemId: number) => kdsApi.advanceItem(itemId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kds-items', slug] });
      queryClient.invalidateQueries({ queryKey: ['tables', slug] });
    },
    onError: (err) => notify.error(err, 'Error al actualizar el estado'),
  });

  const byStatus = (status: TableOrderItem['status']) =>
    items.filter((i) => i.status === status);

  const served = byStatus('served');
  const totalActive = byStatus('pending').length + byStatus('preparing').length + byStatus('ready').length;

  return (
    <AddonGate moduleKey="kitchen" slug={slug}>
    <div className="flex flex-col gap-4 h-full">
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ChefHat className="size-6" />
            Pantalla de Cocina
          </h1>
          {totalActive > 0 && (
            <Badge variant="destructive" className="tabular-nums">
              {totalActive} pendiente{totalActive !== 1 ? 's' : ''}
            </Badge>
          )}
        </div>
        <span className="text-xs text-muted-foreground">
          Actualizado: {dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString('es-CO') : '—'}
        </span>
      </div>

      {/* Kanban columns */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 flex-1 min-h-0 overflow-hidden">
        {COLUMNS.map((col) => {
          const colItems = byStatus(col.status);
          return (
            <div key={col.status} className="flex flex-col gap-3 min-h-0">
              {/* Column header */}
              <div
                className={`flex items-center justify-between rounded-lg border px-3 py-2 ${col.headerClass}`}
              >
                <span className="font-semibold text-sm">{col.label}</span>
                <span className="text-xs font-bold tabular-nums">{colItems.length}</span>
              </div>

              {/* Items */}
              <div className="flex-1 overflow-y-auto space-y-2 pr-0.5">
                {isLoading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-28 rounded-lg" />
                  ))
                ) : colItems.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground/50">
                    <CheckCheck className="size-6" />
                    <p className="text-xs">Sin ítems</p>
                  </div>
                ) : (
                  colItems.map((item) => (
                    <ItemCard
                      key={item.id}
                      item={item}
                      nextLabel={col.nextLabel}
                      onAdvance={(id) => advanceMutation.mutate(id)}
                      isPending={advanceMutation.isPending}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Served items (collapsed at bottom) */}
      {served.length > 0 && (
        <div className="flex-shrink-0 border-t pt-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Servidos ({served.length})
          </p>
          <div className="flex flex-wrap gap-2">
            {served.map((item) => (
              <ServedCard key={item.id} item={item} />
            ))}
          </div>
        </div>
      )}
    </div>
    </AddonGate>
  );
}
