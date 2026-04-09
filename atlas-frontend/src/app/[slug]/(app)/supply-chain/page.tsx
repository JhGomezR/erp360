'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { routePlanApi, shipmentApi, fleetApi } from '@/lib/api/tenant.api';
import { AddonGate } from '@/components/shared/AddonPaywall';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MapPin, Truck, Plus, Package, Navigation, CheckCircle, AlertTriangle, Calculator } from 'lucide-react';
import { Label } from '@/components/ui/label';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RoutePlan {
  id: number;
  ref: string;
  name: string;
  planned_date: string;
  status: string;
  total_stops: number;
  total_distance_km: number | null;
  vehicle_plate: string | null;
  driver_name: string | null;
}

interface Stop {
  id: number;
  sequence: number;
  stop_type: string;
  address: string;
  contact_name: string | null;
  time_window_from: string | null;
  time_window_to: string | null;
  status: string;
}

interface Shipment {
  id: number;
  tracking_number: string;
  carrier: string | null;
  recipient_name: string;
  destination_address: string;
  status: string;
  estimated_delivery_date: string | null;
  created_at: string;
}

interface ShipmentStats {
  total: number;
  pending: number;
  in_transit: number;
  delivered: number;
  overdue: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  optimized: 'bg-blue-100 text-blue-700',
  in_progress: 'bg-yellow-100 text-yellow-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-600',
  pending: 'bg-gray-100 text-gray-600',
  picked_up: 'bg-blue-100 text-blue-700',
  in_transit: 'bg-yellow-100 text-yellow-700',
  out_for_delivery: 'bg-orange-100 text-orange-700',
  delivered: 'bg-green-100 text-green-700',
  returned: 'bg-red-100 text-red-600',
};

const STATUS_LABELS: Record<string, string> = {
  draft: 'Borrador', optimized: 'Optimizada', in_progress: 'En curso',
  completed: 'Completada', cancelled: 'Cancelada',
  pending: 'Pendiente', picked_up: 'Recogido', in_transit: 'En tránsito',
  out_for_delivery: 'En reparto', delivered: 'Entregado', returned: 'Devuelto',
};

