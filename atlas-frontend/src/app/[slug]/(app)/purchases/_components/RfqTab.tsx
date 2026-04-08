'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { purchasesApi, suppliersApi, productsApi } from '@/lib/api/tenant.api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { Plus, Eye, Send, Trophy, Trash2, CheckCircle2 } from 'lucide-react';

type RfqLine = { id?: number; product_id?: number; description: string; quantity: number; unit?: string };
type RfqItem = {
  id: number; rfq_number: string; title: string; status: string;
  deadline?: string; rfq_suppliers_count: number; created_at: string;
};
type Supplier = { id: number; name: string; email?: string };
type Product = { id: number; name: string; sku: string; unit?: string };

const statusLabels: Record<string, string> = {
  draft: 'Borrador', sent: 'Enviado', evaluating: 'Evaluando',
  awarded: 'Adjudicado', cancelled: 'Cancelado',
};
const statusColor: Record<string, 'default' | 'secondary' | 'destructive'> = {
  draft: 'secondary', sent: 'default', evaluating: 'default',
  awarded: 'default', cancelled: 'destructive',
};

function fmt(n: number) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);
}

// ─── CreateRfqDialog ──────────────────────────────────────────────────────────
function CreateRfqDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState('');
  const [deadline, setDeadline] = useState('');
  const [lines, setLines] = useState<RfqLine[]>([{ description: '', quantity: 1 }]);
  const [selectedSuppliers, setSelectedSuppliers] = useState<number[]>([]);

  const suppQ = useQuery({ queryKey: ['suppliers-list'], queryFn: () => suppliersApi.list({ page: 1 }) });
  const suppliers = (suppQ.data?.data as unknown as { data?: Supplier[] })?.data ?? [];

  const addLine = () => setLines(p => [...p, { description: '', quantity: 1 }]);
  const removeLine = (i: number) => setLines(p => p.filter((_, idx) => idx !== i));
  const setLine = (i: number, key: keyof RfqLine, val: string | number) =>
    setLines(p => p.map((l, idx) => idx === i ? { ...l, [key]: val } : l));

  const toggleSupplier = (id: number) =>
    setSelectedSuppliers(p => p.includes(id) ? p.filter(s => s !== id) : [...p, id]);

  const mut = useMutation({
    mutationFn: () => purchasesApi.createRfq({ title, deadline: deadline || undefined, lines, supplier_ids: selectedSuppliers }),
    onSuccess: () => {
      toast.success('RFQ creado');
      qc.invalidateQueries({ queryKey: ['rfq-list'] });
      onClose();
    },
    onError: () => toast.error('Error al crear RFQ'),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Nueva Solicitud de Cotización (RFQ)</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label>Título *</Label>
              <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Compra Q2 materiales eléctricos" />
            </div>
            <div>
              <Label>Fecha límite respuesta</Label>
              <Input type="date" value={deadline} onChange={e => setDeadline(e.target.value)} />
            </div>
          </div>

          <div>
            <Label className="mb-2 block">Líneas requeridas</Label>
            {lines.map((line, i) => (
              <div key={i} className="flex gap-2 mb-2">
                <Input
                  className="flex-1"
                  placeholder="Descripción del producto/servicio"
                  value={line.description}
                  onChange={e => setLine(i, 'description', e.target.value)}
                />
                <Input
                  type="number"
                  className="w-24"
                  placeholder="Cant."
                  value={line.quantity}
                  onChange={e => setLine(i, 'quantity', parseFloat(e.target.value) || 1)}
                />
                <Input
                  className="w-20"
                  placeholder="Und."
                  value={line.unit ?? ''}
                  onChange={e => setLine(i, 'unit', e.target.value)}
                />
                <Button size="icon" variant="ghost" onClick={() => removeLine(i)} disabled={lines.length === 1}>
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            ))}
            <Button size="sm" variant="outline" onClick={addLine}>
              <Plus className="size-4 mr-1" /> Agregar línea
            </Button>
          </div>

          <div>
            <Label className="mb-2 block">Proveedores a invitar</Label>
            <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto border rounded p-2">
              {suppliers.map((s: Supplier) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => toggleSupplier(s.id)}
                  className={`px-2 py-1 rounded text-sm border transition-colors ${
                    selectedSuppliers.includes(s.id)
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background hover:bg-muted'
                  }`}
                >
                  {s.name}
                </button>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => mut.mutate()} disabled={!title || lines.every(l => !l.description) || mut.isPending}>
            {mut.isPending ? 'Creando...' : 'Crear RFQ'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── ResponseDialog — registrar respuesta de un proveedor ─────────────────────
function ResponseDialog({
  rfqId, supplierId, supplierName, lines, onClose,
}: {
  rfqId: number; supplierId: number; supplierName: string;
  lines: Array<{ id: number; description: string; quantity: number; unit?: string }>;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [deliveryDays, setDeliveryDays] = useState('');
  const [shippingCost, setShippingCost] = useState('0');
  const [paymentTerms, setPaymentTerms] = useState('');
  const [prices, setPrices] = useState<Record<number, string>>({});

  const mut = useMutation({
    mutationFn: () => purchasesApi.registerRfqResponse(rfqId, supplierId, {
      delivery_days: deliveryDays ? parseInt(deliveryDays) : undefined,
      shipping_cost: parseFloat(shippingCost) || 0,
      payment_terms: paymentTerms || undefined,
      items: lines.map(l => ({
        rfq_line_id: l.id,
        unit_price: parseFloat(prices[l.id] || '0') || 0,
        quantity: l.quantity,
      })),
    }),
    onSuccess: () => {
      toast.success(`Cotización de ${supplierName} registrada`);
      qc.invalidateQueries({ queryKey: ['rfq-detail', rfqId] });
      onClose();
    },
    onError: () => toast.error('Error al registrar cotización'),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Cotización de {supplierName}</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Plazo entrega (días)</Label>
              <Input type="number" value={deliveryDays} onChange={e => setDeliveryDays(e.target.value)} />
            </div>
            <div>
              <Label>Costo de envío</Label>
              <Input type="number" value={shippingCost} onChange={e => setShippingCost(e.target.value)} />
            </div>
            <div className="col-span-2">
              <Label>Condiciones de pago</Label>
              <Input value={paymentTerms} onChange={e => setPaymentTerms(e.target.value)} placeholder="30 días, contado, etc." />
            </div>
          </div>
          <Label className="block">Precios por línea</Label>
          {lines.map(line => (
            <div key={line.id} className="flex items-center gap-3">
              <span className="flex-1 text-sm">{line.description} ({line.quantity} {line.unit ?? 'und'})</span>
              <Input
                type="number"
                className="w-32"
                placeholder="Precio unitario"
                value={prices[line.id] ?? ''}
                onChange={e => setPrices(p => ({ ...p, [line.id]: e.target.value }))}
              />
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>Guardar cotización</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── RfqDetailDialog ──────────────────────────────────────────────────────────
function RfqDetailDialog({ rfqId, onClose }: { rfqId: number | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [responseDlg, setResponseDlg] = useState<{ supplierId: number; supplierName: string } | null>(null);

  const detailQ = useQuery({
    queryKey: ['rfq-detail', rfqId],
    queryFn: () => purchasesApi.getRfq(rfqId!),
    enabled: !!rfqId,
  });

  const sendMut = useMutation({
    mutationFn: () => purchasesApi.sendRfq(rfqId!),
    onSuccess: () => { toast.success('RFQ enviado'); qc.invalidateQueries({ queryKey: ['rfq-detail', rfqId] }); },
  });

  const awardMut = useMutation({
    mutationFn: (responseId: number) => purchasesApi.awardRfq(rfqId!, responseId),
    onSuccess: () => {
      toast.success('RFQ adjudicado — Orden de Compra creada');
      qc.invalidateQueries({ queryKey: ['rfq-detail', rfqId] });
      qc.invalidateQueries({ queryKey: ['rfq-list'] });
    },
    onError: () => toast.error('Error al adjudicar'),
  });

  type DetailData = {
    rfq: {
      id: number; rfq_number: string; title: string; status: string;
      deadline?: string; rfq_suppliers: Array<{
        id: number; supplier_id: number; status: string;
        supplier?: { id: number; name: string };
        response?: { id: number; delivery_days?: number; shipping_cost: number; payment_terms?: string; is_awarded: boolean };
      }>;
    };
    comparison: Array<{
      line_id: number; description: string; quantity: number; unit?: string;
      supplier_prices: Array<{
        supplier_id: number; supplier_name: string; unit_price: number | null;
        subtotal: number | null; response_id: number | null; is_cheapest: boolean; is_awarded: boolean;
      }>;
    }>;
  };

  const data = detailQ.data?.data as unknown as DetailData | undefined;
  const rfq = data?.rfq;
  const comparison = data?.comparison ?? [];
  const lines = rfq?.rfq_suppliers?.[0] ? [] : []; // placeholder

  if (!rfqId) return null;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            {rfq?.rfq_number ?? '...'} — {rfq?.title}
            {rfq && (
              <Badge variant={statusColor[rfq.status] ?? 'secondary'}>{statusLabels[rfq.status]}</Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        {detailQ.isLoading ? (
          <p className="text-center py-8 text-muted-foreground">Cargando...</p>
        ) : rfq ? (
          <div className="space-y-4">
            {/* Actions */}
            <div className="flex gap-2">
              {rfq.status === 'draft' && (
                <Button size="sm" onClick={() => sendMut.mutate()} disabled={sendMut.isPending}>
                  <Send className="size-4 mr-2" /> Enviar a proveedores
                </Button>
              )}
            </div>

            {/* Proveedores */}
            <div>
              <p className="text-sm font-medium mb-2">Proveedores invitados ({rfq.rfq_suppliers.length})</p>
              <div className="flex flex-wrap gap-2">
                {rfq.rfq_suppliers.map(rs => (
                  <div key={rs.id} className="flex items-center gap-2 border rounded px-2 py-1">
                    <span className="text-sm">{rs.supplier?.name}</span>
                    <Badge variant={rs.status === 'responded' ? 'default' : 'secondary'} className="text-xs">
                      {rs.status === 'responded' ? 'Cotizó' : rs.status === 'awarded' ? 'Adjudicado' : 'Invitado'}
                    </Badge>
                    {['sent', 'evaluating'].includes(rfq.status) && !rs.response && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-1 text-xs"
                        onClick={() => setResponseDlg({ supplierId: rs.supplier_id, supplierName: rs.supplier?.name ?? '' })}
                      >
                        + Cotización
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Tabla comparativa */}
            {comparison.length > 0 && (
              <div className="overflow-x-auto">
                <p className="text-sm font-medium mb-2">Comparativa de precios</p>
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-muted">
                      <th className="border px-2 py-1 text-left">Ítem</th>
                      <th className="border px-2 py-1 text-center">Cant.</th>
                      {rfq.rfq_suppliers.map(rs => (
                        <th key={rs.id} className="border px-2 py-1 text-center">
                          {rs.supplier?.name}
                          {rs.response?.is_awarded && (
                            <Trophy className="inline size-3 ml-1 text-amber-500" />
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {comparison.map(line => (
                      <tr key={line.line_id}>
                        <td className="border px-2 py-1">{line.description}</td>
                        <td className="border px-2 py-1 text-center">{line.quantity} {line.unit ?? ''}</td>
                        {line.supplier_prices.map(sp => (
                          <td
                            key={sp.supplier_id}
                            className={`border px-2 py-1 text-right font-mono ${sp.is_cheapest ? 'bg-green-50 text-green-700 font-bold' : ''}`}
                          >
                            {sp.unit_price !== null ? fmt(sp.unit_price) : '—'}
                          </td>
                        ))}
                      </tr>
                    ))}
                    {/* Row totales */}
                    <tr className="bg-muted font-semibold">
                      <td colSpan={2} className="border px-2 py-1 text-right">Total + envío</td>
                      {rfq.rfq_suppliers.map(rs => {
                        const total = comparison.reduce((sum, line) => {
                          const sp = line.supplier_prices.find(p => p.supplier_id === rs.supplier_id);
                          return sum + (sp?.subtotal ?? 0);
                        }, 0) + (rs.response?.shipping_cost ?? 0);
                        return (
                          <td key={rs.id} className="border px-2 py-1 text-right font-mono">
                            {rs.response ? fmt(total) : '—'}
                            {rs.response && rfq.status === 'evaluating' && !rs.response.is_awarded && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="ml-1 h-5 px-1 text-xs text-green-700"
                                onClick={() => awardMut.mutate(rs.response!.id)}
                                disabled={awardMut.isPending}
                              >
                                <CheckCircle2 className="size-3 mr-0.5" /> Adjudicar
                              </Button>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : null}

        {/* Response dialog */}
        {responseDlg && rfq && (
          <ResponseDialog
            rfqId={rfq.id}
            supplierId={responseDlg.supplierId}
            supplierName={responseDlg.supplierName}
            lines={comparison.map(l => ({ id: l.line_id, description: l.description, quantity: l.quantity, unit: l.unit }))}
            onClose={() => setResponseDlg(null)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── RfqTab (exported) ────────────────────────────────────────────────────────
export function RfqTab() {
  const [createDlg, setCreateDlg] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const listQ = useQuery({
    queryKey: ['rfq-list'],
    queryFn: () => purchasesApi.rfqList(),
  });

  const rfqs = (listQ.data?.data as unknown as { data?: RfqItem[] })?.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setCreateDlg(true)}>
          <Plus className="size-4 mr-2" /> Nueva cotización RFQ
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Número</TableHead>
              <TableHead>Título</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-center">Proveedores</TableHead>
              <TableHead>Fecha límite</TableHead>
              <TableHead>Creado</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {listQ.isLoading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8">Cargando...</TableCell></TableRow>
            ) : rfqs.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Sin solicitudes de cotización</TableCell></TableRow>
            ) : rfqs.map(r => (
              <TableRow key={r.id}>
                <TableCell className="font-mono font-medium">{r.rfq_number}</TableCell>
                <TableCell>{r.title}</TableCell>
                <TableCell>
                  <Badge variant={statusColor[r.status] ?? 'secondary'}>{statusLabels[r.status]}</Badge>
                </TableCell>
                <TableCell className="text-center">{r.rfq_suppliers_count}</TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {r.deadline ? new Date(r.deadline).toLocaleDateString('es-CO') : '—'}
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {new Date(r.created_at).toLocaleDateString('es-CO')}
                </TableCell>
                <TableCell>
                  <Button size="sm" variant="ghost" onClick={() => setSelectedId(r.id)}>
                    <Eye className="size-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <CreateRfqDialog open={createDlg} onClose={() => setCreateDlg(false)} />
      <RfqDetailDialog rfqId={selectedId} onClose={() => setSelectedId(null)} />
    </div>
  );
}
