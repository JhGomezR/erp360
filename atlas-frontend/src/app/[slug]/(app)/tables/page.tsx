'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notify } from '@/lib/notify';
import {
  Plus,
  Users,
  UtensilsCrossed,
  Clock,
  CheckCircle2,
  X,
  Pencil,
  Trash2,
  Settings2,
} from 'lucide-react';

import { tablesApi, productsApi } from '@/lib/api/tenant.api';
import { AddonGate } from '@/components/shared/AddonPaywall';
import type { Table, TableOrder, TableOrderItem, Product } from '@/types';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
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

// ─── Status config ─────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  available: {
    label: 'Disponible',
    color: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    dot: 'bg-emerald-400',
  },
  occupied: {
    label: 'Ocupada',
    color: 'bg-orange-50 border-orange-200 text-orange-700',
    dot: 'bg-orange-400',
  },
  reserved: {
    label: 'Reservada',
    color: 'bg-blue-50 border-blue-200 text-blue-700',
    dot: 'bg-blue-400',
  },
  billing: {
    label: 'Facturando',
    color: 'bg-purple-50 border-purple-200 text-purple-700',
    dot: 'bg-purple-400',
  },
} as const;

// ─── Item status ───────────────────────────────────────────────────────────────

const ITEM_STATUS_LABEL: Record<TableOrderItem['status'], string> = {
  pending: 'Pendiente',
  preparing: 'Preparando',
  ready: 'Listo',
  served: 'Servido',
};

