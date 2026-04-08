'use client';

import { useState, useCallback } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { notify } from '@/lib/notify';
import { Tag, Package, Truck, Plus, Minus, Printer, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { labelsApi, setTenantSlug } from '@/lib/api/tenant.api';

// ─── Types ────────────────────────────────────────────────────────────────────
interface ProductLabel {
  product_id: number; name: string; sku: string; barcode: string;
  price: number; cost: number; unit: string; category: string; copies: number;
}
interface ShippingLabel {
  sale_id: number; sale_number: string; tracking: string; carrier: string; date: string;
  sender_name: string; sender_address: string; sender_phone: string; sender_city: string;
  recipient_name: string; recipient_phone: string; recipient_email: string;
  recipient_address: string; recipient_city: string; recipient_nit: string;
  items_count: number; total: number; weight?: number; dimensions?: string; notes?: string;
}
interface Company {
  name: string; nit: string; address: string; phone: string; email: string; city: string;
}
interface ProductItem { id: number; name: string; sku: string; barcode?: string; price: number; }
interface SaleItem { id: number; sale_number?: string; invoice_number?: string; customer_name?: string; total: number; status: string; }

const fmt = (n: number) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);

const TABS = [
  { id: 'products', label: 'Etiquetas de Producto', icon: Tag },
  { id: 'shipping', label: 'Etiquetas de Envío',    icon: Truck },
];

// ─── Code128B SVG Generator ───────────────────────────────────────────────────
function code128svg(text: string, height = 56, xScale = 1.6): string {
  const P = [
    '11011001100','11001101100','11001100110','10010011000','10010001100',
    '10001001100','10011001000','10011000100','10001100100','11001001000',
    '11001000100','11000100100','10110011100','10011011100','10011001110',
    '10111001100','10011101100','10011100110','11001110010','11001011100',
    '11001001110','11011100100','11001110100','11101101110','11101001100',
    '11100101100','11100100110','11101100100','11100110100','11100110010',
    '11011011000','11011000110','11000110110','10100011000','10001011000',
    '10001000110','10110001000','10001101000','10001100010','11010001000',
    '11000101000','11000100010','10110111000','10110001110','10001101110',
    '10111011000','10111000110','10001110110','11101110110','11010001110',
    '11000101110','11011101000','11011100010','11011101110','11101011000',
    '11101000110','11100010110','11101101000','11101100010','11100011010',
    '11101111010','11001000010','11110001010','10100110000','10100001100',
    '10010110000','10010000110','10000101100','10000100110','10110010000',
    '10110000100','10011010000','10011000010','10000110100','10000110010',
    '11000010010','11001010000','11110111010','11000010100','10001111010',
    '10100111100','10010111100','10010011110','10111100100','10011110100',
    '10011110010','11110100100','11110010100','11110010010','11011011110',
    '11011110110','11110110110','10101111000','10100011110','10001011110',
    '10111101000','10111100010','11110101000','11110100010','10111011110',
    '10111101110','11101011110','11110101110',
    '11010000100','11010010000','11010011100','11000111010',
  ];
  const STOP = '1100011101011';
  const START_B = 104;

  // Sanitize: keep only printable ASCII 32–126, replace others with space
  const safe = text.replace(/[^ -~]/g, ' ').slice(0, 80);

  let checksum = START_B;
  let bits = P[START_B];
  for (let i = 0; i < safe.length; i++) {
    const v = safe.charCodeAt(i) - 32;
    checksum += (i + 1) * v;
    bits += P[v];
  }
  bits += P[checksum % 103];
  bits += STOP;

  const totalW = (bits.length * xScale).toFixed(1);
  const rects: string[] = [];
  let i = 0;
  while (i < bits.length) {
    if (bits[i] === '1') {
      let j = i + 1;
      while (j < bits.length && bits[j] === '1') j++;
      rects.push(`<rect x="${(i * xScale).toFixed(1)}" y="0" width="${((j - i) * xScale).toFixed(1)}" height="${height}" fill="#000"/>`);
      i = j;
    } else { i++; }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalW} ${height}" width="${totalW}" height="${height}">${rects.join('')}</svg>`;
}

