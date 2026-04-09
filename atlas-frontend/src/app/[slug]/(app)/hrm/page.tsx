'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { standardSchemaResolver as zodResolver } from '@hookform/resolvers/standard-schema';
import { z } from 'zod';
import { notify } from '@/lib/notify';
import {
  UserCog, Plus, Users, FileText, Calendar, CheckCircle, Search, Pencil,
  Download, AlertTriangle, Lock, Zap,
  Clock, Coffee, LogIn, LogOut, ClipboardList, X, BriefcaseMedical,
  FileSpreadsheet, Send, Star, BookOpen, GraduationCap, CalendarDays,
  FolderOpen, Upload, Eye, Archive,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { hrmApi, pilaApi, talentApi, billingApi, setTenantSlug } from '@/lib/api/tenant.api';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Employee {
  id: number; code?: string; name: string; email?: string; phone?: string;
  position?: string; department?: string; status?: string; hire_date?: string;
}
interface Payroll {
  id: number; period_start: string; period_end: string; status: string;
  net_pay: number; employee?: { name: string };
}
interface Vacation {
  id: number; start_date: string; end_date: string; status: string; days?: number;
  employee?: { name: string }; reason?: string;
}
interface AttendanceSummaryRow {
  employee_id: number; employee_name: string; status: string;
  check_in?: string; check_out?: string; worked_minutes: number; tardiness_minutes: number;
}
interface AttendanceLog {
  id: number; employee_id: number; type: string; recorded_at: string; method: string;
  notes?: string; is_correction?: boolean;
  employee?: { id: number; name: string };
}
interface Absence {
  id: number; employee_id: number; type: string; type_label?: string;
  start_date: string; end_date: string; days: number; status: string;
  reason?: string; document_number?: string; notes?: string;
  employee?: { id: number; name: string };
  approved_by_employee?: { name: string };
}

// ─── Schemas ──────────────────────────────────────────────────────────────────
const employeeSchema = z.object({
  name: z.string().min(2),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  position: z.string().optional(),
  department: z.string().optional(),
  hire_date: z.string().min(1, 'Fecha de inicio requerida'),
  salary: z.string().optional(),
  salary_type: z.enum(['monthly', 'hourly']).optional(),
});
type EmployeeForm = z.infer<typeof employeeSchema>;

const payrollSchema = z.object({
  employee_id: z.string().min(1),
  period_start: z.string().min(1),
  period_end: z.string().min(1),
});
type PayrollForm = z.infer<typeof payrollSchema>;

const vacationSchema = z.object({
  employee_id: z.string().min(1),
  start_date: z.string().min(1),
  end_date: z.string().min(1),
  reason: z.string().optional(),
});
type VacationForm = z.infer<typeof vacationSchema>;

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'outline'> = {
  active: 'default', inactive: 'secondary',
  draft: 'secondary', approved: 'default', paid: 'default',
  pending: 'secondary', rejected: 'outline',
};

const fmt = (n: number) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);

// ─── Add-on Paywall ───────────────────────────────────────────────────────────

