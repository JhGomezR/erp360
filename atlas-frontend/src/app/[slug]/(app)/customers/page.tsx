'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { notify } from '@/lib/notify';
import {
  Pencil, Trash2, Search, ChevronLeft, ChevronRight,
  UserPlus, ShoppingBag, Phone, Mail, FileText, Users,
  Receipt,
} from 'lucide-react';

import { customersApi, posApi } from '@/lib/api/tenant.api';
import type { Sale } from '@/types';
import { SaleReceiptDialog } from '@/components/shared/SaleReceiptDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
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
  meta: { current_page: number; last_page: number; total: number; per_page: number };
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

const fmt = (n: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);

// Genera color de avatar basado en nombre
const AVATAR_COLORS = [
  'bg-blue-500', 'bg-purple-500', 'bg-pink-500', 'bg-rose-500',
  'bg-orange-500', 'bg-amber-500', 'bg-green-500', 'bg-teal-500',
  'bg-cyan-500', 'bg-indigo-500',
];

function avatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function initials(name: string) {
  return name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

// ─── Customer Card ────────────────────────────────────────────────────────────

function CustomerCard({
  customer,
  onEdit,
  onDelete,
  onHistory,
}: {
  customer: Customer;
  onEdit: () => void;
  onDelete: () => void;
  onHistory: () => void;
}) {
  return (
    <div className="group relative rounded-2xl border bg-card p-4 hover:shadow-md hover:border-primary/20 transition-all flex flex-col gap-3">

      {/* Avatar + nombre */}
      <div className="flex items-center gap-3">
        <div className={`size-11 rounded-xl flex items-center justify-center text-white font-bold text-sm shrink-0 ${avatarColor(customer.name)}`}>
          {initials(customer.name)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold truncate">{customer.name}</p>
          {customer.document_type && customer.document_number ? (
            <p className="text-xs text-muted-foreground font-mono">
              {customer.document_type} {customer.document_number}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground/40 italic">Sin documento</p>
          )}
        </div>
      </div>

      {/* Contacto */}
      <div className="space-y-1.5">
        {customer.phone ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Phone className="size-3 shrink-0" />
            <span className="truncate">{customer.phone}</span>
          </div>
        ) : null}
        {customer.email ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Mail className="size-3 shrink-0" />
            <span className="truncate">{customer.email}</span>
          </div>
        ) : null}
        {!customer.phone && !customer.email && (
          <p className="text-xs text-muted-foreground/40 italic">Sin contacto</p>
        )}
      </div>

      {/* Total compras */}
      {typeof customer.total_purchases === 'number' && customer.total_purchases > 0 && (
        <div className="flex items-center gap-1.5 rounded-lg bg-green-500/8 px-2.5 py-1.5">
          <Receipt className="size-3 text-green-600 shrink-0" />
          <span className="text-xs font-semibold text-green-700">{fmt(customer.total_purchases)}</span>
          <span className="text-xs text-muted-foreground ml-auto">en compras</span>
        </div>
      )}

      {/* Acciones */}
      <div className="flex gap-1.5 pt-1 border-t">
        <Button
          variant="ghost"
          size="sm"
          className="flex-1 text-xs gap-1.5"
          onClick={onHistory}
        >
          <ShoppingBag className="size-3.5" />
          Compras
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-xs"
          onClick={onEdit}
        >
          <Pencil className="size-3.5" />
          Editar
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onDelete}
          className="text-destructive hover:text-destructive"
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CustomersPage() {
  const params = useParams();
  const slug = params.slug as string;
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [historyCustomer, setHistoryCustomer] = useState<Customer | null>(null);
  const [receiptSale, setReceiptSale] = useState<Sale | null>(null);

  const debouncedSearch = useDebounce(search, 400);

  const {
    register, handleSubmit, reset, control,
    formState: { errors, isSubmitting },
  } = useForm<CustomerFormValues>({
    resolver: zodResolver(customerSchema),
    defaultValues: { name: '', email: '', phone: '', document_type: '', document_number: '', address: '', notes: '' },
  });

  useEffect(() => {
    reset(editingCustomer
      ? { name: editingCustomer.name, email: editingCustomer.email ?? '', phone: editingCustomer.phone ?? '', document_type: editingCustomer.document_type ?? '', document_number: editingCustomer.document_number ?? '', address: editingCustomer.address ?? '', notes: editingCustomer.notes ?? '' }
      : { name: '', email: '', phone: '', document_type: '', document_number: '', address: '', notes: '' }
    );
  }, [editingCustomer, reset]);

  const { data, isLoading } = useQuery({
    queryKey: ['customers', slug, debouncedSearch, page],
    queryFn: async () => {
      const res = await customersApi.list({ search: debouncedSearch || undefined, page });
      return res.data as PaginatedResponse<Customer>;
    },
  });

  const customers = data?.data ?? [];
  const meta = data?.meta;
  const totalPages = meta?.last_page ?? 1;
  const total = meta?.total ?? 0;

  const saveMutation = useMutation({
    mutationFn: async (values: CustomerFormValues) => {
      const payload = { ...values, email: values.email || undefined, document_type: values.document_type || undefined, document_number: values.document_number || undefined };
      return editingCustomer ? customersApi.update(editingCustomer.id, payload) : customersApi.create(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers', slug] });
      notify.success(editingCustomer ? 'Cliente actualizado' : 'Cliente creado');
      handleCloseDialog();
    },
    onError: () => notify.error('Error al guardar el cliente'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => customersApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers', slug] });
      notify.success('Cliente eliminado');
    },
    onError: () => notify.error('Error al eliminar el cliente'),
  });

  const handleCloseDialog = useCallback(() => { setDialogOpen(false); setEditingCustomer(null); }, []);
  const handleOpenCreate = () => { setEditingCustomer(null); setDialogOpen(true); };
  const handleOpenEdit = (c: Customer) => { setEditingCustomer(c); setDialogOpen(true); };
  const handleDelete = (c: Customer) => { if (window.confirm(`¿Eliminar a ${c.name}?`)) deleteMutation.mutate(c.id); };

  useEffect(() => { setPage(1); }, [debouncedSearch]);

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Clientes</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {isLoading ? 'Cargando...' : `${total.toLocaleString('es-CO')} cliente${total !== 1 ? 's' : ''} registrados`}
          </p>
        </div>
        <Button onClick={handleOpenCreate} className="gap-2">
          <UserPlus className="size-4" />
          Nuevo cliente
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="Buscar por nombre, teléfono, documento..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Grid de clientes */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="rounded-2xl border bg-card p-4 space-y-3">
              <div className="flex items-center gap-3">
                <Skeleton className="size-11 rounded-xl" />
                <div className="space-y-1.5 flex-1">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-3 w-20" />
                </div>
              </div>
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-7 w-full rounded-lg" />
            </div>
          ))}
        </div>
      ) : customers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="size-20 rounded-full bg-muted flex items-center justify-center mb-4">
            <Users className="size-9 text-muted-foreground/40" />
          </div>
          <h3 className="font-semibold text-lg mb-1">
            {debouncedSearch ? 'Sin resultados' : 'Aún no tienes clientes'}
          </h3>
          <p className="text-sm text-muted-foreground max-w-xs">
            {debouncedSearch
              ? `No encontramos clientes con "${debouncedSearch}". Intenta con otro término.`
              : 'Registra tu primer cliente para empezar a llevar el historial de compras.'}
          </p>
          {!debouncedSearch && (
            <Button onClick={handleOpenCreate} className="mt-5 gap-2">
              <UserPlus className="size-4" />
              Registrar primer cliente
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {customers.map((customer) => (
            <CustomerCard
              key={customer.id}
              customer={customer}
              onEdit={() => handleOpenEdit(customer)}
              onDelete={() => handleDelete(customer)}
              onHistory={() => setHistoryCustomer(customer)}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {!isLoading && totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
            <ChevronLeft className="size-4 mr-1" /> Anterior
          </Button>
          <span className="text-sm text-muted-foreground">
            Página <strong>{page}</strong> de <strong>{totalPages}</strong>
          </span>
          <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
            Siguiente <ChevronRight className="size-4 ml-1" />
          </Button>
        </div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(v) => !v && handleCloseDialog()}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {editingCustomer ? (
                <><Pencil className="size-4" /> Editar cliente</>
              ) : (
                <><UserPlus className="size-4" /> Nuevo cliente</>
              )}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit((v) => saveMutation.mutate(v))} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">Nombre completo <span className="text-destructive">*</span></Label>
              <Input id="name" placeholder="Ej. Juan García" {...register('name')} aria-invalid={!!errors.name} />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="phone">Teléfono</Label>
                <Input id="phone" placeholder="Ej. 3001234567" {...register('phone')} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" placeholder="correo@ejemplo.com" {...register('email')} aria-invalid={!!errors.email} />
                {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Tipo documento</Label>
                <Controller
                  name="document_type"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value ?? ''} onValueChange={field.onChange}>
                      <SelectTrigger className="w-full"><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                      <SelectContent>
                        {DOCUMENT_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="document_number">Número</Label>
                <Input id="document_number" placeholder="Ej. 1234567890" {...register('document_number')} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="address">Dirección</Label>
              <Input id="address" placeholder="Ej. Calle 123 # 45-67" {...register('address')} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="notes">Notas</Label>
              <textarea
                id="notes"
                placeholder="Observaciones sobre el cliente..."
                rows={3}
                {...register('notes')}
                className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none resize-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 placeholder:text-muted-foreground"
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleCloseDialog}>Cancelar</Button>
              <Button type="submit" disabled={isSubmitting || saveMutation.isPending}>
                {saveMutation.isPending ? 'Guardando...' : editingCustomer ? 'Actualizar' : 'Crear cliente'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Customer Sales History Sheet */}
      <Sheet open={!!historyCustomer} onOpenChange={(v) => !v && setHistoryCustomer(null)}>
        <SheetContent className="w-full sm:max-w-xl flex flex-col gap-0 p-0">
          <SheetHeader className="px-6 py-4 border-b">
            <div className="flex items-center gap-3">
              {historyCustomer && (
                <div className={`size-9 rounded-lg flex items-center justify-center text-white font-bold text-xs shrink-0 ${avatarColor(historyCustomer.name)}`}>
                  {initials(historyCustomer.name)}
                </div>
              )}
              <div>
                <SheetTitle className="text-base">{historyCustomer?.name}</SheetTitle>
                <p className="text-xs text-muted-foreground">Historial de compras</p>
              </div>
            </div>
          </SheetHeader>
          <CustomerSalesContent
            customerId={historyCustomer?.id ?? null}
            slug={slug}
            onViewReceipt={setReceiptSale}
          />
        </SheetContent>
      </Sheet>

      {/* Receipt Dialog */}
      <SaleReceiptDialog sale={receiptSale} open={!!receiptSale} onOpenChange={(v) => !v && setReceiptSale(null)} />
    </div>
  );
}

// ─── Customer Sales Content ────────────────────────────────────────────────────

function CustomerSalesContent({
  customerId, slug, onViewReceipt,
}: {
  customerId: number | null;
  slug: string;
  onViewReceipt: (sale: Sale) => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['customer-sales', slug, customerId],
    queryFn: () => posApi.sales({ customer_id: customerId!, per_page: 50 }),
    enabled: !!customerId,
  });

  const sales: Sale[] = (data as any)?.data?.data ?? [];

  const STATUS_MAP: Record<string, { label: string; className: string }> = {
    completed: { label: 'Completada', className: 'bg-green-500/10 text-green-700' },
    cancelled: { label: 'Cancelada', className: 'bg-red-500/10 text-red-700' },
    pending: { label: 'Pendiente', className: 'bg-amber-500/10 text-amber-700' },
  };

  return (
    <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
      {isLoading && Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-3 rounded-xl border">
          <Skeleton className="size-9 rounded-lg" />
          <div className="flex-1 space-y-1.5"><Skeleton className="h-3 w-24" /><Skeleton className="h-3 w-16" /></div>
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-4 w-16" />
        </div>
      ))}

      {!isLoading && sales.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="size-16 rounded-full bg-muted flex items-center justify-center mb-3">
            <ShoppingBag className="size-7 text-muted-foreground/40" />
          </div>
          <p className="text-sm font-medium text-muted-foreground">Sin compras registradas</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Este cliente aún no tiene compras</p>
        </div>
      )}

      {!isLoading && sales.map((sale) => {
        const status = STATUS_MAP[sale.status] ?? { label: sale.status, className: 'bg-muted text-muted-foreground' };
        return (
          <button
            key={sale.id}
            type="button"
            onClick={() => onViewReceipt(sale)}
            className="w-full flex items-center gap-3 p-3 rounded-xl border hover:bg-muted/40 hover:border-primary/20 transition-all text-left"
          >
            <div className="size-9 rounded-lg bg-primary/8 flex items-center justify-center shrink-0">
              <FileText className="size-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-mono font-semibold">{sale.code}</p>
              <p className="text-xs text-muted-foreground">
                {new Date(sale.created_at).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })}
              </p>
            </div>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${status.className}`}>
              {status.label}
            </span>
            <span className="text-sm font-bold tabular-nums">
              {new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(sale.total)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
