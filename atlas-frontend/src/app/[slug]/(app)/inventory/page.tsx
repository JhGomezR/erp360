'use client';

import * as z from 'zod';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notify } from '@/lib/notify';
import {
  Pencil,
  Trash2,
  ArrowUpDown,
  Plus,
  Search,
  PackageSearch,
  Tag,
  History,
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  Download,
} from 'lucide-react';

import { productsApi, categoriesApi, tenantMediaApi, taxesApi, billingApi, type TaxRecord } from '@/lib/api/tenant.api';
import { PromotionsTab } from './_components/PromotionsTab';
import type { Product, Category } from '@/types';

import { CategoriesSheet }    from '@/components/inventory/CategoriesSheet';
import { BatchesTab }         from './_components/BatchesTab';
import { KardexTab }          from './_components/KardexTab';
import { StockAlertsTab }     from './_components/StockAlertsTab';
import { FractionsManager }   from './_components/FractionsManager';
import { VariantsManager }       from './_components/VariantsManager';
import { PhysicalInventoryTab } from './_components/PhysicalInventoryTab';
import { ValuationTab } from './_components/ValuationTab';

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
import { ImageUpload } from '@/components/ui/image-upload';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(value);

// ─── Zod Schema ───────────────────────────────────────────────────────────────

const productSchema = z.object({
  name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres'),
  sku: z.string().min(1, 'El SKU es requerido'),
  barcode: z.string().optional(),
  price: z
    .number({ error: 'Precio requerido' })
    .positive('El precio debe ser mayor a 0'),
  cost: z
    .number({ error: 'Costo requerido' })
    .min(0, 'El costo no puede ser negativo'),
  stock: z.number().int().min(0).optional(),
  min_stock: z
    .number({ error: 'Stock mínimo requerido' })
    .int()
    .min(0),
  category_id: z
    .number({ error: 'Selecciona una categoría' })
    .positive('Selecciona una categoría'),
  description: z.string().optional(),
  is_active: z.boolean(),
  image_url: z.string().optional(),
  tax_ids: z.array(z.number()).optional(),
  // ─── INVIMA / Registro sanitario ────────────────────────────────────────
  invima_code: z.string().optional(),
  invima_expiry: z.string().optional(),
  controlled_substance: z.boolean().optional(),
  requires_prescription: z.boolean().optional(),
});

type ProductFormValues = z.infer<typeof productSchema>;

// ─── Adjust Stock Schema ───────────────────────────────────────────────────────

const adjustSchema = z.object({
  quantity: z
    .number({ error: 'Cantidad requerida' })
    .int('Debe ser un número entero')
    .refine((n) => n !== 0, 'La cantidad no puede ser 0'),
  reason: z.string().min(1, 'Selecciona un motivo'),
});

type AdjustFormValues = z.infer<typeof adjustSchema>;

const ADJUST_REASONS = [
  { value: 'Compra', label: 'Compra' },
  { value: 'Ajuste manual', label: 'Ajuste manual' },
  { value: 'Daño/Pérdida', label: 'Daño / Pérdida' },
  { value: 'Devolución', label: 'Devolución' },
];

// ─── Product Form Dialog ───────────────────────────────────────────────────────

interface ProductDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: Product | null;
  categories: Category[];
  slug: string;
  hasFractionsAddon: boolean;
}

