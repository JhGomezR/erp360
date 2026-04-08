'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import { standardSchemaResolver as zodResolver } from '@hookform/resolvers/standard-schema';
import { z } from 'zod';
import { notify } from '@/lib/notify';
import { Pencil, Trash2, Search, ChevronLeft, ChevronRight, UserPlus, ShoppingBag } from 'lucide-react';

import { customersApi, posApi } from '@/lib/api/tenant.api';
import type { Sale } from '@/types';
import { SaleReceiptDialog } from '@/components/shared/SaleReceiptDialog';
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
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Customer {
  id: number;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  document_type?: string;
  document_number?: string;
  notes?: string;
  total_purchases?: number;
  created_at: string;
}

interface PaginatedResponse<T> {
  data: T[];
  meta: {
    current_page: number;
    last_page: number;
    total: number;
    per_page: number;
  };
}

// ─── Schema ───────────────────────────────────────────────────────────────────

const customerSchema = z.object({
  name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres'),
  email: z.email('Email inválido').or(z.literal('')).optional(),
  phone: z.string().optional(),
  document_type: z.string().optional(),
  document_number: z.string().optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
});

type CustomerFormValues = z.infer<typeof customerSchema>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

const DOCUMENT_TYPES = ['CC', 'NIT', 'CE', 'Pasaporte'] as const;

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CustomersPage() {
  const params = useParams();
  const slug = params.slug as string;
  const queryClient = useQueryClient();

  // State
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [historyCustomer, setHistoryCustomer] = useState<Customer | null>(null);
  const [receiptSale, setReceiptSale] = useState<Sale | null>(null);

  const debouncedSearch = useDebounce(search, 400);

  // Form
  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors, isSubmitting },
  } = useForm<CustomerFormValues>({
    resolver: zodResolver(customerSchema),
    defaultValues: {
      name: '',
      email: '',
      phone: '',
      document_type: '',
      document_number: '',
      address: '',
      notes: '',
    },
  });

  // Populate form when editing
  useEffect(() => {
    if (editingCustomer) {
      reset({
        name: editingCustomer.name,
        email: editingCustomer.email ?? '',
        phone: editingCustomer.phone ?? '',
        document_type: editingCustomer.document_type ?? '',
        document_number: editingCustomer.document_number ?? '',
        address: editingCustomer.address ?? '',
        notes: editingCustomer.notes ?? '',
      });
    } else {
      reset({
        name: '',
        email: '',
        phone: '',
        document_type: '',
        document_number: '',
        address: '',
        notes: '',
      });
    }
  }, [editingCustomer, reset]);

  // Query
  const { data, isLoading } = useQuery({
    queryKey: ['customers', slug, debouncedSearch, page],
    queryFn: async () => {
      const res = await customersApi.list({
        search: debouncedSearch || undefined,
        page,
      });
      return res.data as PaginatedResponse<Customer>;
    },
  });

  const customers = data?.data ?? [];
  const meta = data?.meta;
  const totalPages = meta?.last_page ?? 1;
  const total = meta?.total ?? 0;

  // Mutations
  const saveMutation = useMutation({
    mutationFn: async (values: CustomerFormValues) => {
      const payload = {
        ...values,
        email: values.email || undefined,
        document_type: values.document_type || undefined,
        document_number: values.document_number || undefined,
      };
      if (editingCustomer) {
        return customersApi.update(editingCustomer.id, payload);
      }
      return customersApi.create(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers', slug] });
      notify.success(editingCustomer ? 'Cliente actualizado' : 'Cliente creado');
      handleCloseDialog();
    },
    onError: () => {
      notify.error('Error al guardar el cliente');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => customersApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers', slug] });
      notify.success('Cliente eliminado');
    },
    onError: () => {
      notify.error('Error al eliminar el cliente');
    },
  });

  // Handlers
  const handleCloseDialog = useCallback(() => {
    setDialogOpen(false);
    setEditingCustomer(null);
  }, []);

  const handleOpenCreate = () => {
    setEditingCustomer(null);
    setDialogOpen(true);
  };

  const handleOpenEdit = (customer: Customer) => {
    setEditingCustomer(customer);
    setDialogOpen(true);
  };

  const handleDelete = (customer: Customer) => {
    if (window.confirm('¿Eliminar cliente?')) {
      deleteMutation.mutate(customer.id);
    }
  };

  const onSubmit = (values: CustomerFormValues) => {
    saveMutation.mutate(values);
  };

  const handleDialogOpenChange = (open: boolean) => {
    if (!open) {
      handleCloseDialog();
    } else {
      setDialogOpen(true);
    }
  };

  // Reset page when search changes
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Clientes</h1>
          {!isLoading && (
            <Badge variant="secondary">{total.toLocaleString('es-CO')}</Badge>
          )}
        </div>
        <Button onClick={handleOpenCreate}>
          <UserPlus className="size-4 mr-2" />
          Nuevo cliente
        </Button>
      </div>

      {/* Search */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Buscar clientes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        {debouncedSearch && !isLoading && (
          <span className="text-sm text-muted-foreground">
            {total} resultado{total !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Table */}
      <div className="rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Documento</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Teléfono</TableHead>
              <TableHead>Compras totales</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-36" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                </TableRow>
              ))
            ) : customers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                  {debouncedSearch
                    ? 'No se encontraron clientes con ese criterio.'
                    : 'No hay clientes registrados.'}
                </TableCell>
              </TableRow>
            ) : (
              customers.map((customer) => (
                <TableRow key={customer.id}>
                  <TableCell className="font-medium">{customer.name}</TableCell>
                  <TableCell>
                    {customer.document_type && customer.document_number
                      ? `${customer.document_type} ${customer.document_number}`
                      : customer.document_number
                        ? customer.document_number
                        : '—'}
                  </TableCell>
                  <TableCell>{customer.email ?? '—'}</TableCell>
                  <TableCell>{customer.phone ?? '—'}</TableCell>
                  <TableCell>
                    {typeof customer.total_purchases === 'number'
                      ? `$${customer.total_purchases.toLocaleString('es-CO')}`
                      : '—'}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setHistoryCustomer(customer)}
                        title="Ver compras"
                      >
                        <ShoppingBag className="size-4" />
                        <span className="sr-only">Ver compras</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => handleOpenEdit(customer)}
                      >
                        <Pencil className="size-4" />
                        <span className="sr-only">Editar</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => handleDelete(customer)}
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="size-4 text-destructive" />
                        <span className="sr-only">Eliminar</span>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {!isLoading && totalPages > 1 && (
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
          >
            <ChevronLeft className="size-4 mr-1" />
            Anterior
          </Button>
          <span className="text-sm text-muted-foreground">
            Página {page} de {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
          >
            Siguiente
            <ChevronRight className="size-4 ml-1" />
          </Button>
        </div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingCustomer ? 'Editar cliente' : 'Nuevo cliente'}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {/* Nombre */}
            <div className="space-y-1.5">
              <Label htmlFor="name">
                Nombre completo <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                placeholder="Ej. Juan García"
                {...register('name')}
                aria-invalid={!!errors.name}
              />
              {errors.name && (
                <p className="text-xs text-destructive">{errors.name.message}</p>
              )}
            </div>

            {/* Email */}
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="correo@ejemplo.com"
                {...register('email')}
                aria-invalid={!!errors.email}
              />
              {errors.email && (
                <p className="text-xs text-destructive">{errors.email.message}</p>
              )}
            </div>

            {/* Teléfono */}
            <div className="space-y-1.5">
              <Label htmlFor="phone">Teléfono</Label>
              <Input
                id="phone"
                placeholder="Ej. 3001234567"
                {...register('phone')}
              />
            </div>

            {/* Documento */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="document_type">Tipo documento</Label>
                <Controller
                  name="document_type"
                  control={control}
                  render={({ field }) => (
                    <Select
                      value={field.value ?? ''}
                      onValueChange={field.onChange}
                    >
                      <SelectTrigger id="document_type" className="w-full">
                        <SelectValue placeholder="Seleccionar" />
                      </SelectTrigger>
                      <SelectContent>
                        {DOCUMENT_TYPES.map((type) => (
                          <SelectItem key={type} value={type}>
                            {type}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="document_number">Número documento</Label>
                <Input
                  id="document_number"
                  placeholder="Ej. 1234567890"
                  {...register('document_number')}
                />
              </div>
            </div>

            {/* Dirección */}
            <div className="space-y-1.5">
              <Label htmlFor="address">Dirección</Label>
              <Input
                id="address"
                placeholder="Ej. Calle 123 # 45-67"
                {...register('address')}
              />
            </div>

            {/* Notas */}
            <div className="space-y-1.5">
              <Label htmlFor="notes">Notas</Label>
              <textarea
                id="notes"
                placeholder="Observaciones sobre el cliente..."
                rows={3}
                {...register('notes')}
                className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none resize-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={handleCloseDialog}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting || saveMutation.isPending}>
                {saveMutation.isPending ? 'Guardando...' : 'Guardar'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Customer Sales History Sheet */}
      <Sheet open={!!historyCustomer} onOpenChange={(v) => !v && setHistoryCustomer(null)}>
        <SheetContent className="w-full sm:max-w-xl flex flex-col gap-0 p-0">
          <SheetHeader className="px-6 py-4 border-b">
            <SheetTitle className="flex items-center gap-2">
              <ShoppingBag className="size-4" />
              Compras — {historyCustomer?.name}
            </SheetTitle>
          </SheetHeader>

          <CustomerSalesContent
            customerId={historyCustomer?.id ?? null}
            slug={slug}
            onViewReceipt={setReceiptSale}
          />
        </SheetContent>
      </Sheet>

      {/* Receipt Dialog */}
      <SaleReceiptDialog
        sale={receiptSale}
        open={!!receiptSale}
        onOpenChange={(v) => !v && setReceiptSale(null)}
      />
    </div>
  );
}

// ─── Customer Sales Content ────────────────────────────────────────────────────

interface CustomerSalesContentProps {
  customerId: number | null;
  slug: string;
  onViewReceipt: (sale: Sale) => void;
}

function CustomerSalesContent({ customerId, slug, onViewReceipt }: CustomerSalesContentProps) {
  const { data, isLoading } = useQuery({
    queryKey: ['customer-sales', slug, customerId],
    queryFn: () => posApi.sales({ customer_id: customerId!, per_page: 50 }),
    enabled: !!customerId,
  });

  const sales: Sale[] = (data as any)?.data?.data ?? [];

  const fmt = (n: number) => `$${n.toLocaleString('es-CO')}`;

  return (
    <div className="flex-1 overflow-y-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-background border-b">
          <tr>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Código</th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Fecha</th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Estado</th>
            <th className="px-4 py-3 text-right font-medium text-muted-foreground">Total</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {isLoading && Array.from({ length: 5 }).map((_, i) => (
            <tr key={i} className="border-b">
              <td className="px-4 py-3"><Skeleton className="h-4 w-20" /></td>
              <td className="px-4 py-3"><Skeleton className="h-4 w-24" /></td>
              <td className="px-4 py-3"><Skeleton className="h-5 w-20" /></td>
              <td className="px-4 py-3 text-right"><Skeleton className="h-4 w-16 ml-auto" /></td>
              <td className="px-4 py-3" />
            </tr>
          ))}
          {!isLoading && sales.length === 0 && (
            <tr>
              <td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">
                Sin compras registradas para este cliente
              </td>
            </tr>
          )}
          {!isLoading && sales.map((sale) => (
            <tr key={sale.id} className="border-b last:border-0 hover:bg-muted/30">
              <td className="px-4 py-3 font-mono text-xs font-semibold">{sale.code}</td>
              <td className="px-4 py-3 text-xs text-muted-foreground">
                {new Date(sale.created_at).toLocaleDateString('es-CO')}
              </td>
              <td className="px-4 py-3">
                <Badge variant={sale.status === 'completed' ? 'default' : sale.status === 'cancelled' ? 'destructive' : 'secondary'}>
                  {sale.status === 'completed' ? 'Completada' : sale.status === 'cancelled' ? 'Cancelada' : 'Pendiente'}
                </Badge>
              </td>
              <td className="px-4 py-3 text-right font-semibold tabular-nums">
                {fmt(sale.total)}
              </td>
              <td className="px-4 py-3 text-center">
                <button
                  type="button"
                  onClick={() => onViewReceipt(sale)}
                  className="p-1.5 rounded hover:bg-muted transition-colors"
                  title="Ver ticket"
                >
                  <ShoppingBag className="size-4 text-muted-foreground" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
