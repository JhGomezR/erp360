'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { notify } from '@/lib/notify';
import { Plus, Pencil, Trash2, Truck, Search, ClipboardList, Star, FileSignature, CheckCircle, X as XIcon, AlertTriangle } from 'lucide-react';

import { suppliersApi, purchasesApi, setTenantSlug } from '@/lib/api/tenant.api';
import type { Supplier } from '@/types';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';

// ─── Schema ───────────────────────────────────────────────────────────────────

const supplierSchema = z.object({
  name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres'),
  document_type: z.enum(['NIT', 'CC', 'CE', 'PASSPORT']),
  document_number: z.string().optional(),
  email: z.string().email('Email inválido').optional().or(z.literal('')),
  phone: z.string().optional(),
  address: z.string().optional(),
  contact_name: z.string().optional(),
  notes: z.string().optional(),
  is_active: z.boolean(),
});

type SupplierFormValues = z.infer<typeof supplierSchema>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

// ─── Supplier Dialog ──────────────────────────────────────────────────────────

interface SupplierDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplier?: Supplier | null;
}

function SupplierDialog({ open, onOpenChange, supplier }: SupplierDialogProps) {
  const queryClient = useQueryClient();
  const { slug } = useParams<{ slug: string }>();
  const isEditing = !!supplier;

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<SupplierFormValues>({
    resolver: zodResolver(supplierSchema),
    defaultValues: {
      name: '',
      document_type: 'NIT',
      document_number: '',
      email: '',
      phone: '',
      address: '',
      contact_name: '',
      notes: '',
      is_active: true,
    },
  });

  // Populate when editing
  useEffect(() => {
    if (open) {
      if (supplier) {
        reset({
          name: supplier.name,
          document_type: supplier.document_type,
          document_number: supplier.document_number ?? '',
          email: supplier.email ?? '',
          phone: supplier.phone ?? '',
          address: supplier.address ?? '',
          contact_name: supplier.contact_name ?? '',
          notes: supplier.notes ?? '',
          is_active: supplier.is_active,
        });
      } else {
        reset({
          name: '',
          document_type: 'NIT',
          document_number: '',
          email: '',
          phone: '',
          address: '',
          contact_name: '',
          notes: '',
          is_active: true,
        });
      }
    }
  }, [open, supplier, reset]);

  const createMutation = useMutation({
    mutationFn: (data: Partial<Supplier>) => suppliersApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers', slug] });
      notify.success('Proveedor creado correctamente');
      onOpenChange(false);
    },
    onError: (err) => notify.error(err, 'Error al crear el proveedor'),
  });

  const updateMutation = useMutation({
    mutationFn: (data: Partial<Supplier>) => suppliersApi.update(supplier!.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers', slug] });
      notify.success('Proveedor actualizado correctamente');
      onOpenChange(false);
    },
    onError: (err) => notify.error(err, 'Error al actualizar el proveedor'),
  });

  const isPending = createMutation.isPending || updateMutation.isPending;

  function onSubmit(values: SupplierFormValues) {
    const payload: Partial<Supplier> = {
      ...values,
      email: values.email || undefined,
      document_number: values.document_number || undefined,
      phone: values.phone || undefined,
      address: values.address || undefined,
      contact_name: values.contact_name || undefined,
      notes: values.notes || undefined,
    };
    if (isEditing) {
      updateMutation.mutate(payload);
    } else {
      createMutation.mutate(payload);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Editar proveedor' : 'Nuevo proveedor'}</DialogTitle>
        </DialogHeader>

        <form id="supplier-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {/* Nombre */}
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="sup-name">
                Nombre <span className="text-destructive">*</span>
              </Label>
              <Input id="sup-name" placeholder="Nombre del proveedor" {...register('name')} />
              {errors.name && (
                <p className="text-xs text-destructive">{errors.name.message}</p>
              )}
            </div>

            {/* Tipo documento */}
            <div className="space-y-1.5">
              <Label>Tipo documento</Label>
              <Controller
                name="document_type"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={(v) => v && field.onChange(v)}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NIT">NIT</SelectItem>
                      <SelectItem value="CC">Cédula de Ciudadanía</SelectItem>
                      <SelectItem value="CE">Cédula de Extranjería</SelectItem>
                      <SelectItem value="PASSPORT">Pasaporte</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            {/* Número documento */}
            <div className="space-y-1.5">
              <Label htmlFor="sup-docnum">Número documento</Label>
              <Input
                id="sup-docnum"
                placeholder="900.123.456-7"
                {...register('document_number')}
              />
            </div>

            {/* Email */}
            <div className="space-y-1.5">
              <Label htmlFor="sup-email">Email</Label>
              <Input
                id="sup-email"
                type="email"
                placeholder="proveedor@ejemplo.com"
                {...register('email')}
              />
              {errors.email && (
                <p className="text-xs text-destructive">{errors.email.message}</p>
              )}
            </div>

            {/* Teléfono */}
            <div className="space-y-1.5">
              <Label htmlFor="sup-phone">Teléfono</Label>
              <Input id="sup-phone" placeholder="+57 300 000 0000" {...register('phone')} />
            </div>

            {/* Contacto */}
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="sup-contact">Nombre de contacto</Label>
              <Input
                id="sup-contact"
                placeholder="Persona de contacto (opcional)"
                {...register('contact_name')}
              />
            </div>

            {/* Dirección */}
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="sup-address">Dirección</Label>
              <Input
                id="sup-address"
                placeholder="Dirección (opcional)"
                {...register('address')}
              />
            </div>

            {/* Notas */}
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="sup-notes">Notas</Label>
              <textarea
                id="sup-notes"
                rows={2}
                placeholder="Observaciones (opcional)"
                className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
                {...register('notes')}
              />
            </div>

            {/* Activo */}
            <div className="col-span-2 flex items-center gap-2">
              <Controller
                name="is_active"
                control={control}
                render={({ field }) => (
                  <input
                    id="sup-active"
                    type="checkbox"
                    checked={field.value}
                    onChange={(e) => field.onChange(e.target.checked)}
                    className="size-4 rounded border-input accent-primary"
                  />
                )}
              />
              <Label htmlFor="sup-active" className="cursor-pointer">
                Proveedor activo
              </Label>
            </div>
          </div>
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancelar
          </Button>
          <Button type="submit" form="supplier-form" disabled={isPending}>
            {isPending ? 'Guardando...' : 'Guardar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SuppliersPage() {
  const { slug } = useParams<{ slug: string }>();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [page, setPage] = useState(1);
  const [historySupplier, setHistorySupplier] = useState<Supplier | null>(null);
  const [evalSupplier, setEvalSupplier] = useState<Supplier | null>(null);
  const [contractsSupplier, setContractsSupplier] = useState<Supplier | null>(null);

  useEffect(() => { setTenantSlug(slug); }, [slug]);

  const debouncedSearch = useDebounce(search, 350);

  const { data: suppliersData, isLoading } = useQuery({
    queryKey: ['suppliers', slug, debouncedSearch, page],
    queryFn: () =>
      suppliersApi.list({
        search: debouncedSearch || undefined,
        page,
      }),
  });

  const suppliers = (suppliersData as any)?.data?.data ?? [];
  const lastPage = (suppliersData as any)?.data?.last_page ?? 1;

  const deleteMutation = useMutation({
    mutationFn: (id: number) => suppliersApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers', slug] });
      notify.success('Proveedor eliminado');
    },
    onError: (err) => notify.error(err, 'Error al eliminar el proveedor'),
  });

  function handleNew() {
    setEditingSupplier(null);
    setDialogOpen(true);
  }

  function handleEdit(supplier: Supplier) {
    setEditingSupplier(supplier);
    setDialogOpen(true);
  }

  function handleDelete(supplier: Supplier) {
    if (window.confirm(`¿Eliminar el proveedor "${supplier.name}"?`)) {
      deleteMutation.mutate(supplier.id);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Proveedores</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {isLoading ? 'Cargando...' : `${suppliers.length} proveedor${suppliers.length !== 1 ? 'es' : ''}`}
          </p>
        </div>
        <Button onClick={handleNew} className="gap-2">
          <Plus className="size-4" />
          Nuevo proveedor
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="Buscar por nombre o documento..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="pl-10"
        />
      </div>

      {/* Cards grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-2xl border bg-card p-4 space-y-3">
              <div className="flex items-center gap-3">
                <Skeleton className="size-11 rounded-xl" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-20" />
                </div>
              </div>
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-8 w-full rounded-lg" />
            </div>
          ))}
        </div>
      ) : suppliers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="size-20 rounded-full bg-muted flex items-center justify-center mb-4">
            <Truck className="size-9 text-muted-foreground/40" />
          </div>
          <h3 className="font-semibold text-lg mb-1">
            {search ? 'Sin resultados' : 'Aún no tienes proveedores'}
          </h3>
          <p className="text-sm text-muted-foreground max-w-xs">
            {search
              ? `No encontramos proveedores con "${search}".`
              : 'Registra tu primer proveedor para gestionar compras y órdenes.'}
          </p>
          {!search && (
            <Button onClick={handleNew} className="mt-5 gap-2">
              <Plus className="size-4" /> Registrar proveedor
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {suppliers.map((s: Supplier) => (
            <div key={s.id} className="rounded-2xl border bg-card p-4 flex flex-col gap-3 hover:shadow-md hover:border-primary/20 transition-all">
              {/* Header */}
              <div className="flex items-start gap-3">
                <div className="size-11 rounded-xl bg-indigo-500 flex items-center justify-center text-white font-bold text-sm shrink-0">
                  {s.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold truncate">{s.name}</p>
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${s.is_active ? 'bg-green-500/10 text-green-700' : 'bg-muted text-muted-foreground'}`}>
                      {s.is_active ? 'Activo' : 'Inactivo'}
                    </span>
                  </div>
                  {s.document_number ? (
                    <p className="text-xs text-muted-foreground font-mono">
                      {s.document_type} {s.document_number}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground/40 italic">Sin documento</p>
                  )}
                </div>
              </div>

              {/* Contacto */}
              <div className="space-y-1">
                {s.contact_name && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <CheckCircle className="size-3 shrink-0 text-muted-foreground/50" />
                    {s.contact_name}
                  </p>
                )}
                {s.phone && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <AlertTriangle className="size-3 shrink-0 opacity-0" />
                    📞 {s.phone}
                  </p>
                )}
                {s.email && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5 truncate">
                    <AlertTriangle className="size-3 shrink-0 opacity-0" />
                    ✉️ {s.email}
                  </p>
                )}
                {!s.contact_name && !s.phone && !s.email && (
                  <p className="text-xs text-muted-foreground/40 italic">Sin información de contacto</p>
                )}
              </div>

              {/* Acciones */}
              <div className="flex gap-1 pt-1 border-t flex-wrap">
                <Button variant="ghost" size="sm" className="text-xs gap-1 flex-1" onClick={() => setHistorySupplier(s)}>
                  <ClipboardList className="size-3.5" /> Órdenes
                </Button>
                <Button variant="ghost" size="sm" className="text-xs gap-1 flex-1" onClick={() => setEvalSupplier(s)}>
                  <Star className="size-3.5" /> Evaluar
                </Button>
                <Button variant="ghost" size="sm" className="text-xs gap-1 flex-1" onClick={() => setContractsSupplier(s)}>
                  <FileSignature className="size-3.5" /> Contratos
                </Button>
                <Button variant="ghost" size="sm" className="text-xs gap-1" onClick={() => handleEdit(s)}>
                  <Pencil className="size-3.5" />
                </Button>
                <Button variant="ghost" size="sm" className="text-xs text-destructive hover:text-destructive gap-1" onClick={() => handleDelete(s)} disabled={deleteMutation.isPending}>
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {lastPage > 1 && (
        <div className="flex items-center justify-center gap-3">
          <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
            Anterior
          </Button>
          <span className="text-sm text-muted-foreground">Página <strong>{page}</strong> de <strong>{lastPage}</strong></span>
          <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(lastPage, p + 1))} disabled={page === lastPage}>
            Siguiente
          </Button>
        </div>
      )}

      {/* Dialog */}
      <SupplierDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        supplier={editingSupplier}
      />

      {/* Purchase History Sheet */}
      <SupplierHistorySheet
        supplier={historySupplier}
        slug={slug}
        onClose={() => setHistorySupplier(null)}
      />

      {/* Evaluation Dialog */}
      <SupplierEvalDialog
        supplier={evalSupplier}
        slug={slug}
        onClose={() => setEvalSupplier(null)}
      />

      {/* Contracts Sheet */}
      <SupplierContractsSheet
        supplier={contractsSupplier}
        slug={slug}
        onClose={() => setContractsSupplier(null)}
      />
    </div>
  );
}

// ─── Supplier Evaluation Dialog ───────────────────────────────────────────────

interface SupplierEvalDialogProps {
  supplier: Supplier | null;
  slug: string;
  onClose: () => void;
}

const CRITERIA = [
  { key: 'score_quality',    label: 'Calidad del producto/servicio' },
  { key: 'score_delivery',   label: 'Cumplimiento en entregas' },
  { key: 'score_price',      label: 'Competitividad de precios' },
  { key: 'score_service',    label: 'Servicio postventa / atención' },
  { key: 'score_compliance', label: 'Cumplimiento legal / documentación' },
] as const;

const HOMOLOGATION_LABELS: Record<string, string> = {
  pending:     'Pendiente',
  approved:    'Aprobado',
  conditional: 'Condicional',
  rejected:    'Rechazado',
};

function SupplierEvalDialog({ supplier, slug, onClose }: SupplierEvalDialogProps) {
  const queryClient = useQueryClient();
  const open = !!supplier;
  const today = new Date().toISOString().split('T')[0];

  const [scores, setScores] = useState<Record<string, string>>({
    score_quality: '3',
    score_delivery: '3',
    score_price: '3',
    score_service: '3',
    score_compliance: '3',
  });
  const [evalDate, setEvalDate]   = useState(today);
  const [homStatus, setHomStatus] = useState('pending');
  const [comments, setComments]   = useState('');

  useEffect(() => {
    if (open) {
      setScores({ score_quality: '3', score_delivery: '3', score_price: '3', score_service: '3', score_compliance: '3' });
      setEvalDate(today);
      setHomStatus('pending');
      setComments('');
    }
  }, [open]);

  const overallPreview = (
    Object.values(scores).reduce((sum, v) => sum + (parseFloat(v) || 0), 0) / 5
  ).toFixed(2);

  const saveMut = useMutation({
    mutationFn: () =>
      suppliersApi.storeEvaluation(supplier!.id, {
        evaluation_date:     evalDate,
        score_quality:       parseFloat(scores.score_quality),
        score_delivery:      parseFloat(scores.score_delivery),
        score_price:         parseFloat(scores.score_price),
        score_service:       parseFloat(scores.score_service),
        score_compliance:    parseFloat(scores.score_compliance),
        homologation_status: homStatus,
        comments:            comments || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers', slug] });
      notify.success('Evaluación registrada correctamente');
      onClose();
    },
    onError: (err) => notify.error(err, 'Error al guardar la evaluación'),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Star className="size-4 text-amber-500" />
            Evaluar proveedor — {supplier?.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Date */}
          <div className="space-y-1.5">
            <Label htmlFor="eval-date">Fecha de evaluación</Label>
            <Input
              id="eval-date"
              type="date"
              value={evalDate}
              onChange={(e) => setEvalDate(e.target.value)}
            />
          </div>

          {/* Score criteria */}
          <div className="space-y-3">
            <p className="text-sm font-medium text-muted-foreground">Criterios (1 = Muy bajo · 5 = Excelente)</p>
            {CRITERIA.map(({ key, label }) => (
              <div key={key} className="flex items-center gap-3">
                <Label className="flex-1 text-sm">{label}</Label>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setScores((p) => ({ ...p, [key]: String(n) }))}
                      className={`size-8 rounded text-sm font-semibold border transition-colors ${
                        Number(scores[key]) === n
                          ? 'bg-amber-500 border-amber-500 text-white'
                          : 'border-input hover:bg-muted'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Overall preview */}
          <div className="flex items-center justify-between rounded-md bg-muted/50 px-4 py-2">
            <span className="text-sm font-medium">Promedio calculado</span>
            <span className="text-lg font-bold text-amber-500">{overallPreview} / 5</span>
          </div>

          {/* Homologation status */}
          <div className="space-y-1.5">
            <Label>Estado de homologación</Label>
            <Select value={homStatus} onValueChange={(v) => setHomStatus(v ?? 'pending')}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(HOMOLOGATION_LABELS).map(([v, l]) => (
                  <SelectItem key={v} value={v}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Comments */}
          <div className="space-y-1.5">
            <Label htmlFor="eval-comments">Comentarios</Label>
            <textarea
              id="eval-comments"
              rows={3}
              placeholder="Observaciones opcionales..."
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saveMut.isPending}>
            Cancelar
          </Button>
          <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
            {saveMut.isPending ? 'Guardando...' : 'Guardar evaluación'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Supplier History Sheet ────────────────────────────────────────────────────

interface SupplierHistorySheetProps {
  supplier: Supplier | null;
  slug: string;
  onClose: () => void;
}

function SupplierHistorySheet({ supplier, slug, onClose }: SupplierHistorySheetProps) {
  const open = !!supplier;

  const { data, isLoading } = useQuery({
    queryKey: ['purchase-orders', slug, 'supplier', supplier?.id],
    queryFn: () => purchasesApi.list({ supplier_id: supplier!.id }),
    enabled: open,
  });

  const orders: any[] = (data as any)?.data ?? [];

  const STATUS_LABELS: Record<string, string> = {
    draft: 'Borrador', sent: 'Enviada', partial: 'Parcial',
    received: 'Recibida', cancelled: 'Cancelada',
  };

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-xl flex flex-col gap-0 p-0">
        <SheetHeader className="px-6 py-4 border-b">
          <SheetTitle className="flex items-center gap-2">
            <ClipboardList className="size-4" />
            Órdenes — {supplier?.name}
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-background border-b">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">#</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Fecha</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Estado</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Total</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b">
                  <td className="px-4 py-3"><Skeleton className="h-4 w-8" /></td>
                  <td className="px-4 py-3"><Skeleton className="h-4 w-24" /></td>
                  <td className="px-4 py-3"><Skeleton className="h-5 w-20" /></td>
                  <td className="px-4 py-3 text-right"><Skeleton className="h-4 w-16 ml-auto" /></td>
                </tr>
              ))}
              {!isLoading && orders.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">
                    Sin órdenes de compra para este proveedor
                  </td>
                </tr>
              )}
              {!isLoading && orders.map((o) => (
                <tr key={o.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">#{o.id}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {new Date(o.created_at).toLocaleDateString('es-CO')}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={o.status === 'received' ? 'default' : o.status === 'cancelled' ? 'destructive' : 'secondary'}>
                      {STATUS_LABELS[o.status] ?? o.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold">
                    ${(o.total ?? 0).toLocaleString('es-CO')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── Supplier Contracts Sheet ─────────────────────────────────────────────────

const CONTRACT_TYPE_LABELS: Record<string, string> = {
  supply: 'Suministro', formulary: 'Formulario', maintenance: 'Mantenimiento',
  exclusive: 'Exclusivo', framework: 'Marco', other: 'Otro',
};
const CONTRACT_STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'outline'> = {
  active: 'default', draft: 'secondary', suspended: 'outline', expired: 'outline', terminated: 'outline',
};

interface SupplierContractsSheetProps {
  supplier: Supplier | null;
  slug: string;
  onClose: () => void;
}

function SupplierContractsSheet({ supplier, slug, onClose }: SupplierContractsSheetProps) {
  const qc = useQueryClient();
  const open = !!supplier;

  // List contracts
  const { data: contracts = [], isLoading } = useQuery<any[]>({
    queryKey: ['supplier-contracts', slug, supplier?.id],
    queryFn: async () => {
      const r = await purchasesApi.supplierContracts({ supplier_id: supplier!.id });
      return (r.data as any)?.data ?? [];
    },
    enabled: open,
  });

  // Selected contract detail
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const { data: detail } = useQuery<any>({
    queryKey: ['supplier-contract-detail', slug, selectedId],
    queryFn: async () => {
      const r = await purchasesApi.getSupplierContract(selectedId!);
      return r.data;
    },
    enabled: !!selectedId,
  });

  // Create contract dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [cName, setCName] = useState('');
  const [cType, setCType] = useState('supply');
  const [cStart, setCStart] = useState('');
  const [cEnd, setCEnd] = useState('');
  const [cScope, setCScope] = useState('');
  const [cPaymentTerms, setCPaymentTerms] = useState('');

  const createMut = useMutation({
    mutationFn: () => purchasesApi.createSupplierContract({
      supplier_id: supplier!.id,
      name: cName, type: cType,
      start_date: cStart, end_date: cEnd || undefined,
      scope: cScope || undefined,
      payment_terms: cPaymentTerms || undefined,
    }),
    onSuccess: () => {
      notify.success('Contrato creado');
      setCreateOpen(false);
      setCName(''); setCScope(''); setCPaymentTerms(''); setCStart(''); setCEnd('');
      qc.invalidateQueries({ queryKey: ['supplier-contracts', slug, supplier?.id] });
    },
    onError: (e) => notify.error(e, 'Error'),
  });

  // Activate contract
  const activateMut = useMutation({
    mutationFn: (id: number) => purchasesApi.updateSupplierContract(id, { status: 'active' }),
    onSuccess: () => { notify.success('Contrato activado'); qc.invalidateQueries({ queryKey: ['supplier-contracts', slug, supplier?.id] }); qc.invalidateQueries({ queryKey: ['supplier-contract-detail', slug, selectedId] }); },
    onError: (e) => notify.error(e, 'Error'),
  });

  // Add item to contract
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [itemName, setItemName] = useState('');
  const [itemCode, setItemCode] = useState('');
  const [itemUnit, setItemUnit] = useState('');
  const [itemPrice, setItemPrice] = useState('');
  const [itemCovered, setItemCovered] = useState(true);

  const addItemMut = useMutation({
    mutationFn: () => purchasesApi.addContractItem(selectedId!, {
      product_name: itemName, product_code: itemCode || undefined,
      unit: itemUnit || undefined,
      agreed_price: itemPrice ? Number(itemPrice) : undefined,
      is_covered: itemCovered,
    }),
    onSuccess: () => {
      notify.success('Ítem agregado');
      setAddItemOpen(false);
      setItemName(''); setItemCode(''); setItemUnit(''); setItemPrice('');
      qc.invalidateQueries({ queryKey: ['supplier-contract-detail', slug, selectedId] });
    },
    onError: (e) => notify.error(e, 'Error'),
  });

  const removeItemMut = useMutation({
    mutationFn: ({ itemId }: { itemId: number }) => purchasesApi.removeContractItem(selectedId!, itemId),
    onSuccess: () => { notify.success('Ítem eliminado'); qc.invalidateQueries({ queryKey: ['supplier-contract-detail', slug, selectedId] }); },
    onError: (e) => notify.error(e, 'Error'),
  });

  // Coverage check
  const [coverageSearch, setCoverageSearch] = useState('');
  const [coverageResult, setCoverageResult] = useState<any>(null);
  const [checkingCoverage, setCheckingCoverage] = useState(false);

  async function checkCoverage() {
    if (!coverageSearch || !supplier) return;
    setCheckingCoverage(true);
    try {
      const r = await purchasesApi.supplierCoverageCheck(supplier.id, { product_name: coverageSearch });
      setCoverageResult(r.data);
    } catch { notify.error('Error al verificar cobertura'); }
    finally { setCheckingCoverage(false); }
  }

  useEffect(() => {
    if (!open) { setSelectedId(null); setCoverageResult(null); setCoverageSearch(''); }
  }, [open]);

  const today = new Date().toISOString().split('T')[0];

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent className="sm:max-w-3xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Contratos — {supplier?.name}</SheetTitle>
        </SheetHeader>

        {/* Coverage check */}
        <div className="mt-4 rounded-lg border bg-muted/30 p-4 space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Verificar cobertura de producto</p>
          <div className="flex gap-2">
            <Input
              placeholder="Nombre del producto, medicamento, repuesto..."
              value={coverageSearch}
              onChange={(e) => setCoverageSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && checkCoverage()}
              className="flex-1"
            />
            <Button size="sm" onClick={checkCoverage} disabled={!coverageSearch || checkingCoverage}>
              {checkingCoverage ? 'Verificando...' : 'Verificar'}
            </Button>
          </div>
          {coverageResult && (
            <div className={`flex items-center gap-2 text-sm rounded p-2 ${coverageResult.is_covered ? 'bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-400' : 'bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400'}`}>
              {coverageResult.is_covered
                ? <><CheckCircle className="size-4" /> Cubierto en {coverageResult.covered_in?.length} contrato(s) activo(s)</>
                : <><XIcon className="size-4" /> No cubierto en ningún contrato activo</>}
            </div>
          )}
        </div>

        <Separator className="my-4" />

        {/* Contracts list / detail split */}
        <div className="flex gap-4">
          {/* Left: list */}
          <div className="w-56 shrink-0 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Contratos</p>
              <Button size="sm" variant="outline" className="h-6 text-xs gap-1" onClick={() => setCreateOpen(true)}>
                <Plus className="size-3" />Nuevo
              </Button>
            </div>
            {isLoading && <div className="space-y-2">{Array.from({length:3}).map((_,i) => <div key={i} className="h-12 bg-muted animate-pulse rounded" />)}</div>}
            {!isLoading && contracts.length === 0 && (
              <p className="text-xs text-muted-foreground py-4 text-center">Sin contratos registrados</p>
            )}
            {contracts.map((c: any) => (
              <button key={c.id}
                onClick={() => setSelectedId(c.id === selectedId ? null : c.id)}
                className={`w-full text-left rounded-lg border p-2 text-sm transition-colors ${selectedId === c.id ? 'border-primary bg-primary/5' : 'hover:border-primary/40'}`}>
                <p className="font-medium truncate">{c.name}</p>
                <div className="flex items-center gap-1 mt-0.5">
                  <Badge variant={CONTRACT_STATUS_VARIANT[c.status] ?? 'secondary'} className="text-xs h-4 px-1">
                    {c.status}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{CONTRACT_TYPE_LABELS[c.type] ?? c.type}</span>
                </div>
                {c.end_date && new Date(c.end_date) <= new Date(Date.now() + 30*86400000) && (
                  <p className="text-xs text-orange-600 flex items-center gap-1 mt-0.5">
                    <AlertTriangle className="size-3" />Vence {new Date(c.end_date).toLocaleDateString('es-CO')}
                  </p>
                )}
              </button>
            ))}
          </div>

          {/* Right: detail */}
          <div className="flex-1 min-w-0">
            {!selectedId && (
              <div className="text-center py-16 text-muted-foreground">
                <FileSignature className="size-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Selecciona un contrato para ver los detalles</p>
              </div>
            )}
            {selectedId && detail && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold">{detail.name}</p>
                    <p className="text-xs text-muted-foreground font-mono">{detail.contract_number}</p>
                  </div>
                  {detail.status === 'draft' && (
                    <Button size="sm" onClick={() => activateMut.mutate(detail.id)} disabled={activateMut.isPending}>
                      Activar
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div><span className="text-muted-foreground">Tipo:</span> {CONTRACT_TYPE_LABELS[detail.type] ?? detail.type}</div>
                  <div><span className="text-muted-foreground">Estado:</span> <Badge variant={CONTRACT_STATUS_VARIANT[detail.status] ?? 'secondary'}>{detail.status}</Badge></div>
                  <div><span className="text-muted-foreground">Inicio:</span> {new Date(detail.start_date).toLocaleDateString('es-CO')}</div>
                  <div><span className="text-muted-foreground">Fin:</span> {detail.end_date ? new Date(detail.end_date).toLocaleDateString('es-CO') : 'Indefinido'}</div>
                  {detail.payment_terms && <div className="col-span-2"><span className="text-muted-foreground">Términos pago:</span> {detail.payment_terms}</div>}
                  {detail.scope && <div className="col-span-2"><span className="text-muted-foreground">Alcance:</span> {detail.scope}</div>}
                </div>

                <Separator />

                {/* Items */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold">Productos / servicios cubiertos</p>
                    <Button size="sm" variant="outline" className="h-6 text-xs gap-1" onClick={() => setAddItemOpen(true)}>
                      <Plus className="size-3" />Agregar
                    </Button>
                  </div>
                  {(!detail.items || detail.items.length === 0) && (
                    <p className="text-xs text-muted-foreground py-2">Sin ítems definidos. Agrega productos o medicamentos cubiertos.</p>
                  )}
                  {detail.items?.map((item: any) => (
                    <div key={item.id} className={`flex items-center justify-between rounded border px-3 py-2 text-sm ${!item.is_covered ? 'opacity-60 border-dashed' : ''}`}>
                      <div>
                        <p className="font-medium">{item.product_name}
                          {!item.is_covered && <span className="ml-1 text-xs text-red-500">(excluido)</span>}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {item.product_code && <span className="mr-2 font-mono">{item.product_code}</span>}
                          {item.unit && <span className="mr-2">{item.unit}</span>}
                          {item.agreed_price && <span>${Number(item.agreed_price).toLocaleString('es-CO')}</span>}
                        </p>
                      </div>
                      <Button size="sm" variant="ghost" className="h-6 px-1 text-muted-foreground"
                        onClick={() => removeItemMut.mutate({ itemId: item.id })}>
                        <XIcon className="size-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </SheetContent>

      {/* Create contract dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Nuevo contrato con {supplier?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Nombre del contrato *</Label>
              <Input value={cName} onChange={(e) => setCName(e.target.value)} placeholder="Ej. Formulario de medicamentos 2026" />
            </div>
            <div className="space-y-1.5">
              <Label>Tipo *</Label>
              <Select value={cType} onValueChange={(v) => setCType(v ?? 'supply')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="supply">Suministro general</SelectItem>
                  <SelectItem value="formulary">Formulario (medicamentos)</SelectItem>
                  <SelectItem value="maintenance">Mantenimiento / taller</SelectItem>
                  <SelectItem value="exclusive">Distribución exclusiva</SelectItem>
                  <SelectItem value="framework">Marco / paraguas</SelectItem>
                  <SelectItem value="other">Otro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Fecha inicio *</Label>
                <Input type="date" value={cStart} onChange={(e) => setCStart(e.target.value)} min={today} />
              </div>
              <div className="space-y-1.5">
                <Label>Fecha fin</Label>
                <Input type="date" value={cEnd} onChange={(e) => setCEnd(e.target.value)} min={cStart || today} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Términos de pago</Label>
              <Input value={cPaymentTerms} onChange={(e) => setCPaymentTerms(e.target.value)} placeholder="Ej. Net 30, Contado, 60 días..." />
            </div>
            <div className="space-y-1.5">
              <Label>Alcance / descripción</Label>
              <Input value={cScope} onChange={(e) => setCScope(e.target.value)} placeholder="Descripción general del alcance" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button onClick={() => createMut.mutate()} disabled={!cName || !cStart || createMut.isPending}>
              {createMut.isPending ? 'Guardando...' : 'Crear contrato'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add item dialog */}
      <Dialog open={addItemOpen} onOpenChange={setAddItemOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Agregar producto / ítem al contrato</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Nombre del producto *</Label>
              <Input value={itemName} onChange={(e) => setItemName(e.target.value)} placeholder="Ej. Amoxicilina 500mg, Aceite de motor..." />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Código proveedor</Label>
                <Input value={itemCode} onChange={(e) => setItemCode(e.target.value)} placeholder="SKU externo" />
              </div>
              <div className="space-y-1.5">
                <Label>Unidad</Label>
                <Input value={itemUnit} onChange={(e) => setItemUnit(e.target.value)} placeholder="Und, Caja, Kg..." />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Precio pactado</Label>
              <Input type="number" min="0" value={itemPrice} onChange={(e) => setItemPrice(e.target.value)} placeholder="0" />
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="item-covered" checked={itemCovered} onChange={(e) => setItemCovered(e.target.checked)} className="size-4" />
              <Label htmlFor="item-covered">Está cubierto (desmarca si es una exclusión explícita)</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddItemOpen(false)}>Cancelar</Button>
            <Button onClick={() => addItemMut.mutate()} disabled={!itemName || addItemMut.isPending}>
              {addItemMut.isPending ? 'Guardando...' : 'Agregar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Sheet>
  );
}
