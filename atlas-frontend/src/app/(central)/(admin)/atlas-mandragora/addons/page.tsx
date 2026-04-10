'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { notify } from '@/lib/notify';
import { Plus, Pencil, Trash2, Puzzle } from 'lucide-react';

import { addonsApi, moduleRegistryApi } from '@/lib/api/central.api';
import type { ModuleRegistry } from '@/lib/api/central.api';
import type { Addon } from '@/types';

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
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';

// ─── Schema ───────────────────────────────────────────────────────────────────

const addonSchema = z.object({
  name:        z.string().min(2, 'El nombre debe tener al menos 2 caracteres'),
  slug:        z.string().optional(),
  description: z.string().min(5, 'Descripción requerida'),
  module_key:  z.string().min(1, 'Selecciona un módulo'),
  price:       z.number().min(0, 'El precio debe ser mayor o igual a 0'),
  is_active:   z.boolean(),
});

type AddonFormValues = z.infer<typeof addonSchema>;

// ─── Módulos BASE que nunca se venden como add-on ─────────────────────────────
// Siempre activos y gratuitos para todos los tenants.
const BASE_MODULES = new Set([
  'pos', 'inventory', 'cash', 'customers', 'reports', 'warehouse',
  'accounting', 'sales', 'banking', 'expenses', 'commissions',
  'prescriptions', 'scales',
]);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function getModuleName(key: string, modules: ModuleRegistry[]): string {
  return modules.find((m) => m.key === key)?.name ?? key;
}

// ─── Add-on Form Dialog ───────────────────────────────────────────────────────

interface AddonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  addon?: Addon | null;
  modules: ModuleRegistry[];
  /** module_keys que ya tienen un add-on activo registrado (excluir del selector al crear) */
  usedModuleKeys: Set<string>;
}

