'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notify } from '@/lib/notify';
import { hrmApi } from '@/lib/api/tenant.api';
import {
  User, FileText, Calendar, BriefcaseMedical,
  Phone, MapPin, Building2, CreditCard, AlertCircle,
  CheckCircle, Clock, Edit, Save, X,
} from 'lucide-react';

import { Button }    from '@/components/ui/button';
import { Badge }     from '@/components/ui/badge';
import { Input }     from '@/components/ui/input';
import { Label }     from '@/components/ui/label';
import { Textarea }  from '@/components/ui/textarea';
import { Skeleton }  from '@/components/ui/skeleton';
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
  Tabs, TabsContent, TabsList, TabsTrigger,
} from '@/components/ui/tabs';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Employee {
  id: number;
  first_name: string;
  last_name: string;
  document_number: string;
  email: string;
  phone: string | null;
  address: string | null;
  city: string | null;
  position: string | null;
  department: string | null;
  hire_date: string | null;
  bank_name: string | null;
  bank_account: string | null;
  bank_account_type: string | null;
  status: string;
}

interface Payslip {
  id: number;
  period_start: string;
  period_end: string;
  period_status: string;
  base_salary: number;
  total_earned: number;
  total_deductions: number;
  net_pay: number;
}

interface Vacation {
  id: number;
  start_date: string;
  end_date: string;
  days: number;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  notes: string | null;
}

interface Absence {
  id: number;
  type: string;
  start_date: string;
  end_date: string;
  status: string;
  reason: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(v: number) { return `$${v.toLocaleString('es-CO')}`; }
function fmtDate(d: string) { return new Date(d).toLocaleDateString('es-CO'); }

const VAC_COLORS: Record<Vacation['status'], 'secondary' | 'default' | 'destructive' | 'outline'> = {
  pending: 'secondary', approved: 'outline', rejected: 'destructive', cancelled: 'destructive',
};
const VAC_LABELS: Record<Vacation['status'], string> = {
  pending: 'Pendiente', approved: 'Aprobadas', rejected: 'Rechazadas', cancelled: 'Canceladas',
};

// ══════════════════════════════════════════════════════════════════════════════
// PROFILE TAB
// ══════════════════════════════════════════════════════════════════════════════

function ProfileTab({ slug }: { slug: string }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [phone, setPhone]     = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity]       = useState('');
  const [bankName, setBankName]         = useState('');
  const [bankAccount, setBankAccount]   = useState('');
  const [bankType, setBankType]         = useState('');

  const meQ = useQuery({
    queryKey: [slug, 'portal-me'],
    queryFn:  () => hrmApi.portalMe(),
  });

  const emp = meQ.data as Employee | undefined;

  const updateMut = useMutation({
    mutationFn: (d: unknown) => hrmApi.portalUpdateMe(d),
    onSuccess: () => {
      notify.success('Datos actualizados.');
      qc.invalidateQueries({ queryKey: [slug, 'portal-me'] });
      setEditing(false);
    },
    onError: (e: unknown) => notify.error((e as { message?: string }).message ?? 'Error'),
  });

  function startEdit() {
    if (!emp) return;
    setPhone(emp.phone ?? ''); setAddress(emp.address ?? '');
    setCity(emp.city ?? ''); setBankName(emp.bank_name ?? '');
    setBankAccount(emp.bank_account ?? ''); setBankType(emp.bank_account_type ?? '');
    setEditing(true);
  }

  if (meQ.isPending) return <div className="space-y-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>;

