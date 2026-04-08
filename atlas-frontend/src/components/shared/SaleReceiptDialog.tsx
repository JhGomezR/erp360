'use client';

import { useRef, useState } from 'react';
import { Printer, Zap } from 'lucide-react';
import { toast } from 'sonner';

import type { Sale } from '@/types';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { printEscPos, type PrinterConfig } from '@/lib/escpos/connection';
import type { PrintPayload } from '@/lib/escpos/encoder';
import { printersApi } from '@/lib/api/tenant.api';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return `$${n.toLocaleString('es-CO')}`;
}

function fmtDate(d: string) {
  return new Date(d).toLocaleString('es-CO', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Efectivo',
  card: 'Tarjeta',
  transfer: 'Transferencia',
};

const STATUS_VARIANT: Record<Sale['status'], 'default' | 'secondary' | 'destructive'> = {
  completed: 'default',
  pending: 'secondary',
  cancelled: 'destructive',
};

const STATUS_LABEL: Record<Sale['status'], string> = {
  completed: 'Completada',
  pending: 'Pendiente',
  cancelled: 'Cancelada',
};

// ─── Receipt body (also used for print) ───────────────────────────────────────

interface ReceiptBodyProps {
  sale: Sale;
  storeName?: string;
}

function ReceiptBody({ sale, storeName }: ReceiptBodyProps) {
  return (
    <div className="font-mono text-sm space-y-3 receipt-content">
      {/* Store header */}
      <div className="text-center space-y-0.5">
        <p className="font-bold text-base">{storeName ?? 'Atlas ERP'}</p>
        <p className="text-muted-foreground text-xs">Ticket de Venta</p>
      </div>

      <Separator />

      {/* Meta */}
      <div className="space-y-1 text-xs">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Código:</span>
          <span className="font-bold">{sale.code}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Fecha:</span>
          <span>{fmtDate(sale.created_at)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Pago:</span>
          <span>{PAYMENT_LABELS[sale.payment_method] ?? sale.payment_method}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-muted-foreground">Estado:</span>
          <Badge variant={STATUS_VARIANT[sale.status]} className="text-[10px] h-4 px-1">
            {STATUS_LABEL[sale.status]}
          </Badge>
        </div>
      </div>

      <Separator />

      {/* Items */}
      <div className="space-y-1">
        <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 text-[10px] font-bold text-muted-foreground uppercase">
          <span>Producto</span>
          <span className="text-right">Cant.</span>
          <span className="text-right">Total</span>
        </div>
        {sale.items.map((item, i) => (
          <div
            key={i}
            className="grid grid-cols-[1fr_auto_auto] gap-x-3 text-xs"
          >
            <div>
              <p className="leading-tight">{item.product?.name ?? `Ítem ${i + 1}`}</p>
              <p className="text-[10px] text-muted-foreground">{fmt(item.unit_price)} / u</p>
            </div>
            <span className="text-right self-start">{item.quantity}</span>
            <span className="text-right self-start font-medium">{fmt(item.subtotal)}</span>
          </div>
        ))}
      </div>

      <Separator />

      {/* Totals */}
      <div className="space-y-1 text-xs">
        <div className="flex justify-between text-muted-foreground">
          <span>Subtotal</span>
          <span>{fmt(sale.subtotal)}</span>
        </div>
        {sale.discount > 0 && (
          <div className="flex justify-between text-muted-foreground">
            <span>Descuento</span>
            <span className="text-destructive">−{fmt(sale.discount)}</span>
          </div>
        )}
        {sale.tax > 0 && (
          <div className="flex justify-between text-muted-foreground">
            <span>IVA (19%)</span>
            <span>+{fmt(sale.tax)}</span>
          </div>
        )}
        <div className="flex justify-between font-bold text-base pt-1">
          <span>TOTAL</span>
          <span>{fmt(sale.total)}</span>
        </div>
      </div>

      <Separator />

      <p className="text-center text-[10px] text-muted-foreground">
        ¡Gracias por su compra!
      </p>
    </div>
  );
}

// ─── Dialog ────────────────────────────────────────────────────────────────────

interface SaleReceiptDialogProps {
  sale: Sale | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  storeName?: string;
  slug?: string;
}

function buildEscPosPayload(sale: Sale, storeName?: string): PrintPayload {
  const lines: PrintPayload['lines'] = [
    { type: 'text', content: storeName ?? 'Atlas ERP', align: 'center', bold: true },
    { type: 'text', content: 'Ticket de Venta', align: 'center' },
    { type: 'divider' },
    { type: 'text', content: `Codigo: ${sale.code}` },
    { type: 'text', content: `Fecha: ${new Date(sale.created_at).toLocaleString('es-CO')}` },
    { type: 'divider' },
  ];
  for (const item of sale.items) {
    lines.push({
      type: 'text',
      content: `${item.product?.name ?? 'Item'} x${item.quantity}`,
    });
    lines.push({ type: 'text', content: `  $${item.subtotal.toLocaleString('es-CO')}`, align: 'right' });
  }
  lines.push({ type: 'divider' });
  lines.push({ type: 'text', content: `TOTAL: $${sale.total.toLocaleString('es-CO')}`, bold: true, align: 'right' });
  lines.push({ type: 'divider' });
  lines.push({ type: 'text', content: 'Gracias por su compra!', align: 'center' });
  lines.push({ type: 'cut' });
  return { lines };
}

export function SaleReceiptDialog({
  sale,
  open,
  onOpenChange,
  storeName,
  slug,
}: SaleReceiptDialogProps) {
  const printRef = useRef<HTMLDivElement>(null);
  const [printingEsc, setPrintingEsc] = useState(false);

  function handlePrint() {
    if (!printRef.current) return;
    const content = printRef.current.innerHTML;
    const win = window.open('', '_blank', 'width=320,height=600');
    if (!win) return;
    win.document.write(`
      <html>
        <head>
          <title>Ticket ${sale?.code ?? ''}</title>
          <style>
            body { font-family: monospace; font-size: 12px; margin: 16px; }
            .separator { border-top: 1px dashed #999; margin: 8px 0; }
            .text-muted { color: #666; }
            .text-center { text-align: center; }
            .font-bold { font-weight: bold; }
            .grid { display: grid; gap: 4px; }
            .grid-cols-2 { grid-template-columns: 1fr auto; }
            .grid-cols-3 { grid-template-columns: 1fr auto auto; }
            .justify-between { justify-content: space-between; display: flex; }
            .text-right { text-align: right; }
            .text-destructive { color: #dc2626; }
            .text-base { font-size: 14px; }
            .text-lg { font-size: 16px; }
            .text-xs { font-size: 11px; }
          </style>
        </head>
        <body>${content}</body>
      </html>
    `);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 300);
  }

  async function handleEscPosPrint() {
    if (!sale) return;
    setPrintingEsc(true);
    try {
      const res = await printersApi.list();
      const printers = res.data as import('@/lib/api/tenant.api').PosPrinter[];
      const defaultPrinter = printers.find((p) => p.is_default && p.is_active) ?? printers.find((p) => p.is_active);
      if (!defaultPrinter) {
        toast.error('No hay impresora configurada. Configura una en Ajustes > Impresoras.');
        setPrintingEsc(false);
        return;
      }
      const config: PrinterConfig = {
        connection_type: defaultPrinter.connection_type,
        host: defaultPrinter.host ?? undefined,
        port: defaultPrinter.port ?? undefined,
        baud_rate: defaultPrinter.baud_rate ?? undefined,
      };
      const payload = buildEscPosPayload(sale, storeName);
      payload.paper_width = defaultPrinter.paper_width;
      const result = await printEscPos(config, payload);
      if (result.success) {
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
    } catch {
      toast.error('Error al intentar imprimir ESC/POS');
    }
    setPrintingEsc(false);
  }

  if (!sale) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Ticket de Venta — {sale.code}</DialogTitle>
        </DialogHeader>

        <div ref={printRef} className="max-h-[60vh] overflow-y-auto py-2">
          <ReceiptBody sale={sale} storeName={storeName} />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
          {slug && (
            <Button variant="secondary" onClick={handleEscPosPrint} disabled={printingEsc} className="gap-2">
              <Zap className="size-4" />
              {printingEsc ? 'Imprimiendo…' : 'Imprimir ESC/POS'}
            </Button>
          )}
          <Button onClick={handlePrint}>
            <Printer className="mr-2 size-4" />
            Imprimir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
