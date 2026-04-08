'use client';

import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useEchoChannel } from './useEcho';

interface SaleCreatedPayload {
  id: number;
  total: number;
  created_at: string;
}

interface StockUpdatedPayload {
  product_id: number;
  product_name: string;
  stock: number;
  min_stock: number;
  is_low: boolean;
}

/**
 * Suscribe al canal tenant.{schema} para recibir actualizaciones en tiempo real
 * de todos los módulos del sistema.
 *
 * Usar en el layout principal del tenant, una vez por sesión.
 */
export function useTenantRealtime(tenantSchema: string) {
  const qc = useQueryClient();

  // ─── POS: Nueva venta ────────────────────────────────────────────────────
  useEchoChannel(
    `tenant.${tenantSchema}`,
    '.sale.created',
    (_payload: unknown) => {
      const data = _payload as SaleCreatedPayload;
      void data;
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['cash'] });
      qc.invalidateQueries({ queryKey: ['sales'] });
    },
  );

  // ─── Inventario: Stock actualizado ───────────────────────────────────────
  useEchoChannel(
    `tenant.${tenantSchema}`,
    '.stock.updated',
    (payload: unknown) => {
      const data = payload as StockUpdatedPayload;
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['stock-alerts'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });

      if (data.is_low) {
        toast.warning(`Stock bajo: ${data.product_name}`, {
          description: `Disponible: ${data.stock} (mín. ${data.min_stock})`,
          duration: 6000,
        });
      }
    },
  );

  // ─── Caja: Apertura, cierre, movimientos ─────────────────────────────────
  useEchoChannel(
    `tenant.${tenantSchema}`,
    '.cash.updated',
    (_payload: unknown) => {
      qc.invalidateQueries({ queryKey: ['cash'] });
      qc.invalidateQueries({ queryKey: ['cash-registers'] });
    },
  );

  // ─── Mesas / Órdenes ─────────────────────────────────────────────────────
  useEchoChannel(
    `tenant.${tenantSchema}`,
    '.table.order.updated',
    (_payload: unknown) => {
      qc.invalidateQueries({ queryKey: ['tables'] });
      qc.invalidateQueries({ queryKey: ['table-orders'] });
      qc.invalidateQueries({ queryKey: ['kitchen'] });
    },
  );

  // ─── Compras ──────────────────────────────────────────────────────────────
  useEchoChannel(
    `tenant.${tenantSchema}`,
    '.purchase.updated',
    (_payload: unknown) => {
      qc.invalidateQueries({ queryKey: ['purchases'] });
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      qc.invalidateQueries({ queryKey: ['products'] }); // stock recibido
    },
  );

  // ─── Transferencias de bodega ─────────────────────────────────────────────
  useEchoChannel(
    `tenant.${tenantSchema}`,
    '.warehouse.transfer.updated',
    (_payload: unknown) => {
      qc.invalidateQueries({ queryKey: ['warehouse-transfers'] });
      qc.invalidateQueries({ queryKey: ['products'] }); // stock afectado
    },
  );

  // ─── Taller / Órdenes de trabajo ─────────────────────────────────────────
  useEchoChannel(
    `tenant.${tenantSchema}`,
    '.work.order.updated',
    (_payload: unknown) => {
      qc.invalidateQueries({ queryKey: ['work-orders'] });
      qc.invalidateQueries({ queryKey: ['workshop'] });
    },
  );

  // ─── E-commerce: Pedidos ─────────────────────────────────────────────────
  useEchoChannel(
    `tenant.${tenantSchema}`,
    '.store.order.updated',
    (payload: unknown) => {
      const data = payload as { action: string; order_number?: string };
      qc.invalidateQueries({ queryKey: ['store-orders'] });
      qc.invalidateQueries({ queryKey: ['ecommerce'] });

      if (data.action === 'created') {
        toast.info('Nuevo pedido en la tienda', {
          description: data.order_number ? `Pedido ${data.order_number}` : undefined,
          duration: 5000,
        });
      }
    },
  );

  // ─── RRHH: Nómina y vacaciones ───────────────────────────────────────────
  useEchoChannel(
    `tenant.${tenantSchema}`,
    '.hrm.updated',
    (_payload: unknown) => {
      qc.invalidateQueries({ queryKey: ['payroll'] });
      qc.invalidateQueries({ queryKey: ['vacations'] });
      qc.invalidateQueries({ queryKey: ['hrm'] });
    },
  );

  // ─── Clientes ─────────────────────────────────────────────────────────────
  useEchoChannel(
    `tenant.${tenantSchema}`,
    '.customer.updated',
    (_payload: unknown) => {
      qc.invalidateQueries({ queryKey: ['customers'] });
    },
  );

  // ─── Gastos ───────────────────────────────────────────────────────────────
  useEchoChannel(
    `tenant.${tenantSchema}`,
    '.expense.updated',
    (_payload: unknown) => {
      qc.invalidateQueries({ queryKey: ['expenses'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  );
}
