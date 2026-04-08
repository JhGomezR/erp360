'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import {
  Truck, Plus, Eye, Trash2, ChevronLeft, ChevronRight, X,
} from 'lucide-react';
import { notify } from '@/lib/notify';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { salesOrdersApi, customersApi, productsApi, setTenantSlug } from '@/lib/api/tenant.api';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);

const STATUS_LABEL: Record<string, string> = {
  draft: 'Borrador', confirmed: 'Confirmada', partial: 'Parcial', fulfilled: 'Despachada', cancelled: 'Cancelada',
};
const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive'> = {
  draft: 'secondary', confirmed: 'default', partial: 'default', fulfilled: 'default', cancelled: 'destructive',
};

function emptyItem() {
  return { description: '', quantity: 1, unit: '', unit_price: 0 };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function RemisionesPage() {
  const { slug } = useParams<{ slug: string }>();
  setTenantSlug(slug);
  const qc = useQueryClient();

  const [page, setPage] = useState(1);
  const [filterStatus, setFilterStatus] = useState('');
  const [showForm, setShowForm] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['remisiones', slug, page, filterStatus],
    queryFn: () =>
      salesOrdersApi.list({ doc_type: 'remision', page, ...(filterStatus ? { status: filterStatus } : {}) })
        .then((r) => r.data),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['remisiones', slug] });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => salesOrdersApi.cancel(id),
    onSuccess: () => { notify.success('Remisión eliminada.'); invalidate(); },
    onError: () => notify.error('Error al eliminar.'),
  });

  const confirmMutation = useMutation({
    mutationFn: (id: number) => salesOrdersApi.confirm(id),
    onSuccess: () => { notify.success('Remisión confirmada.'); invalidate(); },
    onError: () => notify.error('Error al confirmar.'),
  });

  const remisiones: any[] = (data as any)?.data ?? [];
  const lastPage: number = (data as any)?.last_page ?? 1;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Truck className="h-6 w-6" />
            Remisiones
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Documentos de despacho de mercancía sin efecto contable inmediato.
          </p>
        </div>
        <Button onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4 mr-2" /> Nueva remisión
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <Select value={filterStatus || '_all'} onValueChange={(v) => { setFilterStatus(v === '_all' ? '' : v); setPage(1); }}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Todos los estados" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">Todos</SelectItem>
            {Object.entries(STATUS_LABEL).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="border-b">
              <tr className="text-left text-muted-foreground">
                <th className="px-4 py-3">Número</th>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Transportador</th>
                <th className="px-4 py-3">Placa</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3">Estado</th>
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
                : remisiones.map((r) => (
                    <tr key={r.id} className="border-b hover:bg-muted/30">
                      <td className="px-4 py-3 font-mono font-medium">{r.order_number}</td>
                      <td className="px-4 py-3">{r.customer?.name ?? r.customer_name}</td>
                      <td className="px-4 py-3 text-xs">{r.carrier ?? '-'}</td>
                      <td className="px-4 py-3 text-xs">{r.vehicle_plate ?? '-'}</td>
                      <td className="px-4 py-3 text-right">{fmt(r.total)}</td>
                      <td className="px-4 py-3">
                        <Badge variant={STATUS_VARIANT[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                      </td>
                      <td className="px-4 py-3 text-right space-x-1">
                        {r.status === 'draft' && (
                          <>
                            <Button
                              size="sm" variant="ghost"
                              onClick={() => confirmMutation.mutate(r.id)}
                              disabled={confirmMutation.isPending}
                            >
                              <Eye className="h-4 w-4 text-blue-500" />
                            </Button>
                            <Button
                              size="sm" variant="ghost"
                              onClick={() => { if (confirm('¿Eliminar remisión?')) deleteMutation.mutate(r.id); }}
                              disabled={deleteMutation.isPending}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
              {!isLoading && remisiones.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                    No hay remisiones registradas.
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

      {showForm && (
        <RemisionForm
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); invalidate(); }}
        />
      )}
    </div>
  );
}

// ─── Form ──────────────────────────────────────────────────────────────────────

function RemisionForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [customerName, setCustomerName] = useState('');
  const [vehiclePlate, setVehiclePlate] = useState('');
  const [driverName, setDriverName] = useState('');
  const [carrier, setCarrier] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState([emptyItem()]);

  const createMutation = useMutation({
    mutationFn: () =>
      salesOrdersApi.create({
        customer_name: customerName,
        doc_type: 'remision',
        vehicle_plate: vehiclePlate || undefined,
        driver_name: driverName || undefined,
        carrier: carrier || undefined,
        delivery_date: deliveryDate || undefined,
        notes: notes || undefined,
        items: items.map((it) => ({
          description: it.description,
          quantity: it.quantity,
          unit: it.unit || undefined,
          unit_price: it.unit_price,
        })),
      }).then((r) => r.data),
    onSuccess: () => { notify.success('Remisión creada.'); onSaved(); },
    onError: () => notify.error('Error al crear la remisión.'),
  });

  const updateItem = (i: number, field: string, value: string | number) =>
    setItems((prev) => prev.map((it, idx) => idx === i ? { ...it, [field]: value } : it));
  const addItem = () => setItems((prev) => [...prev, emptyItem()]);
  const removeItem = (i: number) => setItems((prev) => prev.filter((_, idx) => idx !== i));

  const total = items.reduce((s, it) => s + it.unit_price * it.quantity, 0);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Nueva Remisión</DialogTitle></DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Cliente / Destinatario *</Label>
              <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Fecha de despacho</Label>
              <Input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1">
              <Label>Transportador</Label>
              <Input value={carrier} onChange={(e) => setCarrier(e.target.value)} placeholder="Empresa/persona" />
            </div>
            <div className="space-y-1">
              <Label>Conductor</Label>
              <Input value={driverName} onChange={(e) => setDriverName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Placa</Label>
              <Input value={vehiclePlate} onChange={(e) => setVehiclePlate(e.target.value)} placeholder="ABC-123" />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Notas</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>

          {/* Items */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-base font-semibold">Artículos despachados</Label>
              <Button type="button" size="sm" variant="outline" onClick={addItem}>
                <Plus className="h-3 w-3 mr-1" /> Agregar
              </Button>
            </div>
            <div className="border rounded-md overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-2 py-2 text-left">Descripción</th>
                    <th className="px-2 py-2 text-right w-20">Cant.</th>
                    <th className="px-2 py-2 w-20">Unidad</th>
                    <th className="px-2 py-2 text-right w-28">V. Unit.</th>
                    <th className="px-2 py-2 text-right w-28">Total</th>
                    <th className="px-2 py-2 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, i) => (
                    <tr key={i} className="border-t">
                      <td className="px-2 py-1">
                        <Input value={item.description} onChange={(e) => updateItem(i, 'description', e.target.value)} className="h-7 text-xs" />
                      </td>
                      <td className="px-2 py-1">
                        <Input type="number" value={item.quantity} onChange={(e) => updateItem(i, 'quantity', parseFloat(e.target.value) || 0)} className="h-7 text-xs text-right" />
                      </td>
                      <td className="px-2 py-1">
                        <Input value={item.unit} onChange={(e) => updateItem(i, 'unit', e.target.value)} className="h-7 text-xs" placeholder="und, kg…" />
                      </td>
                      <td className="px-2 py-1">
                        <Input type="number" value={item.unit_price} onChange={(e) => updateItem(i, 'unit_price', parseFloat(e.target.value) || 0)} className="h-7 text-xs text-right" />
                      </td>
                      <td className="px-2 py-1 text-right font-mono">{fmt(item.unit_price * item.quantity)}</td>
                      <td className="px-2 py-1">
                        {items.length > 1 && (
                          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => removeItem(i)}>
                            <X className="h-3 w-3" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t bg-muted/30">
                  <tr>
                    <td colSpan={4} className="px-2 py-2 text-right font-semibold">Total:</td>
                    <td className="px-2 py-2 text-right font-mono font-bold">{fmt(total)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            onClick={() => createMutation.mutate()}
            disabled={!customerName || items.every((it) => !it.description) || createMutation.isPending}
          >
            Crear remisión
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
