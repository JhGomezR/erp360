'use client';

import * as z from 'zod';
import { useEffect, useRef, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notify } from '@/lib/notify';
import { Plus, Pencil, Trash2, Package, Check, X, Star, GripVertical } from 'lucide-react';

import { plansApi, businessTypesApi, moduleRegistryApi } from '@/lib/api/central.api';
import type { BusinessType, ModuleRegistry } from '@/lib/api/central.api';
import type { Plan } from '@/types';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
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

// ─── Constants ────────────────────────────────────────────────────────────────

const PRESET_COLORS = [
  '#6366f1', // indigo
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#f97316', // orange
  '#22c55e', // green
  '#14b8a6', // teal
  '#0ea5e9', // sky
  '#eab308', // yellow
  '#ef4444', // red
  '#64748b', // slate
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

function formatPrice(price: number): string {
  return `$${price.toLocaleString('es-CO')}/mes`;
}

function getModuleLabel(key: string, modules: ModuleRegistry[]): string {
  return modules.find((m) => m.key === key)?.name ?? key;
}

// ─── Zod Schema ───────────────────────────────────────────────────────────────

const planSchema = z.object({
  name:                z.string().min(2, 'El nombre debe tener al menos 2 caracteres'),
  slug:                z.string().optional(),
  description:         z.string().min(5, 'Descripción requerida'),
  price:               z.number().min(0, 'El precio debe ser positivo'),
  price_annual:        z.number().min(0).optional(),
  annual_discount_pct: z.number().min(0).max(100).optional(),
  max_users:           z.number().int().min(1).nullable().optional(),
  max_pos:             z.number().int().min(1).nullable().optional(),
  sort_order:          z.number().min(0).default(0),
  color:               z.string().optional(),
  badge_text:          z.string().optional(),
  type:                z.string().min(1, 'Selecciona el tipo de negocio'),
  modules:             z.array(z.string()).min(1, 'Selecciona al menos un módulo'),
  features:            z.array(z.string()).default([]),
  is_active:           z.boolean(),
  is_featured:         z.boolean().default(false),
});

type PlanFormValues = z.infer<typeof planSchema>;

// ─── Plan Dialog ──────────────────────────────────────────────────────────────

interface PlanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingPlan: Plan | null;
  businessTypes: BusinessType[];
  allModules: ModuleRegistry[];
}