const ITEM_STATUS_COLOR: Record<TableOrderItem['status'], string> = {
  pending: 'secondary',
  preparing: 'default',
  ready: 'outline',
  served: 'secondary',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatElapsed(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (diff < 1) return 'Ahora mismo';
  if (diff < 60) return `${diff} min`;
  const h = Math.floor(diff / 60);
  return `${h}h ${diff % 60}m`;
}

// ─── Table Card ────────────────────────────────────────────────────────────────

interface TableCardProps {
  table: Table;
  onClick: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

function TableCard({ table, onClick, onEdit, onDelete }: TableCardProps) {
  const cfg = STATUS_CONFIG[table.status];
  const hasOrder = !!table.current_order;
  const itemCount = table.current_order?.items?.length ?? 0;
  const total = table.current_order?.total ?? 0;

  return (
    <div
      className={`relative rounded-xl border-2 p-4 flex flex-col gap-3 transition-all duration-150 ${cfg.color}`}
    >
      {/* Status indicator + actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className={`size-2 rounded-full ${cfg.dot}`} />
          <span className="text-xs font-medium">{cfg.label}</span>
        </div>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
            className="p-1 rounded opacity-60 hover:opacity-100 transition-opacity"
          >
            <Pencil className="size-3" />
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="p-1 rounded opacity-60 hover:opacity-100 transition-opacity hover:text-destructive"
          >
            <Trash2 className="size-3" />
          </button>
        </div>
      </div>

      {/* Table info */}
      <button type="button" onClick={onClick} className="text-left flex flex-col gap-2 flex-1">
        <div>
          <p className="text-lg font-bold leading-none">{table.name || `Mesa ${table.number}`}</p>
          <p className="text-xs opacity-70 flex items-center gap-1 mt-0.5">
            <Users className="size-3" />
            {table.capacity} personas
          </p>
        </div>

        {/* Active order summary */}
        {hasOrder && (
          <div className="text-xs space-y-0.5">
            <Separator className="opacity-30" />
            <p className="font-medium">
              {itemCount} ítem{itemCount !== 1 ? 's' : ''}
            </p>
            <p className="font-bold text-sm">
              ${(total ?? 0).toLocaleString('es-CO')}
            </p>
            <p className="opacity-60 flex items-center gap-1">
              <Clock className="size-2.5" />
              {formatElapsed(table.current_order!.created_at)}
            </p>
          </div>
        )}

        {/* CTA */}
        <div className="mt-auto">
          {table.status === 'available' ? (
            <span className="text-xs font-semibold underline underline-offset-2">
              Abrir mesa →
            </span>
          ) : (
            <span className="text-xs font-semibold underline underline-offset-2">
              Ver orden →
            </span>
          )}
        </div>
      </button>
    </div>
  );
}

// ─── Table Form Dialog ─────────────────────────────────────────────────────────

interface TableFormDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  table?: Table | null;
}

function TableFormDialog({ open, onOpenChange, table }: TableFormDialogProps) {
  const { slug } = useParams<{ slug: string }>();
  const queryClient = useQueryClient();
  const isEditing = !!table;

  const [number, setNumber] = useState('');
  const [name, setName] = useState('');
  const [capacity, setCapacity] = useState('');

  // Populate on open
  useState(() => {});
  // useEffect equivalent inline — handled by Dialog open prop change

  function handleOpen(v: boolean) {
    if (v) {
      setNumber(table?.number ? String(table.number) : '');
      setName(table?.name ?? '');
      setCapacity(table?.capacity ? String(table.capacity) : '4');
    }
    onOpenChange(v);
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        number: parseInt(number),
        name: name.trim() || undefined,
        capacity: parseInt(capacity) || 4,
      };
      return isEditing
        ? tablesApi.update(table!.id, payload)
        : tablesApi.create(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tables', slug] });
      notify.success(isEditing ? 'Mesa actualizada' : 'Mesa creada');
      onOpenChange(false);
    },
    onError: (err) => notify.error(err, 'Error al guardar la mesa'),
  });

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Editar mesa' : 'Nueva mesa'}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="t-num">
              Número <span className="text-destructive">*</span>
            </Label>
            <Input
              id="t-num"
              type="number"
              min={1}
              placeholder="1"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="t-cap">Capacidad</Label>
            <Input
              id="t-cap"
              type="number"
              min={1}
              placeholder="4"
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
            />
          </div>

          <div className="col-span-2 space-y-1.5">
            <Label htmlFor="t-name">Nombre (opcional)</Label>
            <Input
              id="t-name"
              placeholder="Ej: Terraza 1"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={!number || saveMutation.isPending}
          >
            {saveMutation.isPending ? 'Guardando...' : 'Guardar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Table Order Dialog ────────────────────────────────────────────────────────

interface TableOrderDialogProps {
  table: Table | null;
  onClose: () => void;
}

function TableOrderDialog({ table, onClose }: TableOrderDialogProps) {
  const { slug } = useParams<{ slug: string }>();
  const queryClient = useQueryClient();
  const [addProductId, setAddProductId] = useState('');
  const [addQty, setAddQty] = useState('1');
  const [addNotes, setAddNotes] = useState('');

  const open = !!table;

  const { data: productsData } = useQuery({
    queryKey: ['pos-products', slug],
    queryFn: async () => {
      const res = await productsApi.list({ per_page: 500 });
      return res.data;
    },
    enabled: open,
    staleTime: 1000 * 60 * 5,
  });

  const products: Product[] = (productsData as any)?.data ?? [];

  const order = table?.current_order;

  const openOrderMutation = useMutation({
    mutationFn: () => tablesApi.openOrder(table!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tables', slug] });
      notify.success('Orden abierta');
    },
    onError: (err) => notify.error(err, 'Error al abrir la orden'),
  });

  const addItemMutation = useMutation({
    mutationFn: () =>
      tablesApi.addItem(table!.id, {
        product_id: parseInt(addProductId),
        quantity: parseInt(addQty) || 1,
        notes: addNotes.trim() || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tables', slug] });
      setAddProductId('');
      setAddQty('1');
      setAddNotes('');
      notify.success('Ítem agregado');
    },
    onError: (err) => notify.error(err, 'Error al agregar ítem'),
  });

  const closeOrderMutation = useMutation({
    mutationFn: () => tablesApi.closeOrder(table!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tables', slug] });
      notify.success('Orden cerrada — mesa disponible');
      onClose();
    },
    onError: (err) => notify.error(err, 'Error al cerrar la orden'),
  });

  if (!table) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UtensilsCrossed className="size-4" />
            {table.name || `Mesa ${table.number}`}
            <span className="text-sm font-normal text-muted-foreground">
              — {table.capacity} personas
            </span>
          </DialogTitle>
        </DialogHeader>

        {/* No order yet */}
        {!order && (
          <div className="flex flex-col items-center gap-4 py-8 text-center">
            <UtensilsCrossed className="size-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No hay orden activa para esta mesa</p>
            <Button
              onClick={() => openOrderMutation.mutate()}
              disabled={openOrderMutation.isPending}
            >
              <Plus className="mr-2 size-4" />
              Abrir orden
            </Button>
          </div>
        )}

        {/* Active order */}
        {order && (
          <div className="flex flex-col gap-4">
            {/* Items list */}
            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Producto</th>
                    <th className="px-3 py-2 text-center font-medium text-muted-foreground">Cant.</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Estado</th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {order.items.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-3 py-6 text-center text-muted-foreground text-xs">
                        Sin ítems — agrega productos abajo
                      </td>
                    </tr>
                  ) : (
                    order.items.map((item) => (
                      <tr key={item.id} className="border-b last:border-0">
                        <td className="px-3 py-2">
                          <p className="font-medium">
                            {item.product?.name ?? `Producto #${item.product_id}`}
                          </p>
                          {item.notes && (
                            <p className="text-xs text-muted-foreground">{item.notes}</p>
                          )}
                        </td>
                        <td className="px-3 py-2 text-center">{item.quantity}</td>
                        <td className="px-3 py-2">
                          <Badge variant={ITEM_STATUS_COLOR[item.status] as any}>
                            {ITEM_STATUS_LABEL[item.status]}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 text-right font-medium">
                          ${(item.quantity * item.unit_price).toLocaleString('es-CO')}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {order.items.length > 0 && (
                  <tfoot>
                    <tr className="bg-muted/30">
                      <td colSpan={3} className="px-3 py-2 text-right font-semibold">Total</td>
                      <td className="px-3 py-2 text-right font-bold">
                        ${(order.total ?? 0).toLocaleString('es-CO')}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            {/* Add item form */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Agregar ítem
              </p>
              <div className="flex gap-2">
                <Select
                  value={addProductId}
                  onValueChange={(v) => v && setAddProductId(v)}
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Seleccionar producto..." />
                  </SelectTrigger>
                  <SelectContent>
                    {products
                      .filter((p) => p.is_active && p.stock > 0)
                      .map((p) => (
                        <SelectItem key={p.id} value={String(p.id)}>
                          {p.name} — ${p.price.toLocaleString('es-CO')}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  min={1}
                  placeholder="Cant."
                  value={addQty}
                  onChange={(e) => setAddQty(e.target.value)}
                  className="w-20"
                />
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="Notas (sin cebolla, etc.)"
                  value={addNotes}
                  onChange={(e) => setAddNotes(e.target.value)}
                  className="flex-1"
                />
                <Button
                  size="sm"
                  onClick={() => addItemMutation.mutate()}
                  disabled={!addProductId || addItemMutation.isPending}
                >
                  <Plus className="size-4" />
                </Button>
              </div>
            </div>

            <Separator />

            {/* Elapsed */}
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="size-3" />
              Orden abierta hace {formatElapsed(order.created_at)}
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cerrar
          </Button>
          {order && (
            <Button
              variant="destructive"
              onClick={() => {
                if (window.confirm('¿Cerrar la orden y liberar la mesa?')) {
                  closeOrderMutation.mutate();
                }
              }}
              disabled={closeOrderMutation.isPending}
            >
              <CheckCircle2 className="mr-2 size-4" />
              Cerrar orden
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TablesPage() {
  const { slug } = useParams<{ slug: string }>();
  const queryClient = useQueryClient();

  const [selectedTable, setSelectedTable] = useState<Table | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingTable, setEditingTable] = useState<Table | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const { data: tablesData, isLoading } = useQuery({
    queryKey: ['tables', slug],
    queryFn: async () => {
      const res = await tablesApi.list();
      return res.data as Table[];
    },
    refetchInterval: 15_000, // Real-time-ish
  });

  const tables: Table[] = tablesData ?? [];

  const filtered =
    statusFilter === 'all' ? tables : tables.filter((t) => t.status === statusFilter);

  const deleteMutation = useMutation({
    mutationFn: (id: number) => tablesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tables', slug] });
      notify.success('Mesa eliminada');
    },
    onError: (err) => notify.error(err, 'No se puede eliminar una mesa con orden activa'),
  });

  function handleEdit(table: Table) {
    setEditingTable(table);
    setFormOpen(true);
  }

  function handleDelete(table: Table) {
    if (window.confirm(`¿Eliminar la mesa "${table.name || `Mesa ${table.number}`}"?`)) {
      deleteMutation.mutate(table.id);
    }
  }

  const STATUS_FILTERS = [
    { value: 'all', label: 'Todas' },
    { value: 'available', label: 'Disponibles' },
    { value: 'occupied', label: 'Ocupadas' },
    { value: 'reserved', label: 'Reservadas' },
    { value: 'billing', label: 'Facturando' },
  ];

  // Summary counts
  const counts = tables.reduce(
    (acc, t) => { acc[t.status] = (acc[t.status] ?? 0) + 1; return acc; },
    {} as Record<string, number>,
  );

  return (
    <AddonGate moduleKey="tables" slug={slug}>
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Mesas</h1>
          <p className="text-sm text-muted-foreground">
            {tables.length} mesas ·{' '}
            <span className="text-emerald-600">{counts.available ?? 0} disponibles</span>
            {(counts.occupied ?? 0) > 0 && (
              <> · <span className="text-orange-600">{counts.occupied} ocupadas</span></>
            )}
          </p>
        </div>
        <Button
          onClick={() => {
            setEditingTable(null);
            setFormOpen(true);
          }}
        >
          <Plus className="mr-2 size-4" />
          Nueva mesa
        </Button>
      </div>

      {/* Status filter */}
      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setStatusFilter(f.value)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium border transition-colors ${
              statusFilter === f.value
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background text-muted-foreground border-border hover:bg-muted'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-44 rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
          <UtensilsCrossed className="size-10 opacity-30" />
          <p className="text-sm">
            {statusFilter === 'all' ? 'No hay mesas configuradas' : 'Sin mesas en este estado'}
          </p>
          {statusFilter === 'all' && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setEditingTable(null);
                setFormOpen(true);
              }}
            >
              <Plus className="mr-2 size-4" />
              Crear primera mesa
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {filtered.map((table) => (
            <TableCard
              key={table.id}
              table={table}
              onClick={() => setSelectedTable(table)}
              onEdit={() => handleEdit(table)}
              onDelete={() => handleDelete(table)}
            />
          ))}
        </div>
      )}

      {/* Dialogs */}
      <TableFormDialog
        open={formOpen}
        onOpenChange={(v) => {
          setFormOpen(v);
          if (!v) setEditingTable(null);
        }}
        table={editingTable}
      />

      <TableOrderDialog
        table={selectedTable}
        onClose={() => setSelectedTable(null)}
      />
    </div>
    </AddonGate>
  );
}
