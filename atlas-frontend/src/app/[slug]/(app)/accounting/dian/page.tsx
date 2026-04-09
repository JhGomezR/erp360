'use client';

import { useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { notify } from '@/lib/notify';
import {
  ShieldCheck, ShieldAlert, Upload, Trash2, CheckCircle2,
  AlertTriangle, Info, RefreshCw,
} from 'lucide-react';

import { dianApi, setTenantSlug } from '@/lib/api/tenant.api';
import type { DianConfig } from '@/lib/api/tenant.api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';

// ─── Types ────────────────────────────────────────────────────────────────────

type ConfigForm = Omit<DianConfig, 'id' | 'is_valid' | 'enabled'>;

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DianPage() {
  const params = useParams();
  const slug   = params.slug as string;
  const qc     = useQueryClient();

  setTenantSlug(slug);

  const [certDialogOpen, setCertDialogOpen] = useState(false);
  const [deleteCertOpen, setDeleteCertOpen] = useState(false);
  const certFileRef  = useRef<HTMLInputElement>(null);
  const [certPass, setCertPass]     = useState('');
  const [certFile, setCertFile]     = useState<File | null>(null);

  // ─── Config query ──────────────────────────────────────────────────────────
  const { data: config, isLoading } = useQuery({
    queryKey: ['dian-config', slug],
    queryFn: async () => {
      const r = await dianApi.getConfig();
      return r.data as DianConfig;
    },
  });

  const form = useForm<ConfigForm>({
    values: config ? {
      nit:                        config.nit ?? '',
      nit_dv:                     config.nit_dv ?? '',
      razon_social:               config.razon_social ?? '',
      tipo_persona:               config.tipo_persona ?? 'juridica',
      regimen:                    config.regimen ?? 'comun',
      actividad_economica:        config.actividad_economica ?? '',
      responsabilidades_fiscales: config.responsabilidades_fiscales ?? '',
      direccion:                  config.direccion ?? '',
      ciudad:                     config.ciudad ?? '',
      departamento:               config.departamento ?? '',
      telefono:                   config.telefono ?? '',
      email_dian:                 config.email_dian ?? '',
      ambiente:                   config.ambiente ?? 'habilitacion',
      soft_id:                    config.soft_id ?? '',
      soft_pin:                   config.soft_pin ?? '',
      resolucion_number:          config.resolucion_number ?? '',
      resolucion_from:            config.resolucion_from ?? '',
      resolucion_to:              config.resolucion_to ?? '',
      consecutive_from:           config.consecutive_from ?? null,
      consecutive_to:             config.consecutive_to ?? null,
      prefix:                     config.prefix ?? '',
    } : undefined,
  });

  // ─── Save config mutation ──────────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: (d: ConfigForm) => dianApi.saveConfig(d),
    onSuccess: () => {
      notify.success('Configuración DIAN guardada');
      qc.invalidateQueries({ queryKey: ['dian-config', slug] });
      qc.invalidateQueries({ queryKey: ['dian-validate', slug] });
    },
    onError: (e) => notify.error(e, 'Error al guardar'),
  });

  // ─── Validate query (manual trigger) ──────────────────────────────────────
  const { data: validation, refetch: revalidate, isFetching: validating } = useQuery({
    queryKey: ['dian-validate', slug],
    queryFn: async () => {
      const r = await dianApi.validate();
      return r.data as { valid: boolean; errors: string[]; warnings: string[] };
    },
    enabled: false,
  });

  // ─── Cert upload ───────────────────────────────────────────────────────────
  const uploadCertMutation = useMutation({
    mutationFn: () => {
      if (!certFile) throw new Error('Selecciona un archivo .p12');
      const fd = new FormData();
      fd.append('cert', certFile);
      fd.append('password', certPass);
      return dianApi.uploadCert(fd);
    },
    onSuccess: () => {
      notify.success('Certificado cargado');
      qc.invalidateQueries({ queryKey: ['dian-config', slug] });
      setCertDialogOpen(false);
      setCertFile(null);
      setCertPass('');
    },
    onError: (e) => notify.error(e, 'Error al subir certificado'),
  });

  const deleteCertMutation = useMutation({
    mutationFn: () => dianApi.deleteCert(),
    onSuccess: () => {
      notify.success('Certificado eliminado');
      qc.invalidateQueries({ queryKey: ['dian-config', slug] });
      setDeleteCertOpen(false);
    },
    onError: (err) => notify.error(err, 'Error al eliminar certificado'),
  });

  const hasCert = !!(config as any)?.cert_path;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Factura Electrónica DIAN</h1>
          <p className="text-muted-foreground text-sm">Configuración del emisor y resolución de facturación</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => revalidate()}
            disabled={validating}
          >
            <RefreshCw className={`size-4 ${validating ? 'animate-spin' : ''}`} />
            Validar configuración
          </Button>
        </div>
      </div>

      {/* ── Validation result ── */}
      {validation && (
        <Card className={validation.valid ? 'border-green-300 bg-green-50' : 'border-destructive bg-destructive/5'}>
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center gap-2 font-medium">
              {validation.valid
                ? <><CheckCircle2 className="size-5 text-green-600" /><span className="text-green-800">Configuración válida para emitir facturas</span></>
                : <><ShieldAlert className="size-5 text-destructive" /><span className="text-destructive">Hay errores que bloquean la emisión</span></>}
            </div>
            {validation.errors.map((e, i) => (
              <div key={i} className="flex items-start gap-2 text-sm text-destructive">
                <AlertTriangle className="size-4 mt-0.5 shrink-0" />{e}
              </div>
            ))}
            {validation.warnings.map((w, i) => (
              <div key={i} className="flex items-start gap-2 text-sm text-amber-700">
                <Info className="size-4 mt-0.5 shrink-0" />{w}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <form onSubmit={form.handleSubmit((d) => saveMutation.mutate(d))} className="space-y-6">
        {/* ── Certificado digital ── */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck className="size-5" />Certificado Digital (.p12)
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-4">
            {hasCert
              ? (
                  <>
                    <Badge variant="secondary" className="gap-1 text-green-700 bg-green-100">
                      <CheckCircle2 className="size-3" />Certificado cargado
                    </Badge>
                    <Button type="button" variant="outline" size="sm" className="gap-1"
                      onClick={() => setCertDialogOpen(true)}>
                      <Upload className="size-4" />Reemplazar
                    </Button>
                    <Button type="button" variant="ghost" size="sm" className="gap-1 text-destructive"
                      onClick={() => setDeleteCertOpen(true)}>
                      <Trash2 className="size-4" />Eliminar
                    </Button>
                  </>
                )
              : (
                  <Button type="button" variant="outline" className="gap-2"
                    onClick={() => setCertDialogOpen(true)}>
                    <Upload className="size-4" />Cargar certificado .p12
                  </Button>
                )}
          </CardContent>
        </Card>

        {/* ── Datos del emisor ── */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Datos del Emisor</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label>NIT <span className="text-destructive">*</span></Label>
                <Input {...form.register('nit', { required: true })} placeholder="900123456" />
              </div>
              <div className="space-y-1.5">
                <Label>Dígito de verificación</Label>
                <Input {...form.register('nit_dv')} placeholder="1" maxLength={2} />
              </div>
              <div className="space-y-1.5 sm:col-span-3 sm:col-start-1">
                <Label>Razón social <span className="text-destructive">*</span></Label>
                <Input {...form.register('razon_social', { required: true })} placeholder="Mi Empresa SAS" className="sm:max-w-md" />
              </div>
              <div className="space-y-1.5">
                <Label>Tipo de persona</Label>
                <Select value={form.watch('tipo_persona') ?? 'juridica'}
                  onValueChange={(v) => form.setValue('tipo_persona', v as 'natural' | 'juridica')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="juridica">Jurídica</SelectItem>
                    <SelectItem value="natural">Natural</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Régimen</Label>
                <Select value={form.watch('regimen') ?? 'comun'}
                  onValueChange={(v) => form.setValue('regimen', v as 'comun' | 'simplificado')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="comun">Común</SelectItem>
                    <SelectItem value="simplificado">Simplificado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Actividad económica</Label>
                <Input {...form.register('actividad_economica')} placeholder="4711" />
              </div>
              <div className="space-y-1.5">
                <Label>Email DIAN</Label>
                <Input type="email" {...form.register('email_dian')} placeholder="facturacion@empresa.com" />
              </div>
              <div className="space-y-1.5">
                <Label>Teléfono</Label>
                <Input {...form.register('telefono')} placeholder="+57 300 000 0000" />
              </div>
              <div className="space-y-1.5">
                <Label>Ciudad</Label>
                <Input {...form.register('ciudad')} placeholder="Bogotá" />
              </div>
              <div className="space-y-1.5">
                <Label>Departamento</Label>
                <Input {...form.register('departamento')} placeholder="Cundinamarca" />
              </div>
              <div className="space-y-1.5 sm:col-span-3">
                <Label>Dirección</Label>
                <Input {...form.register('direccion')} placeholder="Calle 123 # 45-67" className="sm:max-w-md" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Configuración DIAN ── */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Software y Ambiente</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label>Ambiente</Label>
                <Select value={form.watch('ambiente') ?? 'habilitacion'}
                  onValueChange={(v) => form.setValue('ambiente', v as 'habilitacion' | 'produccion')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="habilitacion">Habilitación (pruebas)</SelectItem>
                    <SelectItem value="produccion">Producción</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Software ID</Label>
                <Input {...form.register('soft_id')} placeholder="UUID del software" />
              </div>
              <div className="space-y-1.5">
                <Label>Software PIN</Label>
                <Input type="password" {...form.register('soft_pin')} placeholder="PIN del software" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Resolución de facturación ── */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Resolución de Facturación</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label>Número de resolución <span className="text-destructive">*</span></Label>
                <Input {...form.register('resolucion_number')} placeholder="18764000001234" />
              </div>
              <div className="space-y-1.5">
                <Label>Fecha inicio</Label>
                <Input type="date" {...form.register('resolucion_from')} />
              </div>
              <div className="space-y-1.5">
                <Label>Fecha vencimiento</Label>
                <Input type="date" {...form.register('resolucion_to')} />
              </div>
              <div className="space-y-1.5">
                <Label>Prefijo</Label>
                <Input {...form.register('prefix')} placeholder="SETP" maxLength={10} />
              </div>
              <div className="space-y-1.5">
                <Label>Consecutivo desde</Label>
                <Input type="number" {...form.register('consecutive_from', { valueAsNumber: true })} placeholder="1" />
              </div>
              <div className="space-y-1.5">
                <Label>Consecutivo hasta</Label>
                <Input type="number" {...form.register('consecutive_to', { valueAsNumber: true })} placeholder="5000" />
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" disabled={saveMutation.isPending || isLoading}>
            {saveMutation.isPending ? 'Guardando...' : 'Guardar configuración'}
          </Button>
        </div>
      </form>

      {/* ── Cert upload dialog ── */}
      <Dialog open={certDialogOpen} onOpenChange={setCertDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Cargar certificado digital</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Archivo .p12 / .pfx <span className="text-destructive">*</span></Label>
              <Input
                ref={certFileRef}
                type="file"
                accept=".p12,.pfx"
                onChange={(e) => setCertFile(e.target.files?.[0] ?? null)}
              />
              {certFile && <p className="text-xs text-muted-foreground">{certFile.name}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Contraseña del certificado <span className="text-destructive">*</span></Label>
              <Input
                type="password"
                value={certPass}
                onChange={(e) => setCertPass(e.target.value)}
                placeholder="Contraseña"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCertDialogOpen(false)}>Cancelar</Button>
            <Button
              onClick={() => uploadCertMutation.mutate()}
              disabled={!certFile || !certPass || uploadCertMutation.isPending}
            >
              {uploadCertMutation.isPending ? 'Subiendo...' : 'Cargar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete cert confirm ── */}
      <Dialog open={deleteCertOpen} onOpenChange={setDeleteCertOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-destructive">Eliminar certificado</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Esta acción elimina el certificado digital. No podrá emitir facturas electrónicas sin él.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteCertOpen(false)}>Cancelar</Button>
            <Button variant="destructive"
              disabled={deleteCertMutation.isPending}
              onClick={() => deleteCertMutation.mutate()}>
              {deleteCertMutation.isPending ? 'Eliminando...' : 'Eliminar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
