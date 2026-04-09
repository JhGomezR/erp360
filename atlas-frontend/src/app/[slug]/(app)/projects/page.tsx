'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notify } from '@/lib/notify';
import { projectsApi } from '@/lib/api/tenant.api';
import { AddonGate } from '@/components/shared/AddonPaywall';
import {
  FolderKanban, ListTodo, Clock, Flag, BarChart2,
  Plus, Eye, Trash2, CheckCircle, Circle,
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

// ─── Types ────────────────────────────────────────────────────────────────────

interface Project {
  id: number;
  code: string;
  name: string;
  description: string | null;
  status: 'planning' | 'active' | 'on_hold' | 'completed' | 'cancelled';
  type: string;
  budget: number;
  billed_amount: number;
  cost_actual: number;
  start_date: string | null;
  end_date: string | null;
  tasks_count?: number;
  members_count?: number;
  created_at: string;
}

interface ProjectDetail extends Project {
  tasks: Task[];
  milestones: Milestone[];
  progress: number;
  stats: {
    total_tasks: number;
    done_tasks: number;
    total_hours: number;
    billable_hours: number;
    total_cost: number;
  };
}

interface Task {
  id: number;
  title: string;
  description: string | null;
  status: 'todo' | 'in_progress' | 'review' | 'done' | 'cancelled';
  priority: 'low' | 'normal' | 'high' | 'critical';
  start_date: string | null;
  due_date: string | null;
  estimated_hours: number;
  logged_hours: number;
  progress_pct: number;
  is_milestone: boolean;
  subtasks?: Task[];
}

interface Milestone {
  id: number;
  name: string;
  amount: number;
  due_date: string | null;
  status: 'pending' | 'achieved' | 'invoiced';
  invoiced_at: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(v: number) { return `$${v.toLocaleString('es-CO')}`; }
function fmtDate(d: string) { return new Date(d).toLocaleDateString('es-CO'); }

const PROJ_STATUS_COLORS: Record<Project['status'], 'secondary' | 'default' | 'destructive' | 'outline'> = {
  planning: 'secondary', active: 'default', on_hold: 'secondary', completed: 'outline', cancelled: 'destructive',
};
const PROJ_STATUS_LABELS: Record<Project['status'], string> = {
  planning: 'Planificación', active: 'Activo', on_hold: 'En pausa', completed: 'Completado', cancelled: 'Cancelado',
};

const TASK_STATUS_COLORS: Record<Task['status'], 'secondary' | 'default' | 'destructive' | 'outline'> = {
  todo: 'secondary', in_progress: 'default', review: 'secondary', done: 'outline', cancelled: 'destructive',
};
const TASK_PRIORITY_COLORS: Record<Task['priority'], string> = {
  low: 'text-muted-foreground', normal: 'text-blue-600', high: 'text-orange-500', critical: 'text-red-600',
};

const MS_STATUS_COLORS: Record<Milestone['status'], 'secondary' | 'default' | 'outline'> = {
  pending: 'secondary', achieved: 'default', invoiced: 'outline',
};

// ══════════════════════════════════════════════════════════════════════════════
// GANTT CHART
// ══════════════════════════════════════════════════════════════════════════════

const GANTT_STATUS_COLORS: Record<Task['status'], string> = {
  todo: 'bg-slate-400',
  in_progress: 'bg-blue-500',
  review: 'bg-yellow-500',
  done: 'bg-green-500',
  cancelled: 'bg-red-400',
};

function GanttChart({ tasks }: { tasks: Task[] }) {
  const scheduledTasks = tasks.filter((t) => t.start_date && t.due_date);

  if (scheduledTasks.length === 0) {
    return (
      <div className="py-14 text-center text-muted-foreground">
        <BarChart2 className="mx-auto size-8 mb-2 opacity-30" />
        <p className="text-sm">Ninguna tarea tiene fecha de inicio y fecha límite asignadas.</p>
        <p className="text-xs mt-1 text-muted-foreground">Edita las tareas para agregar <code>start_date</code> y <code>due_date</code>.</p>
      </div>
    );
  }

  // Compute overall timeline bounds
  const allDates = scheduledTasks.flatMap((t) => [new Date(t.start_date!), new Date(t.due_date!)]);
  const minDate = new Date(Math.min(...allDates.map((d) => d.getTime())));
  const maxDate = new Date(Math.max(...allDates.map((d) => d.getTime())));

  // Snap to week start/end for clean column alignment
  const snapStart = new Date(minDate);
  snapStart.setDate(snapStart.getDate() - snapStart.getDay()); // prev Sunday
  const snapEnd = new Date(maxDate);
  snapEnd.setDate(snapEnd.getDate() + (6 - snapEnd.getDay())); // next Saturday

  const totalDays = Math.ceil((snapEnd.getTime() - snapStart.getTime()) / 86_400_000) + 1;

  // Build week header labels
  const weeks: { label: string; startDay: number; span: number }[] = [];
  const cur = new Date(snapStart);
  while (cur <= snapEnd) {
    const weekStart = cur.getDate();
    const weekLabel = cur.toLocaleDateString('es-CO', { day: '2-digit', month: 'short' });
    const daysLeft = Math.ceil((snapEnd.getTime() - cur.getTime()) / 86_400_000) + 1;
    const span = Math.min(7, daysLeft);
    weeks.push({ label: weekLabel, startDay: weekStart, span });
    cur.setDate(cur.getDate() + 7);
  }

  function barStyle(task: Task) {
    const start = new Date(task.start_date!);
    const end   = new Date(task.due_date!);
    const offsetDays = Math.round((start.getTime() - snapStart.getTime()) / 86_400_000);
    const spanDays   = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1);
    return {
      marginLeft: `${(offsetDays / totalDays) * 100}%`,
      width:      `${(spanDays / totalDays) * 100}%`,
    };
  }

  const today = new Date();
  const todayOffset = (today.getTime() - snapStart.getTime()) / 86_400_000;
  const todayPct = Math.min(100, Math.max(0, (todayOffset / totalDays) * 100));

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[700px]">
        {/* Header: week labels */}
        <div className="flex border-b pb-1 mb-2">
          {/* Task name column */}
          <div className="w-44 shrink-0 text-xs font-medium text-muted-foreground pr-2">Tarea</div>
          <div className="flex-1 relative flex">
            {weeks.map((w, i) => (
              <div key={i} className="text-xs text-muted-foreground border-l border-border pl-1 truncate"
                style={{ width: `${(w.span / totalDays) * 100}%` }}>
                {w.label}
              </div>
            ))}
          </div>
        </div>

        {/* Rows */}
        <div className="space-y-1.5">
          {scheduledTasks.map((task) => (
            <div key={task.id} className="flex items-center gap-1 group">
              <div className="w-44 shrink-0 text-xs truncate pr-2" title={task.title}>
                <span className={task.status === 'done' ? 'line-through text-muted-foreground' : ''}>
                  {task.is_milestone ? '◆ ' : ''}{task.title}
                </span>
              </div>
              <div className="flex-1 relative h-6">
                {/* Today marker */}
                <div className="absolute top-0 bottom-0 w-px bg-red-400 opacity-60 z-10"
                  style={{ left: `${todayPct}%` }} />
                {/* Week grid lines */}
                {weeks.map((_, i) => (
                  <div key={i} className="absolute top-0 bottom-0 w-px bg-border"
                    style={{ left: `${((i * 7) / totalDays) * 100}%` }} />
                ))}
                {/* Task bar */}
                <div
                  className={`absolute top-1 h-4 rounded-sm ${GANTT_STATUS_COLORS[task.status]} flex items-center px-1.5 overflow-hidden`}
                  style={barStyle(task)}
                  title={`${task.title} — ${task.start_date} → ${task.due_date}`}
                >
                  {task.progress_pct > 0 && task.progress_pct < 100 && (
                    <div className="absolute inset-0 bg-black/20 rounded-sm" style={{ width: `${task.progress_pct}%` }} />
                  )}
                  <span className="relative text-white text-[10px] font-medium truncate leading-none">
                    {task.progress_pct > 0 ? `${task.progress_pct}%` : ''}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-3 mt-4 pt-3 border-t">
          {(Object.entries(GANTT_STATUS_COLORS) as [Task['status'], string][]).map(([s, cls]) => (
            <div key={s} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className={`inline-block size-3 rounded-sm ${cls}`} />
              {s}
            </div>
          ))}
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="inline-block w-px h-3 bg-red-400" />
            Hoy
          </div>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// PROJECT DETAIL VIEW (tasks + milestones + time)
// ══════════════════════════════════════════════════════════════════════════════

interface ProjectDetailViewProps {
  projectId: number;
  slug: string;
  onBack: () => void;
}

function ProjectDetailView({ projectId, slug, onBack }: ProjectDetailViewProps) {
  const qc = useQueryClient();
  const [innerTab, setInnerTab] = useState('tasks');
  const [taskDialog, setTaskDialog] = useState(false);
  const [msDialog, setMsDialog]     = useState(false);
  const [timeDialog, setTimeDialog] = useState(false);

  // Task form
  const [taskTitle, setTaskTitle]     = useState('');
  const [taskPriority, setTaskPriority] = useState('normal');
  const [taskDue, setTaskDue]         = useState('');
  const [taskEst, setTaskEst]         = useState('0');

  // Milestone form
  const [msName, setMsName]     = useState('');
  const [msAmount, setMsAmount] = useState('0');
  const [msDue, setMsDue]       = useState('');

  // Time log form
  const [timeHours, setTimeHours]   = useState('1');
  const [timeDesc, setTimeDesc]     = useState('');
  const [timeDate, setTimeDate]     = useState('');
  const [timeBillable, setTimeBillable] = useState(true);
  const [timeRate, setTimeRate]     = useState('0');

  const detailQ = useQuery({
    queryKey: [slug, 'project-detail', projectId],
    queryFn:  () => projectsApi.get(projectId),
  });
  const tasksQ = useQuery({
    queryKey: [slug, 'project-tasks', projectId],
    queryFn:  () => projectsApi.tasks(projectId),
    enabled:  innerTab === 'tasks' || innerTab === 'gantt',
  });
  const msQ = useQuery({
    queryKey: [slug, 'project-milestones', projectId],
    queryFn:  () => projectsApi.milestones(projectId),
    enabled:  innerTab === 'milestones',
  });
  const timeQ = useQuery({
    queryKey: [slug, 'project-time', projectId],
    queryFn:  () => projectsApi.timeLogs(projectId),
    enabled:  innerTab === 'time',
  });

  const detail = detailQ.data as ProjectDetail | undefined;
  const tasks: Task[] = (tasksQ.data as Task[] | undefined) ?? [];
  const milestones: Milestone[] = (msQ.data as Milestone[] | undefined) ?? [];
  const timeLogs = (timeQ.data as { data?: unknown[] })?.data ?? [];

  function invTasks()  { qc.invalidateQueries({ queryKey: [slug, 'project-tasks', projectId] }); qc.invalidateQueries({ queryKey: [slug, 'project-detail', projectId] }); }
  function invMs()     { qc.invalidateQueries({ queryKey: [slug, 'project-milestones', projectId] }); }
  function invTime()   { qc.invalidateQueries({ queryKey: [slug, 'project-time', projectId] }); qc.invalidateQueries({ queryKey: [slug, 'project-detail', projectId] }); }

  const createTaskMut = useMutation({
    mutationFn: (d: unknown) => projectsApi.createTask(projectId, d),
    onSuccess: () => { notify.success('Tarea creada.'); invTasks(); setTaskDialog(false); setTaskTitle(''); },
    onError: (e: unknown) => notify.error((e as { message?: string }).message ?? 'Error'),
  });
  const updateTaskMut = useMutation({
    mutationFn: ({ taskId, data }: { taskId: number; data: unknown }) => projectsApi.updateTask(projectId, taskId, data),
    onSuccess: () => invTasks(),
    onError: (e: unknown) => notify.error((e as { message?: string }).message ?? 'Error'),
  });
  const deleteTaskMut = useMutation({
    mutationFn: (taskId: number) => projectsApi.deleteTask(projectId, taskId),
    onSuccess: () => { notify.success('Eliminada.'); invTasks(); },
    onError: (e: unknown) => notify.error((e as { message?: string }).message ?? 'Error'),
  });
  const createMsMut = useMutation({
    mutationFn: (d: unknown) => projectsApi.createMilestone(projectId, d),
    onSuccess: () => { notify.success('Hito creado.'); invMs(); setMsDialog(false); setMsName(''); },
    onError: (e: unknown) => notify.error((e as { message?: string }).message ?? 'Error'),
  });
  const updateMsMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: unknown }) => projectsApi.updateMilestone(projectId, id, data),
    onSuccess: () => invMs(),
    onError: (e: unknown) => notify.error((e as { message?: string }).message ?? 'Error'),
  });
  const invoiceMsMut = useMutation({
    mutationFn: (milestoneId: number) => projectsApi.invoiceMilestone(projectId, milestoneId),
    onSuccess: (res: unknown) => {
      const d = (res as { data: { reference: string } })?.data;
      notify.success(`Orden de venta generada: ${d?.reference ?? ''}`);
      invMs();
      qc.invalidateQueries({ queryKey: [slug, 'project-detail', projectId] });
    },
    onError: (e: unknown) => notify.error((e as { message?: string }).message ?? 'Error al facturar hito'),
  });
  const logTimeMut = useMutation({
    mutationFn: (d: Parameters<typeof projectsApi.logTime>[1]) => projectsApi.logTime(projectId, d),
    onSuccess: () => { notify.success('Horas registradas.'); invTime(); setTimeDialog(false); setTimeHours('1'); setTimeDesc(''); },
    onError: (e: unknown) => notify.error((e as { message?: string }).message ?? 'Error'),
  });

  if (detailQ.isPending) return <div className="p-4"><Skeleton className="h-40 w-full" /></div>;
  if (!detail) return <div className="p-4 text-muted-foreground">Proyecto no encontrado.</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>← Proyectos</Button>
        <Separator orientation="vertical" className="h-5" />
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-semibold">{detail.code} — {detail.name}</h2>
          <div className="flex items-center gap-2 mt-0.5">
            <Badge variant={PROJ_STATUS_COLORS[detail.status]}>{PROJ_STATUS_LABELS[detail.status]}</Badge>
            <span className="text-xs text-muted-foreground">{detail.type}</span>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Progreso',   val: `${detail.progress}%`, sub: `${detail.stats?.done_tasks}/${detail.stats?.total_tasks} tareas` },
          { label: 'Presupuesto', val: fmt(detail.budget), sub: `Gastado: ${fmt(detail.cost_actual)}` },
          { label: 'Facturado',  val: fmt(detail.billed_amount), sub: 'de hitos' },
          { label: 'Horas',      val: `${detail.stats?.total_hours ?? 0}h`, sub: `${detail.stats?.billable_hours ?? 0}h facturables` },
        ].map((kpi) => (
          <Card key={kpi.label}><CardContent className="pt-4 pb-3 px-4">
            <p className="text-xl font-bold">{kpi.val}</p>
            <p className="text-xs font-medium text-muted-foreground">{kpi.label}</p>
            <p className="text-xs text-muted-foreground">{kpi.sub}</p>
          </CardContent></Card>
        ))}
      </div>
      <Progress value={detail.progress} className="h-2" />

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-0.5 p-1 rounded-lg bg-muted w-fit">
          {(['tasks', 'milestones', 'time', 'gantt'] as const).map((key) => (
            <button key={key} onClick={() => setInnerTab(key)}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${innerTab === key ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
              {key === 'tasks' ? 'Tareas' : key === 'milestones' ? 'Hitos' : key === 'time' ? 'Horas' : 'Gantt'}
            </button>
          ))}
        </div>
        <div>
          {innerTab === 'tasks'      && <Button size="sm" onClick={() => setTaskDialog(true)}><Plus className="mr-1 size-3.5" />Tarea</Button>}
          {innerTab === 'milestones' && <Button size="sm" onClick={() => setMsDialog(true)}><Plus className="mr-1 size-3.5" />Hito</Button>}
          {innerTab === 'time'       && <Button size="sm" onClick={() => setTimeDialog(true)}><Plus className="mr-1 size-3.5" />Registrar horas</Button>}
        </div>
      </div>

        {/* Tasks */}
        {innerTab === 'tasks' && (<div className="mt-3">
          <div className="space-y-2">
            {tasksQ.isPending ? <Skeleton className="h-40 w-full" /> :
             tasks.length === 0 ? (
              <div className="py-10 text-center text-muted-foreground"><ListTodo className="mx-auto size-8 mb-2 opacity-30" /><p>Sin tareas</p></div>
             ) : (tasks.map((task) => (
              <div key={task.id} className="rounded border p-3">
                <div className="flex items-start gap-3">
                  <button onClick={() => updateTaskMut.mutate({ taskId: task.id, data: { status: task.status === 'done' ? 'todo' : 'done' } })}
                    className="mt-0.5 shrink-0">
                    {task.status === 'done' ? <CheckCircle className="size-5 text-green-600" /> : <Circle className="size-5 text-muted-foreground" />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${task.status === 'done' ? 'line-through text-muted-foreground' : ''}`}>{task.title}</p>
                    <div className="flex flex-wrap gap-2 mt-1">
                      <Badge variant={TASK_STATUS_COLORS[task.status]} className="text-xs">{task.status}</Badge>
                      <span className={`text-xs ${TASK_PRIORITY_COLORS[task.priority]}`}>{task.priority}</span>
                      {task.due_date && <span className="text-xs text-muted-foreground">Vence: {fmtDate(task.due_date)}</span>}
                      {task.estimated_hours > 0 && <span className="text-xs text-muted-foreground">{task.logged_hours}h/{task.estimated_hours}h</span>}
                    </div>
                    {task.progress_pct > 0 && task.progress_pct < 100 && (
                      <Progress value={task.progress_pct} className="h-1 mt-1.5 w-32" />
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Select value={task.status} onValueChange={(v) => v && updateTaskMut.mutate({ taskId: task.id, data: { status: v } })}>
                      <SelectTrigger className="h-7 w-28 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(['todo','in_progress','review','done','cancelled'] as const).map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Button size="icon" variant="ghost" className="size-7 text-destructive"
                      onClick={() => { if (confirm('¿Eliminar tarea?')) deleteTaskMut.mutate(task.id); }}>
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            )))}
          </div>
        </div>)}

        {/* Milestones */}
        {innerTab === 'milestones' && (<div className="mt-3">
          {msQ.isPending ? <Skeleton className="h-40 w-full" /> :
           milestones.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground"><Flag className="mx-auto size-8 mb-2 opacity-30" /><p>Sin hitos</p></div>
           ) : (
            <div className="space-y-2">
              {milestones.map((ms) => (
                <div key={ms.id} className="flex items-center gap-3 rounded border p-3">
                  <Flag className={`size-4 shrink-0 ${ms.status === 'invoiced' ? 'text-green-600' : ms.status === 'achieved' ? 'text-blue-600' : 'text-muted-foreground'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{ms.name}</p>
                    <div className="flex gap-2 mt-0.5">
                      <Badge variant={MS_STATUS_COLORS[ms.status]} className="text-xs">{ms.status}</Badge>
                      {ms.due_date && <span className="text-xs text-muted-foreground">Vence: {fmtDate(ms.due_date)}</span>}
                    </div>
                  </div>
                  <span className="text-sm font-semibold shrink-0">{fmt(ms.amount)}</span>
                  {ms.status === 'pending' && (
                    <Button size="sm" variant="outline"
                      onClick={() => updateMsMut.mutate({ id: ms.id, data: { status: 'achieved' } })}>
                      Logrado
                    </Button>
                  )}
                  {ms.status === 'achieved' && (
                    <Button size="sm" disabled={invoiceMsMut.isPending}
                      onClick={() => invoiceMsMut.mutate(ms.id)}>
                      {invoiceMsMut.isPending ? 'Generando OV...' : 'Facturar'}
                    </Button>
                  )}
                </div>
              ))}
            </div>
           )}
        </div>)}

        {/* Time Logs */}
        {innerTab === 'time' && (<div className="mt-3">
          {timeQ.isPending ? <Skeleton className="h-40 w-full" /> :
           timeLogs.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground"><Clock className="mx-auto size-8 mb-2 opacity-30" /><p>Sin registros de horas</p></div>
           ) : (
            <div className="space-y-2">
              {(timeLogs as Record<string, unknown>[]).map((l, i) => (
                <div key={i} className="rounded-2xl border bg-card p-3 flex items-center gap-4 hover:shadow-sm hover:border-primary/20 transition-all">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm">{String(l.description ?? '—')}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{fmtDate(String(l.logged_date))}</p>
                  </div>
                  <div className="hidden sm:flex items-center gap-4 text-sm shrink-0">
                    <span className="font-medium">{Number(l.hours)}h</span>
                    <span className="text-muted-foreground">{fmt(Number(l.cost))}</span>
                  </div>
                  {l.billable ? <CheckCircle className="size-4 text-green-600 shrink-0" /> : <span className="text-muted-foreground text-xs shrink-0">No facturable</span>}
                </div>
              ))}
            </div>
           )}
        </div>)}

        {/* Gantt */}
        {innerTab === 'gantt' && (<div className="mt-3">
          {tasksQ.isPending
            ? <Skeleton className="h-48 w-full" />
            : <GanttChart tasks={tasks} />
          }
        </div>)}

      {/* Task Dialog */}
      <Dialog open={taskDialog} onOpenChange={setTaskDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Nueva Tarea</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Título <span className="text-destructive">*</span></Label>
              <Input value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Prioridad</Label>
                <Select value={taskPriority} onValueChange={(v) => setTaskPriority(v ?? 'normal')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{['low','normal','high','critical'].map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Vence</Label>
                <Input type="date" value={taskDue} onChange={(e) => setTaskDue(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Horas estimadas</Label>
                <Input type="number" min={0} value={taskEst} onChange={(e) => setTaskEst(e.target.value)} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTaskDialog(false)}>Cancelar</Button>
            <Button onClick={() => createTaskMut.mutate({ title: taskTitle, priority: taskPriority, due_date: taskDue || undefined, estimated_hours: parseFloat(taskEst) || 0 })}
              disabled={createTaskMut.isPending || !taskTitle.trim()}>
              {createTaskMut.isPending ? 'Creando…' : 'Crear Tarea'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Milestone Dialog */}
      <Dialog open={msDialog} onOpenChange={setMsDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Nuevo Hito</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Nombre <span className="text-destructive">*</span></Label>
              <Input value={msName} onChange={(e) => setMsName(e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Monto</Label>
                <Input type="number" min={0} value={msAmount} onChange={(e) => setMsAmount(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Fecha límite</Label>
                <Input type="date" value={msDue} onChange={(e) => setMsDue(e.target.value)} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMsDialog(false)}>Cancelar</Button>
            <Button onClick={() => createMsMut.mutate({ name: msName, amount: parseFloat(msAmount) || 0, due_date: msDue || undefined })}
              disabled={createMsMut.isPending || !msName.trim()}>
              {createMsMut.isPending ? 'Creando…' : 'Crear Hito'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Time Log Dialog */}
      <Dialog open={timeDialog} onOpenChange={setTimeDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Registrar Horas</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Horas <span className="text-destructive">*</span></Label>
                <Input type="number" min={0.25} step={0.25} value={timeHours} onChange={(e) => setTimeHours(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Fecha</Label>
                <Input type="date" value={timeDate} onChange={(e) => setTimeDate(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Tarifa/hora</Label>
                <Input type="number" min={0} value={timeRate} onChange={(e) => setTimeRate(e.target.value)} /></div>
              <div className="space-y-1.5 flex items-center gap-2 pt-5">
                <input type="checkbox" id="billable" checked={timeBillable} onChange={(e) => setTimeBillable(e.target.checked)} className="size-4" />
                <Label htmlFor="billable">Facturable</Label>
              </div>
            </div>
            <div className="space-y-1.5"><Label>Descripción</Label>
              <Textarea value={timeDesc} onChange={(e) => setTimeDesc(e.target.value)} rows={2} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTimeDialog(false)}>Cancelar</Button>
            <Button onClick={() => logTimeMut.mutate({ hours: parseFloat(timeHours) || 1, logged_date: timeDate || undefined, description: timeDesc || undefined, billable: timeBillable, hourly_rate: parseFloat(timeRate) || 0 })}
              disabled={logTimeMut.isPending}>
              {logTimeMut.isPending ? 'Guardando…' : 'Registrar'}
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

export default function ProjectsPage() {
  const params  = useParams();
  const slug    = params.slug as string;
  const qc      = useQueryClient();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch]             = useState('');
  const [createOpen, setCreateOpen]     = useState(false);

  // Create form
  const [name, setName]       = useState('');
  const [type, setType]       = useState('fixed_price');
  const [budget, setBudget]   = useState('0');
  const [start, setStart]     = useState('');
  const [end, setEnd]         = useState('');
  const [desc, setDesc]       = useState('');

  const projectsQ = useQuery({
    queryKey: [slug, 'projects', statusFilter, search],
    queryFn:  () => projectsApi.list({ status: statusFilter !== 'all' ? statusFilter : undefined, search: search || undefined }),
  });

  const projects: Project[] = (projectsQ.data as { data?: Project[] })?.data ?? [];

  const createMut = useMutation({
    mutationFn: (d: unknown) => projectsApi.create(d),
    onSuccess: () => { notify.success('Proyecto creado.'); qc.invalidateQueries({ queryKey: [slug, 'projects'] }); setCreateOpen(false); setName(''); },
    onError: (e: unknown) => notify.error((e as { message?: string }).message ?? 'Error'),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: unknown }) => projectsApi.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: [slug, 'projects'] }),
    onError: (e: unknown) => notify.error((e as { message?: string }).message ?? 'Error'),
  });
  const deleteMut = useMutation({
    mutationFn: (id: number) => projectsApi.delete(id),
    onSuccess: () => { notify.success('Eliminado.'); qc.invalidateQueries({ queryKey: [slug, 'projects'] }); },
    onError: (e: unknown) => notify.error((e as { message?: string }).message ?? 'Error'),
  });

  if (selectedId !== null) {
    return (
      <div className="p-6">
        <ProjectDetailView projectId={selectedId} slug={slug} onBack={() => setSelectedId(null)} />
      </div>
    );
  }

  return (
    <AddonGate moduleKey="projects" slug={slug}>
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Gestión de Proyectos</h1>
        <Button onClick={() => setCreateOpen(true)}><Plus className="mr-2 size-4" />Nuevo Proyecto</Button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input placeholder="Buscar por nombre o código…" value={search} onChange={(e) => setSearch(e.target.value)} className="sm:w-64" />
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v ?? 'all')}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="planning">Planificación</SelectItem>
            <SelectItem value="active">Activos</SelectItem>
            <SelectItem value="on_hold">En pausa</SelectItem>
            <SelectItem value="completed">Completados</SelectItem>
            <SelectItem value="cancelled">Cancelados</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {projectsQ.isPending ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-48 w-full" />)}
        </div>
      ) : projects.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground">
          <FolderKanban className="mx-auto size-12 mb-3 opacity-30" /><p>No hay proyectos</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((p) => (
            <Card key={p.id} className="cursor-pointer hover:shadow-sm transition-shadow" onClick={() => setSelectedId(p.id)}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs text-muted-foreground font-mono">{p.code}</p>
                    <CardTitle className="text-base">{p.name}</CardTitle>
                  </div>
                  <Badge variant={PROJ_STATUS_COLORS[p.status]}>{PROJ_STATUS_LABELS[p.status]}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-1 text-xs text-muted-foreground">
                  <div>Presupuesto: <span className="font-semibold text-foreground">{fmt(p.budget)}</span></div>
                  <div>Gastado: <span className="font-semibold text-foreground">{fmt(p.cost_actual)}</span></div>
                  {p.start_date && <div>Inicio: {fmtDate(p.start_date)}</div>}
                  {p.end_date && <div>Fin: {fmtDate(p.end_date)}</div>}
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{p.tasks_count ?? 0} tareas</span>
                  <span>{p.members_count ?? 0} miembro(s)</span>
                </div>
                <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                  <Select value={p.status} onValueChange={(v) => v && updateMut.mutate({ id: p.id, data: { status: v } })}>
                    <SelectTrigger className="h-7 w-28 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(['planning','active','on_hold','completed','cancelled'] as const).map((s) => (
                        <SelectItem key={s} value={s}>{PROJ_STATUS_LABELS[s]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button size="icon" variant="ghost" className="size-7 text-destructive"
                    onClick={() => { if (confirm('¿Eliminar proyecto?')) deleteMut.mutate(p.id); }}>
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Nuevo Proyecto</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Nombre <span className="text-destructive">*</span></Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Tipo</Label>
                <Select value={type} onValueChange={(v) => setType(v ?? 'fixed_price')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fixed_price">Precio fijo</SelectItem>
                    <SelectItem value="time_material">Tiempo y materiales</SelectItem>
                    <SelectItem value="milestone">Por hitos</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Presupuesto</Label>
                <Input type="number" min={0} value={budget} onChange={(e) => setBudget(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Fecha inicio</Label>
                <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Fecha fin</Label>
                <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
            </div>
            <div className="space-y-1.5"><Label>Descripción</Label>
              <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button onClick={() => createMut.mutate({ name, type, budget: parseFloat(budget) || 0, start_date: start || undefined, end_date: end || undefined, description: desc || undefined })}
              disabled={createMut.isPending || !name.trim()}>
              {createMut.isPending ? 'Creando…' : 'Crear Proyecto'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </AddonGate>
  );
}
