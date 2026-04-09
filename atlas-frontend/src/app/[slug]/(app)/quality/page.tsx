'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notify } from '@/lib/notify';
import { qualityApi } from '@/lib/api/tenant.api';
import { AddonGate } from '@/components/shared/AddonPaywall';
import {
  ClipboardCheck, AlertTriangle, ListChecks, Wrench,
  Plus, Eye, CheckCircle, XCircle, Trash2,
  AlertCircle, ChevronRight,
} from 'lucide-react';

import { Button }    from '@/components/ui/button';
import { Badge }     from '@/components/ui/badge';
import { Input }     from '@/components/ui/input';
import { Label }     from '@/components/ui/label';
import { Textarea }  from '@/components/ui/textarea';
import { Skeleton }  from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Progress }  from '@/components/ui/progress';
import {
  Card, CardContent, CardHeader, CardTitle,
} from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import {
} from '@/components/ui/tabs';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Checkpoint {
  id?: number;
  name: string;
  method: string;
  acceptance_criteria: string;
}

interface QcPlan {
  id: number;
  name: string;
  description: string | null;
  type: string;
  status: 'active' | 'inactive';
  checkpoints_count?: number;
  checkpoints?: Checkpoint[];
}

interface InspectionResult {
  id: number;
  checkpoint_name: string;
  passed: boolean | null;
  measured_value: string | null;
  notes: string | null;
}

interface QcInspection {
  id: number;
  qc_plan_id: number;
  status: 'pending' | 'in_progress' | 'passed' | 'failed';
  result: string | null;
  defect_rate: number | null;
  summary: string | null;
  created_at: string;
  plan?: { id: number; name: string } | null;
  results?: InspectionResult[];
}

interface CapaAction {
  id: number;
  type: string;
  description: string;
  status: 'planned' | 'in_progress' | 'completed' | 'verified';
  due_date: string | null;
  completed_at: string | null;
}

interface Nonconformity {
  id: number;
  nc_number: string;
  title: string;
  description: string;
  severity: 'minor' | 'major' | 'critical';
  status: 'open' | 'in_progress' | 'closed' | 'cancelled';
  root_cause: string | null;
  due_date: string | null;
  capa_actions_count?: number;
  capa_actions?: CapaAction[];
  created_at: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d: string) { return new Date(d).toLocaleDateString('es-CO'); }

const SEV_COLORS: Record<Nonconformity['severity'], 'secondary' | 'default' | 'destructive'> = {
  minor: 'secondary', major: 'default', critical: 'destructive',
};
const NC_STATUS_COLORS: Record<Nonconformity['status'], 'secondary' | 'default' | 'destructive' | 'outline'> = {
  open: 'default', in_progress: 'secondary', closed: 'outline', cancelled: 'destructive',
};
const INS_STATUS_COLORS: Record<QcInspection['status'], 'secondary' | 'default' | 'destructive' | 'outline'> = {
  pending: 'secondary', in_progress: 'default', passed: 'outline', failed: 'destructive',
};

// ══════════════════════════════════════════════════════════════════════════════
// PLANS TAB
// ══════════════════════════════════════════════════════════════════════════════

