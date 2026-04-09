'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { maintenanceApi } from '@/lib/api/tenant.api';
import { AddonGate } from '@/components/shared/AddonPaywall';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, Wrench, Calendar, Plus, CheckCircle, Play, X, ClipboardList, Zap, Search } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface MaintenanceStats {
  schedules_active: number;
  overdue: number;
  due_soon: number;
  open_work_orders: number;
  completed_this_month: number;
  critical_open: number;
  overdue_schedules: unknown[];
}

interface Schedule {
  id: number;
  name: string;
  asset_label: string;
  asset_type: string;
  frequency_type: string;
  frequency_value: number;
  next_due_date: string | null;
  last_done_at: string | null;
  assigned_to: string | null;
  active: boolean;
  estimated_cost: number | null;
}

interface WorkOrder {
  id: number;
  ref: string;
  type: string;
  asset_label: string;
  status: string;
  priority: string;
  scheduled_date: string | null;
  assigned_to: string | null;
  estimated_cost: number | null;
  actual_cost: number | null;
  description: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function statusBadge(status: string) {
  const map: Record<string, string> = {
    open: 'bg-blue-100 text-blue-700',
    in_progress: 'bg-yellow-100 text-yellow-700',
    completed: 'bg-green-100 text-green-700',
    cancelled: 'bg-gray-100 text-gray-500',
  };
  const labels: Record<string, string> = {
    open: 'Abierta', in_progress: 'En progreso', completed: 'Completada', cancelled: 'Cancelada',
  };
  return <span className={`px-2 py-0.5 rounded text-xs font-medium ${map[status] ?? 'bg-gray-100 text-gray-500'}`}>{labels[status] ?? status}</span>;
}

function priorityBadge(p: string) {
  const map: Record<string, string> = {
    low: 'bg-gray-100 text-gray-600', normal: 'bg-blue-100 text-blue-700',
    high: 'bg-orange-100 text-orange-700', critical: 'bg-red-100 text-red-700',
  };
  return <span className={`px-2 py-0.5 rounded text-xs font-medium ${map[p] ?? ''}`}>{p}</span>;
}

function isDueSoon(date: string | null): boolean {
  if (!date) return false;
  const d = new Date(date);
  const diff = (d.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  return diff >= 0 && diff <= 30;
}

function isOverdue(date: string | null): boolean {
  if (!date) return false;
  return new Date(date) < new Date();
}

// ─── Create Schedule Dialog ───────────────────────────────────────────────────

function CreateScheduleDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: '', asset_label: '', asset_type: 'vehicle',
    frequency_type: 'months', frequency_value: 3,
    assigned_to: '', estimated_cost: '',
    description: '', last_done_at: '',
  });

  const mut = useMutation({
    mutationFn: () => maintenanceApi.createSchedule(form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['maintenance'] }); onClose(); },
  });

  const f = (k: keyof typeof form, v: unknown) => setForm(p => ({ ...p, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Nuevo Plan de Mantenimiento</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="font-medium">Nombre del plan *</label>
              <Input value={form.name} onChange={e => f('name', e.target.value)} placeholder="Ej: Cambio de aceite" />
            </div>
            <div className="col-span-2">
              <label className="font-medium">Activo / Equipo *</label>
              <Input value={form.asset_label} onChange={e => f('asset_label', e.target.value)} placeholder="Placa, nombre del equipo..." />
            </div>
            <div>
              <label className="font-medium">Tipo de activo</label>
              <Select value={form.asset_type} onValueChange={v => f('asset_type', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="vehicle">Vehículo</SelectItem>
                  <SelectItem value="machine">Máquina</SelectItem>
                  <SelectItem value="equipment">Equipo</SelectItem>
                  <SelectItem value="building">Edificio</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="font-medium">Frecuencia</label>
              <div className="flex gap-2">
                <Input type="number" value={form.frequency_value} onChange={e => f('frequency_value', Number(e.target.value))} className="w-20" min={1} />
                <Select value={form.frequency_type} onValueChange={v => f('frequency_type', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="days">Días</SelectItem>
                    <SelectItem value="weeks">Semanas</SelectItem>
                    <SelectItem value="months">Meses</SelectItem>
                    <SelectItem value="km">Kilómetros</SelectItem>
                    <SelectItem value="hours">Horas</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label className="font-medium">Último mantenimiento</label>
              <Input type="date" value={form.last_done_at} onChange={e => f('last_done_at', e.target.value)} />
            </div>
            <div>
              <label className="font-medium">Costo estimado</label>
              <Input type="number" value={form.estimated_cost} onChange={e => f('estimated_cost', e.target.value)} placeholder="0" />
            </div>
            <div className="col-span-2">
              <label className="font-medium">Responsable</label>
              <Input value={form.assigned_to} onChange={e => f('assigned_to', e.target.value)} placeholder="Técnico o taller" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => mut.mutate()} disabled={!form.name || !form.asset_label || mut.isPending}>
            {mut.isPending ? 'Guardando...' : 'Crear plan'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Create Work Order Dialog ─────────────────────────────────────────────────

function CreateWorkOrderDialog({ open, onClose, scheduleId }: { open: boolean; onClose: () => void; scheduleId?: number }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    type: 'preventive', asset_label: '', priority: 'normal',
    assigned_to: '', description: '', scheduled_date: '',
    estimated_cost: '', schedule_id: scheduleId ?? null,
  });

  const mut = useMutation({
    mutationFn: () => maintenanceApi.createWorkOrder(form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['maintenance'] }); onClose(); },
  });

  const f = (k: keyof typeof form, v: unknown) => setForm(p => ({ ...p, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Nueva Orden de Trabajo</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-medium">Tipo</label>
              <Select value={form.type} onValueChange={v => f('type', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="preventive">Preventivo</SelectItem>
                  <SelectItem value="corrective">Correctivo</SelectItem>
                  <SelectItem value="emergency">Emergencia</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="font-medium">Prioridad</label>
              <Select value={form.priority} onValueChange={v => f('priority', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Baja</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="high">Alta</SelectItem>
                  <SelectItem value="critical">Crítica</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <label className="font-medium">Activo / Equipo *</label>
              <Input value={form.asset_label} onChange={e => f('asset_label', e.target.value)} placeholder="Nombre del activo" />
            </div>
            <div>
              <label className="font-medium">Fecha programada</label>
              <Input type="date" value={form.scheduled_date} onChange={e => f('scheduled_date', e.target.value)} />
            </div>
            <div>
              <label className="font-medium">Costo estimado</label>
              <Input type="number" value={form.estimated_cost} onChange={e => f('estimated_cost', e.target.value)} placeholder="0" />
            </div>
            <div className="col-span-2">
              <label className="font-medium">Responsable</label>
              <Input value={form.assigned_to} onChange={e => f('assigned_to', e.target.value)} placeholder="Técnico" />
            </div>
            <div className="col-span-2">
              <label className="font-medium">Descripción</label>
              <textarea className="w-full border rounded p-2 text-sm" rows={3} value={form.description} onChange={e => f('description', e.target.value)} placeholder="Descripción del trabajo a realizar..." />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => mut.mutate()} disabled={!form.asset_label || mut.isPending}>
            {mut.isPending ? 'Guardando...' : 'Crear OT'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Complete Work Order Dialog ───────────────────────────────────────────────

function CompleteWoDialog({ wo, onClose }: { wo: WorkOrder; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ findings: '', actions_taken: '', actual_cost: '' });

  const mut = useMutation({
    mutationFn: () => maintenanceApi.completeWorkOrder(wo.id, form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['maintenance'] }); onClose(); },
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Completar OT {wo.ref}</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm">
          <div>
            <label className="font-medium">Hallazgos</label>
            <textarea className="w-full border rounded p-2 text-sm" rows={3} value={form.findings} onChange={e => setForm(p => ({ ...p, findings: e.target.value }))} placeholder="Describir lo encontrado..." />
          </div>
          <div>
            <label className="font-medium">Acciones realizadas</label>
            <textarea className="w-full border rounded p-2 text-sm" rows={3} value={form.actions_taken} onChange={e => setForm(p => ({ ...p, actions_taken: e.target.value }))} placeholder="Describir lo realizado..." />
          </div>
          <div>
            <label className="font-medium">Costo real</label>
            <Input type="number" value={form.actual_cost} onChange={e => setForm(p => ({ ...p, actual_cost: e.target.value }))} placeholder="0" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
            <CheckCircle className="w-4 h-4 mr-2" />
            {mut.isPending ? 'Guardando...' : 'Completar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function MaintenancePage() {
  const { slug } = useParams<{ slug: string }>();
  const qc = useQueryClient();
  const [tab, setTab] = useState('schedules');
  const [showCreateSchedule, setShowCreateSchedule] = useState(false);
  const [showCreateWo, setShowCreateWo] = useState(false);
  const [createCorrectiveOpen, setCreateCorrectiveOpen] = useState(false);
  const [completeWo, setCompleteWo] = useState<WorkOrder | null>(null);
  const [woTypeFilter, setWoTypeFilter] = useState('');
  const [woStatusFilter, setWoStatusFilter] = useState('');
  const [woSearch, setWoSearch] = useState('');

  const statsQ = useQuery({ queryKey: ['maintenance', 'stats'], queryFn: () => maintenanceApi.stats() });
  const schedulesQ = useQuery({
    queryKey: ['maintenance', 'schedules'],
    queryFn: () => maintenanceApi.schedules(),
    enabled: tab === 'schedules',
  });
  const woQ = useQuery({
    queryKey: ['maintenance', 'work-orders', woTypeFilter, woStatusFilter],
    queryFn: () => maintenanceApi.workOrders({
      type: woTypeFilter || undefined,
      status: woStatusFilter || undefined,
    }),
    enabled: tab === 'work-orders' || tab === 'corrective',
  });

  const stats = (statsQ.data as unknown as { data: MaintenanceStats })?.data ?? statsQ.data as unknown as MaintenanceStats;
  const schedules: Schedule[] = (schedulesQ.data as unknown as { data: { data: Schedule[] } })?.data?.data ?? [];
  const wos: WorkOrder[] = (woQ.data as unknown as { data: { data: WorkOrder[] } })?.data?.data ?? [];

  const startWoMut = useMutation({
    mutationFn: (id: number) => maintenanceApi.startWorkOrder(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['maintenance'] }),
  });

  const cancelWoMut = useMutation({
    mutationFn: (id: number) => maintenanceApi.cancelWorkOrder(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['maintenance'] }),
  });

  return (
    <AddonGate moduleKey="maintenance" slug={slug}>
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Mantenimiento</h1>
          <p className="text-sm text-muted-foreground">Preventivo, correctivo y emergencias</p>
        </div>
        <div className="flex gap-2">
          <Button variant="destructive" onClick={() => { setCreateCorrectiveOpen(true); }} className="gap-2">
            <Zap className="w-4 h-4" />Reportar Avería
          </Button>
          <Button variant="outline" onClick={() => setShowCreateSchedule(true)}>
            <Calendar className="w-4 h-4 mr-2" />Nuevo Plan
          </Button>
          <Button onClick={() => setShowCreateWo(true)}>
            <Plus className="w-4 h-4 mr-2" />Nueva OT
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {[
          { label: 'Planes activos',    value: stats?.schedules_active ?? '-',   icon: Calendar,      color: 'text-blue-600' },
          { label: 'Vencidos',          value: stats?.overdue ?? '-',             icon: AlertTriangle, color: 'text-red-600' },
          { label: 'Por vencer (30d)',  value: stats?.due_soon ?? '-',            icon: AlertTriangle, color: 'text-orange-500' },
          { label: 'OT abiertas',       value: stats?.open_work_orders ?? '-',    icon: Wrench,        color: 'text-yellow-600' },
          { label: 'OT críticas',       value: stats?.critical_open ?? '-',       icon: AlertTriangle, color: 'text-red-700' },
          { label: 'Completadas/mes',   value: stats?.completed_this_month ?? '-',icon: CheckCircle,   color: 'text-green-600' },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label}>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2">
                <Icon className={`w-4 h-4 ${color}`} />
                <span className="text-sm text-gray-500">{label}</span>
              </div>
              <div className={`text-2xl font-bold mt-1 ${color}`}>{value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex gap-0.5 p-1 rounded-lg bg-muted w-fit">
        {([
          { key: 'schedules', icon: Calendar, label: 'Planes preventivos' },
          { key: 'work-orders', icon: ClipboardList, label: 'Todas las OTs' },
          { key: 'corrective', icon: Zap, label: 'Correctivos' },
        ] as const).map(({ key, icon: Icon, label }) => (
          <button key={key} onClick={() => { setTab(key); setWoTypeFilter(key === 'corrective' ? 'corrective' : ''); setWoStatusFilter(''); setWoSearch(''); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${tab === key ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
            <Icon className="w-3.5 h-3.5" />{label}
          </button>
        ))}
      </div>

      {/* Planes de mantenimiento */}
      {tab === 'schedules' && (
        <div className="space-y-2">
          {schedulesQ.isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Cargando...</div>
          ) : schedules.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 gap-3 text-muted-foreground">
              <div className="size-14 rounded-full bg-muted flex items-center justify-center">
                <Calendar className="size-7 opacity-40" />
              </div>
              <p className="font-medium">Sin planes de mantenimiento</p>
            </div>
          ) : schedules.map(s => (
            <div key={s.id} className="rounded-2xl border bg-card p-4 flex items-center gap-4 hover:shadow-sm hover:border-primary/20 transition-all">
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm">{s.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{s.asset_label} · Cada {s.frequency_value} {s.frequency_type}{s.assigned_to ? ` · ${s.assigned_to}` : ''}</p>
              </div>
              <div className="hidden sm:flex items-center gap-4 text-sm flex-shrink-0">
                <div className="text-center">
                  <p className="text-xs text-muted-foreground">Próximo</p>
                  <p className={`font-medium text-xs ${isOverdue(s.next_due_date) ? 'text-red-600' : isDueSoon(s.next_due_date) ? 'text-orange-500' : ''}`}>
                    {s.next_due_date ?? '—'}
                  </p>
                </div>
              </div>
              <Badge variant={s.active ? 'default' : 'secondary'}>{s.active ? 'Activo' : 'Inactivo'}</Badge>
              <Button size="sm" variant="outline" onClick={() => setShowCreateWo(true)}>
                <Wrench className="w-3 h-3 mr-1" />OT
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Órdenes de trabajo */}
      {(tab === 'work-orders' || tab === 'corrective') && (
        <div className="space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <p className="text-sm font-medium text-muted-foreground">
              {tab === 'corrective' ? 'OTs Correctivas / Emergencias' : 'Órdenes de Trabajo'}
            </p>
            <div className="flex gap-2 flex-wrap">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                <Input className="pl-8 h-8 w-44 text-xs" placeholder="Buscar activo..." value={woSearch} onChange={(e) => setWoSearch(e.target.value)} />
              </div>
              {tab === 'work-orders' && (
                <select className="h-8 rounded-md border px-2 text-xs bg-background"
                  value={woTypeFilter} onChange={(e) => setWoTypeFilter(e.target.value)}>
                  <option value="">Todos los tipos</option>
                  <option value="preventive">Preventivo</option>
                  <option value="corrective">Correctivo</option>
                  <option value="emergency">Emergencia</option>
                </select>
              )}
              <select className="h-8 rounded-md border px-2 text-xs bg-background"
                value={woStatusFilter} onChange={(e) => setWoStatusFilter(e.target.value)}>
                <option value="">Todos los estados</option>
                <option value="open">Abierta</option>
                <option value="in_progress">En progreso</option>
                <option value="completed">Completada</option>
                <option value="cancelled">Cancelada</option>
              </select>
            </div>
          </div>
          {woQ.isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Cargando...</div>
          ) : (
            <div className="space-y-2">
              {wos
                .filter((wo) => !woSearch || (wo.asset_label ?? '').toLowerCase().includes(woSearch.toLowerCase()) || (wo.description ?? '').toLowerCase().includes(woSearch.toLowerCase()))
                .map(wo => (
                  <div key={wo.id} className={`rounded-2xl border bg-card p-4 flex items-center gap-4 hover:shadow-sm transition-all ${wo.priority === 'critical' ? 'border-red-200 bg-red-50/30' : 'hover:border-primary/20'}`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs text-muted-foreground">{wo.ref}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded capitalize font-medium ${
                          wo.type === 'emergency' ? 'bg-red-100 text-red-700' :
                          wo.type === 'corrective' ? 'bg-orange-100 text-orange-700' :
                          'bg-blue-100 text-blue-700'
                        }`}>{wo.type === 'emergency' ? 'Emergencia' : wo.type === 'corrective' ? 'Correctivo' : 'Preventivo'}</span>
                        {priorityBadge(wo.priority)}
                      </div>
                      <p className="font-semibold text-sm mt-1">{wo.asset_label}</p>
                      {wo.description && <p className="text-xs text-muted-foreground mt-0.5 truncate">{wo.description}</p>}
                    </div>
                    <div className="hidden sm:flex items-center gap-4 text-sm flex-shrink-0">
                      <div className="text-center">
                        <p className="text-xs text-muted-foreground">Fecha</p>
                        <p className="text-xs">{wo.scheduled_date ?? '—'}</p>
                      </div>
                    </div>
                    {statusBadge(wo.status)}
                    <div className="flex gap-1 flex-shrink-0">
                      {wo.status === 'open' && (
                        <Button size="sm" variant="outline" onClick={() => startWoMut.mutate(wo.id)}>
                          <Play className="w-3 h-3" />
                        </Button>
                      )}
                      {(wo.status === 'open' || wo.status === 'in_progress') && (
                        <Button size="sm" onClick={() => setCompleteWo(wo)}>
                          <CheckCircle className="w-3 h-3" />
                        </Button>
                      )}
                      {wo.status === 'open' && (
                        <Button size="sm" variant="destructive" onClick={() => cancelWoMut.mutate(wo.id)}>
                          <X className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              {wos.length === 0 && (
                <div className="flex flex-col items-center justify-center py-14 gap-3 text-muted-foreground">
                  <div className="size-14 rounded-full bg-muted flex items-center justify-center">
                    <Wrench className="size-7 opacity-40" />
                  </div>
                  <p className="font-medium">{tab === 'corrective' ? 'Sin OTs correctivas registradas' : 'Sin órdenes de trabajo'}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {showCreateSchedule && <CreateScheduleDialog open onClose={() => setShowCreateSchedule(false)} />}
      {showCreateWo && <CreateWorkOrderDialog open onClose={() => setShowCreateWo(false)} />}
      {completeWo && <CompleteWoDialog wo={completeWo} onClose={() => setCompleteWo(null)} />}

      {/* Reportar Avería — quick corrective/emergency dialog */}
      <QuickCorrectiveDialog
        open={createCorrectiveOpen}
        onClose={() => setCreateCorrectiveOpen(false)}
        onCreated={() => qc.invalidateQueries({ queryKey: ['maintenance'] })}
      />
    </div>
    </AddonGate>
  );
}

// ─── Quick Corrective / Emergency Dialog ──────────────────────────────────────

function QuickCorrectiveDialog({ open, onClose, onCreated }: {
  open: boolean; onClose: () => void; onCreated: () => void;
}) {
  const [assetLabel, setAssetLabel] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('high');
  const [type, setType] = useState('corrective');
  const [assignedTo, setAssignedTo] = useState('');

  const mut = useMutation({
    mutationFn: () => maintenanceApi.createWorkOrder({
      type, asset_label: assetLabel, description, priority,
      assigned_to: assignedTo || undefined,
      scheduled_date: new Date().toISOString().split('T')[0],
    }),
    onSuccess: () => {
      onCreated(); onClose();
      setAssetLabel(''); setDescription(''); setPriority('high'); setType('corrective'); setAssignedTo('');
    },
    onError: () => {},
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <Zap className="size-5" />Reportar Avería
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Tipo de falla</Label>
              <select className="w-full h-9 rounded-md border px-2 text-sm bg-background"
                value={type} onChange={(e) => setType(e.target.value)}>
                <option value="corrective">Correctivo</option>
                <option value="emergency">Emergencia</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Prioridad</Label>
              <select className="w-full h-9 rounded-md border px-2 text-sm bg-background"
                value={priority} onChange={(e) => setPriority(e.target.value)}>
                <option value="normal">Normal</option>
                <option value="high">Alta</option>
                <option value="critical">Crítica</option>
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Activo / equipo afectado *</Label>
            <Input value={assetLabel} onChange={(e) => setAssetLabel(e.target.value)}
              placeholder="Ej. Compresor sala 2, Vehículo ABC123, Caldera..." />
          </div>
          <div className="space-y-1.5">
            <Label>Descripción de la falla *</Label>
            <textarea
              className="w-full rounded-md border px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe la falla o avería observada..."
            />
          </div>
          <div className="space-y-1.5">
            <Label>Asignar a</Label>
            <Input value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}
              placeholder="Técnico o taller responsable" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button variant="destructive" onClick={() => mut.mutate()} disabled={!assetLabel || !description || mut.isPending}>
            {mut.isPending ? 'Reportando...' : 'Reportar avería'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