// ─── Label HTML generators ────────────────────────────────────────────────────
function buildProductLabelHtml(labels: ProductLabel[], company: Company): string {
  const labelCSS = `
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: Arial, sans-serif; }
    body { background: #fff; }
    .page { display: flex; flex-wrap: wrap; gap: 4mm; padding: 8mm; }
    .label {
      width: 50mm; height: 30mm; border: 0.3mm solid #ccc; border-radius: 1mm;
      padding: 2mm 3mm; display: flex; flex-direction: column; justify-content: space-between;
      page-break-inside: avoid; overflow: hidden;
    }
    .company { font-size: 5pt; color: #666; text-transform: uppercase; letter-spacing: 0.3pt; }
    .name { font-size: 7.5pt; font-weight: bold; line-height: 1.2; max-height: 2.4em; overflow: hidden; }
    .sku  { font-size: 5.5pt; color: #444; }
    .price { font-size: 10pt; font-weight: bold; color: #000; }
    .barcode-row { display: flex; flex-direction: column; align-items: center; gap: 0.5mm; }
    .barcode-row svg { max-width: 100%; height: 10mm; }
    .barcode-text { font-size: 5pt; letter-spacing: 1pt; color: #333; }
    @media print {
      @page { margin: 0; size: A4; }
      body { margin: 0; }
    }
  `;

  const labelsHtml = labels.flatMap(l =>
    Array.from({ length: l.copies }, () => `
      <div class="label">
        <div>
          <div class="company">${escHtml(company.name)}</div>
          <div class="name">${escHtml(l.name)}</div>
          <div class="sku">SKU: ${escHtml(l.sku)}${l.category ? ` · ${escHtml(l.category)}` : ''}</div>
        </div>
        <div class="price">${fmt(l.price)}</div>
        <div class="barcode-row">
          ${code128svg(l.barcode || l.sku, 28, 1.2)}
          <span class="barcode-text">${escHtml(l.barcode || l.sku)}</span>
        </div>
      </div>
    `)
  ).join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Etiquetas de Producto</title>
    <style>${labelCSS}</style></head>
    <body><div class="page">${labelsHtml}</div>
    <script>window.onload=()=>{window.print();}<\/script>
    </body></html>`;
}

function buildShippingLabelHtml(labels: ShippingLabel[], company: Company): string {
  const css = `
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: Arial, sans-serif; }
    body { background: #fff; }
    .page { padding: 10mm; display: flex; flex-direction: column; gap: 8mm; }
    .label {
      width: 100mm; border: 0.5mm solid #000; page-break-inside: avoid;
    }
    .section { padding: 2.5mm 3.5mm; border-bottom: 0.3mm solid #ccc; }
    .section:last-child { border-bottom: none; }
    .section-title { font-size: 6pt; font-weight: bold; color: #666; text-transform: uppercase;
      letter-spacing: 0.5pt; margin-bottom: 1mm; }
    .main-text { font-size: 9pt; font-weight: bold; }
    .sub-text  { font-size: 7.5pt; color: #333; line-height: 1.5; }
    .recipient .main-text { font-size: 11pt; }
    .meta-row { display: flex; gap: 4mm; font-size: 7pt; }
    .meta-row span { flex: 1; }
    .tracking-section { padding: 2.5mm 3.5mm; display: flex; flex-direction: column; align-items: center; gap: 1.5mm; }
    .tracking-section svg { max-width: 94mm; height: 14mm; }
    .tracking-num { font-size: 8pt; font-weight: bold; letter-spacing: 2pt; }
    .carrier-badge { font-size: 6pt; background: #000; color: #fff; padding: 0.5mm 2mm;
      border-radius: 1mm; align-self: flex-start; }
    @media print {
      @page { margin: 0; size: A4; }
      body { margin: 0; }
    }
  `;

  const labelsHtml = labels.map(l => {
    const trackingBarcode = code128svg(l.tracking, 42, 1.5);
    return `
      <div class="label">
        <div class="section">
          <div class="section-title">Remitente</div>
          <div class="main-text">${escHtml(l.sender_name)}</div>
          <div class="sub-text">${escHtml(l.sender_address)}${l.sender_city ? `, ${escHtml(l.sender_city)}` : ''}</div>
          <div class="sub-text">Tel: ${escHtml(l.sender_phone)}</div>
        </div>
        <div class="section recipient">
          <div class="section-title">▼ Destinatario ▼</div>
          <div class="main-text">${escHtml(l.recipient_name)}</div>
          ${l.recipient_nit ? `<div class="sub-text">NIT/CC: ${escHtml(l.recipient_nit)}</div>` : ''}
          ${l.recipient_address ? `<div class="sub-text">${escHtml(l.recipient_address)}</div>` : ''}
          ${l.recipient_city ? `<div class="sub-text">${escHtml(l.recipient_city)}</div>` : ''}
          ${l.recipient_phone ? `<div class="sub-text">Tel: ${escHtml(l.recipient_phone)}</div>` : ''}
        </div>
        <div class="section">
          <div class="meta-row">
            <span><strong>Pedido:</strong> ${escHtml(l.sale_number)}</span>
            <span><strong>Fecha:</strong> ${escHtml(l.date)}</span>
          </div>
          <div class="meta-row">
            <span><strong>Ítems:</strong> ${l.items_count}</span>
            <span><strong>Total:</strong> ${fmt(l.total)}</span>
            ${l.weight ? `<span><strong>Peso:</strong> ${l.weight} kg</span>` : ''}
          </div>
          ${l.dimensions ? `<div class="sub-text"><strong>Dim:</strong> ${escHtml(l.dimensions)}</div>` : ''}
          ${l.notes ? `<div class="sub-text"><strong>Nota:</strong> ${escHtml(l.notes)}</div>` : ''}
        </div>
        <div class="tracking-section">
          ${l.carrier ? `<span class="carrier-badge">${escHtml(l.carrier)}</span>` : ''}
          ${trackingBarcode}
          <span class="tracking-num">${escHtml(l.tracking)}</span>
        </div>
      </div>
    `;
  }).join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Etiquetas de Envío</title>
    <style>${css}</style></head>
    <body><div class="page">${labelsHtml}</div>
    <script>window.onload=()=>{window.print();}<\/script>
    </body></html>`;
}

function escHtml(s: string): string {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function openPrintWindow(html: string) {
  const win = window.open('', '_blank', 'width=900,height=700');
  if (!win) { notify.error('Bloqueó la ventana emergente. Permita popups para este sitio.'); return; }
  win.document.open();
  win.document.write(html);
  win.document.close();
}

// ─── Page Component ───────────────────────────────────────────────────────────
export default function LabelsPage() {
  const params = useParams();
  const slug   = params.slug as string;
  setTenantSlug(slug);

  const [tab, setTab]   = useState('products');

  // ── Product labels state ──
  const [prodSearch, setProdSearch]   = useState('');
  const [selectedProds, setSelProds]  = useState<Record<number, number>>({}); // id → copies
  const [prodPage, setProdPage]       = useState(1);

  // ── Shipping labels state ──
  const [shipSearch, setShipSearch]   = useState('');
  const [selectedSales, setSelSales]  = useState<Set<number>>(new Set());
  const [carrier, setCarrier]         = useState('');
  const [weight, setWeight]           = useState('');
  const [dimensions, setDimensions]   = useState('');
  const [shipNotes, setShipNotes]     = useState('');

  // Queries
  const { data: productsData, isLoading: prodsLoading } = useQuery<{ data: ProductItem[] }>({
    queryKey: ['label-products', slug, prodSearch, prodPage],
    queryFn: () => labelsApi.products({ search: prodSearch || undefined, page: prodPage }).then(r => r.data as { data: ProductItem[] }),
  });

  const { data: salesData, isLoading: salesLoading } = useQuery<{ data: SaleItem[] }>({
    queryKey: ['label-sales', slug, shipSearch],
    queryFn: () => labelsApi.sales({ search: shipSearch || undefined }).then(r => r.data as { data: SaleItem[] }),
  });

  const products = productsData?.data ?? [];
  const sales    = salesData?.data ?? [];

  // Mutations
  const prodLabelMut = useMutation({
    mutationFn: (items: { product_id: number; copies: number }[]) =>
      labelsApi.productLabels({ items }).then(r => r.data as { company: Company; labels: ProductLabel[] }),
    onSuccess: (data) => openPrintWindow(buildProductLabelHtml(data.labels, data.company)),
    onError: (err) => notify.error(err, 'Error al generar etiquetas'),
  });

  const shipLabelMut = useMutation({
    mutationFn: (saleIds: number[]) =>
      labelsApi.shippingLabels({
        sale_ids: saleIds,
        carrier: carrier || undefined,
        extra: {
          weight:     weight     ? parseFloat(weight)  : undefined,
          dimensions: dimensions || undefined,
          notes:      shipNotes  || undefined,
        },
      }).then(r => r.data as { company: Company; labels: ShippingLabel[] }),
    onSuccess: (data) => openPrintWindow(buildShippingLabelHtml(data.labels, data.company)),
    onError: (err) => notify.error(err, 'Error al generar etiquetas de envío'),
  });

  // Helpers
  const setCopies = useCallback((id: number, delta: number) => {
    setSelProds(prev => {
      const cur = prev[id] ?? 0;
      const next = Math.max(0, cur + delta);
      if (next === 0) { const { [id]: _, ...rest } = prev; return rest; }
      return { ...prev, [id]: next };
    });
  }, []);

  const toggleSale = useCallback((id: number) => {
    setSelSales(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  }, []);

  const selectedProdCount = Object.keys(selectedProds).length;
  const totalProdCopies   = Object.values(selectedProds).reduce((a, b) => a + b, 0);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Printer className="w-6 h-6 text-primary" />
        <h1 className="text-2xl font-bold">Impresión de Etiquetas</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors
              ${tab === t.id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            <t.icon className="w-4 h-4" />{t.label}
          </button>
        ))}
      </div>

      {/* ── Tab: Etiquetas de Producto ─────────────────────────────────────── */}
      {tab === 'products' && (
        <div className="space-y-4">
          {/* Toolbar */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Buscar producto..." value={prodSearch}
                onChange={e => { setProdSearch(e.target.value); setProdPage(1); }}
                className="pl-8 w-64" />
            </div>
            {selectedProdCount > 0 && (
              <div className="flex items-center gap-3 ml-auto">
                <span className="text-sm text-muted-foreground">
                  {selectedProdCount} producto{selectedProdCount > 1 ? 's' : ''} · {totalProdCopies} etiqueta{totalProdCopies !== 1 ? 's' : ''}
                </span>
                <Button variant="outline" size="sm" onClick={() => setSelProds({})}>Limpiar</Button>
                <Button size="sm"
                  disabled={prodLabelMut.isPending}
                  onClick={() => prodLabelMut.mutate(Object.entries(selectedProds).map(([id, copies]) => ({ product_id: parseInt(id), copies })))}>
                  <Printer className="w-3.5 h-3.5 mr-1" />
                  {prodLabelMut.isPending ? 'Generando...' : 'Imprimir Etiquetas'}
                </Button>
              </div>
            )}
          </div>

          {/* Product List */}
          {prodsLoading ? (
            <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
          ) : (
            <div className="rounded-md border overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-3 py-2 w-8" />
                    <th className="text-left px-3 py-2">Producto</th>
                    <th className="text-left px-3 py-2">SKU</th>
                    <th className="text-left px-3 py-2">Código de Barras</th>
                    <th className="text-right px-3 py-2">Precio</th>
                    <th className="text-center px-3 py-2 w-36">Copias</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map(p => {
                    const copies = selectedProds[p.id] ?? 0;
                    return (
                      <tr key={p.id} className={`border-t hover:bg-muted/30 ${copies > 0 ? 'bg-primary/5' : ''}`}>
                        <td className="px-3 py-2">
                          <input type="checkbox" className="h-4 w-4 accent-primary" checked={copies > 0} onChange={() => copies > 0 ? setCopies(p.id, -copies) : setCopies(p.id, 1)} />
                        </td>
                        <td className="px-3 py-2 font-medium">{p.name}</td>
                        <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{p.sku}</td>
                        <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{p.barcode ?? '—'}</td>
                        <td className="px-3 py-2 text-right">{fmt(p.price)}</td>
                        <td className="px-3 py-2">
                          <div className="flex items-center justify-center gap-1">
                            <Button size="sm" variant="outline" className="h-7 w-7 p-0" onClick={() => setCopies(p.id, -1)} disabled={copies === 0}>
                              <Minus className="w-3 h-3" />
                            </Button>
                            <span className="w-8 text-center text-sm font-medium">{copies}</span>
                            <Button size="sm" variant="outline" className="h-7 w-7 p-0" onClick={() => setCopies(p.id, 1)}>
                              <Plus className="w-3 h-3" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {products.length === 0 && (
                    <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">No hay productos</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Preview card */}
          {selectedProdCount > 0 && (
            <Card className="border-primary/30 bg-primary/5">
              <CardContent className="p-4">
                <p className="text-sm font-medium mb-3">Vista previa de formato (50mm × 30mm):</p>
                <div className="flex flex-wrap gap-3">
                  {Object.entries(selectedProds).slice(0, 3).map(([id]) => {
                    const p = products.find(x => x.id === parseInt(id));
                    if (!p) return null;
                    const bc = p.barcode || p.sku;
                    const svgStr = code128svg(bc, 28, 1.2);
                    return (
                      <div key={id} className="border border-gray-300 rounded p-2 bg-white w-48 flex flex-col gap-1 text-[9px]">
                        <div className="text-gray-400 uppercase tracking-wider text-[7px]">Empresa</div>
                        <div className="font-bold text-[10px] leading-tight line-clamp-2">{p.name}</div>
                        <div className="text-gray-500">SKU: {p.sku}</div>
                        <div className="font-bold text-sm">{fmt(p.price)}</div>
                        <div className="flex flex-col items-center gap-0.5">
                          <div dangerouslySetInnerHTML={{ __html: svgStr }} />
                          <span className="text-[7px] tracking-widest">{bc}</span>
                        </div>
                      </div>
                    );
                  })}
                  {selectedProdCount > 3 && (
                    <div className="flex items-center justify-center w-16 text-xs text-muted-foreground">
                      +{selectedProdCount - 3} más
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ── Tab: Etiquetas de Envío ────────────────────────────────────────── */}
      {tab === 'shipping' && (
        <div className="space-y-4">
          {/* Options row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Transportadora</Label>
              <Input value={carrier} onChange={e => setCarrier(e.target.value)} placeholder="Ej: Servientrega" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Peso (kg)</Label>
              <Input type="number" value={weight} onChange={e => setWeight(e.target.value)} placeholder="0.0" min="0" step="0.1" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Dimensiones</Label>
              <Input value={dimensions} onChange={e => setDimensions(e.target.value)} placeholder="30x20x15 cm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Nota en etiqueta</Label>
              <Input value={shipNotes} onChange={e => setShipNotes(e.target.value)} placeholder="Frágil, etc." />
            </div>
          </div>

          {/* Toolbar */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Buscar venta / cliente..." value={shipSearch}
                onChange={e => setShipSearch(e.target.value)} className="pl-8 w-64" />
            </div>
            {selectedSales.size > 0 && (
              <div className="flex items-center gap-3 ml-auto">
                <span className="text-sm text-muted-foreground">{selectedSales.size} venta{selectedSales.size > 1 ? 's' : ''} seleccionada{selectedSales.size > 1 ? 's' : ''}</span>
                <Button variant="outline" size="sm" onClick={() => setSelSales(new Set())}>Limpiar</Button>
                <Button size="sm"
                  disabled={shipLabelMut.isPending}
                  onClick={() => shipLabelMut.mutate(Array.from(selectedSales))}>
                  <Printer className="w-3.5 h-3.5 mr-1" />
                  {shipLabelMut.isPending ? 'Generando...' : 'Imprimir Etiquetas'}
                </Button>
              </div>
            )}
          </div>

          {/* Batch select all button */}
          {sales.length > 0 && (
            <Button variant="outline" size="sm"
              onClick={() => selectedSales.size === sales.length
                ? setSelSales(new Set())
                : setSelSales(new Set(sales.map(s => s.id)))}>
              {selectedSales.size === sales.length ? 'Deseleccionar todo' : `Seleccionar todo (${sales.length})`}
            </Button>
          )}

          {/* Sales list */}
          {salesLoading ? (
            <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
          ) : (
            <div className="rounded-md border overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-3 py-2 w-8" />
                    <th className="text-left px-3 py-2">N° Venta</th>
                    <th className="text-left px-3 py-2">Cliente</th>
                    <th className="text-right px-3 py-2">Total</th>
                    <th className="text-center px-3 py-2">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {sales.map(s => (
                    <tr key={s.id} className={`border-t hover:bg-muted/30 cursor-pointer ${selectedSales.has(s.id) ? 'bg-primary/5' : ''}`}
                      onClick={() => toggleSale(s.id)}>
                      <td className="px-3 py-2">
                        <input type="checkbox" className="h-4 w-4 accent-primary" checked={selectedSales.has(s.id)} onChange={() => toggleSale(s.id)} onClick={(e: React.MouseEvent) => e.stopPropagation()} />
                      </td>
                      <td className="px-3 py-2 font-mono text-xs font-medium">{s.sale_number ?? s.invoice_number ?? `V-${s.id}`}</td>
                      <td className="px-3 py-2">{s.customer_name ?? 'Cliente directo'}</td>
                      <td className="px-3 py-2 text-right">{fmt(s.total)}</td>
                      <td className="px-3 py-2 text-center">
                        <Badge variant={s.status === 'paid' ? 'default' : 'secondary'}>{s.status}</Badge>
                      </td>
                    </tr>
                  ))}
                  {sales.length === 0 && (
                    <tr><td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">No hay ventas</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Shipping label preview */}
          {selectedSales.size > 0 && (() => {
            const salePreview = sales.find(s => selectedSales.has(s.id));
            if (!salePreview) return null;
            const tracking = 'ABC-XXXXXX';
            const bcSvg = code128svg(tracking, 42, 1.5);
            return (
              <Card className="border-primary/30 bg-primary/5">
                <CardContent className="p-4">
                  <p className="text-sm font-medium mb-3">Vista previa de formato (100mm):</p>
                  <div className="border border-gray-800 w-72 bg-white text-[9px]">
                    <div className="border-b border-gray-300 p-2">
                      <div className="text-gray-500 text-[7px] uppercase font-bold tracking-wider mb-0.5">Remitente</div>
                      <div className="font-bold text-[10px]">Mi Empresa S.A.S.</div>
                      <div className="text-gray-600">Calle 1 # 2-3, Bogotá · Tel: 300-000-0000</div>
                    </div>
                    <div className="border-b border-gray-300 p-2">
                      <div className="text-gray-500 text-[7px] uppercase font-bold tracking-wider mb-0.5">▼ Destinatario ▼</div>
                      <div className="font-bold text-[12px]">{salePreview.customer_name ?? 'Cliente directo'}</div>
                      <div className="text-gray-600">Dirección · Ciudad</div>
                    </div>
                    <div className="border-b border-gray-300 p-2 flex gap-4 text-[8px]">
                      <span><strong>Pedido:</strong> {salePreview.sale_number ?? `V-${salePreview.id}`}</span>
                      <span><strong>Total:</strong> {fmt(salePreview.total)}</span>
                      {weight && <span><strong>Peso:</strong> {weight} kg</span>}
                    </div>
                    <div className="p-2 flex flex-col items-center gap-1">
                      {carrier && <span className="text-[7px] bg-black text-white px-2 py-0.5 rounded self-start">{carrier}</span>}
                      <div dangerouslySetInnerHTML={{ __html: bcSvg }} />
                      <span className="text-[8px] font-bold tracking-widest">{tracking}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })()}
        </div>
      )}
    </div>
  );
}
