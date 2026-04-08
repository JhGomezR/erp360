'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notify } from '@/lib/notify';
import {
  FileCheck, Save, AlertTriangle, CheckCircle2, XCircle,
  Clock, RefreshCw, Plus, Send, ExternalLink, Info,
  ShieldCheck, FlaskConical, Lock, Zap,
} from 'lucide-react';

import {
  dianApi,
  posApi,
  billingApi,
  type DianConfig, type RadianEvent, type RadianEventType,
} from '@/lib/api/tenant.api';
import type { Sale } from '@/types';

import { Button }   from '@/components/ui/button';
import { Input }    from '@/components/ui/input';
import { Label }    from '@/components/ui/label';
import { Badge }    from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import {
  Tabs, TabsList, TabsTrigger, TabsContent,
} from '@/components/ui/tabs';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);

const fmtDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

// ─── Meta ──────────────────────────────────────────────────────────────────────

const RADIAN_EVENT_META: Record<RadianEventType, { label: string; code: string; color: string }> = {
  acuse_recibo:      { label: 'Acuse de recibo',       code: '030', color: 'bg-blue-100 text-blue-700' },
  rechazo:           { label: 'Rechazo',                code: '031', color: 'bg-red-100 text-red-700' },
  recibo_bien:       { label: 'Recibo del bien/servicio', code: '032', color: 'bg-amber-100 text-amber-700' },
  aceptacion:        { label: 'Aceptación expresa',     code: '033', color: 'bg-emerald-100 text-emerald-700' },
  aceptacion_tacita: { label: 'Aceptación tácita',      code: '034', color: 'bg-violet-100 text-violet-700' },
};

const EVENT_STATUS_META: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  pending:  { label: 'Pendiente', icon: Clock,        color: 'text-amber-600' },
  sent:     { label: 'Enviado',   icon: Send,         color: 'text-blue-600' },
  accepted: { label: 'Aceptado', icon: CheckCircle2,  color: 'text-emerald-600' },
  failed:   { label: 'Fallido',   icon: XCircle,      color: 'text-red-600' },
};

// ─── Stub warning banner ──────────────────────────────────────────────────────

function StubBanner() {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900/40 px-4 py-3 flex gap-3 text-sm text-amber-800 dark:text-amber-300">
      <FlaskConical className="size-4 shrink-0 mt-0.5" />
      <div>
        <p className="font-medium">Modo stub — integración DIAN pendiente</p>
        <p className="text-xs mt-0.5 text-amber-700 dark:text-amber-400">
          El sistema genera CUFE y procesa la lógica interna correctamente, pero el envío real a la DIAN
          requiere un certificado digital .p12 y la habilitación del software en el portal DIAN.
          Para producción, conectar con un proveedor certificado (Siigo, Alegra, myBill, Interfirma).
        </p>
      </div>
    </div>
  );
}

// ─── Config Tab ───────────────────────────────────────────────────────────────

const EMPTY_CONFIG: Partial<DianConfig> = {
  nit: '', nit_dv: '', razon_social: '', tipo_persona: 'juridica', regimen: 'comun',
  actividad_economica: '', responsabilidades_fiscales: 'O-13', direccion: '',
  ciudad: '', departamento: '', telefono: '', email_dian: '',
  ambiente: 'habilitacion', soft_id: '', soft_pin: '',
  resolucion_number: '', resolucion_from: '', resolucion_to: '',
  consecutive_from: undefined, consecutive_to: undefined, prefix: '',
};