function PlanDialog({ open, onOpenChange, editingPlan, businessTypes, allModules }: PlanDialogProps) {
  const queryClient = useQueryClient();
  const isEdit = Boolean(editingPlan);
  const slugManuallyEdited = useRef(false);
  const [newFeature, setNewFeature] = useState('');

  const {
    register,
    handleSubmit,
    control,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<PlanFormValues>({
    resolver: zodResolver(planSchema),
    defaultValues: {
      name: '',
      slug: '',
      description: '',
      price: 0,
      price_annual: undefined,
      annual_discount_pct: undefined,
      max_users: undefined,
      max_pos: undefined,
      sort_order: 0,
      color: PRESET_COLORS[0],
      badge_text: '',
      type: '',
      modules: [],
      features: [],
      is_active: true,
      is_featured: false,
    },
  });

  const nameValue    = watch('name');
  const typeValue    = watch('type');
  const modulesValue = watch('modules');
  const featuresValue = watch('features');
  const colorValue   = watch('color');

  // Módulos disponibles filtrados por el tipo de negocio seleccionado
  const selectedBusinessType = businessTypes.find((bt) => bt.slug === typeValue);
  const availableModuleKeys  = selectedBusinessType
    ? selectedBusinessType.modules.map((m) => m.module_key)
    : allModules.map((m) => m.key);
  const availableModules     = allModules.filter((m) => availableModuleKeys.includes(m.key));

  // Reset form when dialog opens/closes or editing plan changes
  useEffect(() => {
    if (open) {
      slugManuallyEdited.current = false;
      setNewFeature('');
      if (editingPlan) {
        reset({
          name:                editingPlan.name,
          slug:                editingPlan.slug,
          description:         editingPlan.description,
          price:               editingPlan.price,
          price_annual:        editingPlan.price_annual ?? undefined,
          annual_discount_pct: editingPlan.annual_discount_pct ?? undefined,
          max_users:           editingPlan.max_users ?? undefined,
          max_pos:             editingPlan.max_pos ?? undefined,
          sort_order:          editingPlan.sort_order ?? 0,
          color:               editingPlan.color ?? PRESET_COLORS[0],
          badge_text:          editingPlan.badge_text ?? '',
          type:                editingPlan.type,
          modules:             editingPlan.modules ?? [],
          features:            editingPlan.features ?? [],
          is_active:           editingPlan.is_active,
          is_featured:         editingPlan.is_featured ?? false,
        });
      } else {
        reset({
          name: '',
          slug: '',
          description: '',
          price: 0,
          price_annual: undefined,
          annual_discount_pct: undefined,
          sort_order: 0,
          color: PRESET_COLORS[0],
          badge_text: '',
          type: businessTypes[0]?.slug ?? '',
          modules: [],
          features: [],
          is_active: true,
          is_featured: false,
        });
      }
    }
  }, [open, editingPlan, reset]);

  // Auto-generate slug from name
  useEffect(() => {
    if (!open || slugManuallyEdited.current) return;
    if (nameValue) setValue('slug', generateSlug(nameValue));
  }, [nameValue, open, setValue]);

  // When type changes, remove selected modules that don't belong to the new type
  useEffect(() => {
    if (!open || !typeValue) return;
    const filtered = (modulesValue ?? []).filter((k) => availableModuleKeys.includes(k));
    if (filtered.length !== (modulesValue ?? []).length) setValue('modules', filtered);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeValue, open]);

  const createMutation = useMutation({
    mutationFn: (data: Partial<Plan>) => plansApi.create(data).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plans'] });
      notify.success('Plan creado correctamente');
      onOpenChange(false);
    },
    onError: (err) => notify.error(err, 'Error al crear el plan'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Plan> }) =>
      plansApi.update(id, data).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plans'] });
      notify.success('Plan actualizado correctamente');
      onOpenChange(false);
    },
    onError: (err) => notify.error(err, 'Error al actualizar el plan'),
  });

  const onSubmit = (values: PlanFormValues) => {
    const payload: Partial<Plan> = {
      name:                values.name,
      slug:                values.slug || generateSlug(values.name),
      description:         values.description,
      price:               values.price,
      price_annual:        values.price_annual,
      annual_discount_pct: values.annual_discount_pct,
      max_users:           values.max_users ?? null,
      max_pos:             values.max_pos ?? null,
      sort_order:          values.sort_order,
      color:               values.color,
      badge_text:          values.badge_text,
      type:                values.type,
      modules:             values.modules,
      features:            values.features,
      is_active:           values.is_active,
      is_featured:         values.is_featured,
    };
    if (editingPlan) {
      updateMutation.mutate({ id: editingPlan.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  function addFeature() {
    const trimmed = newFeature.trim();
    if (!trimmed) return;
    setValue('features', [...(featuresValue ?? []), trimmed]);
    setNewFeature('');
  }

  function removeFeature(idx: number) {
    setValue('features', (featuresValue ?? []).filter((_, i) => i !== idx));
  }

  const isPending = createMutation.isPending || updateMutation.isPending || isSubmitting;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar plan' : 'Nuevo plan'}</DialogTitle>
        </DialogHeader>

        <form id="plan-form" onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">

          {/* ── Información básica ── */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="plan-name">Nombre *</Label>
              <Input id="plan-name" {...register('name')} placeholder="Ej. Plan Básico" />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="plan-slug">Slug</Label>
              <Input
                id="plan-slug"
                {...register('slug', { onChange: () => { slugManuallyEdited.current = true; } })}
                placeholder="plan-basico"
                className="font-mono text-sm"
              />
              {errors.slug && <p className="text-xs text-destructive">{errors.slug.message}</p>}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="plan-description">Descripción *</Label>
            <textarea
              id="plan-description"
              {...register('description')}
              rows={2}
              placeholder="Describe las características del plan..."
              className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex min-h-[60px] w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            />
            {errors.description && <p className="text-xs text-destructive">{errors.description.message}</p>}
          </div>

          <Separator />

          {/* ── Precios ── */}
          <div className="space-y-2">
            <p className="text-sm font-medium">Precios</p>
            <div className="grid grid-cols-3 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="plan-price">Mensual *</Label>
                <Controller
                  name="price"
                  control={control}
                  render={({ field }) => (
                    <Input
                      id="plan-price"
                      type="number"
                      min={0}
                      step={1000}
                      placeholder="0"
                      value={field.value}
                      onChange={(e) => field.onChange(Number(e.target.value))}
                    />
                  )}
                />
                {errors.price && <p className="text-xs text-destructive">{errors.price.message}</p>}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="plan-price-annual">Anual (total)</Label>
                <Controller
                  name="price_annual"
                  control={control}
                  render={({ field }) => (
                    <Input
                      id="plan-price-annual"
                      type="number"
                      min={0}
                      step={1000}
                      placeholder="0"
                      value={field.value ?? ''}
                      onChange={(e) => field.onChange(e.target.value === '' ? undefined : Number(e.target.value))}
                    />
                  )}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="plan-discount">Descuento anual %</Label>
                <Controller
                  name="annual_discount_pct"
                  control={control}
                  render={({ field }) => (
                    <Input
                      id="plan-discount"
                      type="number"
                      min={0}
                      max={100}
                      placeholder="0"
                      value={field.value ?? ''}
                      onChange={(e) => field.onChange(e.target.value === '' ? undefined : Number(e.target.value))}
                    />
                  )}
                />
              </div>
            </div>
          </div>

          {/* ── Límites de uso ── */}
          <div className="space-y-2">
            <p className="text-sm font-medium">Límites de uso</p>
            <p className="text-xs text-muted-foreground">Deja en blanco para sin límite (ilimitado).</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="plan-max-users">Máx. usuarios simultáneos</Label>
                <Controller
                  name="max_users"
                  control={control}
                  render={({ field }) => (
                    <Input
                      id="plan-max-users"
                      type="number"
                      min={1}
                      placeholder="Sin límite"
                      value={field.value ?? ''}
                      onChange={(e) =>
                        field.onChange(e.target.value === '' ? undefined : Number(e.target.value))
                      }
                    />
                  )}
                />
                {errors.max_users && (
                  <p className="text-xs text-destructive">{errors.max_users.message}</p>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="plan-max-pos">Máx. puntos de venta (cajas)</Label>
                <Controller
                  name="max_pos"
                  control={control}
                  render={({ field }) => (
                    <Input
                      id="plan-max-pos"
                      type="number"
                      min={1}
                      placeholder="Sin límite"
                      value={field.value ?? ''}
                      onChange={(e) =>
                        field.onChange(e.target.value === '' ? undefined : Number(e.target.value))
                      }
                    />
                  )}
                />
                {errors.max_pos && (
                  <p className="text-xs text-destructive">{errors.max_pos.message}</p>
                )}
              </div>
            </div>
          </div>

          <Separator />

          {/* ── Apariencia y orden ── */}
          <div className="space-y-3">
            <p className="text-sm font-medium">Apariencia</p>
            <div className="grid grid-cols-3 gap-4">
              <div className="flex flex-col gap-1.5 col-span-1">
                <Label htmlFor="plan-sort">Orden</Label>
                <Controller
                  name="sort_order"
                  control={control}
                  render={({ field }) => (
                    <Input
                      id="plan-sort"
                      type="number"
                      min={0}
                      step={1}
                      placeholder="0"
                      value={field.value}
                      onChange={(e) => field.onChange(Number(e.target.value))}
                    />
                  )}
                />
              </div>
              <div className="flex flex-col gap-1.5 col-span-2">
                <Label htmlFor="plan-badge">Etiqueta (badge)</Label>
                <Input
                  id="plan-badge"
                  {...register('badge_text')}
                  placeholder="Ej. Más popular, Recomendado..."
                />
              </div>
            </div>

            {/* Color picker */}
            <div className="flex flex-col gap-2">
              <Label>Color del plan</Label>
              <div className="flex items-center gap-2 flex-wrap">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setValue('color', c)}
                    className="h-7 w-7 rounded-full border-2 transition-all"
                    style={{
                      backgroundColor: c,
                      borderColor: colorValue === c ? '#000' : 'transparent',
                      transform: colorValue === c ? 'scale(1.2)' : 'scale(1)',
                    }}
                  />
                ))}
                <div className="flex items-center gap-1.5 ml-1">
                  <input
                    type="color"
                    value={colorValue ?? '#6366f1'}
                    onChange={(e) => setValue('color', e.target.value)}
                    className="h-7 w-7 cursor-pointer rounded border border-border p-0"
                  />
                  <span className="text-xs text-muted-foreground font-mono">{colorValue}</span>
                </div>
              </div>
            </div>
          </div>

          <Separator />

          {/* ── Tipo + Módulos ── */}
          <div className="space-y-3">
            <div className="flex flex-col gap-1.5 w-64">
              <Label>Tipo de negocio *</Label>
              <Controller
                name="type"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={(v) => v && field.onChange(v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona tipo" />
                    </SelectTrigger>
                    <SelectContent>
                      {businessTypes.filter((bt) => bt.is_active).map((bt) => (
                        <SelectItem key={bt.slug} value={bt.slug}>
                          {bt.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.type && <p className="text-xs text-destructive">{errors.type.message}</p>}
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <Label>Módulos *</Label>
                {availableModules.length === 0 && typeValue && (
                  <span className="text-xs text-muted-foreground">
                    No hay módulos asignados a este tipo de negocio
                  </span>
                )}
              </div>
              <Controller
                name="modules"
                control={control}
                render={({ field }) => (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {availableModules.map((mod) => {
                      const checked = field.value.includes(mod.key);
                      return (
                        <label
                          key={mod.key}
                          className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${
                            checked
                              ? 'border-primary bg-primary/5 text-primary'
                              : 'border-border hover:bg-muted/50'
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="sr-only"
                            checked={checked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                field.onChange([...field.value, mod.key]);
                              } else {
                                field.onChange(field.value.filter((k) => k !== mod.key));
                              }
                            }}
                          />
                          <span
                            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                              checked ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground'
                            }`}
                          >
                            {checked && <Check className="h-3 w-3" />}
                          </span>
                          {mod.name}
                        </label>
                      );
                    })}
                  </div>
                )}
              />
              {errors.modules && <p className="text-xs text-destructive">{errors.modules.message}</p>}
            </div>
          </div>

          <Separator />

          {/* ── Features / Beneficios ── */}
          <div className="space-y-2">
            <Label>Características del plan</Label>
            <div className="flex gap-2">
              <Input
                value={newFeature}
                onChange={(e) => setNewFeature(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addFeature(); } }}
                placeholder="Ej. 5 usuarios incluidos"
                className="flex-1"
              />
              <Button type="button" variant="outline" size="sm" onClick={addFeature}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {(featuresValue ?? []).length > 0 && (
              <ul className="space-y-1 mt-2">
                {(featuresValue ?? []).map((f, idx) => (
                  <li key={idx} className="flex items-center gap-2 text-sm rounded-md border px-3 py-1.5 bg-muted/30">
                    <GripVertical className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="flex-1">{f}</span>
                    <button
                      type="button"
                      onClick={() => removeFeature(idx)}
                      className="text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <Separator />

          {/* ── Estado ── */}
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <Controller
                name="is_active"
                control={control}
                render={({ field }) => (
                  <input
                    id="plan-active"
                    type="checkbox"
                    checked={field.value}
                    onChange={(e) => field.onChange(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 accent-primary"
                  />
                )}
              />
              <Label htmlFor="plan-active" className="cursor-pointer">Plan activo</Label>
            </div>
            <div className="flex items-center gap-2">
              <Controller
                name="is_featured"
                control={control}
                render={({ field }) => (
                  <input
                    id="plan-featured"
                    type="checkbox"
                    checked={field.value}
                    onChange={(e) => field.onChange(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 accent-primary"
                  />
                )}
              />
              <Label htmlFor="plan-featured" className="cursor-pointer">Destacado</Label>
            </div>
          </div>
        </form>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancelar
          </Button>
          <Button type="submit" form="plan-form" disabled={isPending}>
            {isPending ? 'Guardando...' : 'Guardar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Plan Card Skeleton ───────────────────────────────────────────────────────

function PlanCardSkeleton() {
  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <Skeleton className="h-2 w-full" />
      <div className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
        <Skeleton className="h-4 w-20 rounded-full" />
        <Skeleton className="h-6 w-28" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <div className="flex gap-1.5 flex-wrap">
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-5 w-20 rounded-full" />
        </div>
        <div className="flex gap-2 pt-1">
          <Skeleton className="h-8 w-full rounded-md" />
          <Skeleton className="h-8 w-full rounded-md" />
        </div>
      </div>
    </div>
  );
}

// ─── Plan Card ────────────────────────────────────────────────────────────────

interface PlanCardProps {
  plan: Plan;
  onEdit: (plan: Plan) => void;
  onDelete: (plan: Plan) => void;
  onToggleActive: (plan: Plan) => void;
  allModules: ModuleRegistry[];
  businessTypes: BusinessType[];
}

function PlanCard({ plan, onEdit, onDelete, onToggleActive, allModules, businessTypes }: PlanCardProps) {
  const businessTypeName = businessTypes.find((bt) => bt.slug === plan.type)?.name ?? plan.type;
  const accent = plan.color ?? '#6366f1';

  return (
    <div className="rounded-xl border bg-card flex flex-col overflow-hidden">
      {/* Color stripe */}
      <div className="h-1.5 w-full" style={{ backgroundColor: accent }} />

      {/* Header */}
      <div className="flex items-start justify-between gap-2 px-5 pt-4 pb-2">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-base leading-tight">{plan.name}</h3>
          {plan.is_featured && (
            <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400 shrink-0" />
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {plan.badge_text && (
            <Badge
              className="text-xs px-2 py-0 leading-5"
              style={{ backgroundColor: accent + '20', color: accent, borderColor: accent + '40' }}
              variant="outline"
            >
              {plan.badge_text}
            </Badge>
          )}
          <button
            type="button"
            onClick={() => onToggleActive(plan)}
            title={plan.is_active ? 'Desactivar' : 'Activar'}
          >
            <Badge
              variant={plan.is_active ? 'default' : 'secondary'}
              className="cursor-pointer text-xs"
            >
              {plan.is_active ? 'Activo' : 'Inactivo'}
            </Badge>
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-col gap-2 px-5 pb-4 flex-1">
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="outline" className="text-xs">
            {businessTypeName} · Orden: {plan.sort_order ?? 0}
          </Badge>
          <Badge variant="outline" className="text-xs">
            👤 {plan.max_users != null ? `${plan.max_users} usuario${plan.max_users !== 1 ? 's' : ''}` : '∞ usuarios'}
          </Badge>
          <Badge variant="outline" className="text-xs">
            🖥 {plan.max_pos != null ? `${plan.max_pos} PDV` : '∞ PDV'}
          </Badge>
        </div>

        {/* Prices */}
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-lg font-bold tracking-tight">
            {plan.price === 0 ? 'Gratis' : formatPrice(plan.price)}
          </span>
          {(plan.price_annual ?? 0) > 0 && (
            <span className="text-xs text-muted-foreground">
              · ${(plan.price_annual ?? 0).toLocaleString('es-CO')}/año
              {(plan.annual_discount_pct ?? 0) > 0 && (
                <span className="ml-1 text-green-600 font-medium">
                  ({plan.annual_discount_pct}% dto)
                </span>
              )}
            </span>
          )}
        </div>

        {plan.description && (
          <p className="text-sm text-muted-foreground line-clamp-2">{plan.description}</p>
        )}

        {/* Features */}
        {plan.features && plan.features.length > 0 && (
          <ul className="space-y-0.5 mt-1">
            {plan.features.slice(0, 4).map((f, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <Check className="h-3 w-3 mt-0.5 shrink-0" style={{ color: accent }} />
                {f}
              </li>
            ))}
            {plan.features.length > 4 && (
              <li className="text-xs text-muted-foreground pl-4">
                +{plan.features.length - 4} más...
              </li>
            )}
          </ul>
        )}

        {/* Modules */}
        {plan.modules && plan.modules.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {plan.modules.map((key) => (
              <span
                key={key}
                className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
              >
                {getModuleLabel(key, allModules)}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t px-5 py-3 flex gap-2">
        <Button size="sm" variant="outline" className="flex-1" onClick={() => onEdit(plan)}>
          <Pencil className="h-3.5 w-3.5 mr-1.5" />
          Editar
        </Button>
        <Button size="sm" variant="destructive" className="flex-1" onClick={() => onDelete(plan)}>
          <Trash2 className="h-3.5 w-3.5 mr-1.5" />
          Eliminar
        </Button>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PlansAdminPage() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);

  const { data: plans, isLoading } = useQuery({
    queryKey: ['plans'],
    queryFn: () => plansApi.list().then((r) => r.data), // sin active_only → trae todos
  });

  const { data: businessTypes = [] } = useQuery({
    queryKey: ['business-types'],
    queryFn: () => businessTypesApi.list().then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  });

  const { data: allModules = [] } = useQuery({
    queryKey: ['module-registry'],
    queryFn: () => moduleRegistryApi.list().then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => plansApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plans'] });
      notify.success('Plan eliminado correctamente');
    },
    onError: (err) => notify.error(err, 'Error al eliminar el plan'),
  });

  const toggleMutation = useMutation({
    mutationFn: (plan: Plan) =>
      plansApi.update(plan.id, { is_active: !plan.is_active }).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plans'] });
    },
    onError: (err) => notify.error(err, 'Error al actualizar el plan'),
  });

  function handleNew() {
    setEditingPlan(null);
    setDialogOpen(true);
  }

  function handleEdit(plan: Plan) {
    setEditingPlan(plan);
    setDialogOpen(true);
  }

  function handleDelete(plan: Plan) {
    const confirmed = window.confirm(`¿Eliminar el plan "${plan.name}"?`);
    if (confirmed) deleteMutation.mutate(plan.id);
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Planes</h1>
          <p className="text-sm text-muted-foreground">Gestión de planes de suscripción</p>
        </div>
        <Button onClick={handleNew}>
          <Plus className="h-4 w-4 mr-2" />
          Nuevo plan
        </Button>
      </div>

      {/* Plans grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {isLoading
          ? Array.from({ length: 6 }).map((_, i) => <PlanCardSkeleton key={i} />)
          : plans && plans.length > 0
          ? plans.map((plan) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onToggleActive={(p) => toggleMutation.mutate(p)}
                allModules={allModules}
                businessTypes={businessTypes}
              />
            ))
          : (
            <div className="col-span-full flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-16 text-muted-foreground">
              <Package className="h-10 w-10 opacity-40" />
              <p className="text-sm">No hay planes creados</p>
            </div>
          )}
      </div>

      {/* Create / Edit dialog */}
      <PlanDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editingPlan={editingPlan}
        businessTypes={businessTypes}
        allModules={allModules}
      />
    </div>
  );
}