function ProductDialog({
  open,
  onOpenChange,
  product,
  categories,
  slug,
  hasFractionsAddon,
}: ProductDialogProps) {
  const queryClient = useQueryClient();
  const isEdit = Boolean(product);

  const { data: allTaxes = [] } = useQuery<TaxRecord[]>({
    queryKey: ['taxes', slug],
    queryFn: async () => {
      const r = await taxesApi.list();
      return (r.data as TaxRecord[]) ?? [];
    },
  });

  const {
    register,
    handleSubmit,
    control,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      name: '',
      sku: '',
      barcode: '',
      price: 0,
      cost: 0,
      stock: 0,
      min_stock: 0,
      category_id: 0,
      description: '',
      is_active: true,
      image_url: '',
      tax_ids: [],
      invima_code: '',
      invima_expiry: '',
      controlled_substance: false,
      requires_prescription: false,
    },
  });

  const selectedTaxIds = watch('tax_ids') ?? [];

  const toggleTax = (id: number) => {
    const current = selectedTaxIds;
    setValue(
      'tax_ids',
      current.includes(id) ? current.filter((t) => t !== id) : [...current, id],
    );
  };

  useEffect(() => {
    if (open) {
      if (product) {
        const productTaxIds = (product as Product & { taxes?: { id: number }[] }).taxes?.map((t) => t.id) ?? [];
        reset({
          name: product.name,
          sku: product.sku,
          barcode: product.barcode ?? '',
          price: product.price,
          cost: product.cost,
          stock: product.stock,
          min_stock: product.min_stock,
          category_id: product.category_id,
          description: product.description ?? '',
          is_active: product.is_active,
          image_url: (product as Product & { image_url?: string }).image_url ?? '',
          tax_ids: productTaxIds,
          invima_code: product.invima_code ?? '',
          invima_expiry: product.invima_expiry ?? '',
          controlled_substance: product.controlled_substance ?? false,
          requires_prescription: product.requires_prescription ?? false,
        });
      } else {
        reset({
          name: '',
          sku: '',
          barcode: '',
          price: 0,
          cost: 0,
          stock: 0,
          min_stock: 0,
          category_id: 0,
          description: '',
          is_active: true,
          image_url: '',
          tax_ids: [],
          invima_code: '',
          invima_expiry: '',
          controlled_substance: false,
          requires_prescription: false,
        });
      }
    }
  }, [open, product, reset]);

  const createMutation = useMutation({
    mutationFn: (data: Partial<Product>) =>
      productsApi.create(data).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products', slug] });
      notify.success('Producto creado correctamente');
      onOpenChange(false);
    },
    onError: (err) => notify.error(err, 'Error al crear el producto'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Product> }) =>
      productsApi.update(id, data).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products', slug] });
      notify.success('Producto actualizado correctamente');
      onOpenChange(false);
    },
    onError: (err) => notify.error(err, 'Error al actualizar el producto'),
  });

  const onSubmit = (values: ProductFormValues) => {
    const payload: Partial<Product> & { image_url?: string; tax_ids?: number[] } = {
      name: values.name,
      sku: values.sku,
      barcode: values.barcode || undefined,
      price: values.price,
      cost: values.cost,
      min_stock: values.min_stock,
      category_id: values.category_id,
      description: values.description || undefined,
      is_active: values.is_active,
      image_url: values.image_url || undefined,
      tax_ids: values.tax_ids ?? [],
      // ─── INVIMA ──────────────────────────────────────────────────────────
      invima_code: values.invima_code || undefined,
      invima_expiry: values.invima_expiry || undefined,
      controlled_substance: values.controlled_substance ?? false,
      requires_prescription: values.requires_prescription ?? false,
    };

    if (!isEdit) {
      payload.stock = values.stock ?? 0;
    }

    if (product) {
      updateMutation.mutate({ id: product.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const isPending =
    createMutation.isPending || updateMutation.isPending || isSubmitting;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? 'Editar producto' : 'Nuevo producto'}
          </DialogTitle>
        </DialogHeader>

        <form
          onSubmit={handleSubmit(onSubmit)}
          id="product-form"
          className="grid grid-cols-1 gap-4 sm:grid-cols-2"
        >
          {/* Nombre */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Nombre *</Label>
            <Input
              id="name"
              {...register('name')}
              placeholder="Nombre del producto"
            />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name.message}</p>
            )}
          </div>

          {/* SKU */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sku">SKU *</Label>
            <Input id="sku" {...register('sku')} placeholder="SKU único" />
            {errors.sku && (
              <p className="text-xs text-destructive">{errors.sku.message}</p>
            )}
          </div>

          {/* Barcode */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="barcode">Código de barras</Label>
            <Input
              id="barcode"
              {...register('barcode')}
              placeholder="Opcional"
            />
          </div>

          {/* Categoría */}
          <div className="flex flex-col gap-1.5">
            <Label>Categoría *</Label>
            <Controller
              control={control}
              name="category_id"
              render={({ field }) => (
                <Select
                  value={field.value ? String(field.value) : ''}
                  onValueChange={(val) => field.onChange(Number(val))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Seleccionar categoría" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((cat) => (
                      <SelectItem key={cat.id} value={String(cat.id)}>
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.category_id && (
              <p className="text-xs text-destructive">
                {errors.category_id.message}
              </p>
            )}
          </div>

          {/* Precio */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="price">Precio *</Label>
            <Input
              id="price"
              type="number"
              step="0.01"
              min="0"
              {...register('price', { valueAsNumber: true })}
              placeholder="0"
            />
            {errors.price && (
              <p className="text-xs text-destructive">{errors.price.message}</p>
            )}
          </div>

          {/* Costo */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cost">Costo *</Label>
            <Input
              id="cost"
              type="number"
              step="0.01"
              min="0"
              {...register('cost', { valueAsNumber: true })}
              placeholder="0"
            />
            {errors.cost && (
              <p className="text-xs text-destructive">{errors.cost.message}</p>
            )}
          </div>

          {/* Stock inicial (solo en crear) */}
          {!isEdit && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="stock">Stock inicial</Label>
              <Input
                id="stock"
                type="number"
                min="0"
                {...register('stock', { valueAsNumber: true })}
                placeholder="0"
              />
            </div>
          )}

          {/* Stock mínimo */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="min_stock">Stock mínimo *</Label>
            <Input
              id="min_stock"
              type="number"
              min="0"
              {...register('min_stock', { valueAsNumber: true })}
              placeholder="0"
            />
            {errors.min_stock && (
              <p className="text-xs text-destructive">
                {errors.min_stock.message}
              </p>
            )}
          </div>

          {/* Imagen del producto */}
          <div className="col-span-full flex flex-col gap-1.5">
            <Label>Imagen del producto</Label>
            <Controller
              control={control}
              name="image_url"
              render={({ field }) => (
                <ImageUpload
                  value={field.value}
                  onChange={field.onChange}
                  uploadFn={(file) =>
                    tenantMediaApi.upload(file, 'products').then((r) => ({ url: r.data.url }))
                  }
                  label="Arrastra una imagen o haz clic para seleccionar"
                />
              )}
            />
          </div>

          {/* Descripción */}
          <div className="col-span-full flex flex-col gap-1.5">
            <Label htmlFor="description">Descripción</Label>
            <textarea
              id="description"
              {...register('description')}
              placeholder="Descripción del producto (opcional)"
              className="min-h-[80px] w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>

          {/* Activo */}
          <div className="col-span-full flex items-center gap-2">
            <input
              id="is_active"
              type="checkbox"
              {...register('is_active')}
              className="size-4 rounded border border-input accent-primary"
            />
            <Label htmlFor="is_active">Producto activo</Label>
          </div>

          {/* ─── Registro Sanitario / INVIMA ─────────────────────────────── */}
          <div className="col-span-full border-t pt-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
              Registro Sanitario / INVIMA
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* Código INVIMA */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="invima_code">
                  Código INVIMA
                  <span className="ml-1 text-xs text-muted-foreground">(opcional)</span>
                </Label>
                <Input
                  id="invima_code"
                  {...register('invima_code')}
                  placeholder="Ej: INVIMA2023M-0012345"
                />
              </div>

              {/* Vencimiento INVIMA */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="invima_expiry">
                  Vigencia del registro
                  <span className="ml-1 text-xs text-muted-foreground">(opcional)</span>
                </Label>
                <Input
                  id="invima_expiry"
                  type="date"
                  {...register('invima_expiry')}
                />
              </div>

              {/* Controles farmacéuticos */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <input
                    id="controlled_substance"
                    type="checkbox"
                    {...register('controlled_substance')}
                    className="size-4 rounded border border-input accent-primary"
                  />
                  <Label htmlFor="controlled_substance" className="cursor-pointer">
                    Medicamento de control especial
                    <span className="ml-1 text-xs text-muted-foreground">(estupefacientes / psicotrópicos)</span>
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    id="requires_prescription"
                    type="checkbox"
                    {...register('requires_prescription')}
                    className="size-4 rounded border border-input accent-primary"
                  />
                  <Label htmlFor="requires_prescription" className="cursor-pointer">
                    Requiere fórmula médica
                  </Label>
                </div>
              </div>
            </div>
          </div>

          {/* Impuestos */}
          {allTaxes.length > 0 && (
            <div className="col-span-full flex flex-col gap-2">
              <Label>Impuestos aplicables</Label>
              <div className="flex flex-wrap gap-3">
                {allTaxes.filter((t) => t.is_active).map((tax) => (
                  <label key={tax.id} className="flex items-center gap-1.5 cursor-pointer text-sm">
                    <input
                      type="checkbox"
                      className="size-4 rounded border border-input accent-primary"
                      checked={selectedTaxIds.includes(tax.id)}
                      onChange={() => toggleTax(tax.id)}
                    />
                    {tax.name}
                    <span className="text-xs text-muted-foreground">({Number(tax.rate).toFixed(2)} %)</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </form>

        {isEdit && product && hasFractionsAddon && (
          <div className="border-t pt-4">
            <FractionsManager
              productId={product.id}
              productName={product.name}
              productUnit={product.unit ?? ''}
              slug={slug}
            />
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancelar
          </Button>
          <Button type="submit" form="product-form" disabled={isPending}>
            {isPending ? 'Guardando...' : 'Guardar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Adjust Stock Dialog ───────────────────────────────────────────────────────

interface AdjustDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: Product | null;
  slug: string;
}

function AdjustStockDialog({
  open,
  onOpenChange,
  product,
  slug,
}: AdjustDialogProps) {
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<AdjustFormValues>({
    resolver: zodResolver(adjustSchema),
    defaultValues: { quantity: 0, reason: '' },
  });

  useEffect(() => {
    if (open) reset({ quantity: 0, reason: '' });
  }, [open, reset]);

  const adjustMutation = useMutation({
    mutationFn: ({ quantity, reason }: AdjustFormValues) =>
      productsApi.adjustStock(product!.id, quantity, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products', slug] });
      notify.success('Stock ajustado correctamente');
      onOpenChange(false);
    },
    onError: (err) => notify.error(err, 'Error al ajustar el stock'),
  });

  const onSubmit = (values: AdjustFormValues) => {
    adjustMutation.mutate(values);
  };

  const isPending = adjustMutation.isPending || isSubmitting;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ajustar stock</DialogTitle>
        </DialogHeader>

        {product && (
          <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm">
            <p className="font-medium">{product.name}</p>
            <p className="text-muted-foreground">
              Stock actual:{' '}
              <span className="font-semibold text-foreground">
                {product.stock}
              </span>{' '}
              unidades
            </p>
          </div>
        )}

        <form
          onSubmit={handleSubmit(onSubmit)}
          id="adjust-form"
          className="flex flex-col gap-4"
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="adj-quantity">
              Cantidad{' '}
              <span className="text-xs text-muted-foreground">
                (+ entrada / - salida)
              </span>
            </Label>
            <Input
              id="adj-quantity"
              type="number"
              {...register('quantity', { valueAsNumber: true })}
              placeholder="Ej: 10 o -5"
            />
            {errors.quantity && (
              <p className="text-xs text-destructive">
                {errors.quantity.message}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Motivo *</Label>
            <Controller
              control={control}
              name="reason"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Seleccionar motivo" />
                  </SelectTrigger>
                  <SelectContent>
                    {ADJUST_REASONS.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.reason && (
              <p className="text-xs text-destructive">{errors.reason.message}</p>
            )}
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
          <Button type="submit" form="adjust-form" disabled={isPending}>
            {isPending ? 'Guardando...' : 'Guardar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Skeleton Rows ─────────────────────────────────────────────────────────────

function TableSkeletonRows() {
  return (
    <>
      {Array.from({ length: 8 }).map((_, i) => (
        <tr key={i} className="border-b border-border">
          <td className="px-4 py-3">
            <Skeleton className="h-4 w-20" />
          </td>
          <td className="px-4 py-3">
            <Skeleton className="h-4 w-36" />
          </td>
          <td className="px-4 py-3">
            <Skeleton className="h-4 w-24" />
          </td>
          <td className="px-4 py-3">
            <Skeleton className="h-4 w-20" />
          </td>
          <td className="px-4 py-3">
            <Skeleton className="h-4 w-20" />
          </td>
          <td className="px-4 py-3">
            <Skeleton className="h-4 w-16" />
          </td>
          <td className="px-4 py-3">
            <Skeleton className="h-5 w-14 rounded-full" />
          </td>
          <td className="px-4 py-3">
            <Skeleton className="h-8 w-24" />
          </td>
        </tr>
      ))}
    </>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

// ─── Kardex Dialog ────────────────────────────────────────────────────────────

interface KardexDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  product: Product | null;
}

function KardexDialog({ open, onOpenChange, product }: KardexDialogProps) {
  const { data, isLoading } = useQuery({
    queryKey: ['kardex', product?.id],
    queryFn: () => productsApi.kardex(product!.id),
    enabled: open && !!product,
  });

  const entries = (data as any)?.data ?? [];

  const TYPE_LABEL: Record<string, string> = {
    in: 'Entrada',
    out: 'Salida',
    adjustment: 'Ajuste',
  };
  const TYPE_COLOR: Record<string, string> = {
    in: 'text-emerald-600',
    out: 'text-destructive',
    adjustment: 'text-amber-600',
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="size-4" />
            Movimientos — {product?.name}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-background border-b">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Fecha</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Tipo</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">Cantidad</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">Saldo</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Referencia</th>
              </tr>
            </thead>
            <tbody>
              {isLoading &&
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b">
                    <td className="px-3 py-2"><Skeleton className="h-4 w-28" /></td>
                    <td className="px-3 py-2"><Skeleton className="h-4 w-16" /></td>
                    <td className="px-3 py-2 text-right"><Skeleton className="h-4 w-10 ml-auto" /></td>
                    <td className="px-3 py-2 text-right"><Skeleton className="h-4 w-12 ml-auto" /></td>
                    <td className="px-3 py-2"><Skeleton className="h-4 w-24" /></td>
                  </tr>
                ))}
              {!isLoading && entries.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-10 text-center text-muted-foreground">
                    Sin movimientos registrados
                  </td>
                </tr>
              )}
              {!isLoading &&
                entries.map((e: import('@/types').KardexEntry) => (
                  <tr key={e.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-3 py-2 text-muted-foreground text-xs">
                      {new Date(e.created_at).toLocaleString('es-CO', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })}
                    </td>
                    <td className={`px-3 py-2 font-medium ${TYPE_COLOR[e.type] ?? ''}`}>
                      {TYPE_LABEL[e.type] ?? e.type}
                    </td>
                    <td className={`px-3 py-2 text-right font-mono font-semibold ${TYPE_COLOR[e.type] ?? ''}`}>
                      {e.type === 'out' ? `−${e.quantity}` : `+${e.quantity}`}
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-bold">{e.balance}</td>
                    <td className="px-3 py-2 text-muted-foreground text-xs">
                      {e.reference ?? e.notes ?? '—'}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Import Dialog ─────────────────────────────────────────────────────────────

const REQUIRED_COLS = ['name', 'sku', 'price'];

interface CsvImportDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  slug: string;
}

interface CsvRow {
  name: string; sku: string; price: string; cost: string;
  stock: string; min_stock: string; barcode: string; description: string;
  [key: string]: string;
}

async function parseSpreadsheet(file: File): Promise<{ headers: string[]; rows: CsvRow[] }> {
  const XLSX = await import('xlsx');
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws, { defval: '' });
  if (!raw.length) return { headers: [], rows: [] };
  const headers = Object.keys(raw[0]).map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));
  const rows: CsvRow[] = raw.map((r) => {
    const row: CsvRow = { name: '', sku: '', price: '', cost: '', stock: '', min_stock: '', barcode: '', description: '' };
    headers.forEach((h, i) => { row[h] = String(Object.values(r)[i] ?? ''); });
    return row;
  });
  return { headers, rows };
}

async function downloadExcelTemplate() {
  const XLSX = await import('xlsx');
  const headers = ['name', 'sku', 'price', 'cost', 'stock', 'min_stock', 'barcode', 'description', 'invima_code', 'invima_expiry', 'controlled_substance', 'requires_prescription'];
  const examples = [
    { name: 'Acetaminofén 500mg x 10', sku: 'ACE500', price: 6500, cost: 3500, stock: 100, min_stock: 20, barcode: '7702158000001', description: 'Analgésico', invima_code: 'INVIMA2023M-001', invima_expiry: '2026-12-31', controlled_substance: 0, requires_prescription: 0 },
    { name: 'Producto Ejemplo 2',      sku: 'SKU-002', price: 25000, cost: 12000, stock: 30,  min_stock: 3,  barcode: '', description: '', invima_code: '', invima_expiry: '', controlled_substance: 0, requires_prescription: 0 },
    { name: 'Producto Ejemplo 3',      sku: 'SKU-003', price: 9900,  cost: 5000,  stock: 100, min_stock: 10, barcode: '7509876543210', description: '', invima_code: '', invima_expiry: '', controlled_substance: 0, requires_prescription: 0 },
  ];
  const ws = XLSX.utils.json_to_sheet(examples, { header: headers });

  // Ancho de columnas
  ws['!cols'] = [{ wch: 28 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 18 }, { wch: 24 }, { wch: 20 }, { wch: 14 }, { wch: 20 }, { wch: 20 }];

  // Estilo encabezado (color azul oscuro)
  const headerRange = XLSX.utils.decode_range(ws['!ref'] ?? 'A1');
  for (let c = headerRange.s.c; c <= headerRange.e.c; c++) {
    const cell = XLSX.utils.encode_cell({ r: 0, c });
    if (ws[cell]) {
      ws[cell].s = {
        font: { bold: true, color: { rgb: 'FFFFFF' } },
        fill: { fgColor: { rgb: '1E3A5F' } },
        alignment: { horizontal: 'center' },
      };
    }
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Productos');
  XLSX.writeFile(wb, 'plantilla_productos.xlsx');
}

function CsvImportDialog({ open, onOpenChange, slug }: CsvImportDialogProps) {
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<{ headers: string[]; rows: CsvRow[] } | null>(null);
  const [parseError, setParseError] = useState('');
  const [result, setResult] = useState<{ imported: number; errors: { row: number; message: string }[] } | null>(null);

  useEffect(() => {
    if (!open) {
      setFile(null);
      setPreview(null);
      setParseError('');
      setResult(null);
    }
  }, [open]);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setParseError('');
    setResult(null);
    try {
      const parsed = await parseSpreadsheet(f);
      const missing = REQUIRED_COLS.filter((c) => !parsed.headers.includes(c));
      if (missing.length) {
        setParseError(`Columnas requeridas faltantes: ${missing.join(', ')}`);
        setPreview(null);
      } else {
        setPreview(parsed);
      }
    } catch {
      setParseError('No se pudo leer el archivo. Asegúrate de que sea un archivo Excel (.xlsx) o CSV válido.');
      setPreview(null);
    }
  };

  const importMutation = useMutation({
    mutationFn: () => productsApi.importRows(preview!.rows).then((r) => r.data),
    onSuccess: (data) => {
      setResult(data);
      queryClient.invalidateQueries({ queryKey: ['products', slug] });
      if (data.imported > 0) notify.success(`${data.imported} producto${data.imported !== 1 ? 's' : ''} importados`);
    },
    onError: (err) => notify.error(err, 'Error al importar el archivo'),
  });

  const previewRows = preview?.rows.slice(0, 5) ?? [];
  const ALL_COLS = ['name', 'sku', 'price', 'cost', 'stock', 'min_stock', 'barcode', 'description'];
  const showCols = ALL_COLS.filter((c: string) => preview?.headers.includes(c));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="size-4" />
            Importar productos desde CSV
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4">
          {/* Template hint */}
          <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium text-foreground mb-1">Columnas requeridas</p>
                <p>
                  <span className="font-semibold">Requeridas:</span> name, sku, price
                  {'  ·  '}
                  <span className="font-semibold">Opcionales:</span> cost, stock, min_stock, barcode, description, invima_code, invima_expiry, controlled_substance, requires_prescription
                </p>
                <p className="mt-1">Formatos aceptados: Excel (.xlsx) o CSV. Los valores numéricos sin símbolo de moneda.</p>
              </div>
              <button
                type="button"
                onClick={downloadExcelTemplate}
                className="shrink-0 flex items-center gap-1.5 rounded-md border border-green-600/40 bg-green-50 dark:bg-green-950/30 px-2.5 py-1.5 text-xs font-medium text-green-700 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-950/50 transition-colors"
              >
                <Download className="size-3.5" />
                Descargar plantilla Excel
              </button>
            </div>
          </div>

          {/* File input */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="csv-file">Archivo Excel o CSV</Label>
            <Input
              id="csv-file"
              type="file"
              accept=".xlsx,.xls,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={handleFile}
              className="cursor-pointer"
            />
          </div>

          {parseError && (
            <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertCircle className="size-4 shrink-0" />
              {parseError}
            </div>
          )}

          {/* Preview */}
          {preview && !parseError && (
            <div className="space-y-2">
              <p className="text-sm font-medium">
                Vista previa{' '}
                <span className="text-muted-foreground font-normal">
                  ({preview.rows.length} fila{preview.rows.length !== 1 ? 's' : ''} totales
                  {preview.rows.length > 5 ? ', mostrando 5' : ''})
                </span>
              </p>
              <div className="overflow-x-auto rounded-lg border border-border text-xs">
                <table className="w-full">
                  <thead className="bg-muted/40">
                    <tr>
                      {showCols.map((c: string) => (
                        <th key={c} className="px-3 py-2 text-left font-medium text-muted-foreground capitalize">
                          {c}
                          {REQUIRED_COLS.includes(c) && <span className="text-destructive ml-0.5">*</span>}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row, i) => (
                      <tr key={i} className="border-t border-border">
                        {showCols.map((c: string) => (
                          <td key={c} className="px-3 py-2 max-w-[160px] truncate text-muted-foreground">
                            {row[c] || '—'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Result */}
          {result && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 dark:border-emerald-900 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="size-4 shrink-0" />
                {result.imported} producto{result.imported !== 1 ? 's' : ''} importados exitosamente
              </div>
              {result.errors.length > 0 && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 space-y-1">
                  <p className="text-xs font-medium text-destructive">{result.errors.length} error{result.errors.length !== 1 ? 'es' : ''}:</p>
                  {result.errors.map((e) => (
                    <p key={e.row} className="text-xs text-muted-foreground">
                      Fila {e.row}: {e.message}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {result ? 'Cerrar' : 'Cancelar'}
          </Button>
          {!result && (
            <Button
              onClick={() => importMutation.mutate()}
              disabled={!file || !preview || !!parseError || importMutation.isPending}
            >
              {importMutation.isPending ? (
                'Importando...'
              ) : (
                <>
                  <Upload className="mr-2 size-4" />
                  Importar {preview ? `${preview.rows.length} producto${preview.rows.length !== 1 ? 's' : ''}` : ''}
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── BulkUpdateDialog ─────────────────────────────────────────────────────────

interface BulkUpdateRow {
  id: string; sku: string; name: string;
  sale_price: string; cost_price: string; min_stock: string;
  [key: string]: string;
}

const UPDATE_COLS = ['id', 'sku', 'name', 'sale_price', 'cost_price', 'min_stock'];

async function downloadBulkTemplate(products: Product[]) {
  const XLSX = await import('xlsx');
  const rows = products.map((p) => ({
    id: p.id,
    sku: p.sku,
    name: p.name,
    sale_price: Number(p.price),
    cost_price: Number(p.cost),
    min_stock: Number(p.min_stock ?? 0),
  }));
  const ws = XLSX.utils.json_to_sheet(rows, { header: UPDATE_COLS });
  ws['!cols'] = [{ wch: 8 }, { wch: 14 }, { wch: 32 }, { wch: 14 }, { wch: 14 }, { wch: 12 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Actualización');
  XLSX.writeFile(wb, `actualizacion_precios_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

function BulkUpdateDialog({ open, onOpenChange, slug }: CsvImportDialogProps) {
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<{ rows: BulkUpdateRow[] } | null>(null);
  const [parseError, setParseError] = useState('');
  const [result, setResult] = useState<{ updated: number } | null>(null);

  const { data: allProducts = [] } = useQuery<Product[]>({
    queryKey: ['products-all', slug],
    queryFn: () => productsApi.list({ per_page: 9999 }).then((r) => (r.data as any)?.data ?? r.data),
    enabled: open,
  });

  useEffect(() => {
    if (!open) { setFile(null); setPreview(null); setParseError(''); setResult(null); }
  }, [open]);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f); setParseError(''); setResult(null);
    try {
      const XLSX = await import('xlsx');
      const buf = await f.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws, { defval: '' });
      if (!raw.length) { setParseError('El archivo está vacío.'); return; }
      const headers = Object.keys(raw[0]).map((h) => h.trim().toLowerCase());
      if (!headers.includes('id')) { setParseError('El archivo debe tener columna "id".'); return; }
      const rows: BulkUpdateRow[] = raw.map((r) => {
        const row: BulkUpdateRow = { id: '', sku: '', name: '', sale_price: '', cost_price: '', min_stock: '' };
        headers.forEach((h, i) => { row[h] = String(Object.values(r)[i] ?? ''); });
        return row;
      });
      setPreview({ rows });
    } catch { setParseError('No se pudo leer el archivo.'); }
  };

  const updateMutation = useMutation({
    mutationFn: () => {
      const updates = preview!.rows
        .filter((r) => r.id && !isNaN(Number(r.id)))
        .map((r) => ({
          id: Number(r.id),
          ...(r.sale_price !== '' ? { sale_price: parseFloat(r.sale_price) } : {}),
          ...(r.cost_price !== '' ? { cost_price: parseFloat(r.cost_price) } : {}),
          ...(r.min_stock !== '' ? { min_stock: parseFloat(r.min_stock) } : {}),
        }));
      return productsApi.bulkUpdate(updates).then((r) => r.data);
    },
    onSuccess: (data) => {
      setResult(data);
      queryClient.invalidateQueries({ queryKey: ['products', slug] });
      notify.success(`${data.updated} producto${data.updated !== 1 ? 's' : ''} actualizados`);
    },
    onError: (err) => notify.error(err, 'Error al actualizar'),
  });

  const previewRows = preview?.rows.slice(0, 5) ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowUpDown className="size-4" />
            Actualización masiva de precios
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4">
          <div className="rounded-lg border bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium text-foreground mb-1">Instrucciones</p>
                <p>1. Descarga la plantilla con todos los productos actuales.</p>
                <p>2. Edita <span className="font-semibold">sale_price</span>, <span className="font-semibold">cost_price</span> o <span className="font-semibold">min_stock</span>. No cambies la columna <span className="font-semibold">id</span>.</p>
                <p>3. Sube el archivo modificado.</p>
              </div>
              <button
                type="button"
                onClick={() => downloadBulkTemplate(allProducts)}
                disabled={!allProducts.length}
                className="shrink-0 flex items-center gap-1.5 rounded-md border border-green-600/40 bg-green-50 dark:bg-green-950/30 px-2.5 py-1.5 text-xs font-medium text-green-700 dark:text-green-400 hover:bg-green-100 transition-colors disabled:opacity-50"
              >
                <Download className="size-3.5" />
                Descargar plantilla ({allProducts.length} productos)
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bulk-update-file">Archivo Excel o CSV modificado</Label>
            <Input
              id="bulk-update-file"
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFile}
              className="cursor-pointer"
            />
          </div>

          {parseError && (
            <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertCircle className="size-4 shrink-0" />
              {parseError}
            </div>
          )}

          {preview && !parseError && (
            <div className="space-y-2">
              <p className="text-sm font-medium">
                Vista previa{' '}
                <span className="text-muted-foreground font-normal">
                  ({preview.rows.length} fila{preview.rows.length !== 1 ? 's' : ''}
                  {preview.rows.length > 5 ? ', mostrando 5' : ''})
                </span>
              </p>
              <div className="overflow-x-auto rounded-lg border text-xs">
                <table className="w-full">
                  <thead className="bg-muted/40">
                    <tr>
                      {['id', 'sku', 'name', 'sale_price', 'cost_price', 'min_stock'].map((c) => (
                        <th key={c} className="px-3 py-2 text-left font-medium text-muted-foreground">{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row, i) => (
                      <tr key={i} className="border-t">
                        {['id', 'sku', 'name', 'sale_price', 'cost_price', 'min_stock'].map((c) => (
                          <td key={c} className="px-3 py-2 max-w-[140px] truncate text-muted-foreground">{row[c] || '—'}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {result && (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="size-4 shrink-0" />
              {result.updated} producto{result.updated !== 1 ? 's' : ''} actualizados exitosamente
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {result ? 'Cerrar' : 'Cancelar'}
          </Button>
          {!result && (
            <Button
              onClick={() => updateMutation.mutate()}
              disabled={!file || !preview || !!parseError || updateMutation.isPending}
            >
              {updateMutation.isPending ? 'Actualizando...' : (
                <><ArrowUpDown className="mr-2 size-4" />Actualizar {preview ? `${preview.rows.length} filas` : ''}</>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function InventoryPage() {
  const params = useParams();
  const slug = params.slug as string;

  // Filter state
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [page, setPage] = useState(1);

  // Categories sheet state
  const [categoriesOpen, setCategoriesOpen] = useState(false);

  // CSV import state
  const [csvImportOpen, setCsvImportOpen] = useState(false);
  const [bulkUpdateOpen, setBulkUpdateOpen] = useState(false);

  // Dialog state
  const [productDialogOpen, setProductDialogOpen] = useState(false);
  const [adjustDialogOpen, setAdjustDialogOpen] = useState(false);
  const [kardexOpen, setKardexOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [adjustProduct, setAdjustProduct] = useState<Product | null>(null);
  const [kardexProduct, setKardexProduct] = useState<Product | null>(null);

  // Active tab
  const [activeTab, setActiveTab] = useState('productos');

  // Debounce search 400ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [search]);

  // Reset page on category filter change
  useEffect(() => {
    setPage(1);
  }, [categoryId]);

  const queryClient = useQueryClient();

  const { data: productsData, isLoading: productsLoading } = useQuery({
    queryKey: ['products', slug, debouncedSearch, categoryId, page],
    queryFn: () =>
      productsApi
        .list({
          search: debouncedSearch || undefined,
          category_id: categoryId ? Number(categoryId) : undefined,
          page,
          per_page: 15,
        })
        .then((r) => r.data),
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['categories', slug],
    queryFn: () => categoriesApi.list().then((r) => r.data),
  });

  const { data: addonsData } = useQuery({
    queryKey: ['billing-addons', slug],
    queryFn: () => billingApi.addons().then((r) => r.data),
    staleTime: 5 * 60_000,
  });
  const addonsArray: Array<{ module_key?: string; is_owned?: boolean }> =
    (addonsData as { available?: unknown[] })?.available as Array<{ module_key?: string; is_owned?: boolean }>
      ?? (Array.isArray(addonsData) ? (addonsData as Array<{ module_key?: string; is_owned?: boolean }>) : []);
  const hasFractionsAddon = addonsArray.some((a) => a.module_key === 'fractions' && a.is_owned === true);

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: number) => productsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products', slug] });
      notify.success('Producto eliminado');
    },
    onError: (err) => notify.error(err, 'Error al eliminar el producto'),
  });

  const handleDelete = (product: Product) => {
    if (
      window.confirm(
        `¿Eliminar el producto "${product.name}"? Esta acción no se puede deshacer.`
      )
    ) {
      deleteMutation.mutate(product.id);
    }
  };

  const handleEdit = (product: Product) => {
    setSelectedProduct(product);
    setProductDialogOpen(true);
  };

  const handleAdjust = (product: Product) => {
    setAdjustProduct(product);
    setAdjustDialogOpen(true);
  };

  const handleKardex = (product: Product) => {
    setKardexProduct(product);
    setKardexOpen(true);
  };

  const handleNewProduct = () => {
    setSelectedProduct(null);
    setProductDialogOpen(true);
  };

  const products = productsData?.data ?? [];
  const currentPage = productsData?.current_page ?? 1;
  const lastPage = productsData?.last_page ?? 1;
  const total = productsData?.total ?? 0;

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Inventario</h1>
          <p className="text-sm text-muted-foreground">
            Gestión de productos, lotes y movimientos
          </p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center justify-between gap-4">
          <TabsList>
            <TabsTrigger value="productos">Productos</TabsTrigger>
            <TabsTrigger value="lotes">Lotes / Vencimientos</TabsTrigger>
            <TabsTrigger value="kardex">Kardex</TabsTrigger>
            <TabsTrigger value="alertas">Alertas de stock</TabsTrigger>
            <TabsTrigger value="variantes">Variantes</TabsTrigger>
            <TabsTrigger value="promociones">Promociones</TabsTrigger>
            <TabsTrigger value="inventario-fisico">Inventario Físico</TabsTrigger>
            <TabsTrigger value="valoracion">Valoración</TabsTrigger>
          </TabsList>

          {/* Actions shown only on the productos tab */}
          {activeTab === 'productos' && (
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="gap-2" onClick={() => setCategoriesOpen(true)}>
                <Tag className="size-4" />
                Categorías
              </Button>
              <Button variant="outline" size="sm" className="gap-2" onClick={() => setCsvImportOpen(true)}>
                <Upload className="size-4" />
                Importar CSV
              </Button>
              <Button variant="outline" size="sm" className="gap-2" onClick={() => setBulkUpdateOpen(true)}>
                <ArrowUpDown className="size-4" />
                Actualizar precios
              </Button>
              <Button onClick={handleNewProduct}>
                <Plus className="mr-2 size-4" />
                Nuevo producto
              </Button>
            </div>
          )}
        </div>

        {/* ── Productos ─────────────────────────────────────────────────────── */}
        <TabsContent value="productos" className="mt-4 space-y-4">
          {/* Filters */}
          <Card>
            <CardContent className="pt-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por nombre, SKU o código..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-8"
                  />
                </div>
                <Select
                  value={categoryId || 'all'}
                  onValueChange={(val) => setCategoryId(!val || val === 'all' ? '' : val)}
                >
                  <SelectTrigger className="w-full sm:w-52">
                    <SelectValue placeholder="Todas las categorías" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas las categorías</SelectItem>
                    {categories.map((cat) => (
                      <SelectItem key={cat.id} value={String(cat.id)}>
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="shrink-0 text-sm text-muted-foreground">
                  {productsLoading
                    ? 'Cargando...'
                    : `${total} producto${total !== 1 ? 's' : ''} encontrado${total !== 1 ? 's' : ''}`}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Product list */}
          {productsLoading ? (
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {Array.from({ length: 9 }).map((_, i) => (
                <Skeleton key={i} className="h-28 rounded-2xl" />
              ))}
            </div>
          ) : products.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
              <div className="size-14 rounded-full bg-muted flex items-center justify-center">
                <PackageSearch className="size-7" />
              </div>
              <p className="font-medium">No se encontraron productos</p>
              <p className="text-xs">Intenta cambiar los filtros o agrega un nuevo producto</p>
              <Button size="sm" onClick={handleNewProduct}>
                <Plus className="mr-2 size-4" />Nuevo producto
              </Button>
            </div>
          ) : (
            <>
              <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {products.map((product) => {
                  const outOfStock = product.stock <= 0;
                  const lowStock = !outOfStock && product.stock <= product.min_stock;
                  const stockPct = product.min_stock > 0
                    ? Math.min(100, Math.round((product.stock / (product.min_stock * 3)) * 100))
                    : product.stock > 0 ? 100 : 0;

                  return (
                    <div
                      key={product.id}
                      className="rounded-2xl border bg-card hover:shadow-sm hover:border-primary/20 transition-all overflow-hidden flex flex-col"
                    >
                      {/* Top bar */}
                      <div className={`h-1 w-full ${outOfStock ? 'bg-destructive' : lowStock ? 'bg-amber-400' : 'bg-emerald-500'}`} />

                      <div className="p-4 flex flex-col gap-2 flex-1">
                        {/* Header row */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm leading-tight truncate">{product.name}</p>
                            <p className="text-xs text-muted-foreground font-mono">{product.sku}</p>
                          </div>
                          <Badge variant={product.is_active ? 'default' : 'outline'} className="text-xs flex-shrink-0">
                            {product.is_active ? 'Activo' : 'Inactivo'}
                          </Badge>
                        </div>

                        {/* Category */}
                        {product.category?.name && (
                          <span className="text-xs text-muted-foreground">{product.category.name}</span>
                        )}

                        {/* Prices */}
                        <div className="flex items-center gap-3 text-sm">
                          <span className="font-bold text-primary">{formatCurrency(product.price)}</span>
                          <span className="text-xs text-muted-foreground">Costo: {formatCurrency(product.cost)}</span>
                        </div>

                        {/* Stock bar */}
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">Stock</span>
                            <span className={`font-medium ${outOfStock ? 'text-destructive' : lowStock ? 'text-amber-600' : 'text-emerald-600'}`}>
                              {product.stock} u {outOfStock ? '· Sin stock' : lowStock ? '· Bajo stock' : ''}
                            </span>
                          </div>
                          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${outOfStock ? 'bg-destructive' : lowStock ? 'bg-amber-400' : 'bg-emerald-500'}`}
                              style={{ width: `${stockPct}%` }}
                            />
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1 pt-1 border-t">
                          <Button variant="ghost" size="sm" className="flex-1 h-7 text-xs gap-1" onClick={() => handleEdit(product)}>
                            <Pencil className="size-3" />Editar
                          </Button>
                          <Button variant="ghost" size="sm" className="flex-1 h-7 text-xs gap-1" onClick={() => handleAdjust(product)}>
                            <ArrowUpDown className="size-3" />Stock
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleKardex(product)} title="Ver movimientos">
                            <History className="size-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => handleDelete(product)} title="Eliminar">
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Pagination */}
              {lastPage > 1 && (
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <p>Página {currentPage} de {lastPage} · {total} producto{total !== 1 ? 's' : ''}</p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={currentPage <= 1}>Anterior</Button>
                    <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(lastPage, p + 1))} disabled={currentPage >= lastPage}>Siguiente</Button>
                  </div>
                </div>
              )}
            </>
          )}
        </TabsContent>

        {/* ── Lotes / Vencimientos ──────────────────────────────────────────── */}
        <TabsContent value="lotes" className="mt-4">
          <BatchesTab slug={slug} />
        </TabsContent>

        {/* ── Kardex ────────────────────────────────────────────────────────── */}
        <TabsContent value="kardex" className="mt-4">
          <KardexTab slug={slug} />
        </TabsContent>

        {/* ── Alertas de stock ──────────────────────────────────────────────── */}
        <TabsContent value="alertas" className="mt-4">
          <StockAlertsTab slug={slug} />
        </TabsContent>

        {/* ── Variantes ─────────────────────────────────────────────────────── */}
        <TabsContent value="variantes" className="mt-4">
          <VariantsManager slug={slug} />
        </TabsContent>

        {/* ── Promociones ───────────────────────────────────────────────────── */}
        <TabsContent value="promociones" className="mt-4">
          <PromotionsTab slug={slug} />
        </TabsContent>

        {/* ── Inventario Físico ─────────────────────────────────────────────── */}
        <TabsContent value="inventario-fisico" className="mt-4">
          <PhysicalInventoryTab slug={slug} />
        </TabsContent>

        <TabsContent value="valoracion" className="mt-4">
          <ValuationTab />
        </TabsContent>
      </Tabs>

      {/* Product Create / Edit Dialog */}
      <ProductDialog
        open={productDialogOpen}
        onOpenChange={(open) => {
          setProductDialogOpen(open);
          if (!open) setSelectedProduct(null);
        }}
        product={selectedProduct}
        categories={categories}
        slug={slug}
        hasFractionsAddon={hasFractionsAddon}
      />

      {/* Adjust Stock Dialog */}
      <AdjustStockDialog
        open={adjustDialogOpen}
        onOpenChange={(open) => {
          setAdjustDialogOpen(open);
          if (!open) setAdjustProduct(null);
        }}
        product={adjustProduct}
        slug={slug}
      />

      {/* Categories Sheet */}
      <CategoriesSheet
        open={categoriesOpen}
        onOpenChange={setCategoriesOpen}
        slug={slug}
      />

      {/* Kardex Dialog (per-product, from Products tab action) */}
      <KardexDialog
        open={kardexOpen}
        onOpenChange={(v) => { setKardexOpen(v); if (!v) setKardexProduct(null); }}
        product={kardexProduct}
      />

      {/* CSV Import Dialog */}
      <CsvImportDialog
        open={csvImportOpen}
        onOpenChange={setCsvImportOpen}
        slug={slug}
      />

      {/* Bulk Update Dialog */}
      <BulkUpdateDialog
        open={bulkUpdateOpen}
        onOpenChange={setBulkUpdateOpen}
        slug={slug}
      />
    </div>
  );
}
