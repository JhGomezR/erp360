'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Truck } from 'lucide-react';

import { salesOrdersApi } from '@/lib/api/tenant.api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SalesOrderItem {
  id: number;
  description: string;
  unit: string;
  quantity: number;
  quantity_delivered: number;
  unit_price: number;
  subtotal: number;
  product?: { name: string };
}

interface SalesOrderFull {
  id: number;
  order_number?: string;
  status: string;
  total: number;
  delivered_total?: number;
  customer_name?: string;
  customer?: { name: string };
  items?: SalesOrderItem[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const O_STATUS: Record<string, string> = {
  draft: 'Borrador', confirmed: 'Confirmada', partial: 'Parcial',
  fulfilled: 'Completada', cancelled: 'Cancelada',
};
const O_VARIANT: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  draft: 'secondary', confirmed: 'default', partial: 'secondary',
  fulfilled: 'default', cancelled: 'outline',
};

const fmt = (n: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);

// ─── Props ────────────────────────────────────────────────────────────────────

interface DispatchDialogProps {
  orderId: number | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  slug: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DispatchDialog({ orderId, open, onOpenChange, slug }: DispatchDialogProps) {
  const qc = useQueryClient();
  const [quantities, setQuantities] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);

  const { data: order, isLoading } = useQuery<SalesOrderFull>({
    queryKey: ['sales-order-detail', orderId],
    queryFn: async () => {
      const r = await salesOrdersApi.get(orderId!);
      return r.data as SalesOrderFull;
    },
    enabled: open && orderId !== null,
  });

  // Initialize quantities when order loads
  useEffect(() => {
    if (order?.items) {
      const init: Record<number, string> = {};
      order.items.forEach((item) => {
        const pending = Math.max(0, item.quantity - item.quantity_delivered);
        init[item.id] = String(pending);
      });
      setQuantities(init);
    }
  }, [order]);

  async function handleSave() {
    if (!order?.items) return;
    setSaving(true);
    let hasError = false;

    const changed = order.items.filter((item) => {
      const newQty = parseFloat(quantities[item.id] ?? '0') || 0;
      return newQty !== item.quantity_delivered;
    });

    if (changed.length === 0) {
      toast.info('No hay cambios en las cantidades');
      setSaving(false);
      return;
    }

    for (const item of changed) {
      const newQty = parseFloat(quantities[item.id] ?? '0') || 0;
      try {
        await salesOrdersApi.deliverItem(order.id, item.id, newQty);
      } catch {
        toast.error(`Error al actualizar ítem: ${item.description}`);
        hasError = true;
      }
    }

    if (!hasError) {
      toast.success('Despacho guardado correctamente');
      qc.invalidateQueries({ queryKey: ['sales-orders', slug] });
      qc.invalidateQueries({ queryKey: ['sales-order-detail', orderId] });
      onOpenChange(false);
    }
    setSaving(false);
  }

  const items = order?.items ?? [];
  const deliveredTotal = order?.delivered_total ?? 0;
  const progressPct = order?.total ? Math.min(100, Math.round((deliveredTotal / order.total) * 100)) : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-6 pt-5 pb-3 border-b">
          <DialogTitle className="flex items-center gap-2">
            <Truck className="size-4" />
            Despachar orden — {order?.order_number ?? (orderId ? `OV-${orderId}` : '…')}
          </DialogTitle>
          {order && (
            <div className="flex items-center gap-3 mt-1.5">
              <Badge variant={O_VARIANT[order.status] ?? 'outline'}>
                {O_STATUS[order.status] ?? order.status}
              </Badge>
              <div className="flex-1 text-xs text-muted-foreground">
                Entregado: {fmt(deliveredTotal)} / {fmt(order.total)}
              </div>
            </div>
          )}
        </DialogHeader>

        {/* Progress bar */}
        {order && (
          <div className="px-6 pt-3">
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-green-500 transition-all"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1">{progressPct}% despachado</p>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
          {isLoading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Cargando ítems…</div>
          ) : (
            <>
              <div className="grid grid-cols-[1fr_60px_70px_70px_90px] gap-2 text-xs font-medium text-muted-foreground px-1">
                <span>Descripción</span>
                <span className="text-center">Unid.</span>
                <span className="text-right">Pedido</span>
                <span className="text-right">Entreg.</span>
                <span className="text-right">A despachar</span>
              </div>
              {items.map((item) => {
                const pending = Math.max(0, item.quantity - item.quantity_delivered);
                return (
                  <div
                    key={item.id}
                    className="grid grid-cols-[1fr_60px_70px_70px_90px] gap-2 items-center rounded-md border px-3 py-2 text-sm"
                  >
                    <div>
                      <p className="font-medium leading-tight">{item.product?.name ?? item.description}</p>
                      <p className="text-xs text-muted-foreground">{fmt(item.unit_price)} / u</p>
                    </div>
                    <span className="text-center text-xs text-muted-foreground">{item.unit}</span>
                    <span className="text-right text-xs">{item.quantity}</span>
                    <span className={`text-right text-xs font-medium ${item.quantity_delivered > 0 ? 'text-green-600' : 'text-muted-foreground'}`}>
                      {item.quantity_delivered}
                    </span>
                    <Input
                      type="number"
                      min={0}
                      max={item.quantity}
                      step="0.001"
                      className="h-8 text-right text-xs"
                      value={quantities[item.id] ?? String(pending)}
                      onChange={(e) => setQuantities((prev) => ({ ...prev, [item.id]: e.target.value }))}
                    />
                  </div>
                );
              })}
              {items.length === 0 && (
                <p className="text-center py-4 text-sm text-muted-foreground">Esta orden no tiene ítems.</p>
              )}
            </>
          )}
        </div>

        <DialogFooter className="px-6 py-3 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            onClick={handleSave}
            disabled={saving || isLoading || items.length === 0}
            className="gap-2"
          >
            <Truck className="size-4" />
            {saving ? 'Guardando…' : 'Guardar despacho'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
