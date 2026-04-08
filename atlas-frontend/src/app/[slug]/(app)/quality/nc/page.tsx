'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { qualityNcApi } from '@/lib/api/tenant.api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertTriangle, Plus, CheckCircle, ClipboardList, Shield } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface NcStats {
  open: number;
  overdue: number;
  closed_this_month: number;
  critical: number;
  major: number;
  pending_actions: number;
}

interface NC {
  id: number;
  ref: string;
  title: string;
  standard: string;
  type: string;
  severity: string;
  area: string | null;
  status: string;
  detected_at: string;
  due_date: string | null;
}

interface IsoAudit {
  id: number;
  ref: string;
  standard: string;
  type: string;
  status: string;
  lead_auditor: string | null;
  planned_start: string;
  nc_major_count: number;
  nc_minor_count: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const SEVERITY_COLORS: Record<string, string> = {
  minor: 'bg-yellow-100 text-yellow-700',
  major: 'bg-orange-100 text-orange-700',
  critical: 'bg-red-100 text-red-700',
};

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-blue-100 text-blue-700',
  in_review: 'bg-purple-100 text-purple-700',
  corrective_in_progress: 'bg-yellow-100 text-yellow-700',
  closed: 'bg-green-100 text-green-700',
  cancelled: 'bg-gray-100 text-gray-500',
};

const STATUS_LABELS: Record<string, string> = {
  open: 'Abierta', in_review: 'En revisión',
  corrective_in_progress: 'Acción correctiva', closed: 'Cerrada', cancelled: 'Cancelada',
};

// ─── Create NC Dialog ─────────────────────────────────────────────────────────

function CreateNcDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    title: '', description: '', standard: 'ISO_9001', type: 'nonconformance',
    severity: 'minor', source: 'internal', area: '', process: '',
    detected_at: new Date().toISOString().slice(0, 10),
    immediate_action: '', due_date: '',
  });

  const mut = useMutation({
    mutationFn: () => qualityNcApi.create(form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['quality-nc'] }); onClose(); },
  });

  const f = (k: keyof typeof form, v: string) => setForm(p => ({ ...p, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Nueva No Conformidad</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="font-medium">Norma</label>
              <Select value={form.standard} onValueChange={v => f('standard', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ISO_9001">ISO 9001</SelectItem>
                  <SelectItem value="ISO_14001">ISO 14001</SelectItem>
                  <SelectItem value="ISO_45001">ISO 45001</SelectItem>
                  <SelectItem value="INTERNAL">Interna</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="font-medium">Tipo</label>
              <Select value={form.type} onValueChange={v => f('type', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="nonconformance">No conformidad</SelectItem>
                  <SelectItem value="observation">Observación</SelectItem>
                  <SelectItem value="opportunity">Oportunidad de mejora</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="font-medium">Severidad</label>
              <Select value={form.severity} onValueChange={v => f('severity', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="minor">Menor</SelectItem>
                  <SelectItem value="major">Mayor</SelectItem>
                  <SelectItem value="critical">Crítica</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <label className="font-medium">Título *</label>
            <Input value={form.title} onChange={e => f('title', e.target.value)} placeholder="Descripción breve de la no conformidad" />
          </div>
          <div>
            <label className="font-medium">Descripción detallada *</label>
            <textarea className="w-full border rounded p-2 text-sm" rows={4} value={form.description} onChange={e => f('description', e.target.value)} placeholder="Describe en detalle la no conformidad encontrada..." />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-medium">Fuente</label>
              <Select value={form.source} onValueChange={v => f('source', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="audit">Auditoría</SelectItem>
                  <SelectItem value="customer_complaint">Queja cliente</SelectItem>
                  <SelectItem value="internal">Interna</SelectItem>
                  <SelectItem value="inspection">Inspección</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="font-medium">Área/Proceso</label>
              <Input value={form.area} onChange={e => f('area', e.target.value)} placeholder="Área afectada" />
            </div>
            <div>
              <label className="font-medium">Fecha detección</label>
              <Input type="date" value={form.detected_at} onChange={e => f('detected_at', e.target.value)} />
            </div>
            <div>
              <label className="font-medium">Fecha límite</label>
              <Input type="date" value={form.due_date} onChange={e => f('due_date', e.target.value)} />
            </div>
          </div>
          <div>
            <label className="font-medium">Acción inmediata tomada</label>
            <textarea className="w-full border rounded p-2 text-sm" rows={2} value={form.immediate_action} onChange={e => f('immediate_action', e.target.value)} placeholder="Describir acciones inmediatas de contención..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => mut.mutate()} disabled={!form.title || !form.description || mut.isPending}>
            {mut.isPending ? 'Guardando...' : 'Registrar NC'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Close NC Dialog ──────────────────────────────────────────────────────────

function CloseNcDialog({ nc, onClose }: { nc: NC; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ root_cause: '', closure_evidence: '' });

  const mut = useMutation({
    mutationFn: () => qualityNcApi.close(nc.id, form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['quality-nc'] }); onClose(); },
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Cerrar NC {nc.ref}</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm">
          <div>
            <label className="font-medium">Causa raíz *</label>
            <textarea className="w-full border rounded p-2 text-sm" rows={3} value={form.root_cause} onChange={e => setForm(p => ({ ...p, root_cause: e.target.value }))} placeholder="Causa raíz identificada..." />
          </div>
          <div>
            <label className="font-medium">Evidencia de cierre *</label>
            <textarea className="w-full border rounded p-2 text-sm" rows={3} value={form.closure_evidence} onChange={e => setForm(p => ({ ...p, closure_evidence: e.target.value }))} placeholder="Evidencia que demuestra la solución..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => mut.mutate()} disabled={!form.root_cause || !form.closure_evidence || mut.isPending}>
            <CheckCircle className="w-4 h-4 mr-2" />
            {mut.isPending ? 'Cerrando...' : 'Cerrar NC'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Create Audit Dialog ──────────────────────────────────────────────────────

function CreateAuditDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    standard: 'ISO_9001', type: 'internal',
    lead_auditor: '', planned_start: '', planned_end: '', scope: '',
  });

  const mut = useMutation({
    mutationFn: () => qualityNcApi.createAudit(form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['quality-audits'] }); onClose(); },
  });

  const f = (k: keyof typeof form, v: string) => setForm(p => ({ ...p, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Nueva Auditoría ISO</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <label className="font-medium">Norma</label>
            <Select value={form.standard} onValueChange={v => f('standard', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ISO_9001">ISO 9001</SelectItem>
                <SelectItem value="ISO_14001">ISO 14001</SelectItem>
                <SelectItem value="ISO_45001">ISO 45001</SelectItem>
                <SelectItem value="INTERNAL">Interna</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="font-medium">Tipo</label>
            <Select value={form.type} onValueChange={v => f('type', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="internal">Interna</SelectItem>
                <SelectItem value="external">Externa</SelectItem>
                <SelectItem value="surveillance">Vigilancia</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2">
            <label className="font-medium">Auditor líder</label>
            <Input value={form.lead_auditor} onChange={e => f('lead_auditor', e.target.value)} placeholder="Nombre del auditor" />
          </div>
          <div>
            <label className="font-medium">Inicio planificado *</label>
            <Input type="date" value={form.planned_start} onChange={e => f('planned_start', e.target.value)} />
          </div>
          <div>
            <label className="font-medium">Fin planificado</label>
            <Input type="date" value={form.planned_end} onChange={e => f('planned_end', e.target.value)} />
          </div>
          <div className="col-span-2">
            <label className="font-medium">Alcance</label>
            <textarea className="w-full border rounded p-2 text-sm" rows={2} value={form.scope} onChange={e => f('scope', e.target.value)} placeholder="Procesos y áreas en alcance..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => mut.mutate()} disabled={!form.planned_start || mut.isPending}>
            {mut.isPending ? 'Guardando...' : 'Programar auditoría'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function QualityNcPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState('nc');
  const [showCreate, setShowCreate] = useState(false);
  const [showCreateAudit, setShowCreateAudit] = useState(false);
  const [closeNc, setCloseNc] = useState<NC | null>(null);

  const statsQ = useQuery({ queryKey: ['quality-nc', 'stats'], queryFn: () => qualityNcApi.stats() });
  const ncQ    = useQuery({ queryKey: ['quality-nc'], queryFn: () => qualityNcApi.list(), enabled: tab === 'nc' });
  const auditQ = useQuery({ queryKey: ['quality-audits'], queryFn: () => qualityNcApi.audits(), enabled: tab === 'audits' });

  const stats: NcStats = (statsQ.data as unknown as { data: NcStats })?.data ?? {} as NcStats;
  const ncs: NC[] = (ncQ.data as unknown as { data: { data: NC[] } })?.data?.data ?? [];
  const audits: IsoAudit[] = (auditQ.data as unknown as { data: { data: IsoAudit[] } })?.data?.data ?? [];

  const startAuditMut = useMutation({
    mutationFn: (id: number) => qualityNcApi.startAudit(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['quality-audits'] }),
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">ISO / Calidad — No Conformidades</h1>
          <p className="text-sm text-gray-500">CAPA (Corrective and Preventive Actions)</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowCreateAudit(true)}>
            <ClipboardList className="w-4 h-4 mr-2" />Nueva Auditoría
          </Button>
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="w-4 h-4 mr-2" />Nueva NC
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {[
          { label: 'Abiertas',          value: stats.open,                color: 'text-blue-600' },
          { label: 'Vencidas',          value: stats.overdue,             color: 'text-red-600' },
          { label: 'Críticas',          value: stats.critical,            color: 'text-red-700' },
          { label: 'Mayores',           value: stats.major,               color: 'text-orange-600' },
          { label: 'Acciones pend.',    value: stats.pending_actions,     color: 'text-yellow-600' },
          { label: 'Cerradas/mes',      value: stats.closed_this_month,   color: 'text-green-600' },
        ].map(({ label, value, color }) => (
          <Card key={label}>
            <CardContent className="pt-4 pb-3">
              <div className="text-sm text-gray-500">{label}</div>
              <div className={`text-2xl font-bold mt-1 ${color}`}>{value ?? '-'}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="nc"><AlertTriangle className="w-4 h-4 mr-2" />No Conformidades</TabsTrigger>
          <TabsTrigger value="audits"><Shield className="w-4 h-4 mr-2" />Auditorías</TabsTrigger>
        </TabsList>

        {/* NCs */}
        <TabsContent value="nc">
          <Card>
            <CardContent className="pt-4">
              {ncQ.isLoading ? (
                <div className="text-center py-8 text-gray-400">Cargando...</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-gray-500">
                      <th className="pb-2">Ref</th>
                      <th>Título</th>
                      <th>Norma</th>
                      <th>Severidad</th>
                      <th>Área</th>
                      <th>Detección</th>
                      <th>Límite</th>
                      <th>Estado</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {ncs.map(nc => (
                      <tr key={nc.id} className="border-b hover:bg-gray-50">
                        <td className="py-2 font-mono text-xs">{nc.ref}</td>
                        <td className="font-medium max-w-xs truncate">{nc.title}</td>
                        <td className="text-xs text-gray-600">{nc.standard}</td>
                        <td>
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${SEVERITY_COLORS[nc.severity] ?? ''}`}>
                            {nc.severity}
                          </span>
                        </td>
                        <td className="text-gray-600 text-xs">{nc.area ?? '—'}</td>
                        <td className="text-xs">{nc.detected_at}</td>
                        <td className={`text-xs ${nc.due_date && new Date(nc.due_date) < new Date() && nc.status !== 'closed' ? 'text-red-600 font-medium' : ''}`}>
                          {nc.due_date ?? '—'}
                        </td>
                        <td>
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[nc.status] ?? ''}`}>
                            {STATUS_LABELS[nc.status] ?? nc.status}
                          </span>
                        </td>
                        <td>
                          {nc.status !== 'closed' && nc.status !== 'cancelled' && (
                            <Button size="sm" variant="outline" onClick={() => setCloseNc(nc)}>
                              <CheckCircle className="w-3 h-3 mr-1" />Cerrar
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {ncs.length === 0 && (
                      <tr><td colSpan={9} className="text-center py-8 text-gray-400">Sin no conformidades registradas</td></tr>
                    )}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Auditorías */}
        <TabsContent value="audits">
          <Card>
            <CardContent className="pt-4">
              {auditQ.isLoading ? (
                <div className="text-center py-8 text-gray-400">Cargando...</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-gray-500">
                      <th className="pb-2">Ref</th>
                      <th>Norma</th>
                      <th>Tipo</th>
                      <th>Auditor líder</th>
                      <th>Inicio</th>
                      <th>NC Mayor</th>
                      <th>NC Menor</th>
                      <th>Estado</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {audits.map(a => (
                      <tr key={a.id} className="border-b hover:bg-gray-50">
                        <td className="py-2 font-mono text-xs">{a.ref}</td>
                        <td className="text-xs">{a.standard}</td>
                        <td className="capitalize text-xs">{a.type}</td>
                        <td>{a.lead_auditor ?? '—'}</td>
                        <td>{a.planned_start}</td>
                        <td className={a.nc_major_count > 0 ? 'text-orange-600 font-bold' : ''}>{a.nc_major_count}</td>
                        <td className={a.nc_minor_count > 0 ? 'text-yellow-600 font-bold' : ''}>{a.nc_minor_count}</td>
                        <td>
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[a.status] ?? 'bg-gray-100 text-gray-500'}`}>
                            {STATUS_LABELS[a.status] ?? a.status}
                          </span>
                        </td>
                        <td>
                          {a.status === 'planned' && (
                            <Button size="sm" variant="outline" onClick={() => startAuditMut.mutate(a.id)}>
                              Iniciar
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {audits.length === 0 && (
                      <tr><td colSpan={9} className="text-center py-8 text-gray-400">Sin auditorías programadas</td></tr>
                    )}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {showCreate && <CreateNcDialog open onClose={() => setShowCreate(false)} />}
      {showCreateAudit && <CreateAuditDialog open onClose={() => setShowCreateAudit(false)} />}
      {closeNc && <CloseNcDialog nc={closeNc} onClose={() => setCloseNc(null)} />}
    </div>
  );
}