function AddonDialog({ open, onOpenChange, addon, modules, usedModuleKeys }: AddonDialogProps) {
  const queryClient = useQueryClient();
  const isEditing = !!addon;

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<AddonFormValues>({
    resolver: zodResolver(addonSchema),
    defaultValues: {
      name:        '',
      slug:        '',
      description: '',
      module_key:  '',
      price:       0,
      is_active:   true,
    },
  });

  useEffect(() => {
    if (open) {
      if (addon) {
        reset({
          name:        addon.name,
          slug:        addon.slug,
          description: addon.description,
          module_key:  addon.module_key,
          price:       addon.price,
          is_active:   addon.is_active,
        });
      } else {
        reset({ name: '', slug: '', description: '', module_key: '', price: 0, is_active: true });
      }
    }
  }, [open, addon, reset]);

  const nameValue = watch('name');
  useEffect(() => {
    if (!isEditing) setValue('slug', toSlug(nameValue ?? ''));
  }, [nameValue, isEditing, setValue]);

  const createMutation = useMutation({
    mutationFn: (data: Partial<Addon>) => addonsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['addons'] });
      notify.success('Add-on creado correctamente');
      onOpenChange(false);
    },
    onError: () => notify.error('Error al crear el add-on'),
  });

  const updateMutation = useMutation({
    mutationFn: (data: Partial<Addon>) => addonsApi.update(addon!.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['addons'] });
      notify.success('Add-on actualizado correctamente');
      onOpenChange(false);
    },
    onError: () => notify.error('Error al actualizar el add-on'),
  });

  const isPending = createMutation.isPending || updateMutation.isPending;

  function onSubmit(values: AddonFormValues) {
    if (isEditing) updateMutation.mutate(values);
    else createMutation.mutate(values);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Editar add-on' : 'Nuevo add-on'}</DialogTitle>
        </DialogHeader>

        <form id="addon-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {/* Nombre */}
            <div className="space-y-1.5">
              <Label htmlFor="addon-name">Nombre</Label>
              <Input id="addon-name" placeholder="Nombre del add-on" {...register('name')} />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>

            {/* Slug */}
            <div className="space-y-1.5">
              <Label htmlFor="addon-slug">Slug</Label>
              <Input id="addon-slug" placeholder="slug-del-addon" {...register('slug')} />
              {errors.slug && <p className="text-xs text-destructive">{errors.slug.message}</p>}
            </div>

            {/* Módulo */}
            <div className="space-y-1.5">
              <Label>Módulo que activa</Label>
              <Controller
                name="module_key"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={(v) => v && field.onChange(v)}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Selecciona un módulo" />
                    </SelectTrigger>
                    <SelectContent>
                      {modules
                        .filter((mod) => {
                          // Excluir módulos BASE (nunca add-on)
                          if (BASE_MODULES.has(mod.key)) return false;
                          // Al crear: excluir módulos que ya tienen add-on registrado
                          // Al editar: mostrar el módulo actual aunque ya esté usado
                          if (!addon && usedModuleKeys.has(mod.key)) return false;
                          return true;
                        })
                        .sort((a, b) => a.name.localeCompare(b.name))
                        .map((mod) => (
                          <SelectItem key={mod.key} value={mod.key}>
                            <div className="flex flex-col">
                              <span>{mod.name}</span>
                              <span className="text-xs text-muted-foreground font-mono">{mod.key}</span>
                            </div>
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.module_key && (
                <p className="text-xs text-destructive">{errors.module_key.message}</p>
              )}
            </div>

            {/* Precio mensual */}
            <div className="space-y-1.5">
              <Label htmlFor="addon-price">Precio mensual</Label>
              <Input
                id="addon-price"
                type="number"
                min={0}
                placeholder="0"
                {...register('price', { valueAsNumber: true })}
              />
              {errors.price && <p className="text-xs text-destructive">{errors.price.message}</p>}
            </div>

            {/* Descripción */}
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="addon-description">Descripción</Label>
              <textarea
                id="addon-description"
                rows={3}
                placeholder="Describe qué activa este add-on..."
                className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
                {...register('description')}
              />
              {errors.description && (
                <p className="text-xs text-destructive">{errors.description.message}</p>
              )}
            </div>

            {/* Estado activo */}
            <div className="col-span-2 flex items-center gap-2">
              <Controller
                name="is_active"
                control={control}
                render={({ field }) => (
                  <input
                    id="addon-is-active"
                    type="checkbox"
                    checked={field.value}
                    onChange={(e) => field.onChange(e.target.checked)}
                    className="size-4 rounded border-input accent-primary"
                  />
                )}
              />
              <Label htmlFor="addon-is-active" className="cursor-pointer">Add-on activo</Label>
            </div>
          </div>
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancelar
          </Button>
          <Button type="submit" form="addon-form" disabled={isPending}>
            {isPending ? 'Guardando...' : 'Guardar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AddonsAdminPage() {
  const queryClient = useQueryClient();
  const [dialogOpen,    setDialogOpen]    = useState(false);
  const [editingAddon,  setEditingAddon]  = useState<Addon | null>(null);
  const [deleteTarget,  setDeleteTarget]  = useState<Addon | null>(null);

  const { data: addons, isLoading } = useQuery({
    queryKey: ['addons'],
    queryFn: () => addonsApi.list().then((r) => r.data),
  });

  const { data: modules = [] } = useQuery({
    queryKey: ['module-registry'],
    queryFn: () => moduleRegistryApi.list().then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  });

  // module_keys que ya tienen add-on registrado (activo o inactivo)
  const usedModuleKeys = new Set<string>(
    (addons ?? []).map((a: Addon) => a.module_key)
  );

  const deleteMutation = useMutation({
    mutationFn: (id: number) => addonsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['addons'] });
      notify.success('Add-on eliminado');
    },
    onError: () => notify.error('Error al eliminar el add-on'),
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Add-ons</h1>
          <p className="text-sm text-muted-foreground">
            Funcionalidades adicionales que los tenants pueden adquirir
          </p>
        </div>
        <Button onClick={() => { setEditingAddon(null); setDialogOpen(true); }}>
          <Plus className="mr-2 size-4" />
          Nuevo add-on
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Nombre</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Módulo que activa</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Precio/mes</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Estado</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && Array.from({ length: 5 }).map((_, i) => (
              <tr key={i} className="border-b last:border-0">
                <td className="px-4 py-3"><Skeleton className="h-4 w-36" /></td>
                <td className="px-4 py-3"><Skeleton className="h-4 w-32" /></td>
                <td className="px-4 py-3"><Skeleton className="h-4 w-20" /></td>
                <td className="px-4 py-3"><Skeleton className="h-5 w-16 rounded-full" /></td>
                <td className="px-4 py-3 text-right"><Skeleton className="ml-auto h-7 w-16" /></td>
              </tr>
            ))}

            {!isLoading && (!addons || addons.length === 0) && (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">
                  <div className="flex flex-col items-center gap-2">
                    <Puzzle className="size-8 opacity-40" />
                    <span className="text-sm">No hay add-ons creados</span>
                  </div>
                </td>
              </tr>
            )}

            {!isLoading && addons?.map((addon) => (
              <tr key={addon.id} className="border-b last:border-0 hover:bg-muted/30">
                <td className="px-4 py-3">
                  <div className="font-medium">{addon.name}</div>
                  {addon.description && (
                    <div className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                      {addon.description}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-col gap-0.5">
                    <span className="font-medium">{getModuleName(addon.module_key, modules)}</span>
                    <code className="font-mono text-xs text-muted-foreground">{addon.module_key}</code>
                  </div>
                </td>
                <td className="px-4 py-3 tabular-nums">
                  ${addon.price.toLocaleString('es-CO')}/mes
                </td>
                <td className="px-4 py-3">
                  <Badge variant={addon.is_active ? 'default' : 'secondary'}>
                    {addon.is_active ? 'Activo' : 'Inactivo'}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => { setEditingAddon(addon); setDialogOpen(true); }}
                      aria-label="Editar"
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setDeleteTarget(addon)}
                      aria-label="Eliminar"
                      className="text-destructive hover:text-destructive"
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <AddonDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        addon={editingAddon}
        modules={modules}
        usedModuleKeys={usedModuleKeys}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar add-on</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Eliminar el add-on <strong>&quot;{deleteTarget?.name}&quot;</strong>? Esta acción no se puede deshacer y dejará de estar disponible para los tenants.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending} />
            <AlertDialogAction
              onClick={() => { if (deleteTarget) deleteMutation.mutate(deleteTarget.id); setDeleteTarget(null); }}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? 'Eliminando...' : 'Eliminar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
