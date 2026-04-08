'use client';

import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileText, Printer, ChevronDown } from 'lucide-react';

import type { Sale } from '@/types';
import { settingsApi } from '@/lib/api/tenant.api';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

// ─── Paper formats ─────────────────────────────────────────────────────────────

export type PaperFormat = 'a4' | 'carta' | 'media-carta' | 'oficio';

const PAPER_FORMATS: { value: PaperFormat; label: string; pageSize: string; maxWidth: string }[] = [
  { value: 'a4',         label: 'A4 (210 × 297 mm)',        pageSize: 'A4',            maxWidth: '760px' },
  { value: 'carta',      label: 'Carta (216 × 279 mm)',      pageSize: 'letter',        maxWidth: '740px' },
  { value: 'media-carta',label: 'Media carta (216 × 140 mm)',pageSize: '8.5in 5.5in',   maxWidth: '680px' },
  { value: 'oficio',     label: 'Oficio (216 × 356 mm)',     pageSize: 'legal',         maxWidth: '740px' },
];

// ─── Store info ────────────────────────────────────────────────────────────────

export interface StoreInfo {
  business_name?: string;
  nit?: string;
  address?: string;
  phone?: string;
  email?: string;
  invoice_prefix?: string;
  invoice_resolution?: string;
  logo_url?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(n);
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('es-CO', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Efectivo',
  card: 'Tarjeta débito/crédito',
  transfer: 'Transferencia bancaria',
  mixed: 'Pago mixto',
};

// ─── Invoice body ─────────────────────────────────────────────────────────────

interface InvoiceBodyProps {
  sale: Sale;
  store: StoreInfo;
  format: PaperFormat;
}

function InvoiceBody({ sale, store, format }: InvoiceBodyProps) {
  const paperCfg = PAPER_FORMATS.find((f) => f.value === format) ?? PAPER_FORMATS[0];
  const base       = store.invoice_prefix ?? 'FV';
  const invoiceNum = `${base}-${sale.code}`;
  const subtotalBase = sale.tax > 0 ? Math.round(sale.subtotal / 1.19) : sale.subtotal;
  const ivaAmount    = sale.tax > 0 ? sale.tax : 0;
  const isHalf       = format === 'media-carta';

  return (
    <div
      className="invoice-body text-gray-900"
      style={{ maxWidth: paperCfg.maxWidth, margin: '0 auto', fontSize: isHalf ? '11px' : '13px' }}
    >
      {/* ── Header ── */}
      <div className={`flex justify-between items-start border-b ${isHalf ? 'pb-2 mb-3' : 'pb-4 mb-4'}`}>
        <div className="space-y-0.5">
          {store.logo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={store.logo_url} alt="Logo" className="h-10 mb-1 object-contain" />
          )}
          <h2 className={`font-bold ${isHalf ? 'text-base' : 'text-xl'}`}>
            {store.business_name ?? 'Atlas ERP'}
          </h2>
          {store.nit     && <p className="text-gray-500 text-xs">NIT: {store.nit}</p>}
          {store.address && <p className="text-gray-500 text-xs">{store.address}</p>}
          {store.phone   && <p className="text-gray-500 text-xs">Tel: {store.phone}</p>}
          {store.email   && <p className="text-gray-500 text-xs">{store.email}</p>}
        </div>
        <div className="text-right shrink-0">
          <div className="inline-block border-2 border-gray-800 rounded px-3 py-1.5">
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Factura de Venta</p>
            <p className={`font-black ${isHalf ? 'text-base' : 'text-lg'}`}>{invoiceNum}</p>
          </div>
          <p className="text-xs text-gray-500 mt-1.5">Fecha: {fmtDate(sale.created_at)}</p>
          {store.invoice_resolution && (
            <p className="text-[10px] text-gray-400 max-w-[180px] text-right mt-0.5">
              Res. DIAN {store.invoice_resolution}
            </p>
          )}
        </div>
      </div>

      {/* ── Client / Payment ── */}
      <div className={`grid grid-cols-2 gap-3 text-xs ${isHalf ? 'mb-3' : 'mb-5'}`}>
        <div className="space-y-0.5">
          <p className="font-semibold text-gray-500 uppercase tracking-wide text-[10px]">Cliente</p>
          <p className="font-medium">{sale.customer?.name ?? 'Consumidor Final'}</p>
          {(sale.customer as any)?.document && (
            <p className="text-gray-500">NIT/CC: {(sale.customer as any).document}</p>
          )}
          {sale.customer?.email && <p className="text-gray-500">{sale.customer.email}</p>}
          {sale.customer?.phone && <p className="text-gray-500">{sale.customer.phone}</p>}
        </div>
        <div className="space-y-0.5">
          <p className="font-semibold text-gray-500 uppercase tracking-wide text-[10px]">Pago</p>
          <p className="font-medium">{PAYMENT_LABELS[sale.payment_method] ?? sale.payment_method}</p>
          <p className="text-gray-500">Estado: Completada</p>
        </div>
      </div>

      {/* ── Items table ── */}
      <table className={`w-full border-collapse ${isHalf ? 'mb-3' : 'mb-5'}`}>
        <thead>
          <tr className="bg-gray-100 text-gray-600 uppercase tracking-wide">
            <th className="border border-gray-200 px-2 py-1.5 text-left text-[10px]">#</th>
            <th className="border border-gray-200 px-2 py-1.5 text-left text-[10px]">Descripción</th>
            <th className="border border-gray-200 px-2 py-1.5 text-right text-[10px]">Cant.</th>
            <th className="border border-gray-200 px-2 py-1.5 text-right text-[10px]">Precio Unit.</th>
            {sale.discount > 0 && (
              <th className="border border-gray-200 px-2 py-1.5 text-right text-[10px]">Desc.</th>
            )}
            <th className="border border-gray-200 px-2 py-1.5 text-right text-[10px]">Total</th>
          </tr>
        </thead>
        <tbody>
          {sale.items.map((item, i) => (
            <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
              <td className="border border-gray-200 px-2 py-1.5 text-gray-400 text-xs">{i + 1}</td>
              <td className="border border-gray-200 px-2 py-1.5 text-xs">
                <span className="font-medium">{item.product?.name ?? `Ítem ${i + 1}`}</span>
                {item.product?.sku && (
                  <span className="text-gray-400"> · {item.product.sku}</span>
                )}
              </td>
              <td className="border border-gray-200 px-2 py-1.5 text-right text-xs">{item.quantity}</td>
              <td className="border border-gray-200 px-2 py-1.5 text-right text-xs">{fmt(item.unit_price)}</td>
              {sale.discount > 0 && (
                <td className="border border-gray-200 px-2 py-1.5 text-right text-xs text-red-600">
                  {item.discount ? `−${fmt(item.discount)}` : '—'}
                </td>
              )}
              <td className="border border-gray-200 px-2 py-1.5 text-right text-xs font-medium">{fmt(item.subtotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* ── Totals ── */}
      <div className={`flex justify-end ${isHalf ? 'mb-3' : 'mb-5'}`}>
        <div className="w-56 space-y-1 text-xs">
          <div className="flex justify-between">
            <span className="text-gray-500">Subtotal (sin IVA)</span>
            <span>{fmt(subtotalBase)}</span>
          </div>
          {sale.discount > 0 && (
            <div className="flex justify-between">
              <span className="text-gray-500">Descuento</span>
              <span className="text-red-600">−{fmt(sale.discount)}</span>
            </div>
          )}
          {ivaAmount > 0 && (
            <div className="flex justify-between">
              <span className="text-gray-500">IVA 19%</span>
              <span>{fmt(ivaAmount)}</span>
            </div>
          )}
          <div className="flex justify-between font-bold text-sm border-t border-gray-300 pt-2 mt-1">
            <span>TOTAL</span>
            <span>{fmt(sale.total)}</span>
          </div>
        </div>
      </div>

      {/* ── Notes ── */}
      {sale.notes && (
        <div className={`text-xs text-gray-500 border-t ${isHalf ? 'pt-2 mb-3' : 'pt-3 mb-4'}`}>
          <span className="font-semibold">Notas: </span>{sale.notes}
        </div>
      )}

      {/* ── Signatures (omitidas en media carta por espacio) ── */}
      {!isHalf && (
        <div className="grid grid-cols-2 gap-8 border-t pt-6">
          <div className="text-center">
            <div className="border-t border-gray-400 pt-2 text-xs text-gray-500">Firma vendedor</div>
          </div>
          <div className="text-center">
            <div className="border-t border-gray-400 pt-2 text-xs text-gray-500">Firma cliente</div>
          </div>
        </div>
      )}

      <p className={`text-center text-[10px] text-gray-400 border-t ${isHalf ? 'pt-2 mt-2' : 'pt-3 mt-3'}`}>
        Documento generado por Atlas ERP · {store.business_name ?? 'Atlas ERP'}
      </p>
    </div>
  );
}

// ─── Print helper ──────────────────────────────────────────────────────────────

function buildPrintWindow(content: string, title: string, format: PaperFormat) {
  const cfg = PAPER_FORMATS.find((f) => f.value === format) ?? PAPER_FORMATS[0];
  const isHalf = format === 'media-carta';

  const win = window.open(
    '',
    '_blank',
    isHalf ? 'width=620,height=500' : 'width=840,height=1100',
  );
  if (!win) return;

  win.document.write(`
    <!DOCTYPE html>
    <html lang="es">
      <head>
        <meta charset="utf-8" />
        <title>${title}</title>
        <style>
          *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            font-family: Arial, Helvetica, sans-serif;
            font-size: ${isHalf ? '11px' : '12px'};
            color: #111;
            padding: ${isHalf ? '16px' : '28px'};
            background: #fff;
          }
          .invoice-body { max-width: ${cfg.maxWidth}; margin: 0 auto; }
          table { width: 100%; border-collapse: collapse; margin-bottom: ${isHalf ? '10px' : '18px'}; }
          th, td { border: 1px solid #e5e7eb; padding: ${isHalf ? '4px 8px' : '6px 10px'}; }
          th { background: #f3f4f6; text-transform: uppercase; font-size: 10px; letter-spacing: 0.04em; color: #6b7280; }
          .text-right  { text-align: right; }
          .text-center { text-align: center; }
          .font-bold   { font-weight: 700; }
          .font-black  { font-weight: 900; }
          .text-gray   { color: #6b7280; }
          .text-red    { color: #dc2626; }
          .border-box  { border: 2px solid #1f2937; border-radius: 4px; padding: 6px 14px; display: inline-block; }
          .divide-top  { border-top: 1px solid #e5e7eb; margin-top: 8px; padding-top: 8px; }
          @media print {
            body { padding: ${isHalf ? '8px' : '1cm'}; }
            @page { size: ${cfg.pageSize}; margin: ${isHalf ? '0.8cm' : '1.2cm'}; }
          }
        </style>
      </head>
      <body>${content}</body>
    </html>
  `);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); win.close(); }, 450);
}

// ─── Dialog ────────────────────────────────────────────────────────────────────

interface SaleInvoiceDialogProps {
  sale: Sale | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Slug del tenant — si se provee, carga StoreInfo automáticamente */
  slug?: string;
  /** StoreInfo explícito — tiene precedencia sobre el auto-fetch */
  store?: StoreInfo;
  /** Formato inicial (por defecto: carta) */
  defaultFormat?: PaperFormat;
}

export function SaleInvoiceDialog({
  sale,
  open,
  onOpenChange,
  slug,
  store: storeProp,
  defaultFormat = 'carta',
}: SaleInvoiceDialogProps) {
  const printRef = useRef<HTMLDivElement>(null);
  const [format, setFormat] = useState<PaperFormat>(defaultFormat);

  // Auto-fetch store info desde el tenant si no se pasa como prop
  const { data: fetchedStore } = useQuery<StoreInfo>({
    queryKey: ['store-info', slug],
    queryFn: () => settingsApi.getStore().then((r) => r.data as StoreInfo),
    enabled: !!slug && !storeProp,
    staleTime: 1000 * 60 * 10,
  });

  const store: StoreInfo = storeProp ?? fetchedStore ?? {};
  const paperLabel = PAPER_FORMATS.find((f) => f.value === format)?.label ?? format;

  function handlePrint() {
    if (!printRef.current || !sale) return;
    buildPrintWindow(
      printRef.current.innerHTML,
      `Factura ${sale.code}`,
      format,
    );
  }

  if (!sale) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-6 pt-5 pb-3 border-b shrink-0">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <DialogTitle className="flex items-center gap-2">
              <FileText className="size-4" />
              Factura de Venta — {sale.code}
            </DialogTitle>

            {/* Format selector */}
            <DropdownMenu>
              <DropdownMenuTrigger>
                <span className={cn(
                  'inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-2.5 py-1',
                  'text-xs font-medium shadow-sm hover:bg-accent hover:text-accent-foreground transition-colors',
                )}>
                  {paperLabel}
                  <ChevronDown className="size-3.5" />
                </span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuRadioGroup value={format} onValueChange={(v) => setFormat(v as PaperFormat)}>
                  {PAPER_FORMATS.map((f) => (
                    <DropdownMenuRadioItem key={f.value} value={f.value} className="text-xs">
                      {f.label}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </DialogHeader>

        {/* Preview */}
        <div ref={printRef} className="flex-1 overflow-y-auto p-6 bg-gray-50">
          <div className="bg-white rounded shadow-sm p-6">
            <InvoiceBody sale={sale} store={store} format={format} />
          </div>
        </div>

        <DialogFooter className="px-6 py-3 border-t shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
          <Button onClick={handlePrint} className="gap-2">
            <Printer className="size-4" />
            Imprimir / PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
