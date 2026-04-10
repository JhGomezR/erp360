'use client';

import * as z from 'zod';
import { useEffect, useRef, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Pencil, Trash2, Plus, Tag } from 'lucide-react';

import { categoriesApi } from '@/lib/api/tenant.api';
import type { Category } from '@/types';

import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// ─── Zod Schema ───────────────────────────────────────────────────────────────

const categorySchema = z.object({
  name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres'),
  slug: z.string().optional(),
  parent_id: z.number().optional(),
});

type CategoryFormValues = z.infer<typeof categorySchema>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateSlug(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-');
}

// ─── Category Dialog ──────────────────────────────────────────────────────────

interface CategoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingCategory: Category | null;
  categories: Category[];
  slug: string;
}

function CategoryDialog({
  open,
  onOpenChange,
  editingCategory,
  categories,
  slug,
}: CategoryDialogProps) {
  const queryClient = useQueryClient();
  const isEdit = Boolean(editingCategory);
  const slugManuallyEdited = useRef(false);

  const {
    register,
    handleSubmit,
    control,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CategoryFormValues>({
    resolver: zodResolver(categorySchema),
    defaultValues: {
      name: '',
      slug: '',
      parent_id: undefined,
    },
  });

  const nameValue = watch('name');

  // Reset form when dialog opens/closes or editing category changes
  useEffect(() => {
    if (open) {
      slugManuallyEdited.current = false;
      if (editingCategory) {
        reset({
          name: editingCategory.name,
          slug: editingCategory.slug,
          parent_id: editingCategory.parent_id ?? undefined,
        });
      } else {
        reset({ name: '', slug: '', parent_id: undefined });
      }
    }
  }, [open, editingCategory, reset]);

  // Auto-generate slug from name if slug hasn't been manually edited
  useEffect(() => {
    if (!open) return;
    if (slugManuallyEdited.current) return;
    if (nameValue) {
      setValue('slug', generateSlug(nameValue));
    }
  }, [nameValue, open, setValue]);

  const createMutation = useMutation({
    mutationFn: (data: Partial<Category>) =>
      categoriesApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories', slug] });
      toast.success('Categoría creada correctamente');
      onOpenChange(false);
    },
    onError: () => toast.error('Error al crear la categoría'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Category> }) =>
      categoriesApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories', slug] });
      toast.success('Categoría actualizada correctamente');
      onOpenChange(false);
    },
    onError: () => toast.error('Error al actualizar la categoría'),
  });

  const onSubmit = (values: CategoryFormValues) => {
    const payload: Partial<Category> = {
      name: values.name,
      slug: values.slug || generateSlug(values.name),
      parent_id: values.parent_id,
    };

    if (editingCategory) {
      updateMutation.mutate({ id: editingCategory.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const isPending =
    createMutation.isPending || updateMutation.isPending || isSubmitting;

  // Root categories, excluding self when editing
  const rootCategories = categories.filter(
    (cat) => !cat.parent_id && cat.id !== editingCategory?.id
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? 'Editar categoría' : 'Nueva categoría'}
          </DialogTitle>
        </DialogHeader>

        <form
          onSubmit={handleSubmit(onSubmit)}
          id="category-form"
          className="flex flex-col gap-4"
        >
          {/* Nombre */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cat-name">Nombre *</Label>
            <Input
              id="cat-name"
              {...register('name')}
              placeholder="Nombre de la categoría"
            />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name.message}</p>
            )}
          </div>

          {/* Slug */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cat-slug">
              Slug{' '}
              <span className="text-xs text-muted-foreground">(opcional)</span>
            </Label>
            <Input
              id="cat-slug"
              {...register('slug')}
              placeholder="auto-generado-desde-nombre"
              onChange={(e) => {
                slugManuallyEdited.current = true;
                setValue('slug', e.target.value);
              }}
            />
          </div>

          {/* Categoría padre */}
          <div className="flex flex-col gap-1.5">
            <Label>Categoría padre</Label>
            <Controller
              control={control}
              name="parent_id"
              render={({ field }) => (
                <Select
                  value={field.value ? String(field.value) : 'none'}
                  onValueChange={(val) =>
                    field.onChange(val === 'none' ? undefined : Number(val))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {field.value
                        ? (rootCategories.find((c) => c.id === field.value)?.name ?? 'Sin categoría padre')
                        : 'Sin categoría padre'}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin categoría padre</SelectItem>
                    {rootCategories.map((cat) => (
                      <SelectItem key={cat.id} value={String(cat.id)}>
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
        </form>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancelar
          </Button>
          <Button type="submit" form="category-form" disabled={isPending}>
            {isPending ? 'Guardando...' : 'Guardar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Categories Sheet ─────────────────────────────────────────────────────────

interface CategoriesSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slug: string;
}

export function CategoriesSheet({
  open,
  onOpenChange,
  slug,
}: CategoriesSheetProps) {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);

  const { data: categories = [], isLoading } = useQuery({
    queryKey: ['categories', slug],
    queryFn: () => categoriesApi.list().then((r) => r.data),
    enabled: open,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => categoriesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories', slug] });
      toast.success('Categoría eliminada');
    },
    onError: () => toast.error('Error al eliminar la categoría'),
  });

  const handleNew = () => {
    setEditingCategory(null);
    setDialogOpen(true);
  };

  const handleEdit = (cat: Category) => {
    setEditingCategory(cat);
    setDialogOpen(true);
  };

  const handleDelete = (cat: Category) => {
    if (
      window.confirm(
        `¿Eliminar la categoría "${cat.name}"? Esta acción no se puede deshacer.`
      )
    ) {
      deleteMutation.mutate(cat.id);
    }
  };

  // Backend returns only root categories with nested children.
  // Build ordered list: parent first, then its children indented below.
  const orderedCategories: { cat: Category; isChild: boolean }[] = [];
  const rootCats = categories as Category[];

  for (const parent of rootCats) {
    orderedCategories.push({ cat: parent, isChild: false });
    const children = (parent.children ?? []) as Category[];
    for (const child of children) {
      orderedCategories.push({ cat: child, isChild: true });
    }
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="flex flex-col gap-0 p-0 sm:max-w-md">
          {/* Header */}
          <SheetHeader className="flex flex-row items-center justify-between border-b border-border px-6 py-4">
            <div className="flex items-center gap-2">
              <Tag className="size-5 text-muted-foreground" />
              <SheetTitle>Gestión de Categorías</SheetTitle>
            </div>
            <Button size="sm" className="gap-2" onClick={handleNew}>
              <Plus className="size-4" />
              Nueva categoría
            </Button>
          </SheetHeader>

          {/* Category list */}
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="flex flex-col gap-0 divide-y divide-border">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center justify-between px-6 py-3">
                    <Skeleton className="h-4 w-40" />
                    <div className="flex gap-1">
                      <Skeleton className="h-7 w-7 rounded-md" />
                      <Skeleton className="h-7 w-7 rounded-md" />
                    </div>
                  </div>
                ))}
              </div>
            ) : orderedCategories.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
                <Plus className="size-8" />
                <p className="text-sm">No hay categorías. Crea la primera.</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {orderedCategories.map(({ cat, isChild }) => (
                  <div
                    key={cat.id}
                    className="flex items-center justify-between px-6 py-3 hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {isChild && (
                        <span className="shrink-0 text-muted-foreground">└</span>
                      )}
                      <span className="truncate text-sm font-medium">
                        {cat.name}
                      </span>
                      {(cat as Category & { products_count?: number }).products_count !== undefined && (
                        <Badge variant="secondary" className="shrink-0 text-xs">
                          {(cat as Category & { products_count?: number }).products_count}
                        </Badge>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => handleEdit(cat)}
                        title="Editar categoría"
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => handleDelete(cat)}
                        title="Eliminar categoría"
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <CategoryDialog
        open={dialogOpen}
        onOpenChange={(v) => {
          setDialogOpen(v);
          if (!v) setEditingCategory(null);
        }}
        editingCategory={editingCategory}
        categories={categories as Category[]}
        slug={slug}
      />
    </>
  );
}