  if (!emp) return (
    <div className="flex flex-col items-center py-16 text-center gap-3">
      <AlertCircle className="size-12 text-muted-foreground/40" />
      <p className="font-medium">No se encontró un empleado vinculado a tu cuenta.</p>
      <p className="text-sm text-muted-foreground">Contacta a Recursos Humanos para que vinculen tu email con tu perfil de empleado.</p>
    </div>
  );

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">{emp.first_name} {emp.last_name}</h2>
          <p className="text-sm text-muted-foreground">{emp.position ?? 'Sin cargo'} · {emp.department ?? 'Sin departamento'}</p>
        </div>
        {!editing && (
          <Button variant="outline" size="sm" onClick={startEdit}>
            <Edit className="mr-2 size-4" />Editar datos
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><User className="size-4" />Datos personales</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Documento</span><span>{emp.document_number}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Email</span><span>{emp.email}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Fecha ingreso</span><span>{emp.hire_date ? fmtDate(emp.hire_date) : '—'}</span></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><MapPin className="size-4" />Contacto</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {editing ? (
              <>
                <div className="space-y-1"><Label className="text-xs">Teléfono</Label>
                  <Input value={phone} onChange={(e) => setPhone(e.target.value)} className="h-8 text-sm" /></div>
                <div className="space-y-1"><Label className="text-xs">Dirección</Label>
                  <Input value={address} onChange={(e) => setAddress(e.target.value)} className="h-8 text-sm" /></div>
                <div className="space-y-1"><Label className="text-xs">Ciudad</Label>
                  <Input value={city} onChange={(e) => setCity(e.target.value)} className="h-8 text-sm" /></div>
              </>
            ) : (
              <>
                <div className="flex justify-between"><span className="text-muted-foreground">Teléfono</span><span>{emp.phone ?? '—'}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Dirección</span><span className="text-right">{emp.address ?? '—'}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Ciudad</span><span>{emp.city ?? '—'}</span></div>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="sm:col-span-2">
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><CreditCard className="size-4" />Datos bancarios</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {editing ? (
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1"><Label className="text-xs">Banco</Label>
                  <Input value={bankName} onChange={(e) => setBankName(e.target.value)} className="h-8 text-sm" /></div>
                <div className="space-y-1"><Label className="text-xs">Número de cuenta</Label>
                  <Input value={bankAccount} onChange={(e) => setBankAccount(e.target.value)} className="h-8 text-sm" /></div>
                <div className="space-y-1"><Label className="text-xs">Tipo</Label>
                  <Select value={bankType} onValueChange={(v) => setBankType(v ?? '')}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="savings">Ahorros</SelectItem><SelectItem value="checking">Corriente</SelectItem></SelectContent>
                  </Select>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-x-8 gap-y-2">
                <div><span className="text-muted-foreground">Banco: </span>{emp.bank_name ?? '—'}</div>
                <div><span className="text-muted-foreground">Cuenta: </span>{emp.bank_account ?? '—'}</div>
                <div><span className="text-muted-foreground">Tipo: </span>{emp.bank_account_type ?? '—'}</div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {editing && (
        <div className="flex gap-2">
          <Button onClick={() => updateMut.mutate({ phone: phone || undefined, address: address || undefined, city: city || undefined, bank_name: bankName || undefined, bank_account: bankAccount || undefined, bank_account_type: bankType || undefined })}
            disabled={updateMut.isPending}>
            <Save className="mr-2 size-4" />{updateMut.isPending ? 'Guardando…' : 'Guardar cambios'}
          </Button>
          <Button variant="outline" onClick={() => setEditing(false)}><X className="mr-2 size-4" />Cancelar</Button>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// PAYSLIPS TAB
// ══════════════════════════════════════════════════════════════════════════════

function PayslipsTab({ slug }: { slug: string }) {
  const payslipsQ = useQuery({
    queryKey: [slug, 'portal-payslips'],
    queryFn:  () => hrmApi.portalPayslips(),
  });

  const payslips = (payslipsQ.data ?? []) as Payslip[];

  return (
    <div className="space-y-4 max-w-3xl">
      <p className="text-sm text-muted-foreground">Historial de recibos de nómina. Mostrando los últimos 24 períodos.</p>
      {payslipsQ.isPending ? (
        <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
      ) : payslips.length === 0 ? (
        <div className="py-14 text-center text-muted-foreground"><FileText className="mx-auto size-10 mb-3 opacity-30" /><p>No hay recibos disponibles.</p></div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Período</TableHead>
                  <TableHead className="text-right">Salario base</TableHead>
                  <TableHead className="text-right">Devengado</TableHead>
                  <TableHead className="text-right">Deducciones</TableHead>
                  <TableHead className="text-right font-semibold">Neto</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payslips.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="text-sm">{fmtDate(p.period_start)} — {fmtDate(p.period_end)}</TableCell>
                    <TableCell className="text-right">{fmt(p.base_salary)}</TableCell>
                    <TableCell className="text-right text-green-600">{fmt(p.total_earned)}</TableCell>
                    <TableCell className="text-right text-red-600">-{fmt(p.total_deductions)}</TableCell>
                    <TableCell className="text-right font-semibold">{fmt(p.net_pay)}</TableCell>
                    <TableCell><Badge variant={p.period_status === 'paid' ? 'outline' : 'secondary'}>{p.period_status === 'paid' ? 'Pagado' : p.period_status}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// VACATIONS TAB
// ══════════════════════════════════════════════════════════════════════════════

function VacationsTab({ slug }: { slug: string }) {
  const qc = useQueryClient();
  const [requestOpen, setRequestOpen] = useState(false);
  const [startDate, setStartDate]     = useState('');
  const [endDate, setEndDate]         = useState('');
  const [notes, setNotes]             = useState('');

  const vacQ = useQuery({
    queryKey: [slug, 'portal-vacations'],
    queryFn:  () => hrmApi.portalVacations(),
  });

  const vacations = (vacQ.data ?? []) as Vacation[];

  function inv() { qc.invalidateQueries({ queryKey: [slug, 'portal-vacations'] }); }

  const requestMut = useMutation({
    mutationFn: (d: { start_date: string; end_date: string; notes?: string }) => hrmApi.portalRequestVacation(d),
    onSuccess: () => { notify.success('Solicitud enviada.'); inv(); setRequestOpen(false); setStartDate(''); setEndDate(''); setNotes(''); },
    onError:   (e: unknown) => notify.error((e as { message?: string }).message ?? 'Error'),
  });
  const cancelMut = useMutation({
    mutationFn: (id: number) => hrmApi.portalCancelVacation(id),
    onSuccess: () => { notify.success('Solicitud cancelada.'); inv(); },
    onError:   (e: unknown) => notify.error((e as { message?: string }).message ?? 'Error'),
  });

  const days = startDate && endDate
    ? Math.max(0, Math.floor((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000) + 1)
    : 0;

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{vacations.length} solicitud(es) de vacaciones</p>
        <Button onClick={() => setRequestOpen(true)}>
          <Calendar className="mr-2 size-4" />Solicitar vacaciones
        </Button>
      </div>

      {vacQ.isPending ? (
        <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
      ) : vacations.length === 0 ? (
        <div className="py-14 text-center text-muted-foreground"><Calendar className="mx-auto size-10 mb-3 opacity-30" /><p>No has solicitado vacaciones.</p></div>
      ) : (
        <div className="space-y-2">
          {vacations.map((v) => (
            <div key={v.id} className="flex items-center justify-between rounded-md border p-4">
              <div>
                <p className="text-sm font-medium">{fmtDate(v.start_date)} — {fmtDate(v.end_date)}</p>
                <p className="text-xs text-muted-foreground">{v.days} día(s){v.notes ? ` · ${v.notes}` : ''}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={VAC_COLORS[v.status]}>{VAC_LABELS[v.status]}</Badge>
                {v.status === 'pending' && (
                  <Button size="sm" variant="ghost" className="text-destructive"
                    onClick={() => cancelMut.mutate(v.id)} disabled={cancelMut.isPending}>
                    Cancelar
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={requestOpen} onOpenChange={setRequestOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Solicitar Vacaciones</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Fecha de inicio <span className="text-destructive">*</span></Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Fecha de fin <span className="text-destructive">*</span></Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} min={startDate} /></div>
            {days > 0 && <p className="text-sm text-center font-medium">{days} día(s) de vacaciones</p>}
            <div className="space-y-1.5"><Label>Observaciones</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRequestOpen(false)}>Cancelar</Button>
            <Button
              onClick={() => requestMut.mutate({ start_date: startDate, end_date: endDate, notes: notes || undefined })}
              disabled={requestMut.isPending || !startDate || !endDate}>
              {requestMut.isPending ? 'Enviando…' : 'Enviar solicitud'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ABSENCES TAB
// ══════════════════════════════════════════════════════════════════════════════

function AbsencesTab({ slug }: { slug: string }) {
  const qc = useQueryClient();
  const [requestOpen, setRequestOpen] = useState(false);
  const [absType, setAbsType]   = useState('');
  const [start, setStart]       = useState('');
  const [end, setEnd]           = useState('');
  const [reason, setReason]     = useState('');
  const [docNum, setDocNum]     = useState('');

  const absQ = useQuery({
    queryKey: [slug, 'portal-absences'],
    queryFn:  () => hrmApi.portalAbsences(),
  });

  const absences = (absQ.data ?? []) as Absence[];
  function inv() { qc.invalidateQueries({ queryKey: [slug, 'portal-absences'] }); }

  const requestMut = useMutation({
    mutationFn: (d: unknown) => hrmApi.portalRequestAbsence(d),
    onSuccess: () => { notify.success('Solicitud enviada.'); inv(); setRequestOpen(false); setAbsType(''); setStart(''); setEnd(''); setReason(''); },
    onError:   (e: unknown) => notify.error((e as { message?: string }).message ?? 'Error'),
  });

  const ABS_TYPES = ['incapacidad', 'licencia_remunerada', 'licencia_no_remunerada', 'calamidad', 'permiso', 'otro'];

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{absences.length} ausencia(s)</p>
        <Button onClick={() => setRequestOpen(true)}>
          <BriefcaseMedical className="mr-2 size-4" />Reportar ausencia
        </Button>
      </div>

      {absQ.isPending ? (
        <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
      ) : absences.length === 0 ? (
        <div className="py-14 text-center text-muted-foreground"><BriefcaseMedical className="mx-auto size-10 mb-3 opacity-30" /><p>No hay ausencias registradas.</p></div>
      ) : (
        <div className="space-y-2">
          {absences.map((a) => (
            <div key={a.id} className="flex items-center justify-between rounded-md border p-4">
              <div>
                <p className="text-sm font-medium capitalize">{a.type.replace(/_/g, ' ')}</p>
                <p className="text-xs text-muted-foreground">{fmtDate(a.start_date)} — {fmtDate(a.end_date)}{a.reason ? ` · ${a.reason}` : ''}</p>
              </div>
              <Badge variant={a.status === 'approved' ? 'outline' : a.status === 'rejected' ? 'destructive' : 'secondary'}>
                {a.status}
              </Badge>
            </div>
          ))}
        </div>
      )}

      <Dialog open={requestOpen} onOpenChange={setRequestOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Reportar Ausencia</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Tipo <span className="text-destructive">*</span></Label>
              <Select value={absType} onValueChange={(v) => setAbsType(v ?? '')}>
                <SelectTrigger><SelectValue placeholder="Seleccionar…" /></SelectTrigger>
                <SelectContent>{ABS_TYPES.map((t) => <SelectItem key={t} value={t}>{t.replace(/_/g, ' ')}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Inicio</Label><Input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Fin</Label><Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} min={start} /></div>
            </div>
            <div className="space-y-1.5"><Label>N° documento soporte</Label><Input value={docNum} onChange={(e) => setDocNum(e.target.value)} placeholder="Ej: Incapacidad 123" /></div>
            <div className="space-y-1.5"><Label>Descripción / motivo</Label><Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRequestOpen(false)}>Cancelar</Button>
            <Button onClick={() => requestMut.mutate({ type: absType, start_date: start, end_date: end, reason: reason || undefined, doc_number: docNum || undefined })}
              disabled={requestMut.isPending || !absType || !start || !end}>
              {requestMut.isPending ? 'Enviando…' : 'Enviar solicitud'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════════════════════════════

export default function EmployeePortalPage() {
  const params  = useParams();
  const slug    = params.slug as string;
  const [activeTab, setActiveTab] = useState('profile');

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Portal del Empleado</h1>
        <p className="text-sm text-muted-foreground">Gestiona tu perfil, consulta tus recibos y solicita permisos.</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="profile" className="gap-1.5"><User className="size-4" />Mi Perfil</TabsTrigger>
          <TabsTrigger value="payslips" className="gap-1.5"><FileText className="size-4" />Recibos</TabsTrigger>
          <TabsTrigger value="vacations" className="gap-1.5"><Calendar className="size-4" />Vacaciones</TabsTrigger>
          <TabsTrigger value="absences" className="gap-1.5"><BriefcaseMedical className="size-4" />Ausencias</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="mt-4"><ProfileTab slug={slug} /></TabsContent>
        <TabsContent value="payslips" className="mt-4"><PayslipsTab slug={slug} /></TabsContent>
        <TabsContent value="vacations" className="mt-4"><VacationsTab slug={slug} /></TabsContent>
        <TabsContent value="absences" className="mt-4"><AbsencesTab slug={slug} /></TabsContent>
      </Tabs>
    </div>
  );
}