function ConfigTab({ slug }: { slug: string }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<Partial<DianConfig>>({ ...EMPTY_CONFIG });
  const [hasConfig, setHasConfig] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['dian-config', slug],
    queryFn: () => dianApi.getConfig().then((r) => r.data).catch(() => null),
    staleTime: 60_000,
    retry: false,
  });

  useEffect(() => {
    if (data) {
      setHasConfig(true);
      setForm({
        nit:                        data.nit ?? '',
        nit_dv:                     data.nit_dv ?? '',
        razon_social:               data.razon_social ?? '',
        tipo_persona:               data.tipo_persona ?? 'juridica',
        regimen:                    data.regimen ?? 'comun',
        actividad_economica:        data.actividad_economica ?? '',
        responsabilidades_fiscales: data.responsabilidades_fiscales ?? '',
        direccion:                  data.direccion ?? '',
        ciudad:                     data.ciudad ?? '',
        departamento:               data.departamento ?? '',
        telefono:                   data.telefono ?? '',
        email_dian:                 data.email_dian ?? '',
        ambiente:                   data.ambiente ?? 'habilitacion',
        soft_id:                    data.soft_id ?? '',
        soft_pin:                   data.soft_pin ?? '',
        resolucion_number:          data.resolucion_number ?? '',
        resolucion_from:            data.resolucion_from ?? '',
        resolucion_to:              data.resolucion_to ?? '',
        consecutive_from:           data.consecutive_from ?? undefined,
        consecutive_to:             data.consecutive_to ?? undefined,
        prefix:                     data.prefix ?? '',
      });
    }
  }, [data]);

  const set = <K extends keyof DianConfig>(k: K, v: DianConfig[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  const saveMutation = useMutation({
    mutationFn: () => dianApi.saveConfig({
      ...form,
      consecutive_from: form.consecutive_from ? Number(form.consecutive_from) : undefined,
      consecutive_to:   form.consecutive_to   ? Number(form.consecutive_to)   : undefined,
      nit_dv:           form.nit_dv   || undefined,
      actividad_economica:        form.actividad_economica        || undefined,
      responsabilidades_fiscales: form.responsabilidades_fiscales || undefined,
      direccion:   form.direccion   || undefined,
      ciudad:      form.ciudad      || undefined,
      departamento:form.departamento|| undefined,
      telefono:    form.telefono    || undefined,
      email_dian:  form.email_dian  || undefined,
      soft_id:     form.soft_id     || undefined,
      soft_pin:    form.soft_pin    || undefined,
      resolucion_number: form.resolucion_number || undefined,
      resolucion_from:   form.resolucion_from   || undefined,
      resolucion_to:     form.resolucion_to     || undefined,
      prefix:      form.prefix      || undefined,
    }),
    onSuccess: () => {
      notify.success('Configuración DIAN guardada');
      qc.invalidateQueries({ queryKey: ['dian-config', slug] });
    },
    onError: (e) => notify.error(e, 'Error al guardar'),
  });

  const canSave = form.nit?.trim() && form.razon_social?.trim();

  if (isLoading) {
    return <div className="flex flex-col gap-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>;
  }

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      {/* Status card */}
      {hasConfig && (
        <div className={`rounded-lg border px-4 py-3 flex items-center gap-3 text-sm ${
          data?.is_valid
            ? 'border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-300'
            : 'border-red-200 bg-red-50 dark:bg-red-950/20 text-red-800 dark:text-red-300'
        }`}>
          {data?.is_valid
            ? <><ShieldCheck className="size-4 shrink-0" /> Resolución DIAN <strong>vigente</strong> — ambiente: <strong>{data.ambiente}</strong></>
            : <><AlertTriangle className="size-4 shrink-0" /> Resolución <strong>vencida o consecutivos agotados</strong>. Actualiza los datos de la resolución.</>
          }
        </div>
      )}

      {/* Datos del emisor */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Datos del emisor</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="sm:col-span-2 flex flex-col gap-1.5">
            <Label>NIT *</Label>
            <div className="flex gap-2">
              <Input value={form.nit ?? ''} onChange={(e) => set('nit', e.target.value)} placeholder="900123456" className="font-mono flex-1" />
              <div className="flex flex-col gap-1">
                <Input value={form.nit_dv ?? ''} onChange={(e) => set('nit_dv', e.target.value)} placeholder="DV" className="w-16 font-mono text-center" maxLength={2} />
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Prefijo factura</Label>
            <Input value={form.prefix ?? ''} onChange={(e) => set('prefix', e.target.value)} placeholder="FE, SETP…" className="font-mono" />
          </div>
          <div className="sm:col-span-3 flex flex-col gap-1.5">
            <Label>Razón social *</Label>
            <Input value={form.razon_social ?? ''} onChange={(e) => set('razon_social', e.target.value)} placeholder="Nombre completo o razón social" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Tipo de persona</Label>
            <Select value={form.tipo_persona} onValueChange={(v) => set('tipo_persona', v as 'natural' | 'juridica')}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="juridica">Jurídica</SelectItem>
                <SelectItem value="natural">Natural</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Régimen</Label>
            <Select value={form.regimen} onValueChange={(v) => set('regimen', v as 'comun' | 'simplificado')}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="comun">Común (responsable de IVA)</SelectItem>
                <SelectItem value="simplificado">Simplificado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Actividad económica (CIIU)</Label>
            <Input value={form.actividad_economica ?? ''} onChange={(e) => set('actividad_economica', e.target.value)} placeholder="4711" className="font-mono" />
          </div>
          <div className="sm:col-span-3 flex flex-col gap-1.5">
            <Label>Responsabilidades fiscales</Label>
            <Input value={form.responsabilidades_fiscales ?? ''} onChange={(e) => set('responsabilidades_fiscales', e.target.value)} placeholder="O-13;O-15 (separar con punto y coma)" />
          </div>
          <div className="sm:col-span-2 flex flex-col gap-1.5">
            <Label>Dirección</Label>
            <Input value={form.direccion ?? ''} onChange={(e) => set('direccion', e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Ciudad</Label>
            <Input value={form.ciudad ?? ''} onChange={(e) => set('ciudad', e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Departamento</Label>
            <Input value={form.departamento ?? ''} onChange={(e) => set('departamento', e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Teléfono</Label>
            <Input value={form.telefono ?? ''} onChange={(e) => set('telefono', e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Email DIAN</Label>
            <Input type="email" value={form.email_dian ?? ''} onChange={(e) => set('email_dian', e.target.value)} placeholder="facturacion@empresa.com" />
          </div>
        </CardContent>
      </Card>

      {/* Resolución y consecutivos */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Resolución de facturación</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="sm:col-span-3 flex flex-col gap-1.5">
            <Label>Número de resolución</Label>
            <Input value={form.resolucion_number ?? ''} onChange={(e) => set('resolucion_number', e.target.value)} placeholder="18764000001234" className="font-mono" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Vigencia desde</Label>
            <Input type="date" value={form.resolucion_from ?? ''} onChange={(e) => set('resolucion_from', e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Vigencia hasta</Label>
            <Input type="date" value={form.resolucion_to ?? ''} onChange={(e) => set('resolucion_to', e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5" />
          <div className="flex flex-col gap-1.5">
            <Label>Consecutivo inicial</Label>
            <Input type="number" min={1} value={form.consecutive_from ?? ''} onChange={(e) => set('consecutive_from', Number(e.target.value) as any)} placeholder="1" className="font-mono" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Consecutivo final</Label>
            <Input type="number" min={1} value={form.consecutive_to ?? ''} onChange={(e) => set('consecutive_to', Number(e.target.value) as any)} placeholder="5000000" className="font-mono" />
          </div>
        </CardContent>
      </Card>

      {/* Ambiente y credenciales */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Ambiente y software</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="sm:col-span-3 flex flex-col gap-2">
            <Label>Ambiente DIAN</Label>
            <div className="flex gap-4">
              {([
                { val: 'habilitacion', label: 'Habilitación (pruebas)', desc: 'Todas las facturas son de prueba' },
                { val: 'produccion',   label: 'Producción',             desc: 'Facturas con validez legal' },
              ] as const).map(({ val, label, desc }) => (
                <label key={val} className={`flex-1 cursor-pointer rounded-lg border-2 px-4 py-3 transition-colors ${form.ambiente === val ? 'border-primary bg-primary/5' : 'border-border'}`}>
                  <input type="radio" className="sr-only" checked={form.ambiente === val} onChange={() => set('ambiente', val)} />
                  <p className="font-medium text-sm">{label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                </label>
              ))}
            </div>
            {form.ambiente === 'produccion' && (
              <div className="rounded-md bg-red-50 dark:bg-red-950/20 border border-red-200 px-3 py-2 text-xs text-red-700 dark:text-red-400 flex gap-2">
                <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
                En producción las facturas tienen validez tributaria. Asegúrate de tener el certificado digital habilitado.
              </div>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Software ID (DIAN)</Label>
            <Input value={form.soft_id ?? ''} onChange={(e) => set('soft_id', e.target.value)} className="font-mono text-sm" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Software PIN (DIAN)</Label>
            <Input type="password" value={form.soft_pin ?? ''} onChange={(e) => set('soft_pin', e.target.value)} placeholder="PIN del software registrado" />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button disabled={!canSave || saveMutation.isPending} onClick={() => saveMutation.mutate()} className="gap-2">
          <Save className="size-4" />
          {saveMutation.isPending ? 'Guardando…' : 'Guardar configuración'}
        </Button>
      </div>
    </div>
  );
}

// ─── Invoices Tab ─────────────────────────────────────────────────────────────

function InvoicesTab({ slug }: { slug: string }) {
  const [emitResult, setEmitResult] = useState<{ cufe: string; invoice_num: string; qr_data: string; environment: string } | null>(null);
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['pos-sales-dian', slug, page],
    queryFn: () => posApi.sales({ page, per_page: 20 }).then((r) => r.data),
    staleTime: 15_000,
  });

  const sales: Sale[]   = (data as any)?.data ?? [];
  const lastPage: number = (data as any)?.last_page ?? 1;
  const total: number   = (data as any)?.total ?? 0;

  const emitMutation = useMutation({
    mutationFn: (sale_id: number) => dianApi.emitInvoice(sale_id),
    onSuccess: (res) => {
      notify.success('Factura electrónica emitida');
      setEmitResult(res.data.invoice);
    },
    onError: (e) => notify.error(e, 'Error al emitir'),
  });

  return (
    <div className="flex flex-col gap-4">
      {/* Emit result dialog */}
      <Dialog open={emitResult !== null} onOpenChange={(v) => !v && setEmitResult(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="size-4 text-emerald-500" />
              Factura electrónica emitida
            </DialogTitle>
          </DialogHeader>
          {emitResult && (
            <div className="flex flex-col gap-3 text-sm">
              <div className="rounded-lg bg-muted p-3 flex flex-col gap-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">N° Factura</span>
                  <span className="font-mono font-bold">{emitResult.invoice_num}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Ambiente</span>
                  <Badge variant={emitResult.environment === 'produccion' ? 'default' : 'secondary'}>
                    {emitResult.environment}
                  </Badge>
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-xs">CUFE</Label>
                <code className="text-[10px] font-mono bg-muted p-2 rounded-md break-all leading-relaxed">
                  {emitResult.cufe}
                </code>
              </div>
              <a
                href={emitResult.qr_data}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs text-primary hover:underline"
              >
                <ExternalLink className="size-3.5" />
                Verificar en portal DIAN
              </a>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setEmitResult(null)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Info */}
      <div className="rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/40 px-4 py-3 flex gap-2 text-xs text-blue-800 dark:text-blue-300">
        <Info className="size-3.5 shrink-0 mt-0.5" />
        Las ventas con un CUFE ya tienen factura electrónica emitida. Haz clic en <strong>Emitir FE</strong> en las ventas que aún no la tienen.
      </div>

      {/* Sales table */}
      <div className="rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground uppercase">
            <tr>
              <th className="px-3 py-2 text-left">Código</th>
              <th className="px-3 py-2 text-left">Fecha</th>
              <th className="px-3 py-2 text-right">Total</th>
              <th className="px-3 py-2 text-left">N° Factura</th>
              <th className="px-3 py-2 text-left">CUFE</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading && Array.from({ length: 6 }).map((_, i) => (
              <tr key={i}>
                {Array.from({ length: 6 }).map((__, j) => (
                  <td key={j} className="px-3 py-2"><Skeleton className="h-4 w-full" /></td>
                ))}
              </tr>
            ))}
            {!isLoading && sales.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-10 text-center text-muted-foreground text-xs">Sin ventas registradas.</td>
              </tr>
            )}
            {!isLoading && sales.map((sale: any) => {
              const hasCufe = Boolean(sale.cufe);
              return (
                <tr key={sale.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-3 py-2 font-mono text-xs font-medium">{sale.code ?? sale.sale_number}</td>
                  <td className="px-3 py-2 text-muted-foreground">{fmtDate(sale.created_at)}</td>
                  <td className="px-3 py-2 text-right font-medium">{fmt(sale.total)}</td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {sale.invoice_number
                      ? <span className="text-emerald-600 font-semibold">{sale.invoice_number}</span>
                      : <span className="text-muted-foreground">—</span>
                    }
                  </td>
                  <td className="px-3 py-2">
                    {hasCufe ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-mono text-muted-foreground">
                        <CheckCircle2 className="size-3 text-emerald-500 shrink-0" />
                        {sale.cufe.slice(0, 16)}…
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">Sin FE</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {!hasCufe && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 gap-1.5 text-xs"
                        disabled={emitMutation.isPending}
                        onClick={() => emitMutation.mutate(sale.id)}
                      >
                        <Send className="size-3" />
                        Emitir FE
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {lastPage > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{total} ventas</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Anterior</Button>
            <span className="px-2 py-1">{page} / {lastPage}</span>
            <Button size="sm" variant="outline" disabled={page >= lastPage} onClick={() => setPage((p) => p + 1)}>Siguiente</Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── RADIAN Tab ───────────────────────────────────────────────────────────────

function NewRadianEventDialog({ open, onOpenChange, slug }: { open: boolean; onOpenChange: (v: boolean) => void; slug: string }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    cufe: '', invoice_number: '', event_type: 'acuse_recibo' as RadianEventType,
    amount: '', notes: '', rejection_reason: '',
  });

  useEffect(() => {
    if (open) setForm({ cufe: '', invoice_number: '', event_type: 'acuse_recibo', amount: '', notes: '', rejection_reason: '' });
  }, [open]);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  const sendMutation = useMutation({
    mutationFn: () => dianApi.radianStore({
      cufe:              form.cufe,
      invoice_number:    form.invoice_number || undefined,
      event_type:        form.event_type,
      amount:            form.amount ? Number(form.amount) : undefined,
      notes:             form.notes || undefined,
      rejection_reason:  form.rejection_reason || undefined,
    }),
    onSuccess: (res) => {
      notify.success(res.data.message);
      qc.invalidateQueries({ queryKey: ['radian-events', slug] });
      onOpenChange(false);
    },
    onError: (e) => notify.error(e, 'Error al enviar evento'),
  });

  const canSend = form.cufe.trim().length >= 10 &&
    (form.event_type !== 'rechazo' || form.rejection_reason.trim());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nuevo evento RADIAN</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>CUFE de la factura recibida *</Label>
            <Input
              value={form.cufe}
              onChange={(e) => set('cufe', e.target.value)}
              className="font-mono text-xs"
              placeholder="SHA-384 de 96 caracteres"
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>N° Factura (referencia)</Label>
              <Input value={form.invoice_number} onChange={(e) => set('invoice_number', e.target.value)} placeholder="FE-0001234" className="font-mono text-sm" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Monto ($)</Label>
              <Input type="number" min={0} value={form.amount} onChange={(e) => set('amount', e.target.value)} placeholder="Valor de la factura" />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Tipo de evento *</Label>
            <Select value={form.event_type} onValueChange={(v) => set('event_type', v as RadianEventType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.entries(RADIAN_EVENT_META) as [RadianEventType, typeof RADIAN_EVENT_META[RadianEventType]][]).map(([key, meta]) => (
                  <SelectItem key={key} value={key}>
                    <span className="font-mono text-xs text-muted-foreground mr-2">{meta.code}</span>
                    {meta.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {form.event_type === 'rechazo' && (
            <div className="flex flex-col gap-1.5">
              <Label>Motivo de rechazo *</Label>
              <Input value={form.rejection_reason} onChange={(e) => set('rejection_reason', e.target.value)} placeholder="Describe el motivo del rechazo" />
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label>Observaciones</Label>
            <textarea
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
              rows={2}
              placeholder="Notas adicionales (opcional)"
              className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 resize-none"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button disabled={!canSend || sendMutation.isPending} onClick={() => sendMutation.mutate()} className="gap-2">
            <Send className="size-4" />
            {sendMutation.isPending ? 'Enviando…' : 'Enviar evento'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RadianTab({ slug }: { slug: string }) {
  const qc = useQueryClient();
  const [newOpen, setNewOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterType, setFilterType]     = useState<RadianEventType | 'all'>('all');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['radian-events', slug, { filterStatus, filterType, page }],
    queryFn: () => dianApi.radianList({
      status:     filterStatus !== 'all' ? filterStatus : undefined,
      event_type: filterType   !== 'all' ? filterType   : undefined,
      page,
    }).then((r) => r.data),
    staleTime: 15_000,
  });

  const events: RadianEvent[] = (data as any)?.data ?? [];
  const lastPage: number       = (data as any)?.last_page ?? 1;
  const total: number          = (data as any)?.total ?? 0;

  const resendMutation = useMutation({
    mutationFn: (id: number) => dianApi.radianResend(id),
    onSuccess: (res) => {
      notify.success(res.data.message);
      qc.invalidateQueries({ queryKey: ['radian-events', slug] });
    },
    onError: (err) => notify.error(err, 'Error al reenviar'),
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex gap-2">
          <Select value={filterStatus} onValueChange={(v) => { setFilterStatus(v ?? 'all'); setPage(1); }}>
            <SelectTrigger className="w-36 h-9"><SelectValue placeholder="Estado" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los estados</SelectItem>
              {Object.entries(EVENT_STATUS_META).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterType} onValueChange={(v) => { setFilterType(v as any); setPage(1); }}>
            <SelectTrigger className="w-48 h-9"><SelectValue placeholder="Tipo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los tipos</SelectItem>
              {(Object.entries(RADIAN_EVENT_META) as [RadianEventType, typeof RADIAN_EVENT_META[RadianEventType]][]).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button className="gap-2 h-9" onClick={() => setNewOpen(true)}>
          <Plus className="size-4" /> Nuevo evento
        </Button>
      </div>

      <div className="rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground uppercase">
            <tr>
              <th className="px-3 py-2 text-left">CUFE (parcial)</th>
              <th className="px-3 py-2 text-left">N° Factura</th>
              <th className="px-3 py-2 text-center">Tipo</th>
              <th className="px-3 py-2 text-center">Código</th>
              <th className="px-3 py-2 text-center">Estado</th>
              <th className="px-3 py-2 text-center">Enviado</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading && Array.from({ length: 5 }).map((_, i) => (
              <tr key={i}>
                {Array.from({ length: 7 }).map((__, j) => (
                  <td key={j} className="px-3 py-2"><Skeleton className="h-4 w-full" /></td>
                ))}
              </tr>
            ))}
            {!isLoading && events.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-12 text-center text-muted-foreground text-xs">
                  Sin eventos RADIAN registrados.
                </td>
              </tr>
            )}
            {!isLoading && events.map((ev) => {
              const typeMeta   = RADIAN_EVENT_META[ev.event_type];
              const statusMeta = EVENT_STATUS_META[ev.status] ?? EVENT_STATUS_META.pending;
              const StatusIcon = statusMeta.icon;
              return (
                <tr key={ev.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-3 py-2">
                    <code className="text-[10px] font-mono text-muted-foreground">
                      {ev.cufe.slice(0, 20)}…
                    </code>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{ev.invoice_number ?? '—'}</td>
                  <td className="px-3 py-2 text-center">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${typeMeta.color}`}>
                      {typeMeta.label}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-center font-mono text-xs font-bold">{ev.event_code}</td>
                  <td className="px-3 py-2 text-center">
                    <span className={`inline-flex items-center gap-1 text-xs font-medium ${statusMeta.color}`}>
                      <StatusIcon className="size-3" />
                      {statusMeta.label}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-center text-xs text-muted-foreground">{fmtDate(ev.sent_at)}</td>
                  <td className="px-3 py-2 text-right">
                    {ev.status === 'failed' && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 gap-1 text-xs"
                        disabled={resendMutation.isPending}
                        onClick={() => resendMutation.mutate(ev.id)}
                      >
                        <RefreshCw className="size-3" />
                        Reintentar
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {lastPage > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{total} eventos</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Anterior</Button>
            <span className="px-2 py-1">{page} / {lastPage}</span>
            <Button size="sm" variant="outline" disabled={page >= lastPage} onClick={() => setPage((p) => p + 1)}>Siguiente</Button>
          </div>
        </div>
      )}

      <NewRadianEventDialog open={newOpen} onOpenChange={setNewOpen} slug={slug} />
    </div>
  );
}

// ─── Addon Paywall ────────────────────────────────────────────────────────────

function AddonPaywall({ addonId }: { addonId: number | null }) {
  const requestMutation = useMutation({
    mutationFn: () => {
      if (!addonId) return Promise.reject(new Error('Add-on no disponible.'));
      return billingApi.requestAddon(addonId);
    },
    onSuccess: () => notify.success('Solicitud enviada. El equipo de Atlas ERP la procesará pronto.'),
    onError: (err: any) => {
      const msg = err?.response?.data?.message ?? 'Error al enviar la solicitud.';
      notify.error(msg);
    },
  });

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center px-4">
      <div className="size-20 rounded-full bg-blue-50 dark:bg-blue-950/30 flex items-center justify-center">
        <Lock className="size-9 text-blue-500" />
      </div>

      <div className="space-y-2 max-w-md">
        <h2 className="text-2xl font-bold tracking-tight">Facturación Electrónica DIAN</h2>
        <p className="text-muted-foreground">
          Este módulo es un <span className="font-semibold text-foreground">add-on de pago</span>.
          Incluye emisión de facturas electrónicas, notas crédito/débito, documentos soporte y eventos RADIAN
          bajo la normativa colombiana (UBL 2.1 · Resolución DIAN).
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-lg text-left">
        {[
          'Facturas electrónicas (FE-V2)',
          'Notas crédito y débito electrónicas',
          'Documento Soporte Electrónico (DSE)',
          'Eventos RADIAN (acuse, rechazo, aceptación)',
          'Certificado digital habilitado',
          'Integración DIAN en tiempo real',
        ].map((feature) => (
          <div key={feature} className="flex items-center gap-2 text-sm">
            <CheckCircle2 className="size-4 text-emerald-500 shrink-0" />
            <span>{feature}</span>
          </div>
        ))}
      </div>

      <div className="flex flex-col items-center gap-3">
        <div className="text-3xl font-bold">
          $25.000<span className="text-base font-normal text-muted-foreground">/mes</span>
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

export default function DianPage() {
  const params = useParams();
  const slug   = params.slug as string;
  const [tab, setTab] = useState('config');

  // Verificar si el tenant tiene el add-on fe_dian activo
  const { data: billingData, isLoading: loadingAddon } = useQuery({
    queryKey: ['billing-addons', slug],
    queryFn: () => billingApi.addons(slug).then((r) => r.data),
  });

  const feDianAddon = (billingData as any)?.available?.find(
    (a: any) => a.module_key === 'fe_dian'
  );
  const hasAddon = feDianAddon?.is_owned;

  if (loadingAddon) {
    return (
      <div className="flex flex-col gap-4 p-6">
        <div className="h-8 w-64 bg-muted animate-pulse rounded" />
        <div className="h-48 bg-muted animate-pulse rounded-lg" />
      </div>
    );
  }

  if (!hasAddon) {
    return <AddonPaywall addonId={feDianAddon?.id ?? null} />;
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <FileCheck className="size-5 text-muted-foreground" />
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Facturación Electrónica DIAN</h1>
          <p className="text-sm text-muted-foreground">Colombia — UBL 2.1 · Resolución DIAN · RADIAN</p>
        </div>
      </div>

      <StubBanner />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="config">Configuración</TabsTrigger>
          <TabsTrigger value="invoices">Facturas</TabsTrigger>
          <TabsTrigger value="radian">RADIAN</TabsTrigger>
        </TabsList>

        <TabsContent value="config" className="mt-6">
          <ConfigTab slug={slug} />
        </TabsContent>

        <TabsContent value="invoices" className="mt-6">
          <InvoicesTab slug={slug} />
        </TabsContent>

        <TabsContent value="radian" className="mt-6">
          <RadianTab slug={slug} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