function HRMAddonPaywall({ addonId }: { addonId: number | null }) {
  const requestMutation = useMutation({
    mutationFn: () => {
      if (!addonId) return Promise.reject(new Error('Add-on no disponible.'));
      return billingApi.requestAddon(addonId);
    },
    onSuccess: () => notify.success('Solicitud enviada. El equipo de Atlas ERP la procesará pronto.'),
    onError: (err: any) => notify.error(err?.response?.data?.message ?? 'Error al enviar la solicitud.'),
  });

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center px-4">
      <div className="size-20 rounded-full bg-blue-50 dark:bg-blue-950/30 flex items-center justify-center">
        <Lock className="size-9 text-blue-500" />
      </div>
      <div className="space-y-2 max-w-md">
        <h2 className="text-2xl font-bold tracking-tight">RRHH y Nómina</h2>
        <p className="text-muted-foreground">
          Este módulo es un <span className="font-semibold text-foreground">add-on de pago</span>.
          Incluye gestión de empleados, contratos, nómina electrónica DIAN, liquidaciones y vacaciones.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-lg text-left">
        {[
          'Empleados y contratos laborales',
          'Nómina electrónica DIAN',
          'Liquidaciones y prestaciones',
          'Vacaciones y ausencias',
          'Archivo PILA para seguridad social',
          'Exportación de nómina en Excel',
        ].map((feature) => (
          <div key={feature} className="flex items-center gap-2 text-sm">
            <CheckCircle className="size-4 text-green-500 shrink-0" />
            <span>{feature}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-col items-center gap-3">
        <div className="text-3xl font-bold">
          $30.000<span className="text-base font-normal text-muted-foreground">/mes</span>
        </div>
        <Button
          size="lg"
          className="gap-2 px-8"
          onClick={() => requestMutation.mutate()}
          disabled={!addonId || requestMutation.isPending || requestMutation.isSuccess}
        >
          <Zap className="size-4" />
          {requestMutation.isSuccess
            ? 'Solicitud enviada'
            : requestMutation.isPending
              ? 'Enviando solicitud…'
              : 'Solicitar add-on'}
        </Button>
        <p className="text-xs text-muted-foreground">
          Un asesor se comunicará contigo para activar el servicio.
        </p>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function HRMPage() {
  const params = useParams();
  const slug = params.slug as string;
  const qc = useQueryClient();
  const [tab, setTab] = useState<'employees' | 'payroll' | 'vacations' | 'liquidations' | 'attendance' | 'absences' | 'pila' | 'performance' | 'training' | 'schedules' | 'documents'>('employees');
  const [liqDialog, setLiqDialog]   = useState(false);
  const [liqEmployee, setLiqEmployee] = useState('');
  const [liqDate, setLiqDate]         = useState(new Date().toISOString().split('T')[0]);
  const [liqReason, setLiqReason]     = useState('resignation');
  const [liqPreview, setLiqPreview]   = useState<any>(null);
  const [liqLoading, setLiqLoading]   = useState(false);
  const [exportingPila, setExportingPila] = useState<number | null>(null);
  const [empDialog, setEmpDialog] = useState(false);
  const [payrollDialog, setPayrollDialog] = useState(false);
  const [vacDialog, setVacDialog] = useState(false);
  const [editEmp, setEditEmp] = useState<Employee | null>(null);
  const [search, setSearch] = useState('');

  // Fichajes
  const [attDate, setAttDate] = useState(new Date().toISOString().split('T')[0]);
  const [manualDialog, setManualDialog] = useState(false);
  const [manualEmpId, setManualEmpId] = useState('');
  const [manualType, setManualType] = useState('check_in');
  const [manualDate, setManualDate] = useState(new Date().toISOString().slice(0, 16));
  const [manualNotes, setManualNotes] = useState('');

  // Ausencias
  const [absenceDialog, setAbsenceDialog] = useState(false);
  const [absenceEmpId, setAbsenceEmpId] = useState('');
  const [absenceType, setAbsenceType] = useState('sick_leave');
  const [absenceFrom, setAbsenceFrom] = useState('');
  const [absenceTo, setAbsenceTo] = useState('');
  const [absenceReason, setAbsenceReason] = useState('');
  const [absenceDocNum, setAbsenceDocNum] = useState('');
  const [absenceNotes, setAbsenceNotes] = useState('');
  const [absenceStatusFilter, setAbsenceStatusFilter] = useState('');
  const [absenceTypeFilter, setAbsenceTypeFilter] = useState('');
  const [rejectDialog, setRejectDialog] = useState<{ id: number; name: string } | null>(null);
  const [rejectNotes, setRejectNotes] = useState('');

  // Jornadas
  const [scheduleDialog, setScheduleDialog] = useState(false);
  const [scheduleEmpId, setScheduleEmpId] = useState('');
  const [scheduleDay, setScheduleDay] = useState('monday');
  const [scheduleStart, setScheduleStart] = useState('08:00');
  const [scheduleEnd, setScheduleEnd] = useState('17:00');

  // Desempeño
  const [reviewDialog, setReviewDialog] = useState(false);
  const [reviewEmpId, setReviewEmpId] = useState('');
  const [reviewPeriod, setReviewPeriod] = useState('');
  const [reviewType, setReviewType] = useState('annual');
  const [managerReviewDialog, setManagerReviewDialog] = useState<any | null>(null);
  const [managerScore, setManagerScore] = useState('');
  const [managerFeedback, setManagerFeedback] = useState('');

  // Formación
  const [trainingDialog, setTrainingDialog] = useState(false);
  const [trainingTitle, setTrainingTitle] = useState('');
  const [trainingStart, setTrainingStart] = useState('');
  const [trainingEnd, setTrainingEnd] = useState('');
  const [trainingHours, setTrainingHours] = useState('');

  // PILA
  const [pilaGenDialog, setPilaGenDialog] = useState(false);
  const [pilaPayrollId, setPilaPayrollId] = useState('');
  const [downloadingPilaId, setDownloadingPilaId] = useState<number | null>(null);

  // Documentos empleado
  const [docEmpId, setDocEmpId] = useState<number | null>(null);
  const [docUploadDialog, setDocUploadDialog] = useState(false);
  const [docFile, setDocFile] = useState<File | null>(null);
  const [docCategory, setDocCategory] = useState('other');
  const [docTitle, setDocTitle] = useState('');
  const [docIssueDate, setDocIssueDate] = useState('');
  const [docExpiryDate, setDocExpiryDate] = useState('');
  const [docNotes, setDocNotes] = useState('');
  const [docSearch, setDocSearch] = useState('');

  useEffect(() => { setTenantSlug(slug); }, [slug]);

  // ─── Add-on gate ──────────────────────────────────────────────────────────
  const { data: billingData, isLoading: loadingAddon } = useQuery({
    queryKey: ['billing-addons', slug],
    queryFn: () => billingApi.addons().then((r) => r.data),
  });

  const hrmAddon = (billingData as any)?.available?.find((a: any) => a.module_key === 'hrm');
  const hasAddon = hrmAddon?.is_owned;

  // ─── Queries ──────────────────────────────────────────────────────────────
  const { data: employees = [], isLoading: loadingEmp } = useQuery<Employee[]>({
    queryKey: ['employees', slug],
    queryFn: async () => {
      const r = await hrmApi.employees();
      return (r.data as { data?: Employee[] }).data ?? (r.data as Employee[]) ?? [];
    },
  });

  const { data: payrolls = [], isLoading: loadingPay } = useQuery<Payroll[]>({
    queryKey: ['payrolls', slug],
    queryFn: async () => {
      const r = await hrmApi.payrolls();
      return (r.data as { data?: Payroll[] }).data ?? (r.data as Payroll[]) ?? [];
    },
    enabled: tab === 'payroll',
  });

  const { data: vacations = [], isLoading: loadingVac } = useQuery<Vacation[]>({
    queryKey: ['vacations', slug],
    queryFn: async () => {
      const r = await hrmApi.vacations();
      return (r.data as { data?: Vacation[] }).data ?? (r.data as Vacation[]) ?? [];
    },
    enabled: tab === 'vacations',
  });

  const { data: attSummary = [], isLoading: loadingAttSummary } = useQuery<AttendanceSummaryRow[]>({
    queryKey: ['attendance-summary', slug, attDate],
    queryFn: async () => {
      const r = await hrmApi.attendanceSummary(attDate);
      return (r.data as any)?.data ?? [];
    },
    enabled: tab === 'attendance',
    refetchInterval: 60000,
  });

  const { data: absenceList = [], isLoading: loadingAbsences } = useQuery<Absence[]>({
    queryKey: ['absences', slug, absenceStatusFilter, absenceTypeFilter],
    queryFn: async () => {
      const r = await hrmApi.absences({
        status: absenceStatusFilter || undefined,
        type:   absenceTypeFilter || undefined,
      });
      return (r.data as any)?.data ?? [];
    },
    enabled: tab === 'absences',
  });

  // ─── Jornadas ─────────────────────────────────────────────────────────────
  const { data: scheduleList = [], isLoading: loadingSchedules } = useQuery<any[]>({
    queryKey: ['work-schedules', slug],
    queryFn: async () => {
      const r = await hrmApi.schedules();
      return (r.data as any)?.data ?? [];
    },
    enabled: tab === 'schedules',
  });

  const createScheduleMut = useMutation({
    mutationFn: () => hrmApi.createSchedule({
      employee_id: Number(scheduleEmpId),
      day_of_week: scheduleDay,
      start_time: scheduleStart,
      end_time: scheduleEnd,
    }),
    onSuccess: () => {
      notify.success('Jornada creada');
      setScheduleDialog(false);
      qc.invalidateQueries({ queryKey: ['work-schedules', slug] });
    },
    onError: (e) => notify.error(e, 'Error'),
  });

  const deleteScheduleMut = useMutation({
    mutationFn: (id: number) => hrmApi.deleteSchedule(id),
    onSuccess: () => { notify.success('Jornada eliminada'); qc.invalidateQueries({ queryKey: ['work-schedules', slug] }); },
    onError: (e) => notify.error(e, 'Error'),
  });

  // ─── Desempeño ────────────────────────────────────────────────────────────
  const { data: reviews = [], isLoading: loadingReviews } = useQuery<any[]>({
    queryKey: ['performance-reviews', slug],
    queryFn: async () => {
      const r = await talentApi.reviews();
      return (r.data as any)?.data ?? [];
    },
    enabled: tab === 'performance',
  });

  const createReviewMut = useMutation({
    mutationFn: () => talentApi.createReview({ employee_id: Number(reviewEmpId), period: reviewPeriod, review_type: reviewType }),
    onSuccess: () => { notify.success('Evaluación creada'); setReviewDialog(false); qc.invalidateQueries({ queryKey: ['performance-reviews', slug] }); },
    onError: (e) => notify.error(e, 'Error'),
  });

  const managerReviewMut = useMutation({
    mutationFn: ({ id }: { id: number }) => talentApi.managerReview(id, { score: Number(managerScore), feedback: managerFeedback }),
    onSuccess: () => { notify.success('Evaluación del manager guardada'); setManagerReviewDialog(null); qc.invalidateQueries({ queryKey: ['performance-reviews', slug] }); },
    onError: (e) => notify.error(e, 'Error'),
  });

  const completeReviewMut = useMutation({
    mutationFn: (id: number) => talentApi.completeReview(id),
    onSuccess: () => { notify.success('Evaluación cerrada'); qc.invalidateQueries({ queryKey: ['performance-reviews', slug] }); },
    onError: (e) => notify.error(e, 'Error'),
  });

  // ─── Formación ────────────────────────────────────────────────────────────
  const { data: trainingList = [], isLoading: loadingTraining } = useQuery<any[]>({
    queryKey: ['training-plans', slug],
    queryFn: async () => {
      const r = await talentApi.training();
      return (r.data as any)?.data ?? [];
    },
    enabled: tab === 'training',
  });

  const createTrainingMut = useMutation({
    mutationFn: () => talentApi.createTraining({ title: trainingTitle, start_date: trainingStart, end_date: trainingEnd, hours: Number(trainingHours) }),
    onSuccess: () => {
      notify.success('Plan de formación creado'); setTrainingDialog(false);
      setTrainingTitle(''); setTrainingStart(''); setTrainingEnd(''); setTrainingHours('');
      qc.invalidateQueries({ queryKey: ['training-plans', slug] });
    },
    onError: (e) => notify.error(e, 'Error'),
  });

  // ─── PILA ─────────────────────────────────────────────────────────────────
  const { data: pilaList = [], isLoading: loadingPila } = useQuery<any[]>({
    queryKey: ['pila-liquidations', slug],
    queryFn: async () => {
      const r = await pilaApi.list();
      return (r.data as any)?.data ?? [];
    },
    enabled: tab === 'pila',
  });

  const pilaGenerateMut = useMutation({
    mutationFn: (payrollId: number) => pilaApi.generate(payrollId),
    onSuccess: () => {
      notify.success('Archivo PILA generado');
      setPilaGenDialog(false); setPilaPayrollId('');
      qc.invalidateQueries({ queryKey: ['pila-liquidations', slug] });
    },
    onError: (e) => notify.error(e, 'Error al generar PILA'),
  });

  const pilaSubmitMut = useMutation({
    mutationFn: (id: number) => pilaApi.submit(id),
    onSuccess: () => { notify.success('PILA marcada como enviada'); qc.invalidateQueries({ queryKey: ['pila-liquidations', slug] }); },
    onError: (e) => notify.error(e, 'Error'),
  });

  const pilaConfirmMut = useMutation({
    mutationFn: (id: number) => pilaApi.confirm(id),
    onSuccess: () => { notify.success('PILA confirmada (pagada)'); qc.invalidateQueries({ queryKey: ['pila-liquidations', slug] }); },
    onError: (e) => notify.error(e, 'Error'),
  });

  const pilaDeleteMut = useMutation({
    mutationFn: (id: number) => pilaApi.destroy(id),
    onSuccess: () => { notify.success('PILA eliminada'); qc.invalidateQueries({ queryKey: ['pila-liquidations', slug] }); },
    onError: (e) => notify.error(e, 'Error'),
  });

  // ─── Documentos empleado ──────────────────────────────────────────────────
  const { data: employeeDocs = [], isLoading: loadingDocs } = useQuery<any[]>({
    queryKey: ['employee-docs', slug, docEmpId],
    queryFn: async () => {
      if (!docEmpId) return [];
      const r = await hrmApi.employeeDocuments(docEmpId);
      return (r.data as any)?.data ?? [];
    },
    enabled: tab === 'documents' && !!docEmpId,
  });

  const { data: expiringDocs = [] } = useQuery<any[]>({
    queryKey: ['expiring-docs', slug],
    queryFn: async () => {
      const r = await hrmApi.expiringDocuments(30);
      return (r.data as any)?.data ?? [];
    },
    enabled: tab === 'documents',
  });

  const uploadDocMut = useMutation({
    mutationFn: () => {
      if (!docEmpId || !docFile) throw new Error('Faltan datos');
      const fd = new FormData();
      fd.append('file', docFile);
      fd.append('category', docCategory);
      fd.append('title', docTitle);
      if (docIssueDate)  fd.append('issue_date', docIssueDate);
      if (docExpiryDate) fd.append('expiry_date', docExpiryDate);
      if (docNotes)      fd.append('notes', docNotes);
      return hrmApi.uploadEmployeeDocument(docEmpId, fd);
    },
    onSuccess: () => {
      notify.success('Documento cargado');
      setDocUploadDialog(false);
      setDocFile(null); setDocTitle(''); setDocNotes(''); setDocIssueDate(''); setDocExpiryDate('');
      qc.invalidateQueries({ queryKey: ['employee-docs', slug, docEmpId] });
      qc.invalidateQueries({ queryKey: ['expiring-docs', slug] });
    },
    onError: (e) => notify.error(e, 'Error al cargar'),
  });

  const archiveDocMut = useMutation({
    mutationFn: ({ docId }: { docId: number }) => hrmApi.archiveEmployeeDocument(docEmpId!, docId),
    onSuccess: () => { notify.success('Documento archivado'); qc.invalidateQueries({ queryKey: ['employee-docs', slug, docEmpId] }); },
    onError: (e) => notify.error(e, 'Error'),
  });

  async function downloadDocument(docId: number, fileName: string) {
    try {
      const r = await hrmApi.getEmployeeDocument(docEmpId!, docId);
      const doc = r.data as any;
      const fileData: string = doc.file_data ?? '';
      if (!fileData) { notify.error('Sin datos de archivo'); return; }
      const a = document.createElement('a');
      a.href = fileData;
      a.download = fileName || `documento_${docId}`;
      a.click();
    } catch { notify.error('Error al descargar'); }
  }

  async function downloadPilaFile(id: number, ref: string) {
    setDownloadingPilaId(id);
    try {
      const r = await pilaApi.download(id);
      const url = URL.createObjectURL(r.data as Blob);
      const a = document.createElement('a'); a.href = url; a.download = `PILA_${ref}.csv`; a.click();
      URL.revokeObjectURL(url);
    } catch { notify.error('Error al descargar PILA'); }
    finally { setDownloadingPilaId(null); }
  }

  // ─── Forms ────────────────────────────────────────────────────────────────
  const empForm = useForm<EmployeeForm>({ resolver: zodResolver(employeeSchema) });
  const payForm = useForm<PayrollForm>({ resolver: zodResolver(payrollSchema) });
  const vacForm = useForm<VacationForm>({ resolver: zodResolver(vacationSchema) });

  useEffect(() => {
    if (editEmp) {
      empForm.reset({
        name: editEmp.name, email: editEmp.email ?? '',
        phone: editEmp.phone ?? '', position: editEmp.position ?? '',
        department: editEmp.department ?? '', hire_date: editEmp.hire_date ?? '',
      });
    } else {
      empForm.reset({ name: '', email: '', phone: '', position: '', department: '', hire_date: '' });
    }
  }, [editEmp, empForm]);

  const saveEmployee = useMutation({
    mutationFn: (d: EmployeeForm) => {
      const payload = { ...d, salary: d.salary ? Number(d.salary) : undefined };
      return editEmp ? hrmApi.updateEmployee(editEmp.id, payload) : hrmApi.createEmployee(payload);
    },
    onSuccess: () => {
      notify.success(editEmp ? 'Empleado actualizado' : 'Empleado creado');
      setEmpDialog(false); setEditEmp(null);
      qc.invalidateQueries({ queryKey: ['employees', slug] });
    },
    onError: (err) => notify.error(err, 'Error al guardar'),
  });

  const generatePayroll = useMutation({
    mutationFn: (d: PayrollForm) => hrmApi.generatePayroll({
      employee_id: Number(d.employee_id),
      period_start: d.period_start,
      period_end: d.period_end,
    }),
    onSuccess: () => {
      notify.success('Nómina generada');
      setPayrollDialog(false); payForm.reset();
      qc.invalidateQueries({ queryKey: ['payrolls', slug] });
    },
    onError: (err) => notify.error(err, 'Error al generar nómina'),
  });

  const approvePayroll = useMutation({
    mutationFn: (id: number) => hrmApi.approvePayroll(id),
    onSuccess: () => { notify.success('Nómina aprobada'); qc.invalidateQueries({ queryKey: ['payrolls', slug] }); },
    onError: (err) => notify.error(err, 'Error al aprobar'),
  });

  const createVacation = useMutation({
    mutationFn: (d: VacationForm) => hrmApi.createVacation({ ...d, employee_id: Number(d.employee_id) }),
    onSuccess: () => {
      notify.success('Solicitud de vacaciones creada');
      setVacDialog(false); vacForm.reset();
      qc.invalidateQueries({ queryKey: ['vacations', slug] });
    },
    onError: (err) => notify.error(err, 'Error al crear solicitud'),
  });

  const approveVacation = useMutation({
    mutationFn: (id: number) => hrmApi.approveVacation(id),
    onSuccess: () => { notify.success('Vacaciones aprobadas'); qc.invalidateQueries({ queryKey: ['vacations', slug] }); },
    onError: (err) => notify.error(err, 'Error al aprobar'),
  });

  // ─── Attendance mutations ──────────────────────────────────────────────────
  const checkInMut  = useMutation({ mutationFn: (eid: number) => hrmApi.checkIn({ employee_id: eid }), onSuccess: () => { notify.success('Entrada registrada'); qc.invalidateQueries({ queryKey: ['attendance-summary', slug, attDate] }); }, onError: (e) => notify.error(e, 'Error') });
  const checkOutMut = useMutation({ mutationFn: (eid: number) => hrmApi.checkOut({ employee_id: eid }), onSuccess: () => { notify.success('Salida registrada'); qc.invalidateQueries({ queryKey: ['attendance-summary', slug, attDate] }); }, onError: (e) => notify.error(e, 'Error') });
  const breakStMut  = useMutation({ mutationFn: (eid: number) => hrmApi.breakStart({ employee_id: eid }), onSuccess: () => { notify.success('Pausa iniciada'); qc.invalidateQueries({ queryKey: ['attendance-summary', slug, attDate] }); }, onError: (e) => notify.error(e, 'Error') });
  const breakEndMut = useMutation({ mutationFn: (eid: number) => hrmApi.breakEnd({ employee_id: eid }), onSuccess: () => { notify.success('Pausa finalizada'); qc.invalidateQueries({ queryKey: ['attendance-summary', slug, attDate] }); }, onError: (e) => notify.error(e, 'Error') });

  const manualAttMut = useMutation({
    mutationFn: () => hrmApi.attendanceManual({ employee_id: Number(manualEmpId), type: manualType, recorded_at: manualDate, notes: manualNotes }),
    onSuccess: () => { notify.success('Fichaje manual registrado'); setManualDialog(false); setManualEmpId(''); setManualNotes(''); qc.invalidateQueries({ queryKey: ['attendance-summary', slug, attDate] }); },
    onError: (e) => notify.error(e, 'Error'),
  });

  // ─── Absence mutations ────────────────────────────────────────────────────
  const createAbsenceMut = useMutation({
    mutationFn: () => hrmApi.createAbsence({ employee_id: Number(absenceEmpId), type: absenceType, start_date: absenceFrom, end_date: absenceTo, reason: absenceReason, document_number: absenceDocNum, notes: absenceNotes }),
    onSuccess: () => {
      notify.success('Ausencia registrada'); setAbsenceDialog(false);
      setAbsenceEmpId(''); setAbsenceFrom(''); setAbsenceTo(''); setAbsenceReason(''); setAbsenceDocNum(''); setAbsenceNotes('');
      qc.invalidateQueries({ queryKey: ['absences', slug] });
    },
    onError: (e) => notify.error(e, 'Error'),
  });

  const approveAbsenceMut = useMutation({
    mutationFn: (id: number) => hrmApi.approveAbsence(id),
    onSuccess: () => { notify.success('Ausencia aprobada'); qc.invalidateQueries({ queryKey: ['absences', slug] }); },
    onError: (e) => notify.error(e, 'Error'),
  });

  const rejectAbsenceMut = useMutation({
    mutationFn: ({ id, notes }: { id: number; notes?: string }) => hrmApi.rejectAbsence(id, { notes }),
    onSuccess: () => { notify.success('Ausencia rechazada'); setRejectDialog(null); setRejectNotes(''); qc.invalidateQueries({ queryKey: ['absences', slug] }); },
    onError: (e) => notify.error(e, 'Error'),
  });

  const deleteAbsenceMut = useMutation({
    mutationFn: (id: number) => hrmApi.deleteAbsence(id),
    onSuccess: () => { notify.success('Ausencia eliminada'); qc.invalidateQueries({ queryKey: ['absences', slug] }); },
    onError: (e) => notify.error(e, 'Error'),
  });

  // ─── Liquidations ─────────────────────────────────────────────────────────
  const { data: liquidations = [], isLoading: loadingLiq } = useQuery<any[]>({
    queryKey: ['liquidations', slug],
    queryFn: async () => {
      const r = await hrmApi.liquidations();
      return (r.data as any)?.data ?? (r.data as any[]) ?? [];
    },
    enabled: tab === 'liquidations',
  });

  const createLiquidation = useMutation({
    mutationFn: () => hrmApi.createLiquidation({
      employee_id:        Number(liqEmployee),
      termination_date:   liqDate,
      termination_reason: liqReason,
    }),
    onSuccess: () => {
      notify.success('Liquidación registrada');
      qc.invalidateQueries({ queryKey: ['liquidations', slug] });
      qc.invalidateQueries({ queryKey: ['employees', slug] });
      setLiqDialog(false); setLiqPreview(null);
    },
    onError: (e) => notify.error(e, 'Error'),
  });

  async function previewLiquidation() {
    if (!liqEmployee) return;
    setLiqLoading(true);
    try {
      const r = await hrmApi.previewLiquidation({
        employee_id: Number(liqEmployee), termination_date: liqDate, termination_reason: liqReason,
      });
      setLiqPreview((r.data as any)?.calculation);
    } catch (e: any) {
      notify.error(e, 'Error al calcular');
    } finally { setLiqLoading(false); }
  }

  async function downloadPila(id: number, name: string) {
    setExportingPila(id);
    try {
      const r = await hrmApi.pilaExport(id);
      const url = URL.createObjectURL(r.data as Blob);
      const a = document.createElement('a'); a.href = url; a.download = `PILA_${name}.csv`; a.click();
      URL.revokeObjectURL(url);
    } catch { notify.error('Error al exportar PILA'); }
    finally { setExportingPila(null); }
  }

  async function downloadDianXml(id: number, name: string) {
    try {
      const r = await hrmApi.payrollDianXml(id);
      const xmlContent: string = (r.data as { xml_content?: string }).xml_content ?? '';
      const blob = new Blob([xmlContent], { type: 'application/xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `NE_DIAN_${name}.xml`; a.click();
      URL.revokeObjectURL(url);
      notify.success('XML de nómina electrónica generado.');
    } catch { notify.error('Error al generar XML DIAN.'); }
  }

  // ── NE-DIAN mejorada ──
  const [neDialogPayrollId, setNeDialogPayrollId] = useState<number | null>(null);
  const [neDocsData, setNeDocsData] = useState<{
    docs: { id: number; employee_name: string; document_number: string; status: string; cune: string | null; devengados_total: number; deducciones_total: number; total_comprobante: number }[];
    stats: { total: number; generated: number; sent: number; accepted: number; rejected: number };
  } | null>(null);
  const [generatingNe, setGeneratingNe] = useState(false);

  async function openNeDocs(payrollId: number) {
    setNeDialogPayrollId(payrollId);
    try {
      const r = await hrmApi.neDocs(payrollId);
      setNeDocsData(r.data as typeof neDocsData);
    } catch { setNeDocsData(null); }
  }

  async function handleGenerateNeDocs(payrollId: number) {
    setGeneratingNe(true);
    try {
      await hrmApi.generateNeDocs(payrollId);
      notify.success('Documentos NE-DIAN generados');
      const r = await hrmApi.neDocs(payrollId);
      setNeDocsData(r.data as typeof neDocsData);
    } catch { notify.error('Error al generar documentos NE-DIAN'); }
    finally { setGeneratingNe(false); }
  }

  async function downloadNeDocXml(payrollId: number, docId: number, docNumber: string) {
    try {
      const r = await hrmApi.neDocXml(payrollId, docId);
      const blob = new Blob([r.data as BlobPart], { type: 'application/xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `NE_${docNumber}.xml`; a.click();
      URL.revokeObjectURL(url);
    } catch { notify.error('Error al descargar XML'); }
  }

  async function downloadPayrollCsv(id: number, name: string) {
    try {
      const r = await hrmApi.exportPayrollCsv(id);
      const url = URL.createObjectURL(r.data as Blob);
      const a = document.createElement('a'); a.href = url; a.download = `nomina_${name}.csv`; a.click();
      URL.revokeObjectURL(url);
    } catch { notify.error('Error al exportar'); }
  }

  const filteredEmps = employees.filter((e) =>
    e.name.toLowerCase().includes(search.toLowerCase()) ||
    (e.position ?? '').toLowerCase().includes(search.toLowerCase())
  );

  const TABS = [
    { key: 'employees',    label: 'Empleados',    icon: Users },
    { key: 'payroll',      label: 'Nómina',        icon: FileText },
    { key: 'vacations',    label: 'Vacaciones',    icon: Calendar },
    { key: 'liquidations', label: 'Liquidaciones', icon: AlertTriangle },
    { key: 'attendance',   label: 'Fichajes',      icon: Clock },
    { key: 'absences',     label: 'Ausencias',     icon: BriefcaseMedical },
    { key: 'pila',         label: 'PILA',          icon: FileSpreadsheet },
    { key: 'schedules',    label: 'Jornadas',      icon: CalendarDays },
    { key: 'performance',  label: 'Desempeño',     icon: Star },
    { key: 'training',     label: 'Formación',     icon: GraduationCap },
    { key: 'documents',    label: 'Documentos',    icon: FolderOpen },
  ] as const;

  if (loadingAddon) {
    return (
      <div className="flex flex-col gap-4 p-6">
        <div className="h-8 w-64 bg-muted animate-pulse rounded" />
        <div className="h-48 bg-muted animate-pulse rounded-lg" />
      </div>
    );
  }

  if (!hasAddon) {
    return <HRMAddonPaywall addonId={hrmAddon?.id ?? null} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Recursos Humanos</h1>
          <p className="text-muted-foreground text-sm">Empleados, nómina y vacaciones</p>
        </div>
        <div className="flex gap-2">
          {tab === 'employees' && (
            <Button onClick={() => { setEditEmp(null); setEmpDialog(true); }} className="gap-2">
              <Plus className="size-4" />Nuevo empleado
            </Button>
          )}
          {tab === 'payroll' && (
            <Button onClick={() => setPayrollDialog(true)} className="gap-2">
              <Plus className="size-4" />Generar nómina
            </Button>
          )}
          {tab === 'vacations' && (
            <Button onClick={() => setVacDialog(true)} className="gap-2">
              <Plus className="size-4" />Solicitar vacaciones
            </Button>
          )}
          {tab === 'attendance' && (
            <Button onClick={() => { setManualEmpId(''); setManualNotes(''); setManualDialog(true); }} variant="outline" className="gap-2">
              <Plus className="size-4" />Fichaje manual
            </Button>
          )}
          {tab === 'absences' && (
            <Button onClick={() => { setAbsenceEmpId(''); setAbsenceFrom(''); setAbsenceTo(''); setAbsenceReason(''); setAbsenceDocNum(''); setAbsenceNotes(''); setAbsenceDialog(true); }} className="gap-2">
              <Plus className="size-4" />Nueva ausencia
            </Button>
          )}
          {tab === 'pila' && (
            <Button onClick={() => { setPilaPayrollId(''); setPilaGenDialog(true); }} className="gap-2">
              <Plus className="size-4" />Generar PILA
            </Button>
          )}
          {tab === 'schedules' && (
            <Button onClick={() => { setScheduleEmpId(''); setScheduleDialog(true); }} className="gap-2">
              <Plus className="size-4" />Nueva jornada
            </Button>
          )}
          {tab === 'performance' && (
            <Button onClick={() => { setReviewEmpId(''); setReviewPeriod(''); setReviewDialog(true); }} className="gap-2">
              <Plus className="size-4" />Nueva evaluación
            </Button>
          )}
          {tab === 'training' && (
            <Button onClick={() => setTrainingDialog(true)} className="gap-2">
              <Plus className="size-4" />Nuevo plan
            </Button>
          )}
          {tab === 'documents' && docEmpId && (
            <Button onClick={() => { setDocFile(null); setDocTitle(''); setDocNotes(''); setDocIssueDate(''); setDocExpiryDate(''); setDocUploadDialog(true); }} className="gap-2">
              <Upload className="size-4" />Cargar documento
            </Button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Empleados activos', value: employees.filter((e) => e.status !== 'inactive').length, icon: Users },
          { label: 'Nóminas del mes', value: payrolls.length, icon: FileText },
          { label: 'Vacaciones pendientes', value: vacations.filter((v) => v.status === 'pending').length, icon: Calendar },
        ].map(({ label, value, icon: Icon }) => (
          <Card key={label}>
            <CardContent className="py-4 flex items-center gap-3">
              <Icon className="size-8 text-primary" />
              <div>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-2xl font-bold">{value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-0.5 p-1 rounded-lg bg-muted w-fit flex-wrap">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              tab === key ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}>
            <Icon className="size-3.5" />{label}
          </button>
        ))}
      </div>

      {/* Empleados */}
      {tab === 'employees' && (
        <div className="space-y-4">
          <div className="relative max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input placeholder="Buscar..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {loadingEmp
              ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-lg" />)
              : filteredEmps.map((emp) => (
                  <Card key={emp.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="pt-4">
                      <div className="flex items-start justify-between mb-2">
                        <div className="size-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                          {emp.name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()}
                        </div>
                        <Badge variant={STATUS_VARIANT[emp.status ?? 'active'] ?? 'default'}>
                          {emp.status === 'inactive' ? 'Inactivo' : 'Activo'}
                        </Badge>
                      </div>
                      <p className="font-semibold">{emp.name}</p>
                      {emp.code && <p className="text-xs font-mono text-muted-foreground">{emp.code}</p>}
                      <p className="text-xs text-muted-foreground">{emp.position ?? '—'}</p>
                      {emp.department && <p className="text-xs text-muted-foreground">{emp.department}</p>}
                      <Button variant="ghost" size="sm" className="mt-2 gap-1 w-full"
                        onClick={() => { setEditEmp(emp); setEmpDialog(true); }}>
                        <Pencil className="size-3" />Editar
                      </Button>
                    </CardContent>
                  </Card>
                ))}
            {!loadingEmp && filteredEmps.length === 0 && (
              <div className="col-span-3 text-center py-12 text-muted-foreground">
                <UserCog className="size-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No hay empleados registrados</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Nómina */}
      {tab === 'payroll' && (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Empleado</th>
                  <th className="text-left px-4 py-3 font-medium">Período</th>
                  <th className="text-right px-4 py-3 font-medium">Pago neto</th>
                  <th className="text-left px-4 py-3 font-medium">Estado</th>
                  <th className="text-left px-4 py-3 font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {loadingPay
                  ? Array.from({ length: 3 }).map((_, i) => (
                      <tr key={i}>{Array.from({ length: 5 }).map((__, j) => (
                        <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-20" /></td>
                      ))}</tr>
                    ))
                  : payrolls.map((p) => (
                      <tr key={p.id} className="hover:bg-muted/30">
                        <td className="px-4 py-3 font-medium">{p.employee?.name ?? '—'}</td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">
                          {new Date(p.period_start).toLocaleDateString('es-CO')} –{' '}
                          {new Date(p.period_end).toLocaleDateString('es-CO')}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold">{fmt(p.net_pay)}</td>
                        <td className="px-4 py-3">
                          <Badge variant={STATUS_VARIANT[p.status] ?? 'outline'}>
                            {p.status === 'draft' ? 'Borrador' : p.status === 'approved' ? 'Aprobada' : p.status === 'paid' ? 'Pagada' : p.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1 flex-wrap">
                            {p.status === 'draft' && (
                              <Button variant="outline" size="sm" className="gap-1 h-7 text-xs"
                                onClick={() => approvePayroll.mutate(p.id)} disabled={approvePayroll.isPending}>
                                <CheckCircle className="size-3" />Aprobar
                              </Button>
                            )}
                            <Button variant="ghost" size="sm" className="gap-1 h-7 text-xs"
                              onClick={() => downloadPayrollCsv(p.id, String(p.id))}>
                              <Download className="size-3" />CSV
                            </Button>
                            {p.status !== 'draft' && (
                              <Button variant="ghost" size="sm" className="gap-1 h-7 text-xs text-blue-700"
                                disabled={exportingPila === p.id}
                                onClick={() => downloadPila(p.id, String(p.id))}>
                                <Download className="size-3" />PILA
                              </Button>
                            )}
                            {p.status === 'paid' && (
                              <Button variant="ghost" size="sm" className="gap-1 h-7 text-xs text-emerald-700"
                                onClick={() => openNeDocs(p.id)}>
                                <Download className="size-3" />NE-DIAN
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                {!loadingPay && payrolls.length === 0 && (
                  <tr><td colSpan={5} className="text-center py-8 text-muted-foreground text-sm">Sin nóminas generadas</td></tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Vacaciones */}
      {tab === 'vacations' && (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Empleado</th>
                  <th className="text-left px-4 py-3 font-medium">Desde</th>
                  <th className="text-left px-4 py-3 font-medium">Hasta</th>
                  <th className="text-left px-4 py-3 font-medium">Días</th>
                  <th className="text-left px-4 py-3 font-medium">Estado</th>
                  <th className="text-left px-4 py-3 font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {loadingVac
                  ? Array.from({ length: 3 }).map((_, i) => (
                      <tr key={i}>{Array.from({ length: 6 }).map((__, j) => (
                        <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-16" /></td>
                      ))}</tr>
                    ))
                  : vacations.map((v) => (
                      <tr key={v.id} className="hover:bg-muted/30">
                        <td className="px-4 py-3 font-medium">{v.employee?.name ?? '—'}</td>
                        <td className="px-4 py-3">{new Date(v.start_date).toLocaleDateString('es-CO')}</td>
                        <td className="px-4 py-3">{new Date(v.end_date).toLocaleDateString('es-CO')}</td>
                        <td className="px-4 py-3">{v.days ?? '—'}</td>
                        <td className="px-4 py-3">
                          <Badge variant={STATUS_VARIANT[v.status] ?? 'outline'}>
                            {v.status === 'pending' ? 'Pendiente' : v.status === 'approved' ? 'Aprobada' : v.status === 'rejected' ? 'Rechazada' : v.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          {v.status === 'pending' && (
                            <Button variant="outline" size="sm" className="gap-1"
                              onClick={() => approveVacation.mutate(v.id)} disabled={approveVacation.isPending}>
                              <CheckCircle className="size-3" />Aprobar
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                {!loadingVac && vacations.length === 0 && (
                  <tr><td colSpan={6} className="text-center py-8 text-muted-foreground text-sm">Sin solicitudes de vacaciones</td></tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* ── Liquidaciones ── */}
      {tab === 'liquidations' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button size="sm" className="gap-2" onClick={() => { setLiqDialog(true); setLiqPreview(null); }}>
              <Plus className="size-4" />Nueva liquidación
            </Button>
          </div>
          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead className="bg-muted/50"><tr>
                  <th className="text-left px-4 py-3 font-medium">No.</th>
                  <th className="text-left px-4 py-3 font-medium">Empleado</th>
                  <th className="text-left px-4 py-3 font-medium">Fecha retiro</th>
                  <th className="text-left px-4 py-3 font-medium">Motivo</th>
                  <th className="text-right px-4 py-3 font-medium">Neto a pagar</th>
                  <th className="text-left px-4 py-3 font-medium">Estado</th>
                </tr></thead>
                <tbody className="divide-y">
                  {loadingLiq
                    ? Array.from({ length: 3 }).map((_, i) => <tr key={i}>{Array.from({ length: 6 }).map((_, j) => <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-20" /></td>)}</tr>)
                    : liquidations.map((l: any) => (
                        <tr key={l.id} className="hover:bg-muted/30">
                          <td className="px-4 py-3 font-mono text-xs">{l.liquidation_number}</td>
                          <td className="px-4 py-3 font-medium">{l.employee?.full_name ?? '—'}</td>
                          <td className="px-4 py-3 text-xs">{new Date(l.termination_date).toLocaleDateString('es-CO')}</td>
                          <td className="px-4 py-3 text-xs text-muted-foreground capitalize">{l.termination_reason?.replace('_', ' ')}</td>
                          <td className="px-4 py-3 text-right font-semibold">{fmt(l.net_liquidation)}</td>
                          <td className="px-4 py-3"><Badge variant={STATUS_VARIANT[l.status] ?? 'secondary'}>{l.status === 'draft' ? 'Borrador' : l.status === 'confirmed' ? 'Confirmada' : 'Pagada'}</Badge></td>
                        </tr>
                      ))}
                  {!loadingLiq && liquidations.length === 0 && (
                    <tr><td colSpan={6} className="text-center py-8 text-muted-foreground text-sm">Sin liquidaciones registradas</td></tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Fichajes ── */}
      {tab === 'attendance' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Label className="text-sm font-medium">Fecha:</Label>
            <Input type="date" value={attDate} onChange={(e) => setAttDate(e.target.value)} className="w-44" />
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Resumen del día — {new Date(attDate + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium">Empleado</th>
                    <th className="text-left px-4 py-3 font-medium">Estado</th>
                    <th className="text-left px-4 py-3 font-medium">Entrada</th>
                    <th className="text-left px-4 py-3 font-medium">Salida</th>
                    <th className="text-left px-4 py-3 font-medium">Horas</th>
                    <th className="text-left px-4 py-3 font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {loadingAttSummary
                    ? Array.from({ length: 4 }).map((_, i) => <tr key={i}>{Array.from({ length: 6 }).map((__, j) => <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-20" /></td>)}</tr>)
                    : attSummary.map((row) => {
                        const statusMap: Record<string, { label: string; color: string }> = {
                          present:  { label: 'Presente',  color: 'text-green-600' },
                          on_break: { label: 'En pausa',  color: 'text-yellow-600' },
                          left:     { label: 'Salió',     color: 'text-blue-600' },
                          absent:   { label: 'Ausente',   color: 'text-muted-foreground' },
                        };
                        const s = statusMap[row.status] ?? { label: row.status, color: '' };
                        const workedH = Math.floor(row.worked_minutes / 60);
                        const workedM = row.worked_minutes % 60;
                        return (
                          <tr key={row.employee_id} className="hover:bg-muted/30">
                            <td className="px-4 py-3 font-medium">{row.employee_name}</td>
                            <td className={`px-4 py-3 font-medium ${s.color}`}>{s.label}</td>
                            <td className="px-4 py-3 text-xs text-muted-foreground">{row.check_in ? new Date(row.check_in).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                            <td className="px-4 py-3 text-xs text-muted-foreground">{row.check_out ? new Date(row.check_out).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                            <td className="px-4 py-3 text-xs">{row.worked_minutes > 0 ? `${workedH}h ${workedM}m` : '—'}</td>
                            <td className="px-4 py-3">
                              <div className="flex gap-1 flex-wrap">
                                {row.status === 'absent' && (
                                  <Button size="sm" variant="outline" className="gap-1 h-7 text-xs text-green-700"
                                    onClick={() => checkInMut.mutate(row.employee_id)} disabled={checkInMut.isPending}>
                                    <LogIn className="size-3" />Entrada
                                  </Button>
                                )}
                                {row.status === 'present' && (<>
                                  <Button size="sm" variant="outline" className="gap-1 h-7 text-xs text-yellow-700"
                                    onClick={() => breakStMut.mutate(row.employee_id)} disabled={breakStMut.isPending}>
                                    <Coffee className="size-3" />Pausa
                                  </Button>
                                  <Button size="sm" variant="outline" className="gap-1 h-7 text-xs text-blue-700"
                                    onClick={() => checkOutMut.mutate(row.employee_id)} disabled={checkOutMut.isPending}>
                                    <LogOut className="size-3" />Salida
                                  </Button>
                                </>)}
                                {row.status === 'on_break' && (
                                  <Button size="sm" variant="outline" className="gap-1 h-7 text-xs text-green-700"
                                    onClick={() => breakEndMut.mutate(row.employee_id)} disabled={breakEndMut.isPending}>
                                    <LogIn className="size-3" />Reanudar
                                  </Button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                  {!loadingAttSummary && attSummary.length === 0 && (
                    <tr><td colSpan={6} className="text-center py-8 text-muted-foreground text-sm"><Clock className="size-8 mx-auto mb-2 opacity-30" /><p>Sin datos de asistencia para este día</p></td></tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>

          {/* Stats row */}
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: 'Presentes', value: attSummary.filter((r) => r.status === 'present' || r.status === 'on_break').length, color: 'text-green-600' },
              { label: 'Salieron',  value: attSummary.filter((r) => r.status === 'left').length,    color: 'text-blue-600' },
              { label: 'Ausentes',  value: attSummary.filter((r) => r.status === 'absent').length,  color: 'text-muted-foreground' },
              { label: 'En pausa',  value: attSummary.filter((r) => r.status === 'on_break').length, color: 'text-yellow-600' },
            ].map(({ label, value, color }) => (
              <Card key={label}>
                <CardContent className="py-3 text-center">
                  <p className={`text-2xl font-bold ${color}`}>{value}</p>
                  <p className="text-xs text-muted-foreground">{label}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* ── Ausencias ── */}
      {tab === 'absences' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex gap-2 flex-wrap">
            <Select value={absenceStatusFilter} onValueChange={(v) => setAbsenceStatusFilter(!v || v === '_all' ? '' : v)}>
              <SelectTrigger className="w-40"><SelectValue placeholder="Estado" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">Todos los estados</SelectItem>
                <SelectItem value="pending">Pendiente</SelectItem>
                <SelectItem value="approved">Aprobada</SelectItem>
                <SelectItem value="rejected">Rechazada</SelectItem>
              </SelectContent>
            </Select>
            <Select value={absenceTypeFilter} onValueChange={(v) => setAbsenceTypeFilter(!v || v === '_all' ? '' : v)}>
              <SelectTrigger className="w-48"><SelectValue placeholder="Tipo de ausencia" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">Todos los tipos</SelectItem>
                <SelectItem value="sick_leave">Incapacidad enfermedad</SelectItem>
                <SelectItem value="accident">Accidente laboral</SelectItem>
                <SelectItem value="permission">Permiso</SelectItem>
                <SelectItem value="unpaid_leave">Licencia no remunerada</SelectItem>
                <SelectItem value="maternity">Licencia maternidad</SelectItem>
                <SelectItem value="paternity">Licencia paternidad</SelectItem>
                <SelectItem value="bereavement">Licencia luto</SelectItem>
                <SelectItem value="vacation">Vacaciones</SelectItem>
                <SelectItem value="other">Otro</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium">Empleado</th>
                    <th className="text-left px-4 py-3 font-medium">Tipo</th>
                    <th className="text-left px-4 py-3 font-medium">Desde</th>
                    <th className="text-left px-4 py-3 font-medium">Hasta</th>
                    <th className="text-left px-4 py-3 font-medium">Días</th>
                    <th className="text-left px-4 py-3 font-medium">Estado</th>
                    <th className="text-left px-4 py-3 font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {loadingAbsences
                    ? Array.from({ length: 3 }).map((_, i) => <tr key={i}>{Array.from({ length: 7 }).map((__, j) => <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-16" /></td>)}</tr>)
                    : absenceList.map((ab) => (
                        <tr key={ab.id} className="hover:bg-muted/30">
                          <td className="px-4 py-3 font-medium">{ab.employee?.name ?? '—'}</td>
                          <td className="px-4 py-3 text-xs">{ab.type_label ?? ab.type}</td>
                          <td className="px-4 py-3 text-xs">{new Date(ab.start_date).toLocaleDateString('es-CO')}</td>
                          <td className="px-4 py-3 text-xs">{new Date(ab.end_date).toLocaleDateString('es-CO')}</td>
                          <td className="px-4 py-3 text-center">{ab.days}</td>
                          <td className="px-4 py-3">
                            <Badge variant={STATUS_VARIANT[ab.status] ?? 'outline'}>
                              {ab.status === 'pending' ? 'Pendiente' : ab.status === 'approved' ? 'Aprobada' : ab.status === 'rejected' ? 'Rechazada' : ab.status}
                            </Badge>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex gap-1 flex-wrap">
                              {ab.status === 'pending' && (<>
                                <Button size="sm" variant="outline" className="gap-1 h-7 text-xs text-green-700"
                                  onClick={() => approveAbsenceMut.mutate(ab.id)} disabled={approveAbsenceMut.isPending}>
                                  <CheckCircle className="size-3" />Aprobar
                                </Button>
                                <Button size="sm" variant="outline" className="gap-1 h-7 text-xs text-destructive"
                                  onClick={() => { setRejectDialog({ id: ab.id, name: ab.employee?.name ?? '' }); setRejectNotes(''); }}>
                                  <X className="size-3" />Rechazar
                                </Button>
                              </>)}
                              {ab.status !== 'approved' && (
                                <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground"
                                  onClick={() => { if (confirm('¿Eliminar ausencia?')) deleteAbsenceMut.mutate(ab.id); }}
                                  disabled={deleteAbsenceMut.isPending}>
                                  Eliminar
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                  {!loadingAbsences && absenceList.length === 0 && (
                    <tr><td colSpan={7} className="text-center py-8 text-muted-foreground text-sm"><ClipboardList className="size-8 mx-auto mb-2 opacity-30" /><p>Sin ausencias registradas</p></td></tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── PILA ── */}
      {tab === 'pila' && (
        <div className="space-y-4">
          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium">Referencia</th>
                    <th className="text-left px-4 py-3 font-medium">Período</th>
                    <th className="text-right px-4 py-3 font-medium">Empleados</th>
                    <th className="text-right px-4 py-3 font-medium">Total aportes</th>
                    <th className="text-left px-4 py-3 font-medium">Operador</th>
                    <th className="text-left px-4 py-3 font-medium">Estado</th>
                    <th className="text-left px-4 py-3 font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {loadingPila
                    ? Array.from({ length: 3 }).map((_, i) => (
                        <tr key={i}>{Array.from({ length: 7 }).map((__, j) => (
                          <td key={j} className="px-4 py-3"><div className="h-4 bg-muted animate-pulse rounded w-20" /></td>
                        ))}</tr>
                      ))
                    : pilaList.map((p: any) => (
                        <tr key={p.id} className="hover:bg-muted/30">
                          <td className="px-4 py-3 font-mono text-xs">{p.reference}</td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">
                            {p.period_month}/{p.period_year}
                          </td>
                          <td className="px-4 py-3 text-right">{p.employee_count ?? '—'}</td>
                          <td className="px-4 py-3 text-right font-semibold">
                            {fmt(Number(p.total_cotizacion_salud ?? 0) + Number(p.total_cotizacion_pension ?? 0) + Number(p.total_cotizacion_arl ?? 0) + Number(p.total_ccf ?? 0))}
                          </td>
                          <td className="px-4 py-3 text-xs">{p.operator ?? 'SOI'}</td>
                          <td className="px-4 py-3">
                            <Badge variant={
                              p.status === 'confirmed' ? 'default' :
                              p.status === 'submitted' ? 'default' :
                              p.status === 'generated' ? 'secondary' : 'outline'
                            }>
                              {p.status === 'generated' ? 'Generado' :
                               p.status === 'submitted' ? 'Enviado' :
                               p.status === 'confirmed' ? 'Confirmado' : p.status}
                            </Badge>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex gap-1 flex-wrap">
                              <Button variant="ghost" size="sm" className="gap-1 h-7 text-xs"
                                disabled={downloadingPilaId === p.id}
                                onClick={() => downloadPilaFile(p.id, p.reference)}>
                                <Download className="size-3" />CSV
                              </Button>
                              {p.status === 'generated' && (
                                <Button variant="outline" size="sm" className="gap-1 h-7 text-xs text-blue-700"
                                  onClick={() => pilaSubmitMut.mutate(p.id)} disabled={pilaSubmitMut.isPending}>
                                  <Send className="size-3" />Enviado
                                </Button>
                              )}
                              {p.status === 'submitted' && (
                                <Button variant="outline" size="sm" className="gap-1 h-7 text-xs text-green-700"
                                  onClick={() => pilaConfirmMut.mutate(p.id)} disabled={pilaConfirmMut.isPending}>
                                  <CheckCircle className="size-3" />Confirmar pago
                                </Button>
                              )}
                              {p.status === 'generated' && (
                                <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive"
                                  onClick={() => { if (confirm('¿Eliminar PILA?')) pilaDeleteMut.mutate(p.id); }}
                                  disabled={pilaDeleteMut.isPending}>
                                  Eliminar
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                  {!loadingPila && pilaList.length === 0 && (
                    <tr>
                      <td colSpan={7} className="text-center py-12 text-muted-foreground text-sm">
                        <FileSpreadsheet className="size-8 mx-auto mb-2 opacity-30" />
                        <p>Sin liquidaciones PILA generadas</p>
                        <p className="text-xs mt-1">Genera el archivo de aportes a seguridad social seleccionando un período de nómina aprobado</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Payroll PILA/export buttons (shown in payroll tab header) ── */}
      {/* Injected into payroll rows via downloadPayrollCsv / downloadPila */}

      {/* Dialog: Liquidación */}
      <Dialog open={liqDialog} onOpenChange={(v) => { if (!v) { setLiqDialog(false); setLiqPreview(null); } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Nueva liquidación de empleado</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Empleado <span className="text-destructive">*</span></Label>
                <Select value={liqEmployee} onValueChange={(v) => setLiqEmployee(v ?? '')}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar empleado" /></SelectTrigger>
                  <SelectContent>
                    {employees.filter((e) => e.status === 'active' || !e.status).map((e) => (
                      <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Fecha de retiro <span className="text-destructive">*</span></Label>
                <Input type="date" value={liqDate} onChange={(e) => setLiqDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Motivo de retiro</Label>
                <Select value={liqReason} onValueChange={(v) => setLiqReason(v ?? 'resignation')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="resignation">Renuncia voluntaria</SelectItem>
                    <SelectItem value="mutual_agreement">Mutuo acuerdo</SelectItem>
                    <SelectItem value="just_cause">Justa causa</SelectItem>
                    <SelectItem value="without_cause">Sin justa causa (con indemnización)</SelectItem>
                    <SelectItem value="contract_expiry">Vencimiento de contrato</SelectItem>
                    <SelectItem value="death">Fallecimiento</SelectItem>
                    <SelectItem value="other">Otro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button variant="outline" size="sm" className="gap-2" disabled={!liqEmployee || liqLoading}
              onClick={previewLiquidation}>
              {liqLoading ? 'Calculando...' : 'Calcular preview'}
            </Button>

            {liqPreview && (
              <div className="border rounded-lg p-3 space-y-1.5 text-sm bg-muted/30">
                <p className="font-medium mb-2">Detalle de liquidación</p>
                {[
                  ['Salario pendiente', liqPreview.breakdown?.salaryPending],
                  ['Aux. transporte pendiente', liqPreview.breakdown?.transportPending],
                  ['Vacaciones pendientes', liqPreview.breakdown?.vacaciones],
                  ['Prima proporcional', liqPreview.breakdown?.primaProporcional],
                  ['Cesantías', liqPreview.breakdown?.cesantias],
                  ['Intereses cesantías', liqPreview.breakdown?.intCesantias],
                  ['Indemnización', liqPreview.breakdown?.indemnizacion],
                  ['— Salud empleado', -(liqPreview.breakdown?.healthDeduction ?? 0)],
                  ['— Pensión empleado', -(liqPreview.breakdown?.pensionDeduction ?? 0)],
                ].map(([label, val]) => (val ?? 0) !== 0 && (
                  <div key={label as string} className="flex justify-between">
                    <span className="text-muted-foreground">{label as string}</span>
                    <span className={Number(val) < 0 ? 'text-destructive' : ''}>{fmt(Number(val))}</span>
                  </div>
                ))}
                <div className="flex justify-between font-bold border-t pt-1.5 mt-1.5">
                  <span>NETO A PAGAR</span>
                  <span>{fmt(liqPreview.breakdown?.netLiquidation ?? 0)}</span>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setLiqDialog(false); setLiqPreview(null); }}>Cancelar</Button>
            <Button onClick={() => createLiquidation.mutate()}
              disabled={!liqEmployee || !liqPreview || createLiquidation.isPending}>
              {createLiquidation.isPending ? 'Guardando...' : 'Confirmar liquidación'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Empleado */}
      <Dialog open={empDialog} onOpenChange={(o) => { setEmpDialog(o); if (!o) setEditEmp(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{editEmp ? 'Editar empleado' : 'Nuevo empleado'}</DialogTitle></DialogHeader>
          <form onSubmit={empForm.handleSubmit((d) => saveEmployee.mutate(d))} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1.5">
                <Label>Nombre completo *</Label>
                <Input {...empForm.register('name')} />
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input type="email" {...empForm.register('email')} />
              </div>
              <div className="space-y-1.5">
                <Label>Teléfono</Label>
                <Input {...empForm.register('phone')} />
              </div>
              <div className="space-y-1.5">
                <Label>Cargo</Label>
                <Input {...empForm.register('position')} />
              </div>
              <div className="space-y-1.5">
                <Label>Área / Departamento</Label>
                <Input {...empForm.register('department')} />
              </div>
              <div className="space-y-1.5">
                <Label>Fecha de ingreso *</Label>
                <Input type="date" {...empForm.register('hire_date')} />
              </div>
              <div className="space-y-1.5">
                <Label>Salario ($)</Label>
                <Input type="number" step="0.01" {...empForm.register('salary')} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setEmpDialog(false)}>Cancelar</Button>
              <Button type="submit" disabled={saveEmployee.isPending}>
                {saveEmployee.isPending ? 'Guardando...' : 'Guardar'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog: Generar nómina */}
      <Dialog open={payrollDialog} onOpenChange={setPayrollDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><FileText className="size-4" />Generar nómina</DialogTitle></DialogHeader>
          <form onSubmit={payForm.handleSubmit((d) => generatePayroll.mutate(d))} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Empleado *</Label>
              <Select onValueChange={(v: string | null) => payForm.setValue('employee_id', v ?? '')}>
                <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                <SelectContent>
                  {employees.map((e) => <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Inicio período *</Label>
                <Input type="date" {...payForm.register('period_start')} />
              </div>
              <div className="space-y-1.5">
                <Label>Fin período *</Label>
                <Input type="date" {...payForm.register('period_end')} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setPayrollDialog(false)}>Cancelar</Button>
              <Button type="submit" disabled={generatePayroll.isPending}>
                {generatePayroll.isPending ? 'Generando...' : 'Generar'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog: Fichaje manual */}
      <Dialog open={manualDialog} onOpenChange={setManualDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Clock className="size-4" />Fichaje manual</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Empleado *</Label>
              <Select value={manualEmpId} onValueChange={(v) => setManualEmpId(v ?? '')}>
                <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                <SelectContent>{employees.map((e) => <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Tipo *</Label>
              <Select value={manualType} onValueChange={(v) => setManualType(v ?? 'check_in')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="check_in">Entrada</SelectItem>
                  <SelectItem value="check_out">Salida</SelectItem>
                  <SelectItem value="break_start">Inicio pausa</SelectItem>
                  <SelectItem value="break_end">Fin pausa</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Fecha y hora *</Label>
              <Input type="datetime-local" value={manualDate} onChange={(e) => setManualDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Notas / Justificación</Label>
              <Input value={manualNotes} onChange={(e) => setManualNotes(e.target.value)} placeholder="Motivo del ajuste manual..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setManualDialog(false)}>Cancelar</Button>
            <Button onClick={() => manualAttMut.mutate()} disabled={!manualEmpId || !manualDate || manualAttMut.isPending}>
              {manualAttMut.isPending ? 'Registrando...' : 'Registrar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Nueva ausencia */}
      <Dialog open={absenceDialog} onOpenChange={setAbsenceDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><BriefcaseMedical className="size-4" />Registrar ausencia</DialogTitle></DialogHeader>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Empleado *</Label>
              <Select value={absenceEmpId} onValueChange={(v) => setAbsenceEmpId(v ?? '')}>
                <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                <SelectContent>{employees.map((e) => <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Tipo de ausencia *</Label>
              <Select value={absenceType} onValueChange={(v) => setAbsenceType(v ?? 'sick_leave')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sick_leave">Incapacidad por enfermedad</SelectItem>
                  <SelectItem value="accident">Accidente laboral</SelectItem>
                  <SelectItem value="permission">Permiso</SelectItem>
                  <SelectItem value="unpaid_leave">Licencia no remunerada</SelectItem>
                  <SelectItem value="maternity">Licencia de maternidad</SelectItem>
                  <SelectItem value="paternity">Licencia de paternidad</SelectItem>
                  <SelectItem value="bereavement">Licencia de luto</SelectItem>
                  <SelectItem value="vacation">Vacaciones</SelectItem>
                  <SelectItem value="other">Otro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Fecha inicio *</Label>
              <Input type="date" value={absenceFrom} onChange={(e) => setAbsenceFrom(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Fecha fin *</Label>
              <Input type="date" value={absenceTo} onChange={(e) => setAbsenceTo(e.target.value)} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Motivo / Descripción</Label>
              <Input value={absenceReason} onChange={(e) => setAbsenceReason(e.target.value)} placeholder="Descripción de la ausencia..." />
            </div>
            <div className="space-y-1.5">
              <Label>N.° documento soporte</Label>
              <Input value={absenceDocNum} onChange={(e) => setAbsenceDocNum(e.target.value)} placeholder="Ej: incapacidad #12345" />
            </div>
            <div className="space-y-1.5">
              <Label>Notas internas</Label>
              <Input value={absenceNotes} onChange={(e) => setAbsenceNotes(e.target.value)} />
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setAbsenceDialog(false)}>Cancelar</Button>
            <Button onClick={() => createAbsenceMut.mutate()} disabled={!absenceEmpId || !absenceFrom || !absenceTo || createAbsenceMut.isPending}>
              {createAbsenceMut.isPending ? 'Guardando...' : 'Registrar ausencia'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Rechazar ausencia */}
      <Dialog open={!!rejectDialog} onOpenChange={(o) => { if (!o) setRejectDialog(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Rechazar ausencia</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Empleado: <span className="font-medium text-foreground">{rejectDialog?.name}</span></p>
          <div className="space-y-1.5 mt-2">
            <Label>Notas / Motivo de rechazo</Label>
            <Input value={rejectNotes} onChange={(e) => setRejectNotes(e.target.value)} placeholder="Opcional..." />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialog(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={() => rejectDialog && rejectAbsenceMut.mutate({ id: rejectDialog.id, notes: rejectNotes })} disabled={rejectAbsenceMut.isPending}>
              {rejectAbsenceMut.isPending ? 'Rechazando...' : 'Confirmar rechazo'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Solicitud vacaciones */}
      <Dialog open={vacDialog} onOpenChange={setVacDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Calendar className="size-4" />Solicitar vacaciones</DialogTitle></DialogHeader>
          <form onSubmit={vacForm.handleSubmit((d) => createVacation.mutate(d))} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Empleado *</Label>
              <Select onValueChange={(v: string | null) => vacForm.setValue('employee_id', v ?? '')}>
                <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                <SelectContent>
                  {employees.map((e) => <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Desde *</Label>
                <Input type="date" {...vacForm.register('start_date')} />
              </div>
              <div className="space-y-1.5">
                <Label>Hasta *</Label>
                <Input type="date" {...vacForm.register('end_date')} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Motivo</Label>
              <Input {...vacForm.register('reason')} />
            </div>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setVacDialog(false)}>Cancelar</Button>
              <Button type="submit" disabled={createVacation.isPending}>
                {createVacation.isPending ? 'Enviando...' : 'Enviar solicitud'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Jornadas ── */}
      {tab === 'schedules' && (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Empleado</th>
                  <th className="text-left px-4 py-3 font-medium">Día</th>
                  <th className="text-left px-4 py-3 font-medium">Entrada</th>
                  <th className="text-left px-4 py-3 font-medium">Salida</th>
                  <th className="text-right px-4 py-3 font-medium">Horas</th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y">
                {loadingSchedules
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i}>{Array.from({ length: 6 }).map((__, j) => (
                        <td key={j} className="px-4 py-3"><div className="h-4 bg-muted animate-pulse rounded w-20" /></td>
                      ))}</tr>
                    ))
                  : scheduleList.map((s: any) => {
                      const dayMap: Record<string, string> = { monday:'Lunes', tuesday:'Martes', wednesday:'Miércoles', thursday:'Jueves', friday:'Viernes', saturday:'Sábado', sunday:'Domingo' };
                      const startH = s.start_time ? parseInt(s.start_time.split(':')[0]) : 0;
                      const startM = s.start_time ? parseInt(s.start_time.split(':')[1]) : 0;
                      const endH   = s.end_time   ? parseInt(s.end_time.split(':')[0])   : 0;
                      const endM   = s.end_time   ? parseInt(s.end_time.split(':')[1])   : 0;
                      const hours  = ((endH * 60 + endM) - (startH * 60 + startM)) / 60;
                      return (
                        <tr key={s.id} className="hover:bg-muted/30">
                          <td className="px-4 py-3 font-medium">{s.employee?.name ?? s.employee?.full_name ?? '—'}</td>
                          <td className="px-4 py-3 capitalize">{dayMap[s.day_of_week] ?? s.day_of_week}</td>
                          <td className="px-4 py-3 font-mono text-xs">{s.start_time}</td>
                          <td className="px-4 py-3 font-mono text-xs">{s.end_time}</td>
                          <td className="px-4 py-3 text-right">{hours > 0 ? `${hours.toFixed(1)}h` : '—'}</td>
                          <td className="px-4 py-3">
                            <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive"
                              onClick={() => { if (confirm('¿Eliminar jornada?')) deleteScheduleMut.mutate(s.id); }}
                              disabled={deleteScheduleMut.isPending}>
                              Eliminar
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                {!loadingSchedules && scheduleList.length === 0 && (
                  <tr><td colSpan={6} className="text-center py-10 text-muted-foreground text-sm">
                    <CalendarDays className="size-8 mx-auto mb-2 opacity-30" /><p>Sin jornadas laborales configuradas</p>
                    <p className="text-xs mt-1">Define los horarios de entrada y salida por empleado y día de la semana</p>
                  </td></tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* ── Desempeño ── */}
      {tab === 'performance' && (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Empleado</th>
                  <th className="text-left px-4 py-3 font-medium">Período</th>
                  <th className="text-left px-4 py-3 font-medium">Tipo</th>
                  <th className="text-right px-4 py-3 font-medium">Puntaje</th>
                  <th className="text-left px-4 py-3 font-medium">Estado</th>
                  <th className="text-left px-4 py-3 font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {loadingReviews
                  ? Array.from({ length: 3 }).map((_, i) => (
                      <tr key={i}>{Array.from({ length: 6 }).map((__, j) => (
                        <td key={j} className="px-4 py-3"><div className="h-4 bg-muted animate-pulse rounded w-20" /></td>
                      ))}</tr>
                    ))
                  : reviews.map((r: any) => (
                      <tr key={r.id} className="hover:bg-muted/30">
                        <td className="px-4 py-3 font-medium">{r.employee?.name ?? '—'}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{r.period ?? '—'}</td>
                        <td className="px-4 py-3 text-xs capitalize">{r.review_type?.replace('_', ' ') ?? '—'}</td>
                        <td className="px-4 py-3 text-right font-semibold">
                          {r.manager_score != null
                            ? <span className="flex items-center justify-end gap-1"><Star className="size-3 text-yellow-500" />{r.manager_score}/5</span>
                            : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={r.status === 'completed' ? 'default' : r.status === 'in_progress' ? 'secondary' : 'outline'}>
                            {r.status === 'pending' ? 'Pendiente' : r.status === 'in_progress' ? 'En progreso' : r.status === 'completed' ? 'Completada' : r.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1">
                            {r.status !== 'completed' && (
                              <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
                                onClick={() => { setManagerReviewDialog(r); setManagerScore(r.manager_score ?? ''); setManagerFeedback(r.manager_feedback ?? ''); }}>
                                <Star className="size-3" />Calificar
                              </Button>
                            )}
                            {r.status === 'in_progress' && (
                              <Button size="sm" variant="outline" className="h-7 text-xs text-green-700"
                                onClick={() => completeReviewMut.mutate(r.id)} disabled={completeReviewMut.isPending}>
                                <CheckCircle className="size-3" />Cerrar
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                {!loadingReviews && reviews.length === 0 && (
                  <tr><td colSpan={6} className="text-center py-10 text-muted-foreground text-sm">
                    <Star className="size-8 mx-auto mb-2 opacity-30" /><p>Sin evaluaciones registradas</p>
                  </td></tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* ── Formación ── */}
      {tab === 'training' && (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Plan de formación</th>
                  <th className="text-left px-4 py-3 font-medium">Inicio</th>
                  <th className="text-left px-4 py-3 font-medium">Fin</th>
                  <th className="text-right px-4 py-3 font-medium">Horas</th>
                  <th className="text-right px-4 py-3 font-medium">Inscritos</th>
                  <th className="text-left px-4 py-3 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {loadingTraining
                  ? Array.from({ length: 3 }).map((_, i) => (
                      <tr key={i}>{Array.from({ length: 6 }).map((__, j) => (
                        <td key={j} className="px-4 py-3"><div className="h-4 bg-muted animate-pulse rounded w-20" /></td>
                      ))}</tr>
                    ))
                  : trainingList.map((t: any) => (
                      <tr key={t.id} className="hover:bg-muted/30">
                        <td className="px-4 py-3 font-medium">{t.title}</td>
                        <td className="px-4 py-3 text-xs">{t.start_date ? new Date(t.start_date).toLocaleDateString('es-CO') : '—'}</td>
                        <td className="px-4 py-3 text-xs">{t.end_date ? new Date(t.end_date).toLocaleDateString('es-CO') : '—'}</td>
                        <td className="px-4 py-3 text-right">{t.hours ?? '—'}</td>
                        <td className="px-4 py-3 text-right">{t.enrolled_count ?? 0}</td>
                        <td className="px-4 py-3">
                          <Badge variant={t.status === 'completed' ? 'default' : t.status === 'active' ? 'secondary' : 'outline'}>
                            {t.status === 'planned' ? 'Planeado' : t.status === 'active' ? 'Activo' : t.status === 'completed' ? 'Completado' : t.status}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                {!loadingTraining && trainingList.length === 0 && (
                  <tr><td colSpan={6} className="text-center py-10 text-muted-foreground text-sm">
                    <GraduationCap className="size-8 mx-auto mb-2 opacity-30" /><p>Sin planes de formación</p>
                  </td></tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Dialog: Nueva jornada */}
      <Dialog open={scheduleDialog} onOpenChange={(o) => { if (!o) setScheduleDialog(false); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><CalendarDays className="size-4" />Nueva jornada laboral</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Empleado *</Label>
              <Select value={scheduleEmpId} onValueChange={(v) => setScheduleEmpId(v ?? '')}>
                <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                <SelectContent>{employees.map((e) => <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Día de la semana *</Label>
              <Select value={scheduleDay} onValueChange={(v) => setScheduleDay(v ?? 'monday')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[['monday','Lunes'],['tuesday','Martes'],['wednesday','Miércoles'],['thursday','Jueves'],['friday','Viernes'],['saturday','Sábado'],['sunday','Domingo']].map(([val, label]) => (
                    <SelectItem key={val} value={val}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Hora entrada *</Label>
                <Input type="time" value={scheduleStart} onChange={(e) => setScheduleStart(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Hora salida *</Label>
                <Input type="time" value={scheduleEnd} onChange={(e) => setScheduleEnd(e.target.value)} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setScheduleDialog(false)}>Cancelar</Button>
            <Button onClick={() => createScheduleMut.mutate()} disabled={!scheduleEmpId || createScheduleMut.isPending}>
              {createScheduleMut.isPending ? 'Guardando...' : 'Guardar jornada'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Nueva evaluación */}
      <Dialog open={reviewDialog} onOpenChange={(o) => { if (!o) setReviewDialog(false); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Star className="size-4" />Nueva evaluación de desempeño</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Empleado *</Label>
              <Select value={reviewEmpId} onValueChange={(v) => setReviewEmpId(v ?? '')}>
                <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                <SelectContent>{employees.map((e) => <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Período (ej: 2025-S1)</Label>
              <Input value={reviewPeriod} onChange={(e) => setReviewPeriod(e.target.value)} placeholder="2025-S1" />
            </div>
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={reviewType} onValueChange={(v) => setReviewType(v ?? 'annual')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="annual">Anual</SelectItem>
                  <SelectItem value="semi_annual">Semestral</SelectItem>
                  <SelectItem value="quarterly">Trimestral</SelectItem>
                  <SelectItem value="probation">Período de prueba</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewDialog(false)}>Cancelar</Button>
            <Button onClick={() => createReviewMut.mutate()} disabled={!reviewEmpId || !reviewPeriod || createReviewMut.isPending}>
              {createReviewMut.isPending ? 'Creando...' : 'Crear evaluación'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Calificación de manager */}
      <Dialog open={!!managerReviewDialog} onOpenChange={(o) => { if (!o) setManagerReviewDialog(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Evaluación del Manager — {managerReviewDialog?.employee?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Puntaje (1–5) *</Label>
              <Input type="number" min={1} max={5} step={0.5} value={managerScore} onChange={(e) => setManagerScore(e.target.value)} placeholder="Ej: 4" />
            </div>
            <div className="space-y-1.5">
              <Label>Retroalimentación</Label>
              <Input value={managerFeedback} onChange={(e) => setManagerFeedback(e.target.value)} placeholder="Comentarios del evaluador..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setManagerReviewDialog(null)}>Cancelar</Button>
            <Button onClick={() => managerReviewDialog && managerReviewMut.mutate({ id: managerReviewDialog.id })} disabled={!managerScore || managerReviewMut.isPending}>
              {managerReviewMut.isPending ? 'Guardando...' : 'Guardar calificación'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Nuevo plan de formación */}
      <Dialog open={trainingDialog} onOpenChange={(o) => { if (!o) setTrainingDialog(false); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><GraduationCap className="size-4" />Nuevo plan de formación</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Título *</Label>
              <Input value={trainingTitle} onChange={(e) => setTrainingTitle(e.target.value)} placeholder="Ej: Excel avanzado para administrativos" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Fecha inicio</Label>
                <Input type="date" value={trainingStart} onChange={(e) => setTrainingStart(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Fecha fin</Label>
                <Input type="date" value={trainingEnd} onChange={(e) => setTrainingEnd(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Horas totales</Label>
              <Input type="number" min={1} value={trainingHours} onChange={(e) => setTrainingHours(e.target.value)} placeholder="Ej: 16" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTrainingDialog(false)}>Cancelar</Button>
            <Button onClick={() => createTrainingMut.mutate()} disabled={!trainingTitle || createTrainingMut.isPending}>
              {createTrainingMut.isPending ? 'Creando...' : 'Crear plan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Generar PILA */}
      <Dialog open={pilaGenDialog} onOpenChange={(o) => { if (!o) setPilaGenDialog(false); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="size-4" />Generar archivo PILA
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-sm">
            <p className="text-muted-foreground">
              Selecciona el período de nómina aprobado para generar el archivo de aportes a seguridad social (salud, pensión, ARL, CCF, SENA, ICBF).
            </p>
            <div className="space-y-1.5">
              <Label>Período de nómina *</Label>
              <Select value={pilaPayrollId} onValueChange={(v) => setPilaPayrollId(v ?? '')}>
                <SelectTrigger><SelectValue placeholder="Seleccionar período..." /></SelectTrigger>
                <SelectContent>
                  {payrolls
                    .filter((p) => p.status === 'approved' || p.status === 'paid')
                    .map((p) => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {p.employee?.name} — {new Date(p.period_start).toLocaleDateString('es-CO')} al {new Date(p.period_end).toLocaleDateString('es-CO')}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              {payrolls.filter((p) => p.status === 'approved' || p.status === 'paid').length === 0 && (
                <p className="text-xs text-orange-600">No hay nóminas aprobadas. Aprueba una nómina primero.</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPilaGenDialog(false)}>Cancelar</Button>
            <Button
              onClick={() => pilaPayrollId && pilaGenerateMut.mutate(Number(pilaPayrollId))}
              disabled={!pilaPayrollId || pilaGenerateMut.isPending}>
              {pilaGenerateMut.isPending ? 'Generando...' : 'Generar PILA'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* NE-DIAN Dialog */}
      <Dialog open={neDialogPayrollId !== null} onOpenChange={(o) => { if (!o) { setNeDialogPayrollId(null); setNeDocsData(null); } }}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nómina Electrónica DIAN — Período #{neDialogPayrollId}</DialogTitle>
          </DialogHeader>

          {neDocsData?.stats && (
            <div className="grid grid-cols-5 gap-2 text-center text-xs">
              {(Object.entries(neDocsData.stats) as [string, number][]).map(([k, v]) => (
                <div key={k} className="rounded border p-2">
                  <p className="text-muted-foreground capitalize">{k}</p>
                  <p className="font-bold text-base">{v}</p>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <Button size="sm" onClick={() => neDialogPayrollId && handleGenerateNeDocs(neDialogPayrollId)}
              disabled={generatingNe}>
              {generatingNe ? 'Generando…' : 'Generar / Regenerar XMLs'}
            </Button>
          </div>

          {neDocsData && neDocsData.docs.length > 0 ? (
            <table className="w-full text-xs border-collapse">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-2 py-1.5 font-medium">Empleado</th>
                  <th className="text-left px-2 py-1.5 font-medium">Documento</th>
                  <th className="text-right px-2 py-1.5 font-medium">Devengados</th>
                  <th className="text-right px-2 py-1.5 font-medium">Deducciones</th>
                  <th className="text-right px-2 py-1.5 font-medium">Total</th>
                  <th className="text-left px-2 py-1.5 font-medium">Estado</th>
                  <th className="px-2 py-1.5" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {neDocsData.docs.map((doc) => (
                  <tr key={doc.id} className="hover:bg-muted/20">
                    <td className="px-2 py-1.5 font-medium">{doc.employee_name}</td>
                    <td className="px-2 py-1.5 text-muted-foreground">{doc.document_number}</td>
                    <td className="px-2 py-1.5 text-right">${Number(doc.devengados_total).toLocaleString('es-CO')}</td>
                    <td className="px-2 py-1.5 text-right">${Number(doc.deducciones_total).toLocaleString('es-CO')}</td>
                    <td className="px-2 py-1.5 text-right font-semibold">${Number(doc.total_comprobante).toLocaleString('es-CO')}</td>
                    <td className="px-2 py-1.5">
                      <span className={`font-medium ${doc.status === 'accepted' ? 'text-green-600' : doc.status === 'rejected' ? 'text-red-600' : doc.status === 'sent' ? 'text-blue-600' : 'text-muted-foreground'}`}>
                        {doc.status}
                      </span>
                    </td>
                    <td className="px-2 py-1.5">
                      <div className="flex gap-1 justify-end">
                        {doc.status !== 'draft' && (
                          <Button size="sm" variant="ghost" className="h-6 text-xs"
                            onClick={() => neDialogPayrollId && downloadNeDocXml(neDialogPayrollId, doc.id, doc.document_number)}>
                            <Download className="size-3" />XML
                          </Button>
                        )}
                        {doc.status === 'generated' && (
                          <Button size="sm" variant="outline" className="h-6 text-xs"
                            onClick={async () => {
                              if (!neDialogPayrollId) return;
                              await hrmApi.neDocMarkSent(neDialogPayrollId, doc.id);
                              const r = await hrmApi.neDocs(neDialogPayrollId);
                              setNeDocsData(r.data as typeof neDocsData);
                            }}>
                            Enviado
                          </Button>
                        )}
                        {doc.status === 'sent' && (
                          <Button size="sm" className="h-6 text-xs bg-green-600 hover:bg-green-700"
                            onClick={async () => {
                              if (!neDialogPayrollId) return;
                              await hrmApi.neDocMarkAccepted(neDialogPayrollId, doc.id);
                              const r = await hrmApi.neDocs(neDialogPayrollId);
                              setNeDocsData(r.data as typeof neDocsData);
                            }}>
                            Aceptado DIAN
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            !generatingNe && (
              <div className="py-10 text-center text-muted-foreground text-sm">
                <p>No hay documentos NE-DIAN generados.</p>
                <p className="text-xs mt-1">Haz clic en "Generar XMLs" para crear los documentos individuales.</p>
              </div>
            )
          )}
        </DialogContent>
      </Dialog>

      {/* ── Documentos empleado ────────────────────────────────────────── */}
      {tab === 'documents' && (
        <div className="space-y-4">
          {/* Alertas de vencimiento */}
          {expiringDocs.length > 0 && (
            <div className="rounded-lg border border-orange-200 bg-orange-50 dark:bg-orange-950/20 dark:border-orange-800 p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="size-4 text-orange-600 shrink-0" />
                <p className="text-sm font-medium text-orange-800 dark:text-orange-300">
                  {expiringDocs.length} documento(s) vencen en los próximos 30 días
                </p>
              </div>
              <div className="space-y-1">
                {expiringDocs.slice(0, 5).map((d: any) => (
                  <p key={d.id} className="text-xs text-orange-700 dark:text-orange-400">
                    {d.first_name} {d.last_name} — {d.title} ({new Date(d.expiry_date).toLocaleDateString('es-CO')})
                  </p>
                ))}
                {expiringDocs.length > 5 && <p className="text-xs text-orange-600">...y {expiringDocs.length - 5} más</p>}
              </div>
            </div>
          )}

          {/* Selector de empleado */}
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
            <div className="w-full sm:w-72">
              <Select value={docEmpId ? String(docEmpId) : ''} onValueChange={(v) => setDocEmpId(v ? Number(v) : null)} >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar empleado..." />
                </SelectTrigger>
                <SelectContent>
                  {employees.map((e) => (
                    <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {docEmpId && (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input placeholder="Buscar documento..." className="pl-9 w-60" value={docSearch} onChange={(e) => setDocSearch(e.target.value)} />
              </div>
            )}
          </div>

          {/* Listado de documentos */}
          {!docEmpId ? (
            <div className="text-center py-16 text-muted-foreground">
              <FolderOpen className="size-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Selecciona un empleado para ver su expediente</p>
            </div>
          ) : loadingDocs ? (
            <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-14 bg-muted animate-pulse rounded" />)}</div>
          ) : (
            (() => {
              const DOC_CATEGORIES: Record<string, string> = {
                contract: 'Contratos', id_document: 'Identificación', diploma: 'Diplomas',
                certificate: 'Certificados', medical: 'Médicos', disciplinary: 'Disciplinarios',
                social_security: 'Seguridad Social', other: 'Otros',
              };
              const filtered = employeeDocs.filter((d: any) =>
                !docSearch || d.title.toLowerCase().includes(docSearch.toLowerCase())
              );
              const grouped = filtered.reduce((acc: Record<string, any[]>, d: any) => {
                const cat = d.category ?? 'other';
                if (!acc[cat]) acc[cat] = [];
                acc[cat].push(d);
                return acc;
              }, {});

              if (filtered.length === 0) return (
                <div className="text-center py-12 text-muted-foreground">
                  <FolderOpen className="size-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Sin documentos. Carga el primero.</p>
                </div>
              );

              return (
                <div className="space-y-6">
                  {Object.entries(grouped).map(([cat, docs]) => (
                    <div key={cat}>
                      <h3 className="text-sm font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
                        {DOC_CATEGORIES[cat] ?? cat}
                      </h3>
                      <Card>
                        <table className="w-full text-sm">
                          <thead className="bg-muted/40">
                            <tr>
                              <th className="text-left px-4 py-2 font-medium">Título</th>
                              <th className="text-left px-4 py-2 font-medium">Versión</th>
                              <th className="text-left px-4 py-2 font-medium">Emisión</th>
                              <th className="text-left px-4 py-2 font-medium">Vencimiento</th>
                              <th className="text-left px-4 py-2 font-medium">Estado</th>
                              <th className="text-right px-4 py-2 font-medium">Acciones</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {(docs as any[]).map((d: any) => {
                              const isExpiringSoon = d.expiry_date && new Date(d.expiry_date) <= new Date(Date.now() + 30 * 86400000);
                              return (
                                <tr key={d.id} className="hover:bg-muted/20">
                                  <td className="px-4 py-2 font-medium">
                                    {d.title}
                                    {d.file_name && <span className="block text-xs text-muted-foreground font-normal">{d.file_name} · {d.file_size_kb} KB</span>}
                                  </td>
                                  <td className="px-4 py-2 text-muted-foreground">v{d.version}</td>
                                  <td className="px-4 py-2 text-muted-foreground">{d.issue_date ? new Date(d.issue_date).toLocaleDateString('es-CO') : '—'}</td>
                                  <td className={`px-4 py-2 ${isExpiringSoon ? 'text-orange-600 font-medium' : 'text-muted-foreground'}`}>
                                    {d.expiry_date ? new Date(d.expiry_date).toLocaleDateString('es-CO') : '—'}
                                    {isExpiringSoon && <AlertTriangle className="inline size-3 ml-1" />}
                                  </td>
                                  <td className="px-4 py-2">
                                    <Badge variant={d.status === 'active' ? 'default' : d.status === 'expired' ? 'outline' : 'secondary'}>
                                      {d.status === 'active' ? 'Activo' : d.status === 'expired' ? 'Vencido' : d.status === 'replaced' ? 'Reemplazado' : 'Archivado'}
                                    </Badge>
                                  </td>
                                  <td className="px-4 py-2">
                                    <div className="flex gap-1 justify-end">
                                      <Button size="sm" variant="ghost" className="h-7 px-2 gap-1"
                                        onClick={() => downloadDocument(d.id, d.file_name ?? d.title)}>
                                        <Download className="size-3" />
                                      </Button>
                                      {d.status === 'active' && (
                                        <Button size="sm" variant="ghost" className="h-7 px-2 gap-1 text-muted-foreground"
                                          onClick={() => archiveDocMut.mutate({ docId: d.id })}>
                                          <Archive className="size-3" />
                                        </Button>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </Card>
                    </div>
                  ))}
                </div>
              );
            })()
          )}
        </div>
      )}

      {/* ── Dialog: cargar documento ───────────────────────────────────── */}
      <Dialog open={docUploadDialog} onOpenChange={setDocUploadDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Cargar documento</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Categoría *</Label>
              <Select value={docCategory} onValueChange={(v) => setDocCategory(v ?? 'other')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="contract">Contrato laboral</SelectItem>
                  <SelectItem value="id_document">Identificación</SelectItem>
                  <SelectItem value="diploma">Diploma / título</SelectItem>
                  <SelectItem value="certificate">Certificado</SelectItem>
                  <SelectItem value="medical">Examen médico</SelectItem>
                  <SelectItem value="disciplinary">Disciplinario</SelectItem>
                  <SelectItem value="social_security">Seguridad social</SelectItem>
                  <SelectItem value="other">Otro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Título / nombre del documento *</Label>
              <Input value={docTitle} onChange={(e) => setDocTitle(e.target.value)} placeholder="Ej. Contrato indefinido 2026" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Fecha emisión</Label>
                <Input type="date" value={docIssueDate} onChange={(e) => setDocIssueDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Fecha vencimiento</Label>
                <Input type="date" value={docExpiryDate} onChange={(e) => setDocExpiryDate(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Archivo *</Label>
              <label className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-lg p-6 cursor-pointer transition-colors ${docFile ? 'border-primary bg-primary/5' : 'hover:border-primary/50'}`}>
                <Upload className="size-6 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">
                  {docFile ? docFile.name : 'Haz clic o arrastra PDF, JPG, PNG, DOC'}
                </span>
                <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                  onChange={(e) => setDocFile(e.target.files?.[0] ?? null)} />
              </label>
              <p className="text-xs text-muted-foreground">Máximo 10 MB. Formatos: PDF, JPG, PNG, DOC/DOCX</p>
            </div>
            <div className="space-y-1.5">
              <Label>Notas</Label>
              <Input value={docNotes} onChange={(e) => setDocNotes(e.target.value)} placeholder="Observaciones opcionales" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDocUploadDialog(false)}>Cancelar</Button>
            <Button onClick={() => uploadDocMut.mutate()}
              disabled={!docFile || !docTitle || uploadDocMut.isPending}>
              {uploadDocMut.isPending ? 'Cargando...' : 'Guardar documento'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