function PlansTab({ slug }: { slug: string }) {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId]     = useState<number | null>(null);

  // Create form
  const [name, setName]   = useState('');
  const [desc, setDesc]   = useState('');
  const [type, setType]   = useState('product');
  const [cps, setCps]     = useState<Checkpoint[]>([{ name: '', method: '', acceptance_criteria: '' }]);

  const plansQ = useQuery({ queryKey: [slug, 'qc-plans'], queryFn: () => qualityApi.plans() });
  const detailQ = useQuery({
    queryKey: [slug, 'qc-plan-detail', detailId],
    queryFn: () => qualityApi.getPlan(detailId!),
    enabled: detailId !== null,
  });

  const plans: QcPlan[] = (plansQ.data as { data?: QcPlan[] })?.data ?? [];
  const planDetail = detailQ.data as QcPlan | undefined;

  function inv() { qc.invalidateQueries({ queryKey: [slug, 'qc-plans'] }); }

  const createMut = useMutation({
    mutationFn: (d: unknown) => qualityApi.createPlan(d),
    onSuccess: () => { notify.success('Plan creado.'); inv(); setCreateOpen(false); setName(''); setDesc(''); setCps([{ name: '', method: '', acceptance_criteria: '' }]); },
    onError: (e: unknown) => notify.error((e as { message?: string }).message ?? 'Error'),
  });
  const deleteMut = useMutation({
    mutationFn: (id: number) => qualityApi.deletePlan(id),
    onSuccess: () => { notify.success('Eliminado.'); inv(); },
    onError: (e: unknown) => notify.error((e as { message?: string }).message ?? 'Error'),
  });

  function updateCp(idx: number, field: keyof Checkpoint, val: string) {
    setCps((prev) => prev.map((cp, i) => i === idx ? { ...cp, [field]: val } : cp));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{plans.length} plan(es) de calidad</p>
        <Button onClick={() => setCreateOpen(true)}><Plus className="mr-2 size-4" />Nuevo Plan</Button>
      </div>

      {plansQ.isPending ? <Skeleton className="h-40 w-full" /> : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {plans.map((p) => (
            <Card key={p.id} className="cursor-pointer hover:shadow-sm transition-shadow" onClick={() => setDetailId(p.id)}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <CardTitle className="text-sm">{p.name}</CardTitle>
                  <Badge variant={p.status === 'active' ? 'outline' : 'secondary'}>{p.status}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">{p.type}</p>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{p.checkpoints_count ?? 0} punto(s) de control</p>
                <div className="flex justify-end mt-2" onClick={(e) => e.stopPropagation()}>
                  <Button size="icon" variant="ghost" className="size-7 text-destructive"
                    onClick={() => { if (confirm('¿Eliminar plan?')) deleteMut.mutate(p.id); }}>
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
          {plans.length === 0 && (
            <div className="col-span-3 py-14 text-center text-muted-foreground">
              <ClipboardCheck className="mx-auto size-10 mb-3 opacity-30" /><p>No hay planes</p>
            </div>
          )}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col">
          <DialogHeader><DialogTitle>Nuevo Plan de Calidad</DialogTitle></DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-3 pr-1">
            <div className="space-y-1.5"><Label>Nombre <span className="text-destructive">*</span></Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Tipo</Label>
              <Select value={type} onValueChange={(v) => setType(v ?? 'product')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="product">Producto</SelectItem>
                  <SelectItem value="process">Proceso</SelectItem>
                  <SelectItem value="supplier">Proveedor</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Descripción</Label>
              <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} /></div>
            <Separator />
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Puntos de control</Label>
                <Button size="sm" variant="outline" onClick={() => setCps((p) => [...p, { name: '', method: '', acceptance_criteria: '' }])}>
                  <Plus className="size-3 mr-1" />Añadir
                </Button>
              </div>
              {cps.map((cp, idx) => (
                <div key={idx} className="rounded border p-3 mb-2 space-y-2">
                  <div className="flex items-start gap-2">
                    <Input placeholder="Nombre del checkpoint" value={cp.name} onChange={(e) => updateCp(idx, 'name', e.target.value)} className="h-8 text-sm flex-1" />
                    {cps.length > 1 && (
                      <button type="button" onClick={() => setCps((p) => p.filter((_, i) => i !== idx))} className="text-destructive mt-1"><Trash2 className="size-3.5" /></button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Input placeholder="Método" value={cp.method} onChange={(e) => updateCp(idx, 'method', e.target.value)} className="h-7 text-xs" />
                    <Input placeholder="Criterio de aceptación" value={cp.acceptance_criteria} onChange={(e) => updateCp(idx, 'acceptance_criteria', e.target.value)} className="h-7 text-xs" />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button onClick={() => createMut.mutate({ name, description: desc || undefined, type, checkpoints: cps.filter((c) => c.name) })}
              disabled={createMut.isPending || !name.trim()}>
              {createMut.isPending ? 'Creando…' : 'Crear Plan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={detailId !== null} onOpenChange={(v) => { if (!v) setDetailId(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>{planDetail?.name ?? 'Cargando…'}</DialogTitle></DialogHeader>
          {planDetail && (
            <div className="space-y-3">
              <div className="flex gap-2">
                <Badge variant="outline">{planDetail.type}</Badge>
                <Badge variant={planDetail.status === 'active' ? 'default' : 'secondary'}>{planDetail.status}</Badge>
              </div>
              {planDetail.description && <p className="text-sm text-muted-foreground">{planDetail.description}</p>}
              <Separator />
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Puntos de control</p>
              {(planDetail.checkpoints ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin puntos de control.</p>
              ) : (
                <div className="space-y-2">
                  {(planDetail.checkpoints ?? []).map((cp, idx) => (
                    <div key={idx} className="rounded border p-3">
                      <p className="text-sm font-medium">{cp.name}</p>
                      {cp.method && <p className="text-xs text-muted-foreground">Método: {cp.method}</p>}
                      {cp.acceptance_criteria && <p className="text-xs text-muted-foreground">Criterio: {cp.acceptance_criteria}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          <DialogFooter><Button variant="outline" onClick={() => setDetailId(null)}>Cerrar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// INSPECTIONS TAB
// ══════════════════════════════════════════════════════════════════════════════

function InspectionsTab({ slug }: { slug: string }) {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId]     = useState<number | null>(null);
  const [planId, setPlanId]         = useState('');
  const [completeOpen, setCompleteOpen] = useState(false);
  const [completeResult, setCompleteResult] = useState('passed');
  const [completeSummary, setCompleteSummary] = useState('');

  const plansQ = useQuery({ queryKey: [slug, 'qc-plans-mini'], queryFn: () => qualityApi.plans({ status: 'active' }) });
  const inspsQ = useQuery({ queryKey: [slug, 'qc-inspections'], queryFn: () => qualityApi.inspections() });
  const detailQ = useQuery({
    queryKey: [slug, 'qc-inspection-detail', detailId],
    queryFn: () => qualityApi.getInspection(detailId!),
    enabled: detailId !== null,
  });

  const inspections: QcInspection[] = (inspsQ.data as { data?: QcInspection[] })?.data ?? [];
  const plans: QcPlan[] = (plansQ.data as { data?: QcPlan[] })?.data ?? [];
  const detail = detailQ.data as QcInspection | undefined;

  function inv() { qc.invalidateQueries({ queryKey: [slug, 'qc-inspections'] }); }
  function invDetail() { qc.invalidateQueries({ queryKey: [slug, 'qc-inspection-detail', detailId] }); }

  const createMut = useMutation({
    mutationFn: (d: unknown) => qualityApi.createInspection(d),
    onSuccess: () => { notify.success('Inspección creada.'); inv(); setCreateOpen(false); setPlanId(''); },
    onError: (e: unknown) => notify.error((e as { message?: string }).message ?? 'Error'),
  });
  const resultMut = useMutation({
    mutationFn: ({ id, results }: { id: number; results: Array<{ id: number; passed?: boolean }> }) =>
      qualityApi.updateResults(id, { results }),
    onSuccess: () => { invDetail(); },
    onError: (e: unknown) => notify.error((e as { message?: string }).message ?? 'Error'),
  });
  const completeMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: { result: string; summary?: string } }) =>
      qualityApi.completeInspection(id, data),
    onSuccess: () => { notify.success('Inspección completada.'); inv(); invDetail(); setCompleteOpen(false); setDetailId(null); },
    onError: (e: unknown) => notify.error((e as { message?: string }).message ?? 'Error'),
  });

  function toggleResult(resultId: number, passed: boolean) {
    if (!detailId) return;
    resultMut.mutate({ id: detailId, results: [{ id: resultId, passed }] });
  }

  const passedCount = detail?.results?.filter((r) => r.passed === true).length ?? 0;
  const totalCount  = detail?.results?.length ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{inspections.length} inspección(es)</p>
        <Button onClick={() => setCreateOpen(true)}><Plus className="mr-2 size-4" />Nueva Inspección</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {inspsQ.isPending ? <div className="p-4"><Skeleton className="h-40 w-full" /></div> :
          inspections.length === 0 ? (
            <div className="py-14 text-center text-muted-foreground"><ListChecks className="mx-auto size-10 mb-3 opacity-30" /><p>Sin inspecciones</p></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Plan</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Resultado</TableHead>
                  <TableHead>Tasa defectos</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {inspections.map((ins) => (
                  <TableRow key={ins.id} className="cursor-pointer hover:bg-muted/40" onClick={() => setDetailId(ins.id)}>
                    <TableCell className="text-sm font-medium">{ins.plan?.name ?? `Plan #${ins.qc_plan_id}`}</TableCell>
                    <TableCell><Badge variant={INS_STATUS_COLORS[ins.status]}>{ins.status}</Badge></TableCell>
                    <TableCell>{ins.result ? <Badge variant={ins.result === 'passed' ? 'outline' : 'destructive'}>{ins.result}</Badge> : '—'}</TableCell>
                    <TableCell>{ins.defect_rate !== null ? `${ins.defect_rate}%` : '—'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{fmtDate(ins.created_at)}</TableCell>
                    <TableCell><Button size="icon" variant="ghost" className="size-7" onClick={() => setDetailId(ins.id)}><Eye className="size-3.5" /></Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Nueva Inspección</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Plan de calidad <span className="text-destructive">*</span></Label>
              <Select value={planId} onValueChange={(v) => setPlanId(v ?? '')}>
                <SelectTrigger><SelectValue placeholder="Seleccionar plan…" /></SelectTrigger>
                <SelectContent>{plans.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button onClick={() => createMut.mutate({ qc_plan_id: parseInt(planId) })} disabled={createMut.isPending || !planId}>
              {createMut.isPending ? 'Creando…' : 'Iniciar Inspección'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail / Execute Dialog */}
      <Dialog open={detailId !== null} onOpenChange={(v) => { if (!v) { setDetailId(null); setCompleteOpen(false); } }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Inspección #{detail?.id} — {detail?.plan?.name ?? '…'}</DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="flex-1 overflow-y-auto space-y-4 pr-1">
              <div className="flex items-center gap-3">
                <Badge variant={INS_STATUS_COLORS[detail.status]}>{detail.status}</Badge>
                {totalCount > 0 && (
                  <div className="flex-1">
                    <Progress value={(passedCount / totalCount) * 100} className="h-2" />
                    <p className="text-xs text-muted-foreground mt-0.5">{passedCount}/{totalCount} aprobados</p>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                {(detail.results ?? []).map((r) => (
                  <div key={r.id} className="flex items-center gap-3 rounded border p-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{r.checkpoint_name}</p>
                      {r.measured_value && <p className="text-xs text-muted-foreground">{r.measured_value}</p>}
                    </div>
                    {['pending', 'in_progress'].includes(detail.status) ? (
                      <div className="flex gap-1">
                        <Button size="sm" variant={r.passed === true ? 'default' : 'outline'}
                          className={r.passed === true ? 'bg-green-600 hover:bg-green-700' : ''}
                          onClick={() => toggleResult(r.id, true)}>
                          <CheckCircle className="size-3.5 mr-1" />Pasa
                        </Button>
                        <Button size="sm" variant={r.passed === false ? 'destructive' : 'outline'}
                          onClick={() => toggleResult(r.id, false)}>
                          <XCircle className="size-3.5 mr-1" />Falla
                        </Button>
                      </div>
                    ) : (
                      r.passed === null ? <span className="text-xs text-muted-foreground">N/A</span> :
                      r.passed ? <CheckCircle className="size-5 text-green-600" /> : <XCircle className="size-5 text-red-600" />
                    )}
                  </div>
                ))}
              </div>

              {!completeOpen && ['pending', 'in_progress'].includes(detail.status) && (
                <Button onClick={() => setCompleteOpen(true)}>Completar inspección</Button>
              )}

              {completeOpen && (
                <div className="rounded border p-4 space-y-3 bg-muted/30">
                  <p className="text-sm font-medium">Resultado final</p>
                  <Select value={completeResult} onValueChange={(v) => setCompleteResult(v ?? 'passed')}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="passed">Aprobada</SelectItem>
                      <SelectItem value="failed">Rechazada</SelectItem>
                      <SelectItem value="conditional">Condicional</SelectItem>
                    </SelectContent>
                  </Select>
                  <Textarea placeholder="Resumen / observaciones…" value={completeSummary} onChange={(e) => setCompleteSummary(e.target.value)} rows={2} />
                  <div className="flex gap-2">
                    <Button onClick={() => completeMut.mutate({ id: detail.id, data: { result: completeResult, summary: completeSummary || undefined } })}
                      disabled={completeMut.isPending}>
                      {completeMut.isPending ? 'Guardando…' : 'Confirmar'}
                    </Button>
                    <Button variant="outline" onClick={() => setCompleteOpen(false)}>Cancelar</Button>
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter><Button variant="outline" onClick={() => setDetailId(null)}>Cerrar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// NONCONFORMITIES TAB
// ══════════════════════════════════════════════════════════════════════════════

function NonconformitiesTab({ slug }: { slug: string }) {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId]     = useState<number | null>(null);

  // Create form
  const [title, setTitle]         = useState('');
  const [description, setDesc]    = useState('');
  const [severity, setSeverity]   = useState('minor');

  // CAPA form
  const [capaDesc, setCapaDesc]   = useState('');
  const [capaType, setCapaType]   = useState('corrective');
  const [capaDue, setCapaDue]     = useState('');

  const ncsQ = useQuery({ queryKey: [slug, 'qc-ncs'], queryFn: () => qualityApi.nonconformities() });
  const detailQ = useQuery({
    queryKey: [slug, 'qc-nc-detail', detailId],
    queryFn: () => qualityApi.getNonconformity(detailId!),
    enabled: detailId !== null,
  });

  const ncs: Nonconformity[] = (ncsQ.data as { data?: Nonconformity[] })?.data ?? [];
  const detail = detailQ.data as Nonconformity | undefined;

  function inv() { qc.invalidateQueries({ queryKey: [slug, 'qc-ncs'] }); }
  function invDetail() { qc.invalidateQueries({ queryKey: [slug, 'qc-nc-detail', detailId] }); }

  const createMut = useMutation({
    mutationFn: (d: unknown) => qualityApi.createNonconformity(d),
    onSuccess: () => { notify.success('NC creada.'); inv(); setCreateOpen(false); setTitle(''); setDesc(''); },
    onError: (e: unknown) => notify.error((e as { message?: string }).message ?? 'Error'),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: unknown }) => qualityApi.updateNonconformity(id, data),
    onSuccess: () => { invDetail(); },
    onError: (e: unknown) => notify.error((e as { message?: string }).message ?? 'Error'),
  });
  const closeMut = useMutation({
    mutationFn: (id: number) => qualityApi.closeNonconformity(id),
    onSuccess: () => { notify.success('NC cerrada.'); inv(); invDetail(); },
    onError: (e: unknown) => notify.error((e as { message?: string }).message ?? 'Error'),
  });
  const capaMut = useMutation({
    mutationFn: ({ ncId, data }: { ncId: number; data: unknown }) => qualityApi.addCapa(ncId, data),
    onSuccess: () => { notify.success('Acción CAPA añadida.'); invDetail(); setCapaDesc(''); },
    onError: (e: unknown) => notify.error((e as { message?: string }).message ?? 'Error'),
  });
  const updateCapaMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: unknown }) => qualityApi.updateCapa(id, data),
    onSuccess: () => { invDetail(); },
    onError: (e: unknown) => notify.error((e as { message?: string }).message ?? 'Error'),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{ncs.length} no conformidad(es)</p>
        <Button onClick={() => setCreateOpen(true)}><Plus className="mr-2 size-4" />Nueva NC</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {ncsQ.isPending ? <div className="p-4"><Skeleton className="h-40 w-full" /></div> :
          ncs.length === 0 ? (
            <div className="py-14 text-center text-muted-foreground"><CheckCircle className="mx-auto size-10 mb-3 opacity-30 text-green-600" /><p>Sin no conformidades registradas</p></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>N°</TableHead>
                  <TableHead>Título</TableHead>
                  <TableHead>Severidad</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>CAPA</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {ncs.map((nc) => (
                  <TableRow key={nc.id} className="cursor-pointer hover:bg-muted/40" onClick={() => setDetailId(nc.id)}>
                    <TableCell className="font-mono text-xs">{nc.nc_number}</TableCell>
                    <TableCell className="font-medium text-sm">{nc.title}</TableCell>
                    <TableCell><Badge variant={SEV_COLORS[nc.severity]}>{nc.severity}</Badge></TableCell>
                    <TableCell><Badge variant={NC_STATUS_COLORS[nc.status]}>{nc.status}</Badge></TableCell>
                    <TableCell className="text-center">{nc.capa_actions_count ?? 0}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{fmtDate(nc.created_at)}</TableCell>
                    <TableCell><Button size="icon" variant="ghost" className="size-7" onClick={() => setDetailId(nc.id)}><Eye className="size-3.5" /></Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Nueva No Conformidad</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Título <span className="text-destructive">*</span></Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Severidad</Label>
              <Select value={severity} onValueChange={(v) => setSeverity(v ?? 'minor')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="minor">Menor</SelectItem>
                  <SelectItem value="major">Mayor</SelectItem>
                  <SelectItem value="critical">Crítica</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Descripción <span className="text-destructive">*</span></Label>
              <Textarea value={description} onChange={(e) => setDesc(e.target.value)} rows={3} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button onClick={() => createMut.mutate({ title, description, severity })}
              disabled={createMut.isPending || !title.trim() || !description.trim()}>
              {createMut.isPending ? 'Creando…' : 'Crear NC'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={detailId !== null} onOpenChange={(v) => { if (!v) setDetailId(null); }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{detail ? `${detail.nc_number} — ${detail.title}` : 'Cargando…'}</DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="flex-1 overflow-y-auto space-y-4 pr-1">
              <div className="flex flex-wrap gap-2 items-center">
                <Badge variant={SEV_COLORS[detail.severity]}>{detail.severity}</Badge>
                <Badge variant={NC_STATUS_COLORS[detail.status]}>{detail.status}</Badge>
                <div className="ml-auto">
                  <Select value={detail.status} onValueChange={(v) => v && updateMut.mutate({ id: detail.id, data: { status: v } })}>
                    <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(['open','in_progress','closed','cancelled'] as const).map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <p className="text-sm">{detail.description}</p>

              {detail.root_cause && (
                <div className="rounded border-l-4 border-orange-400 pl-3 py-1">
                  <p className="text-xs font-medium text-muted-foreground">Causa raíz</p>
                  <p className="text-sm">{detail.root_cause}</p>
                </div>
              )}

              <Separator />

              {/* CAPA Actions */}
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Acciones CAPA</p>
                {(detail.capa_actions ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sin acciones CAPA.</p>
                ) : (
                  <div className="space-y-2">
                    {(detail.capa_actions ?? []).map((a) => (
                      <div key={a.id} className="flex items-start gap-3 rounded border p-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium capitalize">{a.type}: {a.description}</p>
                          {a.due_date && <p className="text-xs text-muted-foreground">Vence: {fmtDate(a.due_date)}</p>}
                        </div>
                        <Select value={a.status} onValueChange={(v) => v && updateCapaMut.mutate({ id: a.id, data: { status: v } })}>
                          <SelectTrigger className="h-7 w-28 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {['planned','in_progress','completed','verified'].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                )}

                {detail.status !== 'closed' && (
                  <div className="mt-3 space-y-2 rounded border p-3 bg-muted/20">
                    <p className="text-xs font-medium">Agregar acción CAPA</p>
                    <div className="flex gap-2">
                      <Select value={capaType} onValueChange={(v) => setCapaType(v ?? 'corrective')}>
                        <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="corrective">Correctiva</SelectItem>
                          <SelectItem value="preventive">Preventiva</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input placeholder="Descripción de la acción" value={capaDesc} onChange={(e) => setCapaDesc(e.target.value)} className="h-8 text-sm flex-1" />
                      <Input type="date" value={capaDue} onChange={(e) => setCapaDue(e.target.value)} className="h-8 w-36 text-sm" />
                    </div>
                    <Button size="sm" disabled={!capaDesc.trim() || capaMut.isPending}
                      onClick={() => capaMut.mutate({ ncId: detail.id, data: { type: capaType, description: capaDesc, due_date: capaDue || undefined } })}>
                      Agregar
                    </Button>
                  </div>
                )}
              </div>

              {detail.status !== 'closed' && (
                <Button variant="outline" size="sm" onClick={() => closeMut.mutate(detail.id)} disabled={closeMut.isPending}>
                  <CheckCircle className="mr-2 size-4 text-green-600" />
                  {closeMut.isPending ? 'Cerrando…' : 'Cerrar NC'}
                </Button>
              )}
            </div>
          )}
          <DialogFooter><Button variant="outline" onClick={() => setDetailId(null)}>Cerrar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════════════════════════════

export default function QualityPage() {
  const params     = useParams();
  const slug       = params.slug as string;
  const [activeTab, setActiveTab] = useState('plans');

  return (
    <AddonGate moduleKey="quality" slug={slug}>
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Gestión de Calidad</h1>
      </div>

      <div className="flex gap-0.5 p-1 rounded-lg bg-muted w-fit">
        {([
          { key: 'plans', icon: ClipboardCheck, label: 'Planes QC' },
          { key: 'inspections', icon: ListChecks, label: 'Inspecciones' },
          { key: 'nonconformities', icon: AlertTriangle, label: 'No Conformidades' },
        ] as const).map(({ key, icon: Icon, label }) => (
          <button key={key} onClick={() => setActiveTab(key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${activeTab === key ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
            <Icon className="size-3.5" />{label}
          </button>
        ))}
      </div>

      <div className="mt-2">
        {activeTab === 'plans' && <PlansTab slug={slug} />}
        {activeTab === 'inspections' && <InspectionsTab slug={slug} />}
        {activeTab === 'nonconformities' && <NonconformitiesTab slug={slug} />}
      </div>
    </div>
    </AddonGate>
  );
}
