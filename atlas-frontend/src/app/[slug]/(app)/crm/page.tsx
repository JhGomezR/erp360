'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notify } from '@/lib/notify';
import { crmApi } from '@/lib/api/tenant.api';
import { AddonGate } from '@/components/shared/AddonPaywall';
import {
  Users, TrendingUp, MessageSquare, Megaphone,
  Plus, Eye, Trash2, Phone, Mail, Building2,
  CheckCircle, XCircle, ArrowRight, Star,
  Target, BarChart3, Filter, RefreshCw, UserPlus, UserMinus,
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
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Lead {
  id: number;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  source: string | null;
  status: 'new' | 'contacted' | 'qualified' | 'disqualified';
  notes: string | null;
  opportunities_count?: number;
  created_at: string;
}

interface Opportunity {
  id: number;
  title: string;
  lead_id: number | null;
  stage: 'prospect' | 'qualified' | 'proposal' | 'negotiation' | 'closed_won' | 'closed_lost';
  amount: number;
  probability: number;
  expected_close: string | null;
  closed_at: string | null;
  lost_reason: string | null;
  description: string | null;
  lead?: { id: number; name: string; company: string | null } | null;
  created_at: string;
}

interface Interaction {
  id: number;
  subject_type: string;
  subject_id: number;
  type: string;
  title: string;
  content: string | null;
  outcome: string | null;
  occurred_at: string;
  completed: boolean;
}

interface Campaign {
  id: number;
  name: string;
  type: string;
  status: 'draft' | 'active' | 'paused' | 'completed';
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  budget: number;
  target_leads: number;
  reached_leads: number;
  converted_leads: number;
  created_at: string;
}

interface PipelineStage {
  count: number;
  total: number;
  items: Opportunity[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const LEAD_STATUS_LABELS = { new: 'Nuevo', contacted: 'Contactado', qualified: 'Calificado', disqualified: 'Descalificado' };
const LEAD_STATUS_COLORS = { new: 'secondary', contacted: 'default', qualified: 'outline', disqualified: 'destructive' } as const;

const OPP_STAGE_LABELS = {
  prospect: 'Prospecto', qualified: 'Calificado', proposal: 'Propuesta',
  negotiation: 'Negociación', closed_won: 'Ganado', closed_lost: 'Perdido',
};
const OPP_STAGE_COLORS = {
  prospect: 'secondary', qualified: 'default', proposal: 'default',
  negotiation: 'default', closed_won: 'outline', closed_lost: 'destructive',
} as const;

const INTERACTION_ICONS: Record<string, React.ReactNode> = {
  call:    <Phone className="size-3.5" />,
  email:   <Mail className="size-3.5" />,
  meeting: <Users className="size-3.5" />,
  note:    <MessageSquare className="size-3.5" />,
  task:    <CheckCircle className="size-3.5" />,
  demo:    <Star className="size-3.5" />,
};

const PIPELINE_STAGES: Array<{ key: Opportunity['stage']; label: string; color: string }> = [
  { key: 'prospect',    label: 'Prospecto',   color: 'bg-slate-100 dark:bg-slate-800' },
  { key: 'qualified',   label: 'Calificado',  color: 'bg-blue-50 dark:bg-blue-950' },
  { key: 'proposal',    label: 'Propuesta',   color: 'bg-purple-50 dark:bg-purple-950' },
  { key: 'negotiation', label: 'Negociación', color: 'bg-orange-50 dark:bg-orange-950' },
];

function fmt(v: number) { return `$${v.toLocaleString('es-CO')}`; }
function fmtDate(d: string) { return new Date(d).toLocaleDateString('es-CO'); }

// ══════════════════════════════════════════════════════════════════════════════
// LEADS TAB
// ══════════════════════════════════════════════════════════════════════════════

function LeadsTab({ slug }: { slug: string }) {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [qualifyOpen, setQualifyOpen] = useState(false);
  const [qualifyTitle, setQualifyTitle] = useState('');

  // Form state
  const [name, setName]         = useState('');
  const [company, setCompany]   = useState('');
  const [email, setEmail]       = useState('');
  const [phone, setPhone]       = useState('');
  const [source, setSource]     = useState('');
  const [notes, setNotes]       = useState('');

  const leadsQ = useQuery({
    queryKey: [slug, 'crm-leads', statusFilter, search],
    queryFn:  () => crmApi.leads({ status: statusFilter !== 'all' ? statusFilter : undefined, search: search || undefined }),
  });

  const detailQ = useQuery({
    queryKey: [slug, 'crm-lead-detail', detailId],
    queryFn:  () => crmApi.getLead(detailId!),
    enabled:  detailId !== null,
  });

  const leads: Lead[] = (leadsQ.data as { data?: Lead[] })?.data ?? [];
  const detail = detailQ.data as (Lead & { interactions?: Interaction[] }) | undefined;

  function inv() { qc.invalidateQueries({ queryKey: [slug, 'crm-leads'] }); }
  function invDetail() { qc.invalidateQueries({ queryKey: [slug, 'crm-lead-detail', detailId] }); }

  const createMut = useMutation({
    mutationFn: (d: unknown) => crmApi.createLead(d),
    onSuccess: () => { notify.success('Lead creado.'); inv(); setCreateOpen(false); resetForm(); },
    onError:   (e: unknown) => notify.error((e as { message?: string }).message ?? 'Error'),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: unknown }) => crmApi.updateLead(id, data),
    onSuccess: () => { notify.success('Lead actualizado.'); inv(); invDetail(); },
    onError:   (e: unknown) => notify.error((e as { message?: string }).message ?? 'Error'),
  });
  const deleteMut = useMutation({
    mutationFn: (id: number) => crmApi.deleteLead(id),
    onSuccess: () => { notify.success('Lead eliminado.'); inv(); setDetailId(null); },
    onError:   (e: unknown) => notify.error((e as { message?: string }).message ?? 'Error'),
  });
  const qualifyMut = useMutation({
    mutationFn: ({ id, title }: { id: number; title: string }) => crmApi.qualifyLead(id, { title }),
    onSuccess: () => { notify.success('Lead calificado. Oportunidad creada.'); inv(); invDetail(); setQualifyOpen(false); setQualifyTitle(''); },
    onError:   (e: unknown) => notify.error((e as { message?: string }).message ?? 'Error'),
  });
  const addInteractionMut = useMutation({
    mutationFn: (d: unknown) => crmApi.createInteraction(d),
    onSuccess: () => { notify.success('Interacción registrada.'); invDetail(); },
    onError:   (e: unknown) => notify.error((e as { message?: string }).message ?? 'Error'),
  });

  const [intType, setIntType]   = useState('call');
  const [intTitle, setIntTitle] = useState('');
  const [intContent, setIntContent] = useState('');

  function resetForm() { setName(''); setCompany(''); setEmail(''); setPhone(''); setSource(''); setNotes(''); }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input placeholder="Buscar lead…" value={search} onChange={(e) => setSearch(e.target.value)} className="sm:w-64" />
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v ?? 'all')}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="new">Nuevos</SelectItem>
            <SelectItem value="contacted">Contactados</SelectItem>
            <SelectItem value="qualified">Calificados</SelectItem>
            <SelectItem value="disqualified">Descalificados</SelectItem>
          </SelectContent>
        </Select>
        <Button className="ml-auto" onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 size-4" />Nuevo Lead
        </Button>
      </div>

      <div className="flex flex-col gap-3">
        {leadsQ.isPending
          ? Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-16 rounded-2xl bg-muted animate-pulse" />)
          : leads.length === 0
          ? (
            <div className="flex flex-col items-center justify-center py-14 gap-3 text-muted-foreground">
              <div className="size-14 rounded-full bg-muted flex items-center justify-center">
                <Users className="size-7 opacity-40" />
              </div>
              <p className="font-medium">No hay leads</p>
              <Button onClick={() => setCreateOpen(true)}><Plus className="mr-2 size-4" />Nuevo Lead</Button>
            </div>
          )
          : leads.map((lead) => (
            <button key={lead.id} onClick={() => setDetailId(lead.id)}
              className="rounded-2xl border bg-card p-4 flex items-center gap-4 hover:shadow-sm hover:border-primary/20 transition-all text-left w-full">
              <div className="size-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                <UserPlus className="size-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm">{lead.name}</p>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                  {lead.company && <span className="text-xs text-muted-foreground flex items-center gap-1"><Building2 className="size-2.5" />{lead.company}</span>}
                  {lead.email && <span className="text-xs text-muted-foreground flex items-center gap-1"><Mail className="size-2.5" />{lead.email}</span>}
                  {lead.phone && <span className="text-xs text-muted-foreground flex items-center gap-1"><Phone className="size-2.5" />{lead.phone}</span>}
                </div>
              </div>
              <div className="hidden sm:flex items-center gap-3 flex-shrink-0">
                {lead.source && <span className="text-xs text-muted-foreground">{lead.source}</span>}
                {(lead.opportunities_count ?? 0) > 0 && (
                  <span className="text-xs bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 px-2 py-0.5 rounded-full font-medium">
                    {lead.opportunities_count} opor.
                  </span>
                )}
              </div>
              <Badge variant={LEAD_STATUS_COLORS[lead.status]} className="flex-shrink-0">{LEAD_STATUS_LABELS[lead.status]}</Badge>
              <div onClick={(e) => e.stopPropagation()} className="flex gap-1 flex-shrink-0">
                <Button size="icon" variant="ghost" className="size-8 text-destructive"
                  onClick={() => { if (confirm('¿Eliminar lead?')) deleteMut.mutate(lead.id); }}>
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </button>
          ))
        }
      </div>

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Nuevo Lead</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1.5"><Label>Nombre <span className="text-destructive">*</span></Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Empresa</Label><Input value={company} onChange={(e) => setCompany(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Fuente</Label>
              <Select value={source} onValueChange={(v) => setSource(v ?? '')}>
                <SelectTrigger><SelectValue placeholder="Seleccionar…" /></SelectTrigger>
                <SelectContent>
                  {['web','referral','cold_call','event','social','other'].map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Teléfono</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
            <div className="col-span-2 space-y-1.5"><Label>Notas</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCreateOpen(false); resetForm(); }}>Cancelar</Button>
            <Button onClick={() => createMut.mutate({ name, company: company || undefined, email: email || undefined, phone: phone || undefined, source: source || undefined, notes: notes || undefined })}
              disabled={createMut.isPending || !name.trim()}>
              {createMut.isPending ? 'Guardando…' : 'Crear Lead'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={detailId !== null} onOpenChange={(v) => { if (!v) setDetailId(null); }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{detail?.name ?? 'Cargando…'}</DialogTitle>
          </DialogHeader>

          {detail && (
            <div className="flex-1 overflow-y-auto space-y-4 pr-1">
              <div className="flex flex-wrap gap-3 items-center">
                <Badge variant={LEAD_STATUS_COLORS[detail.status]}>{LEAD_STATUS_LABELS[detail.status]}</Badge>
                {detail.company && <span className="text-sm flex items-center gap-1"><Building2 className="size-3.5 text-muted-foreground" />{detail.company}</span>}
                {detail.email && <span className="text-sm flex items-center gap-1"><Mail className="size-3.5 text-muted-foreground" />{detail.email}</span>}
                {detail.phone && <span className="text-sm flex items-center gap-1"><Phone className="size-3.5 text-muted-foreground" />{detail.phone}</span>}
                <div className="ml-auto flex gap-2">
                  <Select value={detail.status} onValueChange={(v) => v && updateMut.mutate({ id: detail.id, data: { status: v } })}>
                    <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(['new','contacted','qualified','disqualified'] as const).map((s) => (
                        <SelectItem key={s} value={s}>{LEAD_STATUS_LABELS[s]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {detail.status !== 'qualified' && (
                    <Button size="sm" variant="outline" onClick={() => setQualifyOpen(true)}>
                      <ArrowRight className="mr-1 size-3.5" />Calificar
                    </Button>
                  )}
                </div>
              </div>

              {/* Registrar interacción */}
              <div className="rounded-md border p-3 space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Registrar actividad</p>
                <div className="flex gap-2">
                  <Select value={intType} onValueChange={(v) => setIntType(v ?? 'call')}>
                    <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['call','email','meeting','note','task','demo'].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Input placeholder="Título de la actividad" value={intTitle} onChange={(e) => setIntTitle(e.target.value)} className="h-8 text-sm flex-1" />
                </div>
                <Textarea placeholder="Detalles / resultado…" value={intContent} onChange={(e) => setIntContent(e.target.value)} rows={2} className="text-sm" />
                <Button size="sm" disabled={!intTitle.trim() || addInteractionMut.isPending}
                  onClick={() => { addInteractionMut.mutate({ subject_type: 'lead', subject_id: detail.id, type: intType, title: intTitle, content: intContent || undefined }); setIntTitle(''); setIntContent(''); }}>
                  Guardar actividad
                </Button>
              </div>

              {/* Timeline */}
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Historial de interacciones</p>
                {(detail.interactions ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sin interacciones registradas.</p>
                ) : (
                  <div className="space-y-2">
                    {(detail.interactions ?? []).map((int) => (
                      <div key={int.id} className="flex gap-3 rounded border p-3">
                        <div className="mt-0.5 text-muted-foreground">{INTERACTION_ICONS[int.type] ?? <MessageSquare className="size-3.5" />}</div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{int.title}</p>
                          {int.content && <p className="text-xs text-muted-foreground mt-0.5">{int.content}</p>}
                          <p className="text-xs text-muted-foreground mt-1">{new Date(int.occurred_at).toLocaleString('es-CO')}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailId(null)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Qualify Dialog */}
      <Dialog open={qualifyOpen} onOpenChange={setQualifyOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Calificar como Oportunidad</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label>Título de la oportunidad <span className="text-destructive">*</span></Label>
            <Input value={qualifyTitle} onChange={(e) => setQualifyTitle(e.target.value)} placeholder="Ej: Propuesta software ERP" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setQualifyOpen(false)}>Cancelar</Button>
            <Button onClick={() => detailId && qualifyMut.mutate({ id: detailId, title: qualifyTitle })}
              disabled={!qualifyTitle.trim() || qualifyMut.isPending}>
              {qualifyMut.isPending ? 'Creando…' : 'Crear Oportunidad'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// PIPELINE TAB (Kanban)
// ══════════════════════════════════════════════════════════════════════════════

function PipelineTab({ slug }: { slug: string }) {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);

  // Create form
  const [title, setTitle]   = useState('');
  const [amount, setAmount] = useState('0');
  const [stage, setStage]   = useState('prospect');
  const [prob, setProb]     = useState('10');
  const [closeDate, setCloseDate] = useState('');

  const pipelineQ = useQuery({
    queryKey: [slug, 'crm-pipeline'],
    queryFn:  () => crmApi.pipeline(),
  });

  const detailQ = useQuery({
    queryKey: [slug, 'crm-opp-detail', detailId],
    queryFn:  () => crmApi.getOpportunity(detailId!),
    enabled:  detailId !== null,
  });

  const pipeline = pipelineQ.data as Record<string, PipelineStage> | undefined;
  const detail = detailQ.data as Opportunity | undefined;

  function inv() { qc.invalidateQueries({ queryKey: [slug, 'crm-pipeline'] }); }

  const createMut = useMutation({
    mutationFn: (d: unknown) => crmApi.createOpportunity(d),
    onSuccess: () => { notify.success('Oportunidad creada.'); inv(); setCreateOpen(false); setTitle(''); setAmount('0'); },
    onError:   (e: unknown) => notify.error((e as { message?: string }).message ?? 'Error'),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: unknown }) => crmApi.updateOpportunity(id, data),
    onSuccess: () => { notify.success('Oportunidad actualizada.'); inv(); qc.invalidateQueries({ queryKey: [slug, 'crm-opp-detail', detailId] }); },
    onError:   (e: unknown) => notify.error((e as { message?: string }).message ?? 'Error'),
  });
  const deleteMut = useMutation({
    mutationFn: (id: number) => crmApi.deleteOpportunity(id),
    onSuccess: () => { notify.success('Eliminada.'); inv(); setDetailId(null); },
    onError:   (e: unknown) => notify.error((e as { message?: string }).message ?? 'Error'),
  });

  const totalPipeline = pipeline
    ? Object.values(pipeline).reduce((s, st) => s + st.total, 0)
    : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Pipeline total</p>
          <p className="text-2xl font-bold">{fmt(totalPipeline)}</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 size-4" />Nueva Oportunidad
        </Button>
      </div>

      {/* Kanban */}
      {pipelineQ.isPending ? (
        <div className="grid grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-48 w-full" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {PIPELINE_STAGES.map((st) => {
            const stageData = pipeline?.[st.key];
            return (
              <div key={st.key} className={`rounded-lg p-3 ${st.color} border`}>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-semibold">{st.label}</p>
                  <Badge variant="secondary">{stageData?.count ?? 0}</Badge>
                </div>
                <p className="text-xs text-muted-foreground mb-3">{fmt(stageData?.total ?? 0)}</p>
                <div className="space-y-2">
                  {(stageData?.items ?? []).map((opp) => (
                    <div key={opp.id}
                      className="bg-background rounded-md border p-3 cursor-pointer hover:shadow-sm transition-shadow"
                      onClick={() => setDetailId(opp.id)}
                    >
                      <p className="text-sm font-medium leading-tight">{opp.title}</p>
                      {opp.lead && <p className="text-xs text-muted-foreground mt-0.5">{opp.lead.company ?? opp.lead.name}</p>}
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-xs font-semibold">{fmt(opp.amount)}</span>
                        <span className="text-xs text-muted-foreground">{opp.probability}%</span>
                      </div>
                      <Progress value={opp.probability} className="h-1 mt-1" />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Nueva Oportunidad</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Título <span className="text-destructive">*</span></Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Monto estimado</Label>
                <Input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Probabilidad %</Label>
                <Input type="number" min={0} max={100} value={prob} onChange={(e) => setProb(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Stage inicial</Label>
                <Select value={stage} onValueChange={(v) => setStage(v ?? 'prospect')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PIPELINE_STAGES.map((s) => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Cierre esperado</Label>
                <Input type="date" value={closeDate} onChange={(e) => setCloseDate(e.target.value)} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button onClick={() => createMut.mutate({ title, amount: parseFloat(amount) || 0, probability: parseFloat(prob) || 0, stage, expected_close: closeDate || undefined })}
              disabled={createMut.isPending || !title.trim()}>
              {createMut.isPending ? 'Creando…' : 'Crear'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail / Edit Dialog */}
      <Dialog open={detailId !== null} onOpenChange={(v) => { if (!v) setDetailId(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>{detail?.title ?? 'Cargando…'}</DialogTitle></DialogHeader>
          {detail && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2 items-center">
                <Badge variant={OPP_STAGE_COLORS[detail.stage]}>{OPP_STAGE_LABELS[detail.stage]}</Badge>
                <span className="text-sm font-semibold ml-auto">{fmt(detail.amount)}</span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                {detail.expected_close && <div><span className="text-muted-foreground">Cierre:</span> {fmtDate(detail.expected_close)}</div>}
                <div><span className="text-muted-foreground">Probabilidad:</span> {detail.probability}%</div>
                {detail.lead && <div><span className="text-muted-foreground">Lead:</span> {detail.lead.name}</div>}
              </div>
              <Progress value={detail.probability} className="h-2" />
              <Separator />
              <div className="space-y-1.5">
                <Label className="text-xs">Cambiar stage</Label>
                <Select value={detail.stage} onValueChange={(v) => v && updateMut.mutate({ id: detail.id, data: { stage: v } })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(OPP_STAGE_LABELS) as Opportunity['stage'][]).map((s) => (
                      <SelectItem key={s} value={s}>{OPP_STAGE_LABELS[s]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {detail.stage === 'closed_lost' && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Motivo de pérdida</Label>
                  <Input placeholder="¿Por qué se perdió?" defaultValue={detail.lost_reason ?? ''}
                    onBlur={(e) => updateMut.mutate({ id: detail.id, data: { lost_reason: e.target.value } })} />
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="destructive" size="sm"
              onClick={() => { if (detail && confirm('¿Eliminar oportunidad?')) deleteMut.mutate(detail.id); }}>
              <Trash2 className="mr-1 size-3.5" />Eliminar
            </Button>
            <Button variant="outline" onClick={() => setDetailId(null)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// CAMPAIGNS TAB
// ══════════════════════════════════════════════════════════════════════════════

function CampaignsTab({ slug }: { slug: string }) {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName]   = useState('');
  const [type, setType]   = useState('email');
  const [desc, setDesc]   = useState('');
  const [budget, setBudget] = useState('0');
  const [target, setTarget] = useState('0');
  const [start, setStart] = useState('');
  const [end, setEnd]     = useState('');

  const campsQ = useQuery({
    queryKey: [slug, 'crm-campaigns'],
    queryFn:  () => crmApi.campaigns(),
  });

  const camps: Campaign[] = (campsQ.data as { data?: Campaign[] })?.data ?? [];
  function inv() { qc.invalidateQueries({ queryKey: [slug, 'crm-campaigns'] }); }

  const createMut = useMutation({
    mutationFn: (d: unknown) => crmApi.createCampaign(d),
    onSuccess: () => { notify.success('Campaña creada.'); inv(); setCreateOpen(false); setName(''); },
    onError:   (e: unknown) => notify.error((e as { message?: string }).message ?? 'Error'),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: unknown }) => crmApi.updateCampaign(id, data),
    onSuccess: () => { notify.success('Actualizada.'); inv(); },
    onError:   (e: unknown) => notify.error((e as { message?: string }).message ?? 'Error'),
  });
  const deleteMut = useMutation({
    mutationFn: (id: number) => crmApi.deleteCampaign(id),
    onSuccess: () => { notify.success('Eliminada.'); inv(); },
    onError:   (e: unknown) => notify.error((e as { message?: string }).message ?? 'Error'),
  });

  const STATUS_CAMP_COLORS: Record<Campaign['status'], 'secondary' | 'default' | 'destructive' | 'outline'> = {
    draft: 'secondary', active: 'default', paused: 'secondary', completed: 'outline',
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{camps.length} campaña(s)</p>
        <Button onClick={() => setCreateOpen(true)}><Plus className="mr-2 size-4" />Nueva Campaña</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {campsQ.isPending ? [...Array(4)].map((_, i) => <Skeleton key={i} className="h-40 w-full" />) :
          camps.length === 0 ? (
            <div className="col-span-2 py-14 text-center text-muted-foreground">
              <Megaphone className="mx-auto size-10 mb-3 opacity-30" /><p>No hay campañas</p>
            </div>
          ) : camps.map((c) => (
            <Card key={c.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-sm font-semibold">{c.name}</CardTitle>
                    <p className="text-xs text-muted-foreground">{c.type} · {c.start_date ? fmtDate(c.start_date) : 'Sin fecha'}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Badge variant={STATUS_CAMP_COLORS[c.status]}>{c.status}</Badge>
                    <Select value={c.status} onValueChange={(v) => v && updateMut.mutate({ id: c.id, data: { status: v } })}>
                      <SelectTrigger className="h-7 w-7 p-0 border-0 opacity-60 hover:opacity-100"><span className="sr-only">estado</span></SelectTrigger>
                      <SelectContent>
                        {['draft','active','paused','completed'].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-2 text-center mb-3">
                  <div><p className="text-lg font-bold">{c.reached_leads}</p><p className="text-xs text-muted-foreground">Alcanzados</p></div>
                  <div><p className="text-lg font-bold">{c.converted_leads}</p><p className="text-xs text-muted-foreground">Convertidos</p></div>
                  <div><p className="text-lg font-bold">{c.reached_leads > 0 ? Math.round(c.converted_leads / c.reached_leads * 100) : 0}%</p><p className="text-xs text-muted-foreground">Conversión</p></div>
                </div>
                <Progress value={c.target_leads > 0 ? (c.reached_leads / c.target_leads) * 100 : 0} className="h-1.5" />
                <p className="text-xs text-muted-foreground mt-1">{c.reached_leads} / {c.target_leads} objetivo</p>
                <div className="flex justify-between mt-3">
                  <span className="text-xs text-muted-foreground">Presupuesto: {fmt(c.budget)}</span>
                  <Button size="icon" variant="ghost" className="size-6 text-destructive"
                    onClick={() => { if (confirm('¿Eliminar campaña?')) deleteMut.mutate(c.id); }}>
                    <Trash2 className="size-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        }
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Nueva Campaña</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1.5"><Label>Nombre <span className="text-destructive">*</span></Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Tipo</Label>
              <Select value={type} onValueChange={(v) => setType(v ?? 'email')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['email','sms','social','event','other'].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Presupuesto</Label>
              <Input type="number" min={0} value={budget} onChange={(e) => setBudget(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Meta de leads</Label>
              <Input type="number" min={0} value={target} onChange={(e) => setTarget(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Inicio</Label>
              <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Fin</Label>
              <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
            <div className="col-span-2 space-y-1.5"><Label>Descripción</Label>
              <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button onClick={() => createMut.mutate({ name, type, description: desc || undefined, budget: parseFloat(budget) || 0, target_leads: parseInt(target) || 0, start_date: start || undefined, end_date: end || undefined })}
              disabled={createMut.isPending || !name.trim()}>
              {createMut.isPending ? 'Guardando…' : 'Crear Campaña'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// SEGMENTS TAB
// ══════════════════════════════════════════════════════════════════════════════

const SEGMENT_COLORS = [
  '#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6',
  '#8b5cf6', '#ef4444', '#14b8a6', '#f97316', '#84cc16',
];

const DYNAMIC_FIELDS = [
  { key: 'city',           label: 'Ciudad' },
  { key: 'total_spent',    label: 'Total comprado (COP)' },
  { key: 'total_orders',   label: 'Número de pedidos' },
  { key: 'loyalty_points', label: 'Puntos de fidelidad' },
  { key: 'document_type',  label: 'Tipo de documento' },
];

const OPERATORS: Record<string, { label: string; types: ('text' | 'number')[] }> = {
  eq:       { label: '= Igual a',         types: ['text', 'number'] },
  neq:      { label: '≠ Diferente de',    types: ['text', 'number'] },
  gt:       { label: '> Mayor que',        types: ['number'] },
  gte:      { label: '≥ Mayor o igual',    types: ['number'] },
  lt:       { label: '< Menor que',        types: ['number'] },
  lte:      { label: '≤ Menor o igual',   types: ['number'] },
  contains: { label: 'Contiene',          types: ['text'] },
};

const NUMERIC_FIELDS = ['total_spent', 'total_orders', 'loyalty_points'];

interface Segment {
  id: number;
  name: string;
  description: string | null;
  type: 'manual' | 'dynamic';
  color: string;
  criteria: string | null;
  customer_count: number;
  is_active: boolean;
}

interface SegmentMember {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  city: string | null;
  total_spent: number;
  total_orders: number;
  loyalty_points: number;
}

function SegmentFormDialog({
  open, onClose, existing,
}: {
  open: boolean;
  onClose: () => void;
  existing?: Segment | null;
}) {
  const qc = useQueryClient();
  const isEdit = !!existing;

  const [name, setName]           = useState(existing?.name ?? '');
  const [desc, setDesc]           = useState(existing?.description ?? '');
  const [type, setType]           = useState<'manual' | 'dynamic'>(existing?.type ?? 'manual');
  const [color, setColor]         = useState(existing?.color ?? '#6366f1');
  const [criteria, setCriteria]   = useState<{ field: string; operator: string; value: string }[]>(
    existing?.criteria ? JSON.parse(existing.criteria) : []
  );

  useEffect(() => {
    if (open) {
      setName(existing?.name ?? '');
      setDesc(existing?.description ?? '');
      setType(existing?.type ?? 'manual');
      setColor(existing?.color ?? '#6366f1');
      setCriteria(existing?.criteria ? JSON.parse(existing.criteria) : []);
    }
  }, [open, existing]);

  const addCriterion = () =>
    setCriteria(p => [...p, { field: 'city', operator: 'eq', value: '' }]);
  const removeCriterion = (i: number) =>
    setCriteria(p => p.filter((_, idx) => idx !== i));
  const updateCriterion = (i: number, k: string, v: string) =>
    setCriteria(p => p.map((c, idx) => idx === i ? { ...c, [k]: v } : c));

  const mut = useMutation({
    mutationFn: (d: unknown) =>
      isEdit ? crmApi.updateSegment(existing!.id, d) : crmApi.createSegment(d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm-segments'] });
      notify.success(isEdit ? 'Segmento actualizado.' : 'Segmento creado.');
      onClose();
    },
    onError: (e: unknown) => notify.error((e as { message?: string }).message ?? 'Error'),
  });

  const payload = {
    name, description: desc || undefined, type, color,
    criteria: type === 'dynamic' ? criteria.filter(c => c.value !== '') : undefined,
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar segmento' : 'Nuevo segmento'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Nombre *</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Ej: Clientes VIP" />
          </div>

          <div className="space-y-1.5">
            <Label>Descripción</Label>
            <Textarea value={desc} onChange={e => setDesc(e.target.value)} rows={2} placeholder="Descripción opcional..." />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={type} onValueChange={(v) => setType(v as 'manual' | 'dynamic')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Manual — añadir clientes uno a uno</SelectItem>
                  <SelectItem value="dynamic">Dinámico — reglas automáticas</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Color</Label>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {SEGMENT_COLORS.map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={`size-6 rounded-full border-2 transition-transform ${color === c ? 'border-foreground scale-110' : 'border-transparent'}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Dynamic criteria */}
          {type === 'dynamic' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Reglas de inclusión</Label>
                <Button type="button" size="sm" variant="outline" onClick={addCriterion}>
                  <Plus className="size-3 mr-1" />Agregar regla
                </Button>
              </div>
              {criteria.length === 0 && (
                <p className="text-xs text-muted-foreground py-2">Sin reglas — se incluirán todos los clientes activos.</p>
              )}
              {criteria.map((c, i) => {
                const isNumeric = NUMERIC_FIELDS.includes(c.field);
                const availableOps = Object.entries(OPERATORS).filter(([, v]) =>
                  v.types.includes(isNumeric ? 'number' : 'text')
                );
                return (
                  <div key={i} className="flex gap-2 items-center">
                    <Select value={c.field} onValueChange={v => updateCriterion(i, 'field', v)}>
                      <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {DYNAMIC_FIELDS.map(f => <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Select value={c.operator} onValueChange={v => updateCriterion(i, 'operator', v)}>
                      <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {availableOps.map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Input
                      type={isNumeric ? 'number' : 'text'}
                      value={c.value}
                      onChange={e => updateCriterion(i, 'value', e.target.value)}
                      placeholder="Valor..."
                      className="flex-1"
                    />
                    <Button type="button" variant="ghost" size="icon" onClick={() => removeCriterion(i)}>
                      <Trash2 className="size-3.5 text-destructive" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={mut.isPending}>Cancelar</Button>
          <Button onClick={() => mut.mutate(payload)} disabled={mut.isPending || !name.trim()}>
            {mut.isPending ? 'Guardando…' : isEdit ? 'Actualizar' : 'Crear segmento'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SegmentDetailSheet({
  segmentId, onClose,
}: { segmentId: number | null; onClose: () => void }) {
  const qc = useQueryClient();

  const detailQ = useQuery({
    queryKey: ['crm-segment-detail', segmentId],
    queryFn: () => crmApi.getSegment(segmentId!),
    enabled: segmentId !== null,
  });

  const segment: Segment | null = (detailQ.data as any)?.data?.segment ?? null;
  const members: SegmentMember[] = (detailQ.data as any)?.data?.members ?? [];

  const syncMut = useMutation({
    mutationFn: () => crmApi.syncSegment(segmentId!),
    onSuccess: (res: any) => {
      notify.success(res?.data?.message ?? 'Segmento sincronizado.');
      qc.invalidateQueries({ queryKey: ['crm-segments'] });
      qc.invalidateQueries({ queryKey: ['crm-segment-detail', segmentId] });
    },
    onError: (e: unknown) => notify.error((e as { message?: string }).message ?? 'Error'),
  });

  const removeMut = useMutation({
    mutationFn: (customerId: number) => crmApi.removeSegmentMember(segmentId!, customerId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm-segments'] });
      qc.invalidateQueries({ queryKey: ['crm-segment-detail', segmentId] });
    },
    onError: (e: unknown) => notify.error((e as { message?: string }).message ?? 'Error'),
  });

  return (
    <Sheet open={segmentId !== null} onOpenChange={v => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl flex flex-col gap-0 p-0">
        <SheetHeader className="px-6 py-4 border-b">
          <SheetTitle className="flex items-center gap-2">
            {segment && (
              <span className="size-3 rounded-full inline-block" style={{ backgroundColor: segment.color }} />
            )}
            {segment?.name ?? 'Segmento'}
            <Badge variant="secondary" className="ml-1 text-xs">{segment?.type === 'dynamic' ? 'Dinámico' : 'Manual'}</Badge>
          </SheetTitle>
          {segment?.description && (
            <p className="text-sm text-muted-foreground mt-0.5">{segment.description}</p>
          )}
        </SheetHeader>

        <div className="px-6 py-3 border-b flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">{members.length}</span> cliente(s)
          </p>
          {segment?.type === 'dynamic' && (
            <Button size="sm" variant="outline" onClick={() => syncMut.mutate()} disabled={syncMut.isPending}>
              <RefreshCw className={`size-3.5 mr-1.5 ${syncMut.isPending ? 'animate-spin' : ''}`} />
              Sincronizar
            </Button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {detailQ.isLoading ? (
            <div className="p-6 space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-10 bg-muted rounded animate-pulse" />
              ))}
            </div>
          ) : members.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
              <Users className="size-8 opacity-30" />
              <p className="text-sm">Este segmento no tiene clientes aún.</p>
              {segment?.type === 'dynamic' && (
                <p className="text-xs">Pulsa &ldquo;Sincronizar&rdquo; para aplicar las reglas.</p>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Ciudad</TableHead>
                  <TableHead className="text-right">Comprado</TableHead>
                  <TableHead className="text-right">Pedidos</TableHead>
                  <TableHead className="text-right">Puntos</TableHead>
                  {segment?.type === 'manual' && <TableHead />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map(m => (
                  <TableRow key={m.id}>
                    <TableCell>
                      <p className="font-medium text-sm">{m.name}</p>
                      {m.email && <p className="text-xs text-muted-foreground">{m.email}</p>}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{m.city ?? '—'}</TableCell>
                    <TableCell className="text-right text-sm font-mono">
                      ${(m.total_spent ?? 0).toLocaleString('es-CO', { maximumFractionDigits: 0 })}
                    </TableCell>
                    <TableCell className="text-right text-sm">{m.total_orders}</TableCell>
                    <TableCell className="text-right text-sm">{m.loyalty_points}</TableCell>
                    {segment?.type === 'manual' && (
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeMut.mutate(m.id)}
                          disabled={removeMut.isPending}
                        >
                          <UserMinus className="size-3.5 text-destructive" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function SegmentsTab({ slug }: { slug: string }) {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editSeg, setEditSeg]       = useState<Segment | null>(null);
  const [detailId, setDetailId]     = useState<number | null>(null);

  const segmentsQ = useQuery({
    queryKey: ['crm-segments', slug],
    queryFn:  () => crmApi.segments(),
  });

  const segments: Segment[] = (segmentsQ.data as any)?.data?.data ?? [];

  const deleteMut = useMutation({
    mutationFn: (id: number) => crmApi.deleteSegment(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm-segments', slug] });
      notify.success('Segmento eliminado.');
    },
    onError: (e: unknown) => notify.error((e as { message?: string }).message ?? 'Error'),
  });

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            Agrupa clientes por características comunes para campañas y análisis.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="size-4 mr-1.5" />Nuevo segmento
        </Button>
      </div>

      {/* Segments grid */}
      {segmentsQ.isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-32 rounded-lg border bg-muted animate-pulse" />
          ))}
        </div>
      ) : segments.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-20 text-muted-foreground border rounded-lg">
          <Filter className="size-10 opacity-30" />
          <p className="text-sm">No hay segmentos creados.</p>
          <Button variant="outline" size="sm" onClick={() => setCreateOpen(true)}>
            Crear primer segmento
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {segments.map(s => (
            <Card
              key={s.id}
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => setDetailId(s.id)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className="size-3 rounded-full shrink-0"
                      style={{ backgroundColor: s.color }}
                    />
                    <CardTitle className="text-base leading-tight">{s.name}</CardTitle>
                  </div>
                  <div className="flex gap-0.5" onClick={e => e.stopPropagation()}>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      onClick={() => setEditSeg(s)}
                    >
                      <Target className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 text-destructive hover:text-destructive"
                      onClick={() => window.confirm(`¿Eliminar "${s.name}"?`) && deleteMut.mutate(s.id)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
                {s.description && (
                  <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{s.description}</p>
                )}
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex items-center justify-between">
                  <div className="text-2xl font-bold">{s.customer_count}</div>
                  <div className="flex gap-1.5">
                    <Badge variant={s.type === 'dynamic' ? 'default' : 'secondary'} className="text-xs">
                      {s.type === 'dynamic' ? 'Dinámico' : 'Manual'}
                    </Badge>
                    {!s.is_active && (
                      <Badge variant="outline" className="text-xs">Inactivo</Badge>
                    )}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">clientes</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Dialogs */}
      <SegmentFormDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
      />
      {editSeg && (
        <SegmentFormDialog
          open
          onClose={() => setEditSeg(null)}
          existing={editSeg}
        />
      )}
      <SegmentDetailSheet
        segmentId={detailId}
        onClose={() => setDetailId(null)}
      />
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════════════════════════════

export default function CRMPage() {
  const params = useParams();
  const slug   = params.slug as string;
  const [activeTab, setActiveTab] = useState('leads');

  return (
    <AddonGate moduleKey="crm" slug={slug}>
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">CRM</h1>
      </div>

      <div className="flex gap-0.5 p-1 rounded-lg bg-muted w-fit">
        {([
          { key: 'leads',     icon: Users,      label: 'Leads'     },
          { key: 'pipeline',  icon: TrendingUp, label: 'Pipeline'  },
          { key: 'campaigns', icon: Megaphone,  label: 'Campañas'  },
          { key: 'segments',  icon: Filter,     label: 'Segmentos' },
        ] as const).map(({ key, icon: Icon, label }) => (
          <button key={key} onClick={() => setActiveTab(key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${activeTab === key ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
            <Icon className="size-3.5" />{label}
          </button>
        ))}
      </div>

      <div className="mt-2">
        {activeTab === 'leads'     && <LeadsTab slug={slug} />}
        {activeTab === 'pipeline'  && <PipelineTab slug={slug} />}
        {activeTab === 'campaigns' && <CampaignsTab slug={slug} />}
        {activeTab === 'segments'  && <SegmentsTab slug={slug} />}
      </div>
    </div>
    </AddonGate>
  );
}
