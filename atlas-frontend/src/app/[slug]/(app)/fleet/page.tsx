'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notify } from '@/lib/notify';
import { fleetApi } from '@/lib/api/tenant.api';
import { AddonGate } from '@/components/shared/AddonPaywall';
import {
  Truck, Car, Plus, CheckCircle, XCircle, Navigation,
  Wrench, Fuel, AlertTriangle, Users, Pencil, DollarSign, Calculator,
} from 'lucide-react';

import { Button }    from '@/components/ui/button';
import { Badge }     from '@/components/ui/badge';
import { Input }     from '@/components/ui/input';
import { Label }     from '@/components/ui/label';
import { Skeleton }  from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import {
  Card, CardContent,
} from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from '@/components/ui/tabs';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Vehicle {
  id: number;
  plate: string;
  brand: string | null;
  model: string | null;
  year: number | null;
  type: string;
  status: 'active' | 'maintenance' | 'inactive' | 'decommissioned';
  odometer_km: number;
  soat_expiry: string | null;
  technical_inspection_expiry: string | null;
  next_service_date: string | null;
}

interface Driver {
  id: number;
  full_name: string;
  document_number: string;
  license_number: string | null;
  license_category: string | null;
  license_expiry: string | null;
  phone: string | null;
  status: string;
}

interface Trip {
  id: number;
  trip_ref: string;
  plate: string;
  driver_name: string | null;
  origin: string;
  destination: string;
  scheduled_at: string;
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  total_cost: number;
  freight_charge: number;
  distance_km: number | null;
}

