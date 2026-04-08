'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notify } from '@/lib/notify';
import { useForm } from 'react-hook-form';
import { standardSchemaResolver as zodResolver } from '@hookform/resolvers/standard-schema';
import { z } from 'zod';
import {
  centralNotificationsApi,
  notificationRulesApi,
  type NotificationRule,
} from '@/lib/api/central.api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Bell, Send, AlertTriangle, Mail, BellRing, Zap, Plus,
  Pencil, Trash2, Play, ToggleLeft, ToggleRight, Clock,
  UserPlus, CreditCard, TimerOff, CalendarDays,
} from 'lucide-react';

// ─── Constants ────────────────────────────────────────────────────────────────

const TYPE_BADGE: Record<string, 'default' | 'secondary' | 'destructive'> = {
  info: 'secondary', warning: 'default', billing: 'default', system: 'secondary',
};
const TYPE_LABEL: Record<string, string> = {
  info: 'Info', warning: 'Advertencia', billing: 'Facturación', system: 'Sistema',
};
const CHANNEL_LABEL: Record<string, string> = {
  email: 'Email', in_app: 'Push', both: 'Email + Push',
};
const STATUS_BADGE: Record<string, 'default' | 'secondary' | 'destructive'> = {
  sent: 'secondary', pending: 'default', failed: 'destructive',
};
const STATUS_LABEL: Record<string, string> = {
  sent: 'Enviado', pending: 'Pendiente', failed: 'Fallido',
};
const TRIGGER_LABEL: Record<string, string> = {
  tenant_created:   'Nuevo registro',
  trial_expiring:   'Trial por vencer',
  trial_expired:    'Trial expirado',
  payment_due:      'Pago próximo',
  payment_overdue:  'Pago vencido',
};
const TRIGGER_ICON: Record<string, React.ReactNode> = {
  tenant_created:  <UserPlus  className="size-4" />,
  trial_expiring:  <Clock     className="size-4" />,
  trial_expired:   <TimerOff  className="size-4" />,
  payment_due:     <CreditCard className="size-4" />,
  payment_overdue: <AlertTriangle className="size-4" />,
};
const WEEK_DAYS = [
  { num: 1, short: 'Lu' },
  { num: 2, short: 'Ma' },
  { num: 3, short: 'Mi' },
  { num: 4, short: 'Ju' },
  { num: 5, short: 'Vi' },
  { num: 6, short: 'Sá' },
  { num: 7, short: 'Do' },
];

function fmtSchedule(runAt?: string | null, runDays?: number[] | null): string {
  if (!runAt) return 'Sin horario automático';
  const days = !runDays || runDays.length === 7
    ? 'Todos los días'
    : runDays.map((d) => WEEK_DAYS.find((w) => w.num === d)?.short ?? d).join(', ');
  return `${runAt} · ${days}`;
}

const TRIGGER_COLOR: Record<string, string> = {
  tenant_created:  'text-emerald-600 bg-emerald-50',
  trial_expiring:  'text-amber-600 bg-amber-50',
  trial_expired:   'text-orange-600 bg-orange-50',
  payment_due:     'text-blue-600 bg-blue-50',
  payment_overdue: 'text-red-600 bg-red-50',
};

// ─── Send Notification Dialog ─────────────────────────────────────────────────

const sendSchema = z.object({
  subject:      z.string().min(3, 'Asunto requerido'),
  body:         z.string().min(10, 'Cuerpo requerido'),
  type:         z.string().min(1),
  via_email:    z.boolean(),
  via_push:     z.boolean(),
  display_type: z.enum(['toast', 'modal']),
}).refine((d) => d.via_email || d.via_push, {
  message: 'Selecciona al menos un canal', path: ['via_email'],
});
type SendForm = z.infer<typeof sendSchema>;

function SendNotificationDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { register, handleSubmit, setValue, watch, reset, formState: { errors, isSubmitting } } =
    useForm<SendForm>({
      resolver: zodResolver(sendSchema),
      defaultValues: { type: 'info', subject: '', body: '', via_email: true, via_push: true, display_type: 'toast' },
    });
  const viaEmail = watch('via_email'), viaPush = watch('via_push'), displayType = watch('display_type');
  const channelValue = (): 'email' | 'in_app' | 'both' =>
    viaEmail && viaPush ? 'both' : viaEmail ? 'email' : 'in_app';

  const mutation = useMutation({
    mutationFn: (data: SendForm) =>
      centralNotificationsApi.send({
        subject: data.subject, body: data.body,
        type: data.type as 'info' | 'warning' | 'billing' | 'system',
        tenant_ids: 'all', channel: channelValue(),
        display_type: data.via_push ? data.display_type : undefined,
      }),
    onSuccess: (res) => {
      const d = res.data as { message?: string; recipients?: number };
      queryClient.invalidateQueries({ queryKey: ['central-notifications'] });
      notify.success(d.message ?? `Enviada a ${d.recipients ?? '?'} tenant(s)`);
      reset(); onClose();
    },
    onError: (err) => notify.error(err, 'Error al enviar'),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="size-4" /> Enviar notificación a todos los tenants
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <Select defaultValue="info" onValueChange={(v) => v && setValue('type', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="info">Información</SelectItem>
                <SelectItem value="warning">Advertencia</SelectItem>
                <SelectItem value="billing">Facturación</SelectItem>
                <SelectItem value="system">Sistema</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Asunto</Label>
            <Input {...register('subject')} placeholder="Asunto de la notificación" />
            {errors.subject && <p className="text-xs text-destructive">{errors.subject.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Mensaje</Label>
            <textarea {...register('body')} rows={4} placeholder="Escribe el mensaje..."
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" />
            {errors.body && <p className="text-xs text-destructive">{errors.body.message}</p>}
          </div>
          <div className="space-y-2">
            <Label>Canales</Label>
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <Checkbox checked={viaEmail} onCheckedChange={(v) => setValue('via_email', !!v)} />
                <Mail className="size-4 text-muted-foreground" /><span className="text-sm">Correo electrónico</span>
              </label>
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <Checkbox checked={viaPush} onCheckedChange={(v) => setValue('via_push', !!v)} />
                <BellRing className="size-4 text-muted-foreground" /><span className="text-sm">Push en el sistema</span>
              </label>
            </div>
            {errors.via_email && <p className="text-xs text-destructive">{errors.via_email.message}</p>}
          </div>
          {viaPush && (
            <div className="space-y-2">
              <Label>Visualización</Label>
              <div className="grid grid-cols-2 gap-2">
                {(['toast', 'modal'] as const).map((dt) => (
                  <button key={dt} type="button" onClick={() => setValue('display_type', dt)}
                    className={`flex flex-col items-center gap-1 rounded-lg border-2 px-3 py-2 text-sm transition-colors ${displayType === dt ? 'border-primary bg-primary/5 text-primary' : 'border-border text-muted-foreground hover:border-muted-foreground'}`}>
                    {dt === 'toast' ? <BellRing className="size-4" /> : <Bell className="size-4" />}
                    <span className="font-medium">{dt === 'toast' ? 'Toast' : 'Pop-up'}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md p-3 flex items-start gap-2 text-sm">
            <AlertTriangle className="size-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-amber-800 dark:text-amber-300">Se enviará a <strong>todos los tenants activos</strong>.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" type="button" onClick={onClose} disabled={isSubmitting}>Cancelar</Button>
            <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Enviando...' : 'Enviar'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Rule Form Dialog ─────────────────────────────────────────────────────────

const ruleSchema = z.object({
  name:              z.string().min(3, 'Nombre requerido'),
  description:       z.string().optional(),
  event_trigger:     z.enum(['tenant_created', 'trial_expiring', 'trial_expired', 'payment_due', 'payment_overdue']),
  days_offset:       z.coerce.number().int().min(1).max(365).optional().nullable(),
  subject:           z.string().min(3, 'Asunto requerido'),
  body:              z.string().min(10, 'Mensaje requerido'),
  notification_type: z.enum(['info', 'warning', 'billing', 'system']),
  channel:           z.enum(['email', 'in_app', 'both']),
  display_type:      z.enum(['toast', 'modal']),
  is_active:         z.boolean(),
  run_at:            z.string().regex(/^\d{2}:\d{2}$/, 'Formato HH:MM').optional().nullable(),
  run_days:          z.array(z.number().int().min(1).max(7)).optional().nullable(),
});
type RuleForm = z.infer<typeof ruleSchema>;

function RuleFormDialog({
  rule,
  onClose,
}: { rule: NotificationRule | null | 'new'; onClose: () => void }) {
  const queryClient = useQueryClient();
  const isNew = rule === 'new';
  const existing = !isNew ? rule as NotificationRule : null;

  const { register, handleSubmit, setValue, watch, reset, formState: { errors, isSubmitting } } =
    useForm<RuleForm>({
      resolver: zodResolver(ruleSchema),
      defaultValues: existing ? {
        name:              existing.name,
        description:       existing.description ?? '',
        event_trigger:     existing.event_trigger,
        days_offset:       existing.days_offset ?? undefined,
        subject:           existing.subject,
        body:              existing.body,
        notification_type: existing.notification_type,
        channel:           existing.channel,
        display_type:      existing.display_type,
        is_active:         existing.is_active,
        run_at:            existing.run_at ?? '10:00',
        run_days:          existing.run_days ?? null,
      } : {
        event_trigger: 'tenant_created', notification_type: 'info',
        channel: 'both', display_type: 'toast', is_active: true,
        run_at: '10:00', run_days: null,
      },
    });

  const trigger          = watch('event_trigger');
  const notifType        = watch('notification_type');
  const channel          = watch('channel');
  const displayType      = watch('display_type');
  const runAt            = watch('run_at');
  const runDays          = watch('run_days') ?? null;
  const needsDays        = ['trial_expiring', 'payment_due'].includes(trigger);

  function toggleDay(day: number) {
    const current = runDays ?? [];
    const next = current.includes(day) ? current.filter((d) => d !== day) : [...current, day].sort();
    setValue('run_days', next.length === 0 ? null : next);
  }

  const mutation = useMutation({
    mutationFn: (data: RuleForm) =>
      isNew
        ? notificationRulesApi.create({ ...data, target_all: true })
        : notificationRulesApi.update(existing!.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-rules'] });
      notify.success(isNew ? 'Regla creada' : 'Regla actualizada');
      reset(); onClose();
    },
    onError: (err) => notify.error(err, 'Error al guardar regla'),
  });

  return (
    <Dialog open={!!rule} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="size-4" />
            {isNew ? 'Nueva regla de automatización' : `Editar — ${existing?.name}`}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label>Nombre</Label>
              <Input {...register('name')} placeholder="Ej: Bienvenida al sistema" />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Descripción <span className="text-muted-foreground">(opcional)</span></Label>
              <Input {...register('description')} placeholder="Describe cuándo y por qué se envía" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Disparador</Label>
              <Select value={trigger} onValueChange={(v) => v && setValue('event_trigger', v as RuleForm['event_trigger'])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="tenant_created">Nuevo registro de tenant</SelectItem>
                  <SelectItem value="trial_expiring">Trial por vencer (X días antes)</SelectItem>
                  <SelectItem value="trial_expired">Trial expirado (hoy)</SelectItem>
                  <SelectItem value="payment_due">Pago próximo (X días antes)</SelectItem>
                  <SelectItem value="payment_overdue">Pago vencido</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {needsDays && (
              <div className="space-y-1.5">
                <Label>Días de anticipación</Label>
                <Input {...register('days_offset')} type="number" min={1} max={365} placeholder="Ej: 3" />
                {errors.days_offset && <p className="text-xs text-destructive">{errors.days_offset.message}</p>}
              </div>
            )}
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={notifType} onValueChange={(v) => v && setValue('notification_type', v as RuleForm['notification_type'])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="info">Información</SelectItem>
                  <SelectItem value="warning">Advertencia</SelectItem>
                  <SelectItem value="billing">Facturación</SelectItem>
                  <SelectItem value="system">Sistema</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Canal</Label>
              <Select value={channel} onValueChange={(v) => v && setValue('channel', v as RuleForm['channel'])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="email">Solo email</SelectItem>
                  <SelectItem value="in_app">Solo push</SelectItem>
                  <SelectItem value="both">Email + Push</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Visualización push</Label>
              <Select value={displayType} onValueChange={(v) => v && setValue('display_type', v as RuleForm['display_type'])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="toast">Toast</SelectItem>
                  <SelectItem value="modal">Pop-up</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Asunto</Label>
            <Input {...register('subject')} placeholder="Asunto del mensaje" />
            {errors.subject && <p className="text-xs text-destructive">{errors.subject.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Mensaje</Label>
            <textarea {...register('body')} rows={4} placeholder="Cuerpo del mensaje..."
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" />
            {errors.body && <p className="text-xs text-destructive">{errors.body.message}</p>}
          </div>

          {/* ── Horario ─────────────────────────────────────────────────────── */}
          {trigger !== 'tenant_created' && (
            <div className="space-y-3 rounded-lg border p-4 bg-muted/30">
              <div className="flex items-center gap-2 text-sm font-medium">
                <CalendarDays className="size-4 text-primary" />
                Horario de ejecución automática
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Hora <span className="text-muted-foreground">(HH:MM)</span></Label>
                  <Input
                    {...register('run_at')}
                    type="time"
                    className="font-mono"
                    placeholder="10:00"
                  />
                  {errors.run_at && <p className="text-xs text-destructive">{errors.run_at.message}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Días <span className="text-muted-foreground">(vacío = todos)</span></Label>
                  <div className="flex gap-1 flex-wrap">
                    {WEEK_DAYS.map((d) => {
                      const active = runDays ? runDays.includes(d.num) : true;
                      return (
                        <button
                          key={d.num}
                          type="button"
                          onClick={() => toggleDay(d.num)}
                          className={`w-8 h-8 rounded-md text-xs font-medium border transition-colors ${
                            runDays === null || runDays.includes(d.num)
                              ? 'bg-primary text-primary-foreground border-primary'
                              : 'bg-background text-muted-foreground border-border hover:border-muted-foreground'
                          }`}
                        >
                          {d.short}
                        </button>
                      );
                    })}
                    {runDays !== null && runDays.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setValue('run_days', null)}
                        className="text-xs text-muted-foreground hover:text-foreground underline ml-1"
                      >
                        todos
                      </button>
                    )}
                  </div>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                El sistema evalúa los horarios cada 5 minutos. La regla no se ejecutará más de una vez al día.
              </p>
            </div>
          )}

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <Checkbox checked={watch('is_active')} onCheckedChange={(v) => setValue('is_active', !!v)} />
            <span className="text-sm font-medium">Regla activa</span>
          </label>

          <DialogFooter>
            <Button variant="outline" type="button" onClick={onClose} disabled={isSubmitting}>Cancelar</Button>
            <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Guardando...' : 'Guardar regla'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Automation Tab ───────────────────────────────────────────────────────────

function AutomationsTab() {
  const queryClient = useQueryClient();
  const [editRule, setEditRule]       = useState<NotificationRule | null | 'new'>(null);
  const [deleteRule, setDeleteRule]   = useState<NotificationRule | null>(null);

  const { data: rules = [], isLoading } = useQuery({
    queryKey: ['notification-rules'],
    queryFn: () => notificationRulesApi.list().then((r) => r.data as unknown as NotificationRule[]),
  });

  const toggleMutation = useMutation({
    mutationFn: (id: number) => notificationRulesApi.toggle(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notification-rules'] }),
    onError: (err) => notify.error(err, 'Error al cambiar estado'),
  });

  const runMutation = useMutation({
    mutationFn: (id: number) => notificationRulesApi.runNow(id),
    onSuccess: (res) => {
      const d = res.data as { stats?: { sent: number } };
      queryClient.invalidateQueries({ queryKey: ['notification-rules'] });
      notify.success(`Ejecutada · ${d.stats?.sent ?? 0} notificaciones enviadas`);
    },
    onError: (err) => notify.error(err, 'Error al ejecutar'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => notificationRulesApi.destroy(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-rules'] });
      notify.success('Regla eliminada');
      setDeleteRule(null);
    },
    onError: (err) => notify.error(err, 'Error al eliminar'),
  });

  const activeCount = rules.filter((r) => r.is_active).length;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            {activeCount} de {rules.length} reglas activas — se ejecutan automáticamente a las 10:00 AM
          </p>
        </div>
        <Button size="sm" onClick={() => setEditRule('new')}>
          <Plus className="size-3.5 mr-1.5" /> Nueva regla
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      ) : rules.length === 0 ? (
        <div className="py-16 text-center">
          <Zap className="size-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm text-muted-foreground">No hay reglas configuradas</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rules.map((rule) => (
            <div key={rule.id}
              className={`border rounded-xl p-4 transition-colors ${rule.is_active ? 'bg-background' : 'bg-muted/30 opacity-70'}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  {/* Trigger icon */}
                  <div className={`flex items-center justify-center rounded-lg p-2 shrink-0 ${TRIGGER_COLOR[rule.event_trigger] ?? 'text-muted-foreground bg-muted'}`}>
                    {TRIGGER_ICON[rule.event_trigger]}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-sm">{rule.name}</p>
                      <Badge variant={rule.is_active ? 'default' : 'secondary'} className="text-[10px]">
                        {rule.is_active ? 'Activa' : 'Inactiva'}
                      </Badge>
                      <Badge variant={TYPE_BADGE[rule.notification_type]} className="text-[10px]">
                        {TYPE_LABEL[rule.notification_type]}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{CHANNEL_LABEL[rule.channel]}</span>
                    </div>
                    {rule.description && (
                      <p className="text-xs text-muted-foreground mt-0.5">{rule.description}</p>
                    )}
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground flex-wrap">
                      <span className="flex items-center gap-1">
                        <Zap className="size-3" />
                        {TRIGGER_LABEL[rule.event_trigger]}
                        {rule.days_offset ? ` · ${rule.days_offset} días antes` : ''}
                      </span>
                      {rule.event_trigger !== 'tenant_created' && (
                        <span className="flex items-center gap-1">
                          <Clock className="size-3" />
                          {fmtSchedule(rule.run_at, rule.run_days)}
                        </span>
                      )}
                      <span>{rule.run_count} ejecuciones</span>
                      {rule.last_run_at && (
                        <span>Última: {new Date(rule.last_run_at).toLocaleDateString('es-CO')}</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="ghost" size="sm" className="h-8 px-2 text-xs"
                    title={rule.is_active ? 'Desactivar' : 'Activar'}
                    onClick={() => toggleMutation.mutate(rule.id)}
                    disabled={toggleMutation.isPending}>
                    {rule.is_active
                      ? <ToggleRight className="size-4 text-primary" />
                      : <ToggleLeft  className="size-4 text-muted-foreground" />}
                  </Button>
                  {rule.event_trigger !== 'tenant_created' && (
                    <Button variant="ghost" size="sm" className="h-8 px-2 text-xs text-emerald-600 hover:text-emerald-600 hover:bg-emerald-50"
                      title="Ejecutar ahora"
                      onClick={() => runMutation.mutate(rule.id)}
                      disabled={runMutation.isPending}>
                      <Play className="size-3.5" />
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" className="h-8 px-2 text-xs"
                    title="Editar" onClick={() => setEditRule(rule)}>
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-8 px-2 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                    title="Eliminar" onClick={() => setDeleteRule(rule)}>
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <RuleFormDialog rule={editRule} onClose={() => setEditRule(null)} />

      <AlertDialog open={!!deleteRule} onOpenChange={(v) => !v && setDeleteRule(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar regla</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Eliminar la regla <strong>&quot;{deleteRule?.name}&quot;</strong>? Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending} />
            <AlertDialogAction onClick={() => deleteRule && deleteMutation.mutate(deleteRule.id)} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? 'Eliminando...' : 'Eliminar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function NotificationsPage() {
  const [tab,      setTab]      = useState<'history' | 'automations'>('history');
  const [sendOpen, setSendOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['central-notifications'],
    queryFn: () =>
      centralNotificationsApi.list().then((r) => {
        const p = r.data as { data?: unknown[]; total?: number };
        return { items: p.data ?? [], total: p.total ?? 0 };
      }),
    enabled: tab === 'history',
  });

  const notifications = (data?.items ?? []) as {
    id: number; subject: string; type: string; channel: string;
    status: string; sent_at: string | null; created_at: string;
    tenant?: { name: string; slug: string };
  }[];

  const totalSent = data?.total ?? 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Notificaciones</h1>
          <p className="text-sm text-muted-foreground mt-1">Comunícate y automatiza mensajes a tus tenants</p>
        </div>
        {tab === 'history' && (
          <Button size="sm" onClick={() => setSendOpen(true)}>
            <Send className="mr-1.5 size-3.5" /> Nueva notificación
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {([
          { id: 'history',     label: 'Historial',       icon: <Bell     className="size-3.5" /> },
          { id: 'automations', label: 'Automatizaciones', icon: <Zap      className="size-3.5" /> },
        ] as const).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === t.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* History Tab */}
      {tab === 'history' && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Total enviadas</p>
                <p className="text-2xl font-bold">{totalSent}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Este mes</p>
                <p className="text-2xl font-bold">
                  {notifications.filter((n) => {
                    const d = new Date(n.created_at), now = new Date();
                    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
                  }).length}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Bell className="size-4" /> Historial de notificaciones
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-4 space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
                </div>
              ) : notifications.length === 0 ? (
                <div className="py-12 text-center">
                  <Bell className="size-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm text-muted-foreground">Sin notificaciones enviadas</p>
                </div>
              ) : (
                <div className="divide-y">
                  {notifications.map((n) => (
                    <div key={n.id} className="px-6 py-3 flex items-center justify-between text-sm gap-4">
                      <div className="min-w-0">
                        <p className="font-medium truncate">{n.subject}</p>
                        <p className="text-xs text-muted-foreground">
                          {n.tenant?.name ?? '—'} · {CHANNEL_LABEL[n.channel] ?? n.channel} · {new Date(n.created_at).toLocaleString('es-CO')}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant={STATUS_BADGE[n.status] ?? 'secondary'} className="text-[10px]">
                          {STATUS_LABEL[n.status] ?? n.status}
                        </Badge>
                        <Badge variant={TYPE_BADGE[n.type] ?? 'secondary'}>
                          {TYPE_LABEL[n.type] ?? n.type}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Automations Tab */}
      {tab === 'automations' && <AutomationsTab />}

      <SendNotificationDialog open={sendOpen} onClose={() => setSendOpen(false)} />
    </div>
  );
}
