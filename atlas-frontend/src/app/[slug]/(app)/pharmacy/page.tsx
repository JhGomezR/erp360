'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { standardSchemaResolver as zodResolver } from '@hookform/resolvers/standard-schema';
import * as z from 'zod';
import { notify } from '@/lib/notify';
import {
  Plus, Search, FileText, FlaskConical, AlertTriangle,
  Clock, CheckCircle2, XCircle, ChevronDown, Pill,
  Calendar, Trash2, BookOpen, PackageOpen,
} from 'lucide-react';

import { pharmacyApi, productsApi, setTenantSlug, type Prescription, type ProductBatch } from '@/lib/api/tenant.api';
import { AddonGate } from '@/components/shared/AddonPaywall';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@/components/ui/tabs';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatDate = (iso: string) =>
  new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium' }).format(new Date(iso));

const formatDateTime = (iso: string) =>
  new Intl.DateTimeFormat('es-CO', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso));

const STATUS_META: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  pending:   { label: 'Pendiente',   color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',   icon: <Clock className="size-3.5" /> },
  partial:   { label: 'Parcial',     color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',       icon: <ChevronDown className="size-3.5" /> },
  dispensed: { label: 'Dispensada',  color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400', icon: <CheckCircle2 className="size-3.5" /> },
  cancelled: { label: 'Cancelada',   color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',           icon: <XCircle className="size-3.5" /> },
};

// ─── Zod Schemas ──────────────────────────────────────────────────────────────

const prescriptionItemSchema = z.object({
  product_id:          z.number({ error: 'Selecciona un producto' }).positive('Selecciona un producto'),
  quantity_prescribed: z.number({ error: 'Requerido' }).int().positive('Debe ser mayor a 0'),
  dose:       z.string().optional(),
  frequency:  z.string().optional(),
  duration:   z.string().optional(),
  notes:      z.string().optional(),
});

const prescriptionSchema = z.object({
  patient_name:   z.string().min(2, 'Nombre del paciente requerido'),
  patient_id:     z.string().optional(),
  doctor_name:    z.string().min(2, 'Nombre del médico requerido'),
  doctor_license: z.string().optional(),
  issue_date:     z.string().min(1, 'Fecha de emisión requerida'),
  expiry_date:    z.string().optional(),
  diagnosis:      z.string().optional(),
  notes:          z.string().optional(),
  items: z.array(prescriptionItemSchema).min(1, 'Agrega al menos un medicamento'),
});

type PrescriptionFormValues = z.infer<typeof prescriptionSchema>;

// ─── New Prescription Dialog ──────────────────────────────────────────────────

function NewPrescriptionDialog({
  open,
  onOpenChange,
  slug,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  slug: string;
}) {
  const qc = useQueryClient();

  const { data: productsData } = useQuery({
    queryKey: ['products', slug, 'for-rx'],
    queryFn: () => productsApi.list({ per_page: 500 }).then((r) => r.data),
    staleTime: 60_000,
  });
  const products = productsData?.data ?? [];

  const form = useForm<PrescriptionFormValues>({
    resolver: zodResolver(prescriptionSchema),
    defaultValues: {
      patient_name:   '',
      patient_id:     '',
      doctor_name:    '',
      doctor_license: '',
      issue_date:     new Date().toISOString().split('T')[0],
      expiry_date:    '',
      diagnosis:      '',
      notes:          '',
      items:          [{ product_id: 0, quantity_prescribed: 1, dose: '', frequency: '', duration: '' }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'items' });

  useEffect(() => {
    if (open) form.reset();
  }, [open, form]);

  const createMutation = useMutation({
    mutationFn: (data: PrescriptionFormValues) =>
      pharmacyApi.createPrescription({
        ...data,
        items: data.items.map((it) => ({
          ...it,
          quantity_dispensed: 0,
        })),
      }),
    onSuccess: () => {
      notify.success('Receta creada correctamente');
      qc.invalidateQueries({ queryKey: ['prescriptions', slug] });
      onOpenChange(false);
    },
    onError: (err) => notify.error(err, 'Error al crear la receta'),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="size-4" />
            Nueva Receta / Fórmula médica
          </DialogTitle>
        </DialogHeader>

        <form
          id="rx-form"
          onSubmit={form.handleSubmit((v) => createMutation.mutate(v))}
          className="flex-1 overflow-y-auto space-y-4 pr-1"
        >
          {/* Patient */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="patient_name">Paciente <span className="text-destructive">*</span></Label>
              <Input id="patient_name" {...form.register('patient_name')} />
              {form.formState.errors.patient_name && (
                <p className="text-xs text-destructive">{form.formState.errors.patient_name.message}</p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="patient_id">Documento paciente</Label>
              <Input id="patient_id" {...form.register('patient_id')} placeholder="CC / NIT" />
            </div>
          </div>

          {/* Doctor */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="doctor_name">Médico <span className="text-destructive">*</span></Label>
              <Input id="doctor_name" {...form.register('doctor_name')} />
              {form.formState.errors.doctor_name && (
                <p className="text-xs text-destructive">{form.formState.errors.doctor_name.message}</p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="doctor_license">Registro médico</Label>
              <Input id="doctor_license" {...form.register('doctor_license')} />
            </div>
          </div>

          {/* Dates + Diagnosis */}
          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="issue_date">Fecha emisión <span className="text-destructive">*</span></Label>
              <Input type="date" id="issue_date" {...form.register('issue_date')} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="expiry_date">Válida hasta</Label>
              <Input type="date" id="expiry_date" {...form.register('expiry_date')} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="diagnosis">Diagnóstico (CIE-10)</Label>
              <Input id="diagnosis" {...form.register('diagnosis')} placeholder="Ej: J06.9" />
            </div>
          </div>

          {/* Items */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Medicamentos <span className="text-destructive">*</span></Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1 h-7 text-xs"
                onClick={() => append({ product_id: 0, quantity_prescribed: 1, dose: '', frequency: '', duration: '' })}
              >
                <Plus className="size-3.5" />
                Agregar
              </Button>
            </div>

            {form.formState.errors.items?.message && (
              <p className="text-xs text-destructive">{form.formState.errors.items.message}</p>
            )}

            <div className="space-y-3">
              {fields.map((field, idx) => (
                <div key={field.id} className="rounded-lg border p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">Medicamento #{idx + 1}</span>
                    {fields.length > 1 && (
                      <Button type="button" variant="ghost" size="icon" className="size-6" onClick={() => remove(idx)}>
                        <Trash2 className="size-3.5 text-destructive" />
                      </Button>
                    )}
                  </div>

                  <div className="grid grid-cols-4 gap-2">
                    <div className="col-span-2">
                      <Controller
                        control={form.control}
                        name={`items.${idx}.product_id`}
                        render={({ field: f }) => (
                          <Select
                            value={f.value ? String(f.value) : ''}
                            onValueChange={(v) => f.onChange(Number(v))}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue placeholder="Seleccionar..." />
                            </SelectTrigger>
                            <SelectContent>
                              {products.map((p: any) => (
                                <SelectItem key={p.id} value={String(p.id)}>
                                  {p.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      />
                    </div>
                    <div>
                      <Input
                        type="number"
                        min={1}
                        placeholder="Cant."
                        className="h-8 text-xs"
                        {...form.register(`items.${idx}.quantity_prescribed`, { valueAsNumber: true })}
                      />
                    </div>
                    <div>
                      <Input
                        placeholder="Dosis (ej: 500mg)"
                        className="h-8 text-xs"
                        {...form.register(`items.${idx}.dose`)}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      placeholder="Frecuencia (ej: cada 8h)"
                      className="h-8 text-xs"
                      {...form.register(`items.${idx}.frequency`)}
                    />
                    <Input
                      placeholder="Duración (ej: 7 días)"
                      className="h-8 text-xs"
                      {...form.register(`items.${idx}.duration`)}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="notes">Observaciones</Label>
            <Input id="notes" {...form.register('notes')} />
          </div>
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button type="submit" form="rx-form" disabled={createMutation.isPending}>
            {createMutation.isPending ? 'Guardando...' : 'Crear receta'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Dispense Dialog ──────────────────────────────────────────────────────────

function DispenseDialog({
  prescription,
  open,
  onOpenChange,
  slug,
}: {
  prescription: Prescription | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  slug: string;
}) {
  const qc = useQueryClient();
  const [quantities, setQuantities] = useState<Record<number, string>>({});

  useEffect(() => {
    if (prescription && open) {
      const init: Record<number, string> = {};
      prescription.items.forEach((item) => {
        const remaining = item.quantity_prescribed - item.quantity_dispensed;
        init[item.id!] = String(remaining > 0 ? remaining : 0);
      });
      setQuantities(init);
    }
  }, [prescription, open]);

  const dispenseMutation = useMutation({
    mutationFn: () => {
      const items = (prescription?.items ?? [])
        .filter((it) => Number(quantities[it.id!]) > 0)
        .map((it) => ({ prescription_item_id: it.id!, quantity: Number(quantities[it.id!]) }));
      return pharmacyApi.dispense(prescription!.id, items);
    },
    onSuccess: () => {
      notify.success('Medicamentos dispensados correctamente');
      qc.invalidateQueries({ queryKey: ['prescriptions', slug] });
      onOpenChange(false);
    },
    onError: (err) => notify.error(err, 'Error al registrar la dispensación'),
  });

  if (!prescription) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackageOpen className="size-4" />
            Dispensar — {prescription.code}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-1 text-sm text-muted-foreground">
          <p><span className="font-medium text-foreground">Paciente:</span> {prescription.patient_name}</p>
          <p><span className="font-medium text-foreground">Médico:</span> {prescription.doctor_name}</p>
        </div>

        <div className="space-y-3">
          {prescription.items.map((item) => {
            const remaining = item.quantity_prescribed - item.quantity_dispensed;
            return (
              <div key={item.id} className="rounded-lg border p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{item.product?.name ?? `Producto #${item.product_id}`}</span>
                  <span className="text-xs text-muted-foreground">
                    {item.quantity_dispensed}/{item.quantity_prescribed} dispensados
                  </span>
                </div>
                {item.dose && <p className="text-xs text-muted-foreground">{item.dose} · {item.frequency} · {item.duration}</p>}
                <div className="flex items-center gap-2">
                  <Label className="text-xs whitespace-nowrap">Cantidad a dispensar:</Label>
                  <Input
                    type="number"
                    min={0}
                    max={remaining}
                    value={quantities[item.id!] ?? ''}
                    onChange={(e) =>
                      setQuantities((prev) => ({ ...prev, [item.id!]: e.target.value }))
                    }
                    className="h-7 w-20 text-sm"
                    disabled={remaining <= 0}
                  />
                  {remaining <= 0 && (
                    <span className="text-xs text-emerald-600 dark:text-emerald-400">Completo</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            onClick={() => dispenseMutation.mutate()}
            disabled={dispenseMutation.isPending}
          >
            {dispenseMutation.isPending ? 'Dispensando...' : 'Confirmar dispensación'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Prescriptions Tab ────────────────────────────────────────────────────────

function PrescriptionsTab({ slug }: { slug: string }) {
  const [search, setSearch]         = useState('');
  const [status, setStatus]         = useState('all');
  const [page, setPage]             = useState(1);
  const [newOpen, setNewOpen]       = useState(false);
  const [dispenseRx, setDispenseRx] = useState<Prescription | null>(null);
  const qc                          = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['prescriptions', slug, search, status, page],
    queryFn: () =>
      pharmacyApi
        .prescriptions({
          search: search || undefined,
          status: status !== 'all' ? status : undefined,
          page,
        })
        .then((r) => r.data),
    staleTime: 15_000,
  });

  const cancelMutation = useMutation({
    mutationFn: (id: number) => pharmacyApi.cancelPrescription(id),
    onSuccess: () => {
      notify.success('Receta cancelada');
      qc.invalidateQueries({ queryKey: ['prescriptions', slug] });
    },
    onError: (err) => notify.error(err, 'Error al cancelar'),
  });

  const prescriptions: Prescription[] = (data as any)?.data ?? [];
  const lastPage: number              = (data as any)?.last_page ?? 1;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-2 flex-1 max-w-sm">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Buscar paciente, médico o código…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="pl-9"
            />
          </div>
          <Select value={status} onValueChange={(v) => { setStatus(v ?? 'all'); setPage(1); }}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="pending">Pendiente</SelectItem>
              <SelectItem value="partial">Parcial</SelectItem>
              <SelectItem value="dispensed">Dispensada</SelectItem>
              <SelectItem value="cancelled">Cancelada</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => setNewOpen(true)}>
          <Plus className="mr-2 size-4" />
          Nueva receta
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-muted-foreground text-xs uppercase">
            <tr>
              <th className="px-4 py-3 text-left">Código</th>
              <th className="px-4 py-3 text-left">Paciente</th>
              <th className="px-4 py-3 text-left">Médico</th>
              <th className="px-4 py-3 text-left">Emisión</th>
              <th className="px-4 py-3 text-left">Vence</th>
              <th className="px-4 py-3 text-center">Estado</th>
              <th className="px-4 py-3 text-center">Ítems</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading &&
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 8 }).map((__, j) => (
                    <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                  ))}
                </tr>
              ))}

            {!isLoading && prescriptions.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">
                  <FileText className="mx-auto mb-2 size-8 opacity-30" />
                  No hay recetas registradas
                </td>
              </tr>
            )}

            {!isLoading &&
              prescriptions.map((rx) => {
                const meta = STATUS_META[rx.status] ?? STATUS_META.pending;
                const isExpired = rx.expiry_date && new Date(rx.expiry_date) < new Date();
                return (
                  <tr key={rx.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-mono font-semibold text-xs">{rx.code}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{rx.patient_name}</div>
                      {rx.patient_id && <div className="text-xs text-muted-foreground">{rx.patient_id}</div>}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      <div>{rx.doctor_name}</div>
                      {rx.doctor_license && <div className="text-xs">{rx.doctor_license}</div>}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{formatDate(rx.issue_date)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {rx.expiry_date ? (
                        <span className={isExpired ? 'text-red-600 dark:text-red-400 font-medium' : 'text-muted-foreground'}>
                          {formatDate(rx.expiry_date)}
                          {isExpired && ' ⚠'}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${meta.color}`}>
                        {meta.icon}{meta.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-muted-foreground">{rx.items?.length ?? 0}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {(rx.status === 'pending' || rx.status === 'partial') && !isExpired && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs gap-1"
                            onClick={() => setDispenseRx(rx)}
                          >
                            <PackageOpen className="size-3.5" />
                            Dispensar
                          </Button>
                        )}
                        {rx.status !== 'cancelled' && rx.status !== 'dispensed' && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-7"
                            title="Cancelar receta"
                            disabled={cancelMutation.isPending}
                            onClick={() => {
                              if (window.confirm(`¿Cancelar la receta ${rx.code}?`)) {
                                cancelMutation.mutate(rx.id);
                              }
                            }}
                          >
                            <XCircle className="size-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {lastPage > 1 && (
        <div className="flex items-center justify-end gap-2 text-sm">
          <button className="px-3 py-1.5 rounded-md border hover:bg-muted disabled:opacity-40" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>Anterior</button>
          <span className="text-muted-foreground">Página {page} de {lastPage}</span>
          <button className="px-3 py-1.5 rounded-md border hover:bg-muted disabled:opacity-40" disabled={page === lastPage} onClick={() => setPage((p) => p + 1)}>Siguiente</button>
        </div>
      )}

      <NewPrescriptionDialog open={newOpen} onOpenChange={setNewOpen} slug={slug} />
      <DispenseDialog
        prescription={dispenseRx}
        open={!!dispenseRx}
        onOpenChange={(v) => { if (!v) setDispenseRx(null); }}
        slug={slug}
      />
    </div>
  );
}

// ─── Controlled Drugs Tab ─────────────────────────────────────────────────────

function ControlledTab({ slug }: { slug: string }) {
  const [page, setPage]       = useState(1);
  const [addOpen, setAddOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['controlled-register', slug, page],
    queryFn: () => pharmacyApi.controlledRegister({ page }).then((r) => r.data),
    staleTime: 15_000,
  });

  const entries = (data as any)?.data ?? [];
  const lastPage = (data as any)?.last_page ?? 1;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Registro oficial de entradas y salidas de medicamentos de control especial (Decreto 780 de 2016)
        </p>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="mr-2 size-4" />
          Nuevo registro
        </Button>
      </div>

      <div className="rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-muted-foreground text-xs uppercase">
            <tr>
              <th className="px-4 py-3 text-left">Fecha</th>
              <th className="px-4 py-3 text-left">Medicamento</th>
              <th className="px-4 py-3 text-left">Lote</th>
              <th className="px-4 py-3 text-center">Tipo</th>
              <th className="px-4 py-3 text-right">Cant.</th>
              <th className="px-4 py-3 text-right">Saldo</th>
              <th className="px-4 py-3 text-left">Paciente</th>
              <th className="px-4 py-3 text-left">Responsable</th>
              <th className="px-4 py-3 text-left">Receta</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading &&
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 9 }).map((__, j) => (
                    <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                  ))}
                </tr>
              ))}
            {!isLoading && entries.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center text-muted-foreground">
                  <BookOpen className="mx-auto mb-2 size-8 opacity-30" />
                  No hay registros de medicamentos controlados
                </td>
              </tr>
            )}
            {!isLoading && entries.map((e: any) => (
              <tr key={e.id} className="hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{formatDateTime(e.created_at)}</td>
                <td className="px-4 py-3 font-medium">{e.product?.name ?? `#${e.product_id}`}</td>
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{e.batch_number ?? '—'}</td>
                <td className="px-4 py-3 text-center">
                  <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                    e.type === 'in'
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                      : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                  }`}>
                    {e.type === 'in' ? 'Entrada' : 'Salida'}
                  </span>
                </td>
                <td className={`px-4 py-3 text-right font-mono font-semibold ${
                  e.type === 'in' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                }`}>
                  {e.type === 'in' ? '+' : '-'}{e.quantity}
                </td>
                <td className="px-4 py-3 text-right font-mono text-muted-foreground">{e.balance}</td>
                <td className="px-4 py-3 text-muted-foreground">{e.patient_name ?? '—'}</td>
                <td className="px-4 py-3 text-muted-foreground">{e.responsible ?? '—'}</td>
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{e.prescription_code ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {lastPage > 1 && (
        <div className="flex items-center justify-end gap-2 text-sm">
          <button className="px-3 py-1.5 rounded-md border hover:bg-muted disabled:opacity-40" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>Anterior</button>
          <span className="text-muted-foreground">Página {page} de {lastPage}</span>
          <button className="px-3 py-1.5 rounded-md border hover:bg-muted disabled:opacity-40" disabled={page === lastPage} onClick={() => setPage((p) => p + 1)}>Siguiente</button>
        </div>
      )}

      <AddControlledEntryDialog open={addOpen} onOpenChange={setAddOpen} slug={slug} />
    </div>
  );
}

// ─── Add Controlled Entry Dialog ──────────────────────────────────────────────

function AddControlledEntryDialog({
  open,
  onOpenChange,
  slug,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  slug: string;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    product_id: '',
    batch_number: '',
    type: 'out' as 'in' | 'out',
    quantity: '',
    prescription_code: '',
    patient_name: '',
    responsible: '',
    notes: '',
  });

  const { data: productsData } = useQuery({
    queryKey: ['products', slug, 'for-controlled'],
    queryFn: () => productsApi.list({ per_page: 500 }).then((r) => r.data),
    staleTime: 60_000,
  });
  const products = productsData?.data ?? [];

  useEffect(() => {
    if (open) setForm({ product_id: '', batch_number: '', type: 'out', quantity: '', prescription_code: '', patient_name: '', responsible: '', notes: '' });
  }, [open]);

  const saveMutation = useMutation({
    mutationFn: () =>
      pharmacyApi.addControlledEntry({
        product_id:    Number(form.product_id),
        batch_number:  form.batch_number || undefined,
        type:          form.type,
        quantity:      Number(form.quantity),
        patient_name:  form.patient_name || undefined,
        responsible:   form.responsible || undefined,
        notes:         form.notes || undefined,
      }),
    onSuccess: () => {
      notify.success('Registro guardado');
      qc.invalidateQueries({ queryKey: ['controlled-register', slug] });
      onOpenChange(false);
    },
    onError: (err) => notify.error(err, 'Error al guardar el registro'),
  });

  const isValid = form.product_id && Number(form.quantity) > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="size-4" />
            Registro de medicamento controlado
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 flex flex-col gap-1.5">
              <Label>Medicamento <span className="text-destructive">*</span></Label>
              <Select value={form.product_id} onValueChange={(v) => setForm((p) => ({ ...p, product_id: v ?? '' }))}>
                <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                <SelectContent>
                  {products.map((p: any) => (
                    <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Tipo <span className="text-destructive">*</span></Label>
              <Select value={form.type} onValueChange={(v) => setForm((p) => ({ ...p, type: (v ?? 'out') as 'in' | 'out' }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="in">Entrada (compra/recepción)</SelectItem>
                  <SelectItem value="out">Salida (dispensación)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Cantidad <span className="text-destructive">*</span></Label>
              <Input type="number" min={1} value={form.quantity} onChange={(e) => setForm((p) => ({ ...p, quantity: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Número de lote</Label>
              <Input value={form.batch_number} onChange={(e) => setForm((p) => ({ ...p, batch_number: e.target.value }))} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Código receta</Label>
              <Input value={form.prescription_code} onChange={(e) => setForm((p) => ({ ...p, prescription_code: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Paciente</Label>
              <Input value={form.patient_name} onChange={(e) => setForm((p) => ({ ...p, patient_name: e.target.value }))} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Responsable</Label>
              <Input value={form.responsible} onChange={(e) => setForm((p) => ({ ...p, responsible: e.target.value }))} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Observaciones</Label>
            <Input value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => saveMutation.mutate()} disabled={!isValid || saveMutation.isPending}>
            {saveMutation.isPending ? 'Guardando...' : 'Guardar registro'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Expiry Alerts Tab ────────────────────────────────────────────────────────

function ExpiryAlertsTab({ slug }: { slug: string }) {
  const [days, setDays] = useState(30);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['pharmacy-expiring', slug, days],
    queryFn: () => pharmacyApi.expiringProducts(days).then((r) => r.data),
    staleTime: 30_000,
  });

  const batches: ProductBatch[] = (data as any)?.batches ?? [];

  const today = new Date();
  const critical = batches.filter((b) => b.days_until_expiry !== null && b.days_until_expiry! <= 7);
  const warn     = batches.filter((b) => b.days_until_expiry !== null && b.days_until_expiry! > 7 && b.days_until_expiry! <= 30);
  const extended = batches.filter((b) => b.days_until_expiry !== null && b.days_until_expiry! > 30);
  const expired  = batches.filter((b) => b.is_expired);

  const expiryBadge = (b: ProductBatch) => {
    if (b.is_expired) return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
    if ((b.days_until_expiry ?? 999) <= 7) return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
    if ((b.days_until_expiry ?? 999) <= 30) return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
    return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
  };

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 max-w-2xl">
        {[
          { label: 'Vencidos',       value: expired.length,  color: 'text-red-600 dark:text-red-400'   },
          { label: '≤ 7 días',       value: critical.length, color: 'text-red-600 dark:text-red-400'   },
          { label: '8 – 30 días',    value: warn.length,     color: 'text-amber-600 dark:text-amber-400' },
          { label: '31 – ' + days + ' días', value: extended.length, color: 'text-blue-600 dark:text-blue-400' },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border p-4 space-y-1">
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div className="flex items-center gap-3">
        <Label className="text-sm whitespace-nowrap">Ventana de alerta:</Label>
        {[15, 30, 60, 90].map((d) => (
          <button
            key={d}
            onClick={() => setDays(d)}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
              days === d
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background border-border hover:bg-muted'
            }`}
          >
            {d} días
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-muted-foreground text-xs uppercase">
            <tr>
              <th className="px-4 py-3 text-left">Producto</th>
              <th className="px-4 py-3 text-left">Lote</th>
              <th className="px-4 py-3 text-right">Stock</th>
              <th className="px-4 py-3 text-left">Vencimiento</th>
              <th className="px-4 py-3 text-center">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading &&
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 5 }).map((__, j) => (
                    <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                  ))}
                </tr>
              ))}

            {!isLoading && batches.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">
                  <CheckCircle2 className="mx-auto mb-2 size-8 opacity-30" />
                  No hay lotes próximos a vencer en los próximos {days} días
                </td>
              </tr>
            )}

            {!isLoading &&
              batches.map((b) => (
                <tr key={b.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-medium">{b.product?.name ?? `#${b.product_id}`}</td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{b.batch_number}</td>
                  <td className="px-4 py-3 text-right">{b.quantity_remaining}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {b.expiry_date ? formatDate(b.expiry_date) : '—'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${expiryBadge(b)}`}>
                      {b.is_expired
                        ? 'Vencido'
                        : `${b.days_until_expiry} días`}
                    </span>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function PharmacyPage() {
  const params = useParams();
  const slug = params.slug as string;

  useEffect(() => {
    if (slug) setTenantSlug(slug);
  }, [slug]);

  return (
    <AddonGate moduleKey="pharmacy" slug={slug}>
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Pill className="size-6 text-primary" />
          Farmacia / Droguería
        </h1>
        <p className="text-sm text-muted-foreground">
          Recetas, dispensación, medicamentos controlados y alertas de vencimiento
        </p>
      </div>

      <Tabs defaultValue="recetas">
        <TabsList>
          <TabsTrigger value="recetas">
            <FileText className="size-4 mr-1.5" />
            Recetas
          </TabsTrigger>
          <TabsTrigger value="controlados">
            <BookOpen className="size-4 mr-1.5" />
            Controlados
          </TabsTrigger>
          <TabsTrigger value="vencimientos">
            <AlertTriangle className="size-4 mr-1.5" />
            Vencimientos
          </TabsTrigger>
        </TabsList>

        <TabsContent value="recetas" className="mt-4">
          <PrescriptionsTab slug={slug} />
        </TabsContent>

        <TabsContent value="controlados" className="mt-4">
          <ControlledTab slug={slug} />
        </TabsContent>

        <TabsContent value="vencimientos" className="mt-4">
          <ExpiryAlertsTab slug={slug} />
        </TabsContent>
      </Tabs>
    </div>
    </AddonGate>
  );
}