function StatusChip({ status }: { status: string }) {
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-500'}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

// ─── Create Route Dialog ──────────────────────────────────────────────────────

function CreateRouteDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: '', planned_date: '', notes: '' });
  const [stops, setStops] = useState([{ address: '', contact_name: '', stop_type: 'delivery', service_time_min: 10 }]);

  const mut = useMutation({
    mutationFn: () => routePlanApi.create({ ...form, stops }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['routes'] }); onClose(); },
  });

  const addStop = () => setStops(p => [...p, { address: '', contact_name: '', stop_type: 'delivery', service_time_min: 10 }]);
  const updateStop = (i: number, k: string, v: unknown) =>
    setStops(p => p.map((s, idx) => idx === i ? { ...s, [k]: v } : s));

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Nueva Ruta de Entrega</DialogTitle></DialogHeader>
        <div className="space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="font-medium">Nombre de la ruta *</label>
              <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Ej: Ruta Norte - Zona 1" />
            </div>
            <div>
              <label className="font-medium">Fecha planificada *</label>
              <Input type="date" value={form.planned_date} onChange={e => setForm(p => ({ ...p, planned_date: e.target.value }))} />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="font-medium">Paradas ({stops.length})</label>
              <Button type="button" size="sm" variant="outline" onClick={addStop}>
                <Plus className="w-3 h-3 mr-1" />Agregar
              </Button>
            </div>
            <div className="space-y-2">
              {stops.map((s, i) => (
                <div key={i} className="grid grid-cols-3 gap-2 p-3 border rounded bg-gray-50">
                  <div className="col-span-2">
                    <Input value={s.address} onChange={e => updateStop(i, 'address', e.target.value)} placeholder={`Dirección parada ${i + 1}`} />
                  </div>
                  <div>
                    <Select value={s.stop_type} onValueChange={v => updateStop(i, 'stop_type', v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="delivery">Entrega</SelectItem>
                        <SelectItem value="pickup">Recolección</SelectItem>
                        <SelectItem value="depot">Depósito</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2">
                    <Input value={s.contact_name} onChange={e => updateStop(i, 'contact_name', e.target.value)} placeholder="Nombre del contacto" />
                  </div>
                  <div className="flex items-center gap-1 text-xs text-gray-500">
                    <span>Min:</span>
                    <Input type="number" value={s.service_time_min} onChange={e => updateStop(i, 'service_time_min', Number(e.target.value))} className="w-16 h-8 text-xs" min={0} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => mut.mutate()} disabled={!form.name || !form.planned_date || mut.isPending}>
            {mut.isPending ? 'Creando...' : 'Crear ruta'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Create Shipment Dialog ───────────────────────────────────────────────────

function CreateShipmentDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    recipient_name: '', recipient_phone: '', recipient_email: '',
    destination_address: '', carrier: '', estimated_delivery_date: '',
    weight_kg: '', declared_value: '',
  });

  const mut = useMutation({
    mutationFn: () => shipmentApi.create(form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['shipments'] }); onClose(); },
  });

  const f = (k: keyof typeof form, v: string) => setForm(p => ({ ...p, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Nuevo Envío</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="col-span-2">
            <label className="font-medium">Destinatario *</label>
            <Input value={form.recipient_name} onChange={e => f('recipient_name', e.target.value)} placeholder="Nombre completo" />
          </div>
          <div>
            <label className="font-medium">Teléfono</label>
            <Input value={form.recipient_phone} onChange={e => f('recipient_phone', e.target.value)} placeholder="+57 3XX..." />
          </div>
          <div>
            <label className="font-medium">Email</label>
            <Input type="email" value={form.recipient_email} onChange={e => f('recipient_email', e.target.value)} />
          </div>
          <div className="col-span-2">
            <label className="font-medium">Dirección de destino *</label>
            <Input value={form.destination_address} onChange={e => f('destination_address', e.target.value)} placeholder="Dirección completa" />
          </div>
          <div>
            <label className="font-medium">Transportista</label>
            <Input value={form.carrier} onChange={e => f('carrier', e.target.value)} placeholder="Coordinadora, TCC..." />
          </div>
          <div>
            <label className="font-medium">Entrega estimada</label>
            <Input type="date" value={form.estimated_delivery_date} onChange={e => f('estimated_delivery_date', e.target.value)} />
          </div>
          <div>
            <label className="font-medium">Peso (kg)</label>
            <Input type="number" value={form.weight_kg} onChange={e => f('weight_kg', e.target.value)} step="0.1" />
          </div>
          <div>
            <label className="font-medium">Valor declarado</label>
            <Input type="number" value={form.declared_value} onChange={e => f('declared_value', e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => mut.mutate()} disabled={!form.recipient_name || !form.destination_address || mut.isPending}>
            {mut.isPending ? 'Guardando...' : 'Crear envío'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Add Event Dialog ─────────────────────────────────────────────────────────

function AddEventDialog({ shipment, onClose }: { shipment: Shipment; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ status: 'in_transit', location: '', description: '' });

  const mut = useMutation({
    mutationFn: () => shipmentApi.addEvent(shipment.id, form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['shipments'] }); onClose(); },
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Agregar Evento — {shipment.tracking_number}</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm">
          <div>
            <label className="font-medium">Nuevo estado</label>
            <Select value={form.status} onValueChange={v => setForm(p => ({ ...p, status: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="picked_up">Recogido</SelectItem>
                <SelectItem value="in_transit">En tránsito</SelectItem>
                <SelectItem value="out_for_delivery">En reparto</SelectItem>
                <SelectItem value="delivered">Entregado</SelectItem>
                <SelectItem value="returned">Devuelto</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="font-medium">Ubicación</label>
            <Input value={form.location} onChange={e => setForm(p => ({ ...p, location: e.target.value }))} placeholder="Ciudad, terminal, bodega..." />
          </div>
          <div>
            <label className="font-medium">Descripción</label>
            <textarea className="w-full border rounded p-2 text-sm" rows={2} value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>Guardar evento</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Freight Calculator Tab ───────────────────────────────────────────────────

const VEHICLE_LABELS: Record<string, string> = {
  truck: 'Camión / Tractocamión',
  van: 'Furgón / Camioneta',
  car: 'Automóvil',
  motorcycle: 'Motocicleta',
  other: 'Otro vehículo',
};

function FreightCalculatorTab() {
  const qc = useQueryClient();
  const [vehicleType, setVehicleType] = useState('van');
  const [distanceKm, setDistanceKm] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [result, setResult] = useState<any>(null);
  const [rateDialog, setRateDialog] = useState(false);

  const ratesQ = useQuery({ queryKey: ['freight-rates'], queryFn: () => fleetApi.freightRates() });
  const rates: any[] = (ratesQ.data as any)?.data ?? [];

  const estimateMut = useMutation({
    mutationFn: () =>
      fleetApi.estimateFreight({
        vehicle_type: vehicleType,
        distance_km: parseFloat(distanceKm),
        weight_kg: weightKg ? parseFloat(weightKg) : undefined,
      }),
    onSuccess: (res) => setResult((res as any)?.data ?? (res as any)),
  });

  const fmt = (n: number) =>
    new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);

  return (
    <div className="space-y-6">
      {/* Calculator card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calculator className="size-5" />
            Calculadora de Costos de Flete
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label>Tipo de vehículo</Label>
              <Select value={vehicleType} onValueChange={v => { setVehicleType(v); setResult(null); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(VEHICLE_LABELS).map(([v, l]) => (
                    <SelectItem key={v} value={v}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dist-km">Distancia (km)</Label>
              <Input
                id="dist-km"
                type="number"
                min="1"
                step="1"
                placeholder="Ej: 250"
                value={distanceKm}
                onChange={e => { setDistanceKm(e.target.value); setResult(null); }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="weight-kg">Peso de la carga (kg)</Label>
              <Input
                id="weight-kg"
                type="number"
                min="0"
                step="0.1"
                placeholder="Opcional"
                value={weightKg}
                onChange={e => { setWeightKg(e.target.value); setResult(null); }}
              />
            </div>
          </div>

          <div className="mt-4 flex gap-2">
            <Button
              onClick={() => estimateMut.mutate()}
              disabled={!distanceKm || parseFloat(distanceKm) <= 0 || estimateMut.isPending}
            >
              {estimateMut.isPending ? 'Calculando...' : 'Calcular flete'}
            </Button>
            <Button variant="outline" onClick={() => setRateDialog(true)}>
              Tarifas configuradas
            </Button>
          </div>

          {/* Result */}
          {result && (
            <div className="mt-6 rounded-lg border bg-muted/30 p-5">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <p className="text-sm text-muted-foreground">Estimado de flete</p>
                  <p className="text-3xl font-bold text-primary">{fmt(result.total_estimate)}</p>
                </div>
                <div className="text-right text-sm text-muted-foreground">
                  <p>{VEHICLE_LABELS[result.vehicle_type]}</p>
                  <p>{result.distance_km} km{result.weight_kg ? ` · ${result.weight_kg} kg` : ''}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                {[
                  { label: 'Costo base', value: result.breakdown?.base_cost },
                  { label: 'Recargo por peso', value: result.breakdown?.weight_surcharge },
                  { label: 'Peajes estimados', value: result.breakdown?.toll_cost },
                  { label: 'Combustible est.', value: result.breakdown?.fuel_cost },
                ].map(({ label, value }) => (
                  <div key={label} className="rounded border bg-background p-3">
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="font-semibold mt-0.5">{fmt(value ?? 0)}</p>
                  </div>
                ))}
              </div>

              {result.breakdown?.subtotal < result.breakdown?.min_freight && (
                <p className="mt-3 text-xs text-amber-600">
                  * Se aplicó el mínimo de flete configurado ({fmt(result.breakdown.min_freight)}) ya que el cálculo fue menor.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Rates table */}
      <Card>
        <CardHeader><CardTitle>Tarifas Base por Tipo de Vehículo</CardTitle></CardHeader>
        <CardContent>
          {ratesQ.isLoading ? (
            <div className="text-center py-6 text-muted-foreground text-sm">Cargando tarifas...</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="pb-2">Vehículo</th>
                  <th>COP/km base</th>
                  <th>COP/kg extra</th>
                  <th>Peaje/km</th>
                  <th>Combustible/km</th>
                  <th>Mínimo</th>
                </tr>
              </thead>
              <tbody>
                {rates.map((r: any) => (
                  <tr key={r.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="py-2.5 font-medium">{VEHICLE_LABELS[r.vehicle_type] ?? r.vehicle_type}</td>
                    <td>{fmt(r.base_rate_per_km)}</td>
                    <td>{fmt(r.weight_surcharge_per_kg)}</td>
                    <td>{fmt(r.toll_estimate_per_km)}</td>
                    <td>{fmt(r.fuel_rate_per_km)}</td>
                    <td>{fmt(r.min_freight)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Edit rate dialog */}
      {rateDialog && (
        <FreightRateDialog
          rates={rates}
          onClose={() => { setRateDialog(false); qc.invalidateQueries({ queryKey: ['freight-rates'] }); }}
        />
      )}
    </div>
  );
}

function FreightRateDialog({ rates, onClose }: { rates: any[]; onClose: () => void }) {
  const [vehicleType, setVehicleType] = useState('van');
  const existing = rates.find(r => r.vehicle_type === vehicleType);
  const [form, setForm] = useState({
    base_rate_per_km: String(existing?.base_rate_per_km ?? '1200'),
    weight_surcharge_per_kg: String(existing?.weight_surcharge_per_kg ?? '2'),
    toll_estimate_per_km: String(existing?.toll_estimate_per_km ?? '80'),
    fuel_rate_per_km: String(existing?.fuel_rate_per_km ?? '600'),
    min_freight: String(existing?.min_freight ?? '80000'),
    notes: existing?.notes ?? '',
  });

  const handleTypeChange = (v: string) => {
    setVehicleType(v);
    const r = rates.find(x => x.vehicle_type === v);
    if (r) {
      setForm({
        base_rate_per_km: String(r.base_rate_per_km),
        weight_surcharge_per_kg: String(r.weight_surcharge_per_kg),
        toll_estimate_per_km: String(r.toll_estimate_per_km),
        fuel_rate_per_km: String(r.fuel_rate_per_km),
        min_freight: String(r.min_freight),
        notes: r.notes ?? '',
      });
    }
  };

  const f = (k: keyof typeof form, v: string) => setForm(p => ({ ...p, [k]: v }));

  const mut = useMutation({
    mutationFn: () =>
      fleetApi.upsertFreightRate({
        vehicle_type: vehicleType,
        base_rate_per_km: parseFloat(form.base_rate_per_km),
        weight_surcharge_per_kg: parseFloat(form.weight_surcharge_per_kg),
        toll_estimate_per_km: parseFloat(form.toll_estimate_per_km),
        fuel_rate_per_km: parseFloat(form.fuel_rate_per_km),
        min_freight: parseFloat(form.min_freight),
        notes: form.notes || undefined,
      }),
    onSuccess: onClose,
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Editar Tarifas de Flete</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="space-y-1.5">
            <Label>Tipo de vehículo</Label>
            <Select value={vehicleType} onValueChange={handleTypeChange}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(VEHICLE_LABELS).map(([v, l]) => (
                  <SelectItem key={v} value={v}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {[
            { key: 'base_rate_per_km',        label: 'COP/km base' },
            { key: 'weight_surcharge_per_kg',  label: 'COP/kg extra por peso' },
            { key: 'toll_estimate_per_km',     label: 'COP/km peajes estimados' },
            { key: 'fuel_rate_per_km',         label: 'COP/km combustible estimado' },
            { key: 'min_freight',              label: 'Flete mínimo (COP)' },
          ].map(({ key, label }) => (
            <div key={key} className="space-y-1">
              <Label>{label}</Label>
              <Input
                type="number"
                min="0"
                step="1"
                value={form[key as keyof typeof form]}
                onChange={e => f(key as keyof typeof form, e.target.value)}
              />
            </div>
          ))}
          <div className="space-y-1">
            <Label>Notas</Label>
            <Input value={form.notes} onChange={e => f('notes', e.target.value)} placeholder="Observaciones opcionales" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
            {mut.isPending ? 'Guardando...' : 'Guardar tarifa'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SupplyChainPage() {
  const { slug } = useParams<{ slug: string }>();
  const qc = useQueryClient();
  const [tab, setTab] = useState('shipments');
  const [showCreateRoute, setShowCreateRoute] = useState(false);
  const [showCreateShipment, setShowCreateShipment] = useState(false);
  const [addEventShipment, setAddEventShipment] = useState<Shipment | null>(null);

  const statsQ = useQuery({ queryKey: ['shipments', 'stats'], queryFn: () => shipmentApi.stats() });
  const routesQ = useQuery({
    queryKey: ['routes'],
    queryFn: () => routePlanApi.list(),
    enabled: tab === 'routes',
  });
  const shipmentsQ = useQuery({
    queryKey: ['shipments'],
    queryFn: () => shipmentApi.list(),
    enabled: tab === 'shipments',
  });

  const stats: ShipmentStats = (statsQ.data as unknown as { data: ShipmentStats })?.data ?? {} as ShipmentStats;
  const routes: RoutePlan[] = (routesQ.data as unknown as { data: { data: RoutePlan[] } })?.data?.data ?? [];
  const shipments: Shipment[] = (shipmentsQ.data as unknown as { data: { data: Shipment[] } })?.data?.data ?? [];

  const startRouteMut = useMutation({
    mutationFn: (id: number) => routePlanApi.start(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['routes'] }),
  });

  return (
    <AddonGate moduleKey="supply_chain" slug={slug}>
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Supply Chain — Logística</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowCreateRoute(true)}>
            <Navigation className="w-4 h-4 mr-2" />Nueva Ruta
          </Button>
          <Button onClick={() => setShowCreateShipment(true)}>
            <Package className="w-4 h-4 mr-2" />Nuevo Envío
          </Button>
        </div>
      </div>

      {/* Shipment KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: 'Total envíos', value: stats.total, color: 'text-gray-800' },
          { label: 'Pendientes', value: stats.pending, color: 'text-gray-600' },
          { label: 'En tránsito', value: stats.in_transit, color: 'text-yellow-600' },
          { label: 'Entregados', value: stats.delivered, color: 'text-green-600' },
          { label: 'Vencidos', value: stats.overdue, color: 'text-red-600' },
        ].map(({ label, value, color }) => (
          <Card key={label}>
            <CardContent className="pt-4 pb-3">
              <div className="text-sm text-gray-500">{label}</div>
              <div className={`text-2xl font-bold mt-1 ${color}`}>{value ?? '-'}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex gap-0.5 p-1 rounded-lg bg-muted w-fit">
        {([
          { key: 'shipments', icon: Package, label: 'Envíos' },
          { key: 'routes', icon: Navigation, label: 'Rutas' },
          { key: 'freight', icon: Calculator, label: 'Flete' },
        ] as const).map(({ key, icon: Icon, label }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${tab === key ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
            <Icon className="w-3.5 h-3.5" />{label}
          </button>
        ))}
      </div>

      {/* Envíos */}
      {tab === 'shipments' && (
        <div className="space-y-2">
          {shipmentsQ.isLoading ? (
            <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="rounded-2xl border bg-card h-16 animate-pulse" />)}</div>
          ) : shipments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 gap-3 text-muted-foreground">
              <div className="size-14 rounded-full bg-muted flex items-center justify-center"><Package className="size-7 opacity-40" /></div>
              <p className="font-medium">Sin envíos registrados</p>
            </div>
          ) : shipments.map(s => (
            <div key={s.id} className="rounded-2xl border bg-card p-4 flex items-center gap-4 hover:shadow-sm hover:border-primary/20 transition-all">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-blue-600">{s.tracking_number}</span>
                  {s.carrier && <span className="text-xs text-muted-foreground">{s.carrier}</span>}
                </div>
                <p className="font-semibold text-sm mt-0.5">{s.recipient_name}</p>
                {s.destination_address && <p className="text-xs text-muted-foreground truncate">{s.destination_address}</p>}
              </div>
              <div className="hidden sm:block text-sm shrink-0">
                <p className="text-xs text-muted-foreground">Entrega est.</p>
                <p className={`text-xs ${s.estimated_delivery_date && new Date(s.estimated_delivery_date) < new Date() && s.status !== 'delivered' ? 'text-red-600 font-medium' : ''}`}>
                  {s.estimated_delivery_date ?? '—'}
                </p>
              </div>
              <StatusChip status={s.status} />
              <div className="shrink-0">
                {!['delivered', 'returned'].includes(s.status) && (
                  <Button size="sm" variant="outline" onClick={() => setAddEventShipment(s)}>
                    <MapPin className="w-3 h-3 mr-1" />Evento
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Rutas */}
      {tab === 'routes' && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">Planes de Ruta — Optimización nearest-neighbor automática</p>
          {routesQ.isLoading ? (
            <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="rounded-2xl border bg-card h-16 animate-pulse" />)}</div>
          ) : routes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 gap-3 text-muted-foreground">
              <div className="size-14 rounded-full bg-muted flex items-center justify-center"><Navigation className="size-7 opacity-40" /></div>
              <p className="font-medium">Sin rutas creadas</p>
            </div>
          ) : routes.map(r => (
            <div key={r.id} className="rounded-2xl border bg-card p-4 flex items-center gap-4 hover:shadow-sm hover:border-primary/20 transition-all">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{r.name}</span>
                  <span className="font-mono text-xs text-muted-foreground">{r.ref}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {r.planned_date} · {r.total_stops} paradas{r.total_distance_km ? ` · ${r.total_distance_km} km` : ''}
                  {(r.vehicle_plate || r.driver_name) ? ` · ${[r.vehicle_plate, r.driver_name].filter(Boolean).join(' / ')}` : ''}
                </p>
              </div>
              <StatusChip status={r.status} />
              <div className="shrink-0">
                {['draft', 'optimized'].includes(r.status) && (
                  <Button size="sm" onClick={() => startRouteMut.mutate(r.id)}>
                    <Truck className="w-3 h-3 mr-1" />Iniciar
                  </Button>
                )}
                {r.status === 'completed' && <CheckCircle className="w-4 h-4 text-green-500" />}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Flete */}
      {tab === 'freight' && <FreightCalculatorTab />}

      {showCreateRoute && <CreateRouteDialog open onClose={() => setShowCreateRoute(false)} />}
      {showCreateShipment && <CreateShipmentDialog open onClose={() => setShowCreateShipment(false)} />}
      {addEventShipment && <AddEventDialog shipment={addEventShipment} onClose={() => setAddEventShipment(null)} />}
    </div>
    </AddonGate>
  );
}