interface Stats {
  totalVehicles: number;
  activeVehicles: number;
  tripsThisMonth: number;
  costThisMonth: number;
  freightThisMonth: number;
  expiringDocs: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (v: number) => `$${Number(v).toLocaleString('es-CO', { minimumFractionDigits: 0 })}`;
const fmtDate = (d: string) => new Date(d).toLocaleDateString('es-CO');

const TRIP_STATUS_COLORS: Record<Trip['status'], 'secondary' | 'default' | 'destructive' | 'outline'> = {
  scheduled: 'secondary', in_progress: 'default', completed: 'outline', cancelled: 'destructive',
};
const TRIP_STATUS_LABELS: Record<Trip['status'], string> = {
  scheduled: 'Programado', in_progress: 'En curso', completed: 'Completado', cancelled: 'Cancelado',
};

// ─── Create Vehicle Dialog ────────────────────────────────────────────────────

function CreateVehicleDialog({ open, onClose, onCreated }: {
  open: boolean; onClose: () => void; onCreated: () => void;
}) {
  const [plate, setPlate]     = useState('');
  const [brand, setBrand]     = useState('');
  const [model, setModel]     = useState('');
  const [year, setYear]       = useState('');
  const [type, setType]       = useState('truck');
  const [payload, setPayload] = useState('');
  const [soat, setSoat]       = useState('');
  const [revision, setRevision] = useState('');

  const mut = useMutation({
    mutationFn: () => fleetApi.createVehicle({
      plate, brand: brand || undefined, model: model || undefined,
      year: year ? parseInt(year) : undefined, type,
      payload_kg: payload ? parseFloat(payload) : undefined,
      soat_expiry: soat || undefined,
      technical_inspection_expiry: revision || undefined,
    }),
    onSuccess: () => { notify.success('Vehículo registrado'); onCreated(); onClose(); },
    onError: () => notify.error('Error al registrar vehículo'),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Registrar Vehículo</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Placa <span className="text-destructive">*</span></Label>
              <Input value={plate} onChange={(e) => setPlate(e.target.value.toUpperCase())} placeholder="ABC123" />
            </div>
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={type} onValueChange={(v) => setType(v ?? 'truck')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="truck">Camión</SelectItem>
                  <SelectItem value="van">Van</SelectItem>
                  <SelectItem value="car">Automóvil</SelectItem>
                  <SelectItem value="motorcycle">Moto</SelectItem>
                  <SelectItem value="other">Otro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Marca</Label>
              <Input value={brand} onChange={(e) => setBrand(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Modelo</Label>
              <Input value={model} onChange={(e) => setModel(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Año</Label>
              <Input type="number" min={1980} max={2030} value={year} onChange={(e) => setYear(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Carga máx. (kg)</Label>
              <Input type="number" min={0} value={payload} onChange={(e) => setPayload(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Venc. SOAT</Label>
              <Input type="date" value={soat} onChange={(e) => setSoat(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Venc. Revisión Técnica</Label>
              <Input type="date" value={revision} onChange={(e) => setRevision(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending || !plate}>
            {mut.isPending ? 'Guardando…' : 'Registrar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Create Trip Dialog ───────────────────────────────────────────────────────

function CreateTripDialog({ open, onClose, onCreated, vehicles, drivers }: {
  open: boolean; onClose: () => void; onCreated: () => void;
  vehicles: Vehicle[]; drivers: Driver[];
}) {
  const [vehicleId, setVehicleId] = useState('');
  const [driverId, setDriverId]   = useState('');
  const [origin, setOrigin]       = useState('');
  const [dest, setDest]           = useState('');
  const [scheduled, setScheduled] = useState('');
  const [distanceKm, setDistanceKm] = useState('');
  const [cargoDesc, setCargoDesc] = useState('');
  const [freight, setFreight]     = useState('0');

  const mut = useMutation({
    mutationFn: () => fleetApi.createTrip({
      vehicle_id: Number(vehicleId),
      driver_id: driverId ? Number(driverId) : undefined,
      origin, destination: dest,
      scheduled_at: scheduled,
      distance_km: distanceKm ? parseFloat(distanceKm) : undefined,
      cargo_description: cargoDesc || undefined,
      freight_charge: parseFloat(freight) || 0,
    }),
    onSuccess: () => { notify.success('Viaje creado'); onCreated(); onClose(); },
    onError: () => notify.error('Error al crear viaje'),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Nuevo Viaje</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Vehículo <span className="text-destructive">*</span></Label>
              <Select value={vehicleId} onValueChange={(v) => setVehicleId(v ?? '')}>
                <SelectTrigger><SelectValue placeholder="Seleccionar…" /></SelectTrigger>
                <SelectContent>
                  {vehicles.filter((v) => v.status === 'active').map((v) => (
                    <SelectItem key={v.id} value={String(v.id)}>{v.plate} — {v.brand} {v.model}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Conductor</Label>
              <Select value={driverId} onValueChange={(v) => setDriverId(v ?? '')}>
                <SelectTrigger><SelectValue placeholder="(ninguno)" /></SelectTrigger>
                <SelectContent>
                  {drivers.filter((d) => d.status === 'active').map((d) => (
                    <SelectItem key={d.id} value={String(d.id)}>{d.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Origen <span className="text-destructive">*</span></Label>
              <Input value={origin} onChange={(e) => setOrigin(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Destino <span className="text-destructive">*</span></Label>
              <Input value={dest} onChange={(e) => setDest(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Fecha/hora programada <span className="text-destructive">*</span></Label>
              <Input type="datetime-local" value={scheduled} onChange={(e) => setScheduled(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Distancia (km)</Label>
              <Input type="number" min={0} value={distanceKm} onChange={(e) => setDistanceKm(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Descripción carga</Label>
              <Input value={cargoDesc} onChange={(e) => setCargoDesc(e.target.value)} className="col-span-2" />
            </div>
            <div className="space-y-1.5">
              <Label>Cobro flete</Label>
              <Input type="number" min={0} step={0.01} value={freight} onChange={(e) => setFreight(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending || !vehicleId || !origin || !dest || !scheduled}>
            {mut.isPending ? 'Creando…' : 'Crear Viaje'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Arrive Dialog ────────────────────────────────────────────────────────────

function ArriveDialog({ tripId, open, onClose, onDone }: {
  tripId: number | null; open: boolean; onClose: () => void; onDone: () => void;
}) {
  const [fuelCost, setFuelCost]   = useState('0');
  const [tollCost, setTollCost]   = useState('0');
  const [otherCost, setOtherCost] = useState('0');
  const [odoEnd, setOdoEnd]       = useState('');

  const mut = useMutation({
    mutationFn: () => fleetApi.arriveTrip(tripId!, {
      odometer_end: odoEnd ? parseFloat(odoEnd) : undefined,
      fuel_cost: parseFloat(fuelCost) || 0,
      toll_cost: parseFloat(tollCost) || 0,
      other_costs: parseFloat(otherCost) || 0,
    }),
    onSuccess: () => { notify.success('Llegada registrada'); onDone(); onClose(); },
  });

  const total = (parseFloat(fuelCost) || 0) + (parseFloat(tollCost) || 0) + (parseFloat(otherCost) || 0);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>Registrar Llegada</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Odómetro llegada (km)</Label>
            <Input type="number" min={0} value={odoEnd} onChange={(e) => setOdoEnd(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Costo combustible</Label>
            <Input type="number" min={0} step={0.01} value={fuelCost} onChange={(e) => setFuelCost(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Peajes</Label>
            <Input type="number" min={0} step={0.01} value={tollCost} onChange={(e) => setTollCost(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Otros costos</Label>
            <Input type="number" min={0} step={0.01} value={otherCost} onChange={(e) => setOtherCost(e.target.value)} />
          </div>
          <div className="text-right text-sm font-semibold">Total: {fmt(total)}</div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
            {mut.isPending ? 'Guardando…' : 'Confirmar Llegada'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Create Driver Dialog ─────────────────────────────────────────────────────

function CreateDriverDialog({ open, onClose, onCreated }: {
  open: boolean; onClose: () => void; onCreated: () => void;
}) {
  const [name, setName]       = useState('');
  const [doc, setDoc]         = useState('');
  const [lic, setLic]         = useState('');
  const [licCat, setLicCat]   = useState('');
  const [licExp, setLicExp]   = useState('');
  const [phone, setPhone]     = useState('');

  const mut = useMutation({
    mutationFn: () => fleetApi.createDriver({
      full_name: name, document_number: doc,
      license_number: lic || undefined, license_category: licCat || undefined,
      license_expiry: licExp || undefined, phone: phone || undefined,
    }),
    onSuccess: () => { notify.success('Conductor registrado'); onCreated(); onClose(); setName(''); setDoc(''); setLic(''); setLicCat(''); setLicExp(''); setPhone(''); },
    onError: () => notify.error('Error al registrar conductor'),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Registrar Conductor</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5 col-span-2">
              <Label>Nombre completo *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Cédula *</Label>
              <Input value={doc} onChange={(e) => setDoc(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Teléfono</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>N° Licencia</Label>
              <Input value={lic} onChange={(e) => setLic(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Categoría licencia</Label>
              <Select value={licCat} onValueChange={(v) => setLicCat(v ?? '')}>
                <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                <SelectContent>
                  {['A1','A2','B1','B2','B3','C1','C2','C3'].map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>Vencimiento licencia</Label>
              <Input type="date" value={licExp} onChange={(e) => setLicExp(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => mut.mutate()} disabled={!name || !doc || mut.isPending}>
            {mut.isPending ? 'Guardando...' : 'Registrar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Vehicle Maintenance Sheet ────────────────────────────────────────────────

function VehicleMaintenanceSheet({ vehicle, open, onClose }: {
  vehicle: Vehicle | null; open: boolean; onClose: () => void;
}) {
  const qc = useQueryClient();
  const { slug } = useParams<{ slug: string }>();

  const { data: logs = [], isLoading } = useQuery<any[]>({
    queryKey: [slug, 'vehicle-maintenance', vehicle?.id],
    queryFn: async () => {
      const r = await fleetApi.vehicleMaintenance(vehicle!.id);
      return (r.data as any[]) ?? [];
    },
    enabled: open && !!vehicle,
  });

  const [addOpen, setAddOpen]   = useState(false);
  const [mType, setMType]       = useState('preventivo');
  const [mDate, setMDate]       = useState(new Date().toISOString().split('T')[0]);
  const [mCost, setMCost]       = useState('');
  const [mWorkshop, setMWorkshop] = useState('');
  const [mDesc, setMDesc]       = useState('');
  const [mNextDate, setMNextDate] = useState('');

  const addMut = useMutation({
    mutationFn: () => fleetApi.addMaintenance(vehicle!.id, {
      type: mType, date: mDate, cost: parseFloat(mCost) || 0,
      workshop: mWorkshop || undefined, description: mDesc || undefined,
      next_maintenance_date: mNextDate || undefined,
    }),
    onSuccess: () => {
      notify.success('Mantenimiento registrado');
      setAddOpen(false); setMCost(''); setMWorkshop(''); setMDesc(''); setMNextDate('');
      qc.invalidateQueries({ queryKey: [slug, 'vehicle-maintenance', vehicle?.id] });
      qc.invalidateQueries({ queryKey: [slug, 'fleet-vehicles'] });
    },
    onError: () => notify.error('Error'),
  });

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Mantenimiento — {vehicle?.plate} ({vehicle?.brand} {vehicle?.model})</DialogTitle>
          </DialogHeader>
          <div className="flex justify-end mb-2">
            <Button size="sm" onClick={() => setAddOpen(true)} className="gap-1">
              <Plus className="size-3.5" />Registrar
            </Button>
          </div>
          {isLoading ? <Skeleton className="h-32 w-full" /> : logs.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground">
              <Wrench className="size-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Sin registros de mantenimiento</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tipo</TableHead><TableHead>Fecha</TableHead>
                  <TableHead>Taller</TableHead><TableHead className="text-right">Costo</TableHead>
                  <TableHead>Próx. servicio</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((l: any) => (
                  <TableRow key={l.id}>
                    <TableCell className="capitalize">{l.type}</TableCell>
                    <TableCell>{fmtDate(l.date)}</TableCell>
                    <TableCell>{l.workshop ?? '—'}</TableCell>
                    <TableCell className="text-right">{fmt(l.cost)}</TableCell>
                    <TableCell>{l.next_maintenance_date ? fmtDate(l.next_maintenance_date) : '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Registrar Mantenimiento</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Tipo *</Label>
                <Select value={mType} onValueChange={(v) => setMType(v ?? 'preventivo')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="preventivo">Preventivo</SelectItem>
                    <SelectItem value="correctivo">Correctivo</SelectItem>
                    <SelectItem value="aceite">Cambio de aceite</SelectItem>
                    <SelectItem value="llantas">Llantas</SelectItem>
                    <SelectItem value="frenos">Frenos</SelectItem>
                    <SelectItem value="otro">Otro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Fecha *</Label>
                <Input type="date" value={mDate} onChange={(e) => setMDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Costo *</Label>
                <Input type="number" min={0} value={mCost} onChange={(e) => setMCost(e.target.value)} placeholder="0" />
              </div>
              <div className="space-y-1.5">
                <Label>Taller</Label>
                <Input value={mWorkshop} onChange={(e) => setMWorkshop(e.target.value)} />
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label>Descripción</Label>
                <Input value={mDesc} onChange={(e) => setMDesc(e.target.value)} />
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label>Próximo mantenimiento</Label>
                <Input type="date" value={mNextDate} onChange={(e) => setMNextDate(e.target.value)} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancelar</Button>
            <Button onClick={() => addMut.mutate()} disabled={!mCost || addMut.isPending}>
              {addMut.isPending ? 'Guardando...' : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Vehicle Fuel Sheet ───────────────────────────────────────────────────────

function VehicleFuelSheet({ vehicle, open, onClose }: {
  vehicle: Vehicle | null; open: boolean; onClose: () => void;
}) {
  const qc = useQueryClient();
  const { slug } = useParams<{ slug: string }>();

  const { data: logs = [], isLoading } = useQuery<any[]>({
    queryKey: [slug, 'vehicle-fuel', vehicle?.id],
    queryFn: async () => {
      const r = await fleetApi.vehicleFuel(vehicle!.id);
      return (r.data as any[]) ?? [];
    },
    enabled: open && !!vehicle,
  });

  const [addOpen, setAddOpen]     = useState(false);
  const [fDate, setFDate]         = useState(new Date().toISOString().split('T')[0]);
  const [fLiters, setFLiters]     = useState('');
  const [fPrice, setFPrice]       = useState('');
  const [fStation, setFStation]   = useState('');
  const [fOdo, setFOdo]           = useState('');

  const totalCost = (parseFloat(fLiters) || 0) * (parseFloat(fPrice) || 0);

  const addMut = useMutation({
    mutationFn: () => fleetApi.addFuel(vehicle!.id, {
      date: fDate, liters: parseFloat(fLiters), price_per_liter: parseFloat(fPrice),
      station: fStation || undefined, odometer_km: fOdo ? parseFloat(fOdo) : undefined,
    }),
    onSuccess: () => {
      notify.success('Combustible registrado');
      setAddOpen(false); setFLiters(''); setFPrice(''); setFStation(''); setFOdo('');
      qc.invalidateQueries({ queryKey: [slug, 'vehicle-fuel', vehicle?.id] });
    },
    onError: () => notify.error('Error'),
  });

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Combustible — {vehicle?.plate}</DialogTitle>
          </DialogHeader>
          <div className="flex justify-end mb-2">
            <Button size="sm" onClick={() => setAddOpen(true)} className="gap-1">
              <Plus className="size-3.5" />Cargar combustible
            </Button>
          </div>
          {isLoading ? <Skeleton className="h-32 w-full" /> : logs.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground">
              <Fuel className="size-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Sin registros de combustible</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead><TableHead>Litros</TableHead>
                  <TableHead>Precio/L</TableHead><TableHead className="text-right">Total</TableHead>
                  <TableHead>Estación</TableHead><TableHead>Odómetro</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((l: any) => (
                  <TableRow key={l.id}>
                    <TableCell>{fmtDate(l.date)}</TableCell>
                    <TableCell>{Number(l.liters).toFixed(1)} L</TableCell>
                    <TableCell>{fmt(l.price_per_liter)}</TableCell>
                    <TableCell className="text-right font-medium">{fmt(l.liters * l.price_per_liter)}</TableCell>
                    <TableCell>{l.station ?? '—'}</TableCell>
                    <TableCell>{l.odometer_km ? `${Number(l.odometer_km).toLocaleString()} km` : '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Cargar Combustible</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Fecha</Label>
              <Input type="date" value={fDate} onChange={(e) => setFDate(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Litros *</Label>
                <Input type="number" min={0} step={0.01} value={fLiters} onChange={(e) => setFLiters(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Precio/litro *</Label>
                <Input type="number" min={0} step={1} value={fPrice} onChange={(e) => setFPrice(e.target.value)} />
              </div>
            </div>
            {totalCost > 0 && <p className="text-sm font-medium text-right">Total: {fmt(totalCost)}</p>}
            <div className="space-y-1.5">
              <Label>Estación / EDS</Label>
              <Input value={fStation} onChange={(e) => setFStation(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Odómetro (km)</Label>
              <Input type="number" min={0} value={fOdo} onChange={(e) => setFOdo(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancelar</Button>
            <Button onClick={() => addMut.mutate()} disabled={!fLiters || !fPrice || addMut.isPending}>
              {addMut.isPending ? 'Guardando...' : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Freight Rates Tab Content ────────────────────────────────────────────────

function FreightRatesTab() {
  const qc = useQueryClient();
  const { slug } = useParams<{ slug: string }>();

  const { data: rates = [], isLoading } = useQuery<any[]>({
    queryKey: [slug, 'fleet-freight-rates'],
    queryFn: async () => {
      const r = await fleetApi.freightRates();
      return (r.data as any[]) ?? [];
    },
  });

  const [editRate, setEditRate] = useState<any | null>(null);
  const [vType, setVType]       = useState('truck');
  const [baseRate, setBaseRate] = useState('');
  const [weightSurcharge, setWeightSurcharge] = useState('');
  const [tollEst, setTollEst]   = useState('');
  const [fuelRate, setFuelRate] = useState('');
  const [minFreight, setMinFreight] = useState('');

  // Estimator
  const [estType, setEstType]   = useState('truck');
  const [estDist, setEstDist]   = useState('');
  const [estWeight, setEstWeight] = useState('');
  const [estimate, setEstimate] = useState<any | null>(null);
  const [estimating, setEstimating] = useState(false);

  function openEdit(r: any) {
    setEditRate(r);
    setVType(r.vehicle_type); setBaseRate(String(r.base_rate_per_km));
    setWeightSurcharge(String(r.weight_surcharge_per_kg));
    setTollEst(String(r.toll_estimate_per_km)); setFuelRate(String(r.fuel_rate_per_km));
    setMinFreight(String(r.min_freight));
  }

  const saveMut = useMutation({
    mutationFn: () => fleetApi.upsertFreightRate({
      vehicle_type: vType, base_rate_per_km: parseFloat(baseRate),
      weight_surcharge_per_kg: parseFloat(weightSurcharge) || 0,
      toll_estimate_per_km: parseFloat(tollEst) || 0,
      fuel_rate_per_km: parseFloat(fuelRate) || 0,
      min_freight: parseFloat(minFreight) || 0,
    }),
    onSuccess: () => {
      notify.success('Tarifa guardada');
      setEditRate(null);
      qc.invalidateQueries({ queryKey: [slug, 'fleet-freight-rates'] });
    },
    onError: () => notify.error('Error'),
  });

  async function calcEstimate() {
    setEstimating(true);
    try {
      const r = await fleetApi.estimateFreight({
        vehicle_type: estType, distance_km: parseFloat(estDist),
        weight_kg: estWeight ? parseFloat(estWeight) : undefined,
      });
      setEstimate(r.data);
    } catch { notify.error('Sin tarifa para ese tipo de vehículo'); }
    finally { setEstimating(false); }
  }

  const VEHICLE_LABELS: Record<string, string> = {
    truck: 'Camión', van: 'Van', car: 'Automóvil', motorcycle: 'Moto', other: 'Otro',
  };

  return (
    <div className="space-y-6">
      {/* Rates table */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Tarifas por tipo de vehículo</h3>
        <Button size="sm" onClick={() => { setEditRate({}); setVType('truck'); setBaseRate(''); setWeightSurcharge('0'); setTollEst('0'); setFuelRate('0'); setMinFreight('0'); }} className="gap-1">
          <Plus className="size-3.5" />Nueva tarifa
        </Button>
      </div>
      {isLoading ? <Skeleton className="h-32 w-full" /> : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Vehículo</TableHead>
              <TableHead className="text-right">Base/km</TableHead>
              <TableHead className="text-right">Combustible/km</TableHead>
              <TableHead className="text-right">Peajes/km</TableHead>
              <TableHead className="text-right">Mín. flete</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rates.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Sin tarifas configuradas</TableCell></TableRow>
            )}
            {rates.map((r: any) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{VEHICLE_LABELS[r.vehicle_type] ?? r.vehicle_type}</TableCell>
                <TableCell className="text-right">{fmt(r.base_rate_per_km)}/km</TableCell>
                <TableCell className="text-right">{fmt(r.fuel_rate_per_km)}/km</TableCell>
                <TableCell className="text-right">{fmt(r.toll_estimate_per_km)}/km</TableCell>
                <TableCell className="text-right">{fmt(r.min_freight)}</TableCell>
                <TableCell>
                  <Button size="sm" variant="ghost" className="h-7 gap-1" onClick={() => openEdit(r)}>
                    <Pencil className="size-3" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* Estimator */}
      <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Calculator className="size-4 text-primary" />
          <h3 className="text-sm font-semibold">Calculadora de flete</h3>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label>Tipo vehículo</Label>
            <Select value={estType} onValueChange={(v) => setEstType(v ?? 'truck')}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(VEHICLE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Distancia (km)</Label>
            <Input type="number" min={0} value={estDist} onChange={(e) => setEstDist(e.target.value)} placeholder="ej. 120" />
          </div>
          <div className="space-y-1.5">
            <Label>Peso carga (kg)</Label>
            <Input type="number" min={0} value={estWeight} onChange={(e) => setEstWeight(e.target.value)} placeholder="opcional" />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button size="sm" onClick={calcEstimate} disabled={!estDist || estimating} className="gap-1">
            <DollarSign className="size-3.5" />{estimating ? 'Calculando...' : 'Calcular'}
          </Button>
          {estimate && (
            <div className="flex gap-4 text-sm">
              <span className="text-muted-foreground">Base: <b>{fmt(estimate.base_cost ?? 0)}</b></span>
              <span className="text-muted-foreground">Combustible: <b>{fmt(estimate.fuel_cost ?? 0)}</b></span>
              <span className="text-muted-foreground">Peajes: <b>{fmt(estimate.toll_cost ?? 0)}</b></span>
              <span className="font-semibold text-primary">Total: {fmt(estimate.total ?? 0)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Edit/Create dialog */}
      <Dialog open={editRate !== null} onOpenChange={(o) => { if (!o) setEditRate(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{editRate?.id ? 'Editar tarifa' : 'Nueva tarifa'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Tipo de vehículo</Label>
              <Select value={vType} onValueChange={(v) => setVType(v ?? 'truck')} disabled={!!editRate?.id}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(VEHICLE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Tarifa base/km *</Label><Input type="number" min={0} value={baseRate} onChange={(e) => setBaseRate(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Combustible/km</Label><Input type="number" min={0} value={fuelRate} onChange={(e) => setFuelRate(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Peajes/km</Label><Input type="number" min={0} value={tollEst} onChange={(e) => setTollEst(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Recargo peso/kg</Label><Input type="number" min={0} value={weightSurcharge} onChange={(e) => setWeightSurcharge(e.target.value)} /></div>
              <div className="space-y-1.5 col-span-2"><Label>Flete mínimo</Label><Input type="number" min={0} value={minFreight} onChange={(e) => setMinFreight(e.target.value)} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditRate(null)}>Cancelar</Button>
            <Button onClick={() => saveMut.mutate()} disabled={!baseRate || saveMut.isPending}>
              {saveMut.isPending ? 'Guardando...' : 'Guardar tarifa'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// PAGE
// ══════════════════════════════════════════════════════════════════════════════

export default function FleetPage() {
  const { slug } = useParams<{ slug: string }>();
  const qc = useQueryClient();
  const [mainTab, setMainTab]       = useState('trips');
  const [createVehicle, setCreateVehicle] = useState(false);
  const [createTrip, setCreateTrip]       = useState(false);
  const [arriveId, setArriveId]           = useState<number | null>(null);
  const [createDriver, setCreateDriver]   = useState(false);
  const [maintVehicle, setMaintVehicle]   = useState<Vehicle | null>(null);
  const [fuelVehicle, setFuelVehicle]     = useState<Vehicle | null>(null);

  const statsQ    = useQuery({ queryKey: [slug, 'fleet-stats'], queryFn: () => fleetApi.stats() });
  const vehiclesQ = useQuery({ queryKey: [slug, 'fleet-vehicles'], queryFn: () => fleetApi.vehicles() });
  const driversQ  = useQuery({ queryKey: [slug, 'fleet-drivers'], queryFn: () => fleetApi.drivers() });
  const tripsQ    = useQuery({ queryKey: [slug, 'fleet-trips'], queryFn: () => fleetApi.trips() });

  const stats   = statsQ.data as Stats | undefined;
  const vehicles = ((vehiclesQ.data as { data?: Vehicle[] })?.data ?? []) as Vehicle[];
  const drivers  = (((driversQ.data as any)?.data ?? driversQ.data ?? []) as Driver[]);
  const trips    = ((tripsQ.data as { data?: Trip[] })?.data ?? []) as Trip[];

  function inv() {
    qc.invalidateQueries({ queryKey: [slug, 'fleet-trips'] });
    qc.invalidateQueries({ queryKey: [slug, 'fleet-stats'] });
  }

  const departMut = useMutation({
    mutationFn: (id: number) => fleetApi.departTrip(id),
    onSuccess: () => { notify.success('Salida registrada'); inv(); },
  });
  const cancelMut = useMutation({
    mutationFn: (id: number) => fleetApi.cancelTrip(id),
    onSuccess: () => { notify.success('Viaje cancelado'); inv(); },
  });

  return (
    <AddonGate moduleKey="fleet" slug={slug}>
    <div className="space-y-4 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2"><Truck className="size-5" />Flota</h1>
          <p className="text-sm text-muted-foreground">Gestión de vehículos, conductores y viajes</p>
        </div>
      </div>

      {/* KPI */}
      {stats && (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
          {[
            { label: 'Vehículos',       value: `${stats.activeVehicles}/${stats.totalVehicles}`, icon: Car },
            { label: 'Viajes/mes',      value: stats.tripsThisMonth,   icon: Navigation },
            { label: 'Costo/mes',       value: fmt(stats.costThisMonth),  icon: Fuel },
            { label: 'Flete/mes',       value: fmt(stats.freightThisMonth), icon: Truck },
            { label: 'Docs por vencer', value: stats.expiringDocs,     icon: AlertTriangle, color: stats.expiringDocs > 0 ? 'text-orange-600' : '' },
          ].map(({ label, value, icon: Icon, color = '' }) => (
            <Card key={label}>
              <CardContent className="flex items-center gap-2 pt-3 pb-2">
                <Icon className={`size-5 shrink-0 ${color || 'text-muted-foreground'}`} />
                <div>
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className={`text-sm font-bold ${color}`}>{String(value)}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Tabs value={mainTab} onValueChange={setMainTab}>
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="trips">Viajes</TabsTrigger>
            <TabsTrigger value="vehicles">Vehículos</TabsTrigger>
            <TabsTrigger value="drivers">Conductores</TabsTrigger>
            <TabsTrigger value="freight">Tarifas</TabsTrigger>
          </TabsList>
          {mainTab === 'trips' && (
            <Button size="sm" onClick={() => setCreateTrip(true)}>
              <Plus className="size-3.5 mr-1" />Nuevo Viaje
            </Button>
          )}
          {mainTab === 'vehicles' && (
            <Button size="sm" onClick={() => setCreateVehicle(true)}>
              <Plus className="size-3.5 mr-1" />Registrar Vehículo
            </Button>
          )}
          {mainTab === 'drivers' && (
            <Button size="sm" onClick={() => setCreateDriver(true)}>
              <Plus className="size-3.5 mr-1" />Nuevo Conductor
            </Button>
          )}
        </div>

        {/* Trips */}
        <TabsContent value="trips" className="mt-3">
          {tripsQ.isPending ? <Skeleton className="h-48 w-full" /> : trips.length === 0 ? (
            <div className="py-14 text-center text-muted-foreground">
              <Navigation className="mx-auto size-8 mb-2 opacity-30" />
              <p>Sin viajes registrados</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ref</TableHead>
                  <TableHead>Placa</TableHead>
                  <TableHead>Conductor</TableHead>
                  <TableHead>Ruta</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead className="text-right">Costo</TableHead>
                  <TableHead className="text-right">Flete</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {trips.map((trip) => (
                  <TableRow key={trip.id}>
                    <TableCell className="font-mono text-xs">{trip.trip_ref}</TableCell>
                    <TableCell className="font-semibold">{trip.plate}</TableCell>
                    <TableCell className="text-sm">{trip.driver_name ?? '—'}</TableCell>
                    <TableCell className="text-sm">{trip.origin} → {trip.destination}</TableCell>
                    <TableCell className="text-sm">{fmtDate(trip.scheduled_at)}</TableCell>
                    <TableCell className="text-right text-sm">{fmt(trip.total_cost)}</TableCell>
                    <TableCell className="text-right text-sm">{fmt(trip.freight_charge)}</TableCell>
                    <TableCell>
                      <Badge variant={TRIP_STATUS_COLORS[trip.status]} className="text-xs">
                        {TRIP_STATUS_LABELS[trip.status]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {trip.status === 'scheduled' && (
                          <Button size="sm" variant="outline" className="h-7 text-xs"
                            onClick={() => departMut.mutate(trip.id)}>
                            Salir
                          </Button>
                        )}
                        {trip.status === 'in_progress' && (
                          <Button size="sm" className="h-7 text-xs"
                            onClick={() => setArriveId(trip.id)}>
                            Llegada
                          </Button>
                        )}
                        {trip.status === 'scheduled' && (
                          <Button size="icon" variant="ghost" className="size-7 text-destructive"
                            onClick={() => { if (confirm('¿Cancelar viaje?')) cancelMut.mutate(trip.id); }}>
                            <XCircle className="size-3.5" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>

        {/* Vehicles */}
        <TabsContent value="vehicles" className="mt-3">
          {vehiclesQ.isPending ? <Skeleton className="h-48 w-full" /> : vehicles.length === 0 ? (
            <div className="py-14 text-center text-muted-foreground">
              <Car className="mx-auto size-8 mb-2 opacity-30" />
              <p>Sin vehículos registrados</p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {vehicles.map((v) => {
                const soatExpiring = v.soat_expiry && new Date(v.soat_expiry) <= new Date(Date.now() + 30 * 86400000);
                return (
                  <Card key={v.id} className="relative">
                    <CardContent className="pt-4 pb-3">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="font-bold text-lg">{v.plate}</p>
                          <p className="text-sm text-muted-foreground">{v.brand} {v.model} {v.year}</p>
                        </div>
                        <Badge variant={v.status === 'active' ? 'default' : v.status === 'maintenance' ? 'secondary' : 'destructive'} className="text-xs">
                          {v.status}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground space-y-0.5">
                        <div>Odómetro: {Number(v.odometer_km).toLocaleString()} km</div>
                        {v.soat_expiry && (
                          <div className={soatExpiring ? 'text-orange-600 font-semibold' : ''}>
                            SOAT vence: {fmtDate(v.soat_expiry)}
                            {soatExpiring && ' ⚠'}
                          </div>
                        )}
                        {v.next_service_date && (
                          <div>Próx. servicio: {fmtDate(v.next_service_date)}</div>
                        )}
                      </div>
                      <div className="flex gap-1 mt-3">
                        <Button size="sm" variant="outline" className="h-7 text-xs gap-1 flex-1"
                          onClick={() => setMaintVehicle(v)}>
                          <Wrench className="size-3" />Mantenim.
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 text-xs gap-1 flex-1"
                          onClick={() => setFuelVehicle(v)}>
                          <Fuel className="size-3" />Combustible
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Drivers */}
        <TabsContent value="drivers" className="mt-3">
          {driversQ.isPending ? <Skeleton className="h-48 w-full" /> : drivers.length === 0 ? (
            <div className="py-14 text-center text-muted-foreground">
              <Users className="mx-auto size-8 mb-2 opacity-30" />
              <p>Sin conductores registrados</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Cédula</TableHead>
                  <TableHead>Licencia</TableHead>
                  <TableHead>Categoría</TableHead>
                  <TableHead>Venc. Licencia</TableHead>
                  <TableHead>Teléfono</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {drivers.map((d) => {
                  const licExpiring = d.license_expiry && new Date(d.license_expiry) <= new Date(Date.now() + 30 * 86400000);
                  return (
                    <TableRow key={d.id}>
                      <TableCell className="font-medium">{d.full_name}</TableCell>
                      <TableCell className="text-sm">{d.document_number}</TableCell>
                      <TableCell className="text-sm">{d.license_number ?? '—'}</TableCell>
                      <TableCell className="text-sm">{d.license_category ?? '—'}</TableCell>
                      <TableCell className={`text-sm ${licExpiring ? 'text-orange-600 font-semibold' : ''}`}>
                        {d.license_expiry ? fmtDate(d.license_expiry) : '—'}
                        {licExpiring && ' ⚠'}
                      </TableCell>
                      <TableCell className="text-sm">{d.phone ?? '—'}</TableCell>
                      <TableCell>
                        <Badge variant={d.status === 'active' ? 'default' : 'secondary'} className="text-xs">{d.status}</Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </TabsContent>
        {/* Freight rates tab */}
        <TabsContent value="freight" className="mt-3">
          <FreightRatesTab />
        </TabsContent>
      </Tabs>

      <CreateVehicleDialog open={createVehicle} onClose={() => setCreateVehicle(false)}
        onCreated={() => qc.invalidateQueries({ queryKey: [slug, 'fleet-vehicles'] })} />

      <CreateTripDialog open={createTrip} onClose={() => setCreateTrip(false)}
        onCreated={inv} vehicles={vehicles} drivers={drivers} />

      <ArriveDialog tripId={arriveId} open={arriveId !== null}
        onClose={() => setArriveId(null)} onDone={inv} />

      <CreateDriverDialog open={createDriver} onClose={() => setCreateDriver(false)}
        onCreated={() => qc.invalidateQueries({ queryKey: [slug, 'fleet-drivers'] })} />

      <VehicleMaintenanceSheet vehicle={maintVehicle} open={maintVehicle !== null}
        onClose={() => setMaintVehicle(null)} />

      <VehicleFuelSheet vehicle={fuelVehicle} open={fuelVehicle !== null}
        onClose={() => setFuelVehicle(null)} />
    </div>
    </AddonGate>
  );
}
