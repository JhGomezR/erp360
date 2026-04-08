'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { standardSchemaResolver as zodResolver } from '@hookform/resolvers/standard-schema';
import { z } from 'zod';
import { notify } from '@/lib/notify';
import { Plus, Warehouse, ArrowLeftRight, MapPin, Pencil, Trash2, RefreshCw, Box, Package, PackageCheck, Truck, ClipboardList, CheckCircle2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { warehouseApi, productsApi } from '@/lib/api/tenant.api';
import type { Product } from '@/types';
import { setTenantSlug } from '@/lib/api/tenant.api';

// ─── Schemas ──────────────────────────────────────────────────────────────────
const warehouseSchema = z.object({
  name: z.string().min(2, 'Mínimo 2 caracteres'),
  code: z.string().min(1, 'Código requerido'),
  address: z.string().optional(),
  is_default: z.boolean().optional(),
});
type WarehouseForm = z.infer<typeof warehouseSchema>;

const transferSchema = z.object({
  from_warehouse_id: z.string().min(1, 'Selecciona bodega origen'),
  to_warehouse_id: z.string().min(1, 'Selecciona bodega destino'),
  product_id: z.string().min(1, 'Selecciona un producto'),
  quantity: z.string().min(1, 'Cantidad mínima 1'),
  notes: z.string().optional(),
});
type TransferForm = z.infer<typeof transferSchema>;

interface WarehouseData {
  id: number; name: string; code: string; address?: string; is_default?: boolean; is_active?: boolean;
}
interface TransferData {
  id: number; from_warehouse: { name: string }; to_warehouse: { name: string };
  status: string; notes?: string; created_at: string;
  items?: { product: { name: string }; quantity: number }[];
}
interface PalletData {
  id: number; code: string; description?: string; status: string;
  zone?: { name: string }; products?: { product: { name: string; sku: string }; quantity: number }[];
}
interface PickingItem {
  id: number; product_name: string; product_sku?: string;
  quantity_requested: number; quantity_picked: number; shelf?: { code: string };
}
interface PickingOrderData {
  id: number; order_number: string; source_type: string; status: string;
  due_date?: string; notes?: string; created_at: string;
  warehouse?: { name: string };
  items?: PickingItem[];
}
interface PackingListData {
  id: number; list_number: string; status: string; carrier?: string; tracking_number?: string;
  recipient_name?: string; weight_kg?: number; notes?: string; created_at: string; packed_at?: string; dispatched_at?: string;
  picking_order?: { order_number: string };
  items?: { id: number; quantity_packed: number; picking_order_item?: { product_name: string } }[];
}

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pendiente', in_transit: 'En tránsito', completed: 'Completado', cancelled: 'Cancelado',
};
const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'outline'> = {
  pending: 'secondary', in_transit: 'default', completed: 'default', cancelled: 'outline',
};

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function WarehousePage() {
  const params = useParams();
  const slug = params.slug as string;
  const qc = useQueryClient();
  const [tab, setTab] = useState<'warehouses' | 'transfers' | 'pallets' | 'picking' | 'packing'>('warehouses');
  const [whDialog, setWhDialog] = useState(false);
  const [editWh, setEditWh] = useState<WarehouseData | null>(null);
  const [transferDialog, setTransferDialog] = useState(false);
  const [palletDialog, setPalletDialog] = useState(false);
  const [addProductDialog, setAddProductDialog] = useState<PalletData | null>(null);
  const [palletForm, setPalletForm] = useState({ code: '', description: '' });
  const [addProductForm, setAddProductForm] = useState({ product_id: '', quantity: '1' });

  // Picking state
  const [pickingDialog, setPickingDialog] = useState(false);
  const [pickingStatusFilter, setPickingStatusFilter] = useState('');
  const [pickingItems, setPickingItems] = useState<{ product_id: string; product_name: string; quantity_requested: string }[]>([{ product_id: '', product_name: '', quantity_requested: '1' }]);
  const [pickingNotes, setPickingNotes] = useState('');
  const [pickingDueDate, setPickingDueDate] = useState('');
  const [pickingWarehouse, setPickingWarehouse] = useState('');
  const [updatePickItem, setUpdatePickItem] = useState<{ orderId: number; item: PickingItem } | null>(null);
  const [pickQty, setPickQty] = useState('');

  // Packing state
  const [packingDialog, setPackingDialog] = useState(false);
  const [packingPickingId, setPackingPickingId] = useState('');
  const [packingCarrier, setPackingCarrier] = useState('');
  const [packingTracking, setPackingTracking] = useState('');
  const [packingRecipient, setPackingRecipient] = useState('');
  const [packingAddress, setPackingAddress] = useState('');
  const [packingNotes, setPackingNotes] = useState('');
  const [dispatchDialog, setDispatchDialog] = useState<PackingListData | null>(null);
  const [dispatchCarrier, setDispatchCarrier] = useState('');
  const [dispatchTracking, setDispatchTracking] = useState('');

  useEffect(() => { setTenantSlug(slug); }, [slug]);

  // ─── Queries ──────────────────────────────────────────────────────────────
  const { data: warehouses = [], isLoading: loadingWh } = useQuery({
    queryKey: ['warehouses', slug],
    queryFn: async () => {
      const r = await warehouseApi.list();
      return (r.data as { data?: WarehouseData[] }).data ?? (r.data as WarehouseData[]) ?? [];
    },
  });

  const { data: transfers, isLoading: loadingTr } = useQuery({
    queryKey: ['warehouse-transfers', slug],
    queryFn: async () => {
      const r = await warehouseApi.transfers();
      return (r.data as { data?: TransferData[] }).data ?? (r.data as TransferData[]) ?? [];
    },
    enabled: tab === 'transfers',
  });

  const { data: products = [] } = useQuery({
    queryKey: ['products-simple', slug],
    queryFn: async () => {
      const r = await productsApi.list({ per_page: 200 });
      return r.data.data ?? [];
    },
  });

  const { data: pallets = [], isLoading: loadingPallets } = useQuery({
    queryKey: ['pallets', slug],
    queryFn: async () => {
      const r = await warehouseApi.pallets();
      return (r.data as { data?: PalletData[] }).data ?? (r.data as PalletData[]) ?? [];
    },
    enabled: tab === 'pallets',
  });

  const { data: pickingOrders = [], isLoading: loadingPicking } = useQuery<PickingOrderData[]>({
    queryKey: ['picking-orders', slug, pickingStatusFilter],
    queryFn: async () => {
      const r = await warehouseApi.pickingOrders({ status: pickingStatusFilter || undefined });
      return (r.data as any)?.data ?? [];
    },
    enabled: tab === 'picking',
  });

  const { data: packingLists = [], isLoading: loadingPacking } = useQuery<PackingListData[]>({
    queryKey: ['packing-lists', slug],
    queryFn: async () => {
      const r = await warehouseApi.packingLists();
      return (r.data as any)?.data ?? [];
    },
    enabled: tab === 'packing',
  });

  const completedPickings = pickingOrders.filter((p) => p.status === 'completed');

  const createPickingMut = useMutation({
    mutationFn: () => warehouseApi.createPicking({
      source_type: 'manual',
      warehouse_id: pickingWarehouse ? Number(pickingWarehouse) : undefined,
      due_date: pickingDueDate || undefined,
      notes: pickingNotes || undefined,
      items: pickingItems.filter((i) => i.product_name && i.quantity_requested).map((i) => ({
        product_id: i.product_id ? Number(i.product_id) : 0,
        product_name: i.product_name,
        quantity_requested: Number(i.quantity_requested),
      })),
    }),
    onSuccess: () => { notify.success('Orden de picking creada'); setPickingDialog(false); setPickingItems([{ product_id: '', product_name: '', quantity_requested: '1' }]); setPickingNotes(''); setPickingDueDate(''); qc.invalidateQueries({ queryKey: ['picking-orders', slug] }); },
    onError: (e) => notify.error(e, 'Error'),
  });

  const updatePickItemMut = useMutation({
    mutationFn: ({ orderId, itemId, qty }: { orderId: number; itemId: number; qty: number }) =>
      warehouseApi.updatePickingItem(orderId, itemId, { quantity_picked: qty }),
    onSuccess: () => { notify.success('Ítem actualizado'); setUpdatePickItem(null); qc.invalidateQueries({ queryKey: ['picking-orders', slug] }); },
    onError: (e) => notify.error(e, 'Error'),
  });

  const completePickingMut = useMutation({
    mutationFn: (id: number) => warehouseApi.completePicking(id),
    onSuccess: () => { notify.success('Picking completado'); qc.invalidateQueries({ queryKey: ['picking-orders', slug] }); },
    onError: (e) => notify.error(e, 'Error al completar'),
  });

  const cancelPickingMut = useMutation({
    mutationFn: (id: number) => warehouseApi.cancelPicking(id),
    onSuccess: () => { notify.success('Picking cancelado'); qc.invalidateQueries({ queryKey: ['picking-orders', slug] }); },
    onError: (e) => notify.error(e, 'Error'),
  });

  const createPackingMut = useMutation({
    mutationFn: () => warehouseApi.createPacking({
      picking_order_id: Number(packingPickingId),
      carrier: packingCarrier || undefined,
      tracking_number: packingTracking || undefined,
      recipient_name: packingRecipient || undefined,
      recipient_address: packingAddress || undefined,
      notes: packingNotes || undefined,
    }),
    onSuccess: () => { notify.success('Lista de empaque creada'); setPackingDialog(false); setPackingPickingId(''); setPackingCarrier(''); setPackingTracking(''); setPackingRecipient(''); setPackingAddress(''); setPackingNotes(''); qc.invalidateQueries({ queryKey: ['packing-lists', slug] }); },
    onError: (e) => notify.error(e, 'Error'),
  });

  const markPackedMut = useMutation({
    mutationFn: (id: number) => warehouseApi.markPacked(id),
    onSuccess: () => { notify.success('Marcado como empacado'); qc.invalidateQueries({ queryKey: ['packing-lists', slug] }); },
    onError: (e) => notify.error(e, 'Error'),
  });

  const dispatchMut = useMutation({
    mutationFn: ({ id, carrier, tracking }: { id: number; carrier?: string; tracking?: string }) =>
      warehouseApi.dispatchPacking(id, { carrier, tracking_number: tracking }),
    onSuccess: () => { notify.success('Envío despachado'); setDispatchDialog(null); qc.invalidateQueries({ queryKey: ['packing-lists', slug] }); },
    onError: (e) => notify.error(e, 'Error'),
  });

  const createPallet = useMutation({
    mutationFn: (d: typeof palletForm) => warehouseApi.createPallet(d),
    onSuccess: () => {
      notify.success('Pallet creado'); setPalletDialog(false); setPalletForm({ code: '', description: '' });
      qc.invalidateQueries({ queryKey: ['pallets', slug] });
    },
    onError: (err) => notify.error(err, 'Error al crear pallet'),
  });

  const deletePallet = useMutation({
    mutationFn: (id: number) => warehouseApi.deletePallet(id),
    onSuccess: () => { notify.success('Pallet eliminado'); qc.invalidateQueries({ queryKey: ['pallets', slug] }); },
    onError: (err) => notify.error(err, 'Error al eliminar'),
  });

  const addPalletProduct = useMutation({
    mutationFn: ({ id, product_id, quantity }: { id: number; product_id: number; quantity: number }) =>
      warehouseApi.addPalletProduct(id, { product_id, quantity }),
    onSuccess: () => {
      notify.success('Producto agregado'); setAddProductDialog(null); setAddProductForm({ product_id: '', quantity: '1' });
      qc.invalidateQueries({ queryKey: ['pallets', slug] });
    },
    onError: (err) => notify.error(err, 'Error al agregar producto'),
  });

  const removePalletProduct = useMutation({
    mutationFn: ({ palletId, productId }: { palletId: number; productId: number }) =>
      warehouseApi.removePalletProduct(palletId, productId),
    onSuccess: () => { notify.success('Producto removido'); qc.invalidateQueries({ queryKey: ['pallets', slug] }); },
    onError: (err) => notify.error(err, 'Error al remover'),
  });

  // ─── Warehouse form ────────────────────────────────────────────────────────
  const whForm = useForm<WarehouseForm>({ resolver: zodResolver(warehouseSchema) });

  useEffect(() => {
    if (editWh) whForm.reset({ name: editWh.name, code: editWh.code, address: editWh.address ?? '' });
    else whForm.reset({ name: '', code: '', address: '' });
  }, [editWh, whForm]);

  const saveWh = useMutation({
    mutationFn: (d: WarehouseForm) =>
      editWh ? warehouseApi.update(editWh.id, d) : warehouseApi.create(d),
    onSuccess: () => {
      notify.success(editWh ? 'Bodega actualizada' : 'Bodega creada');
      setWhDialog(false); setEditWh(null);
      qc.invalidateQueries({ queryKey: ['warehouses', slug] });
    },
    onError: (err) => notify.error(err, 'Error al guardar'),
  });

  const deleteWh = useMutation({
    mutationFn: (id: number) => warehouseApi.delete(id),
    onSuccess: () => { notify.success('Bodega eliminada'); qc.invalidateQueries({ queryKey: ['warehouses', slug] }); },
    onError: (err) => notify.error(err, 'No se puede eliminar esta bodega'),
  });

  // ─── Transfer form ─────────────────────────────────────────────────────────
  const trForm = useForm<TransferForm>({ resolver: zodResolver(transferSchema) });

  const createTransfer = useMutation({
    mutationFn: (d: TransferForm) => warehouseApi.createTransfer({
      from_warehouse_id: Number(d.from_warehouse_id),
      to_warehouse_id: Number(d.to_warehouse_id),
      items: [{ product_id: Number(d.product_id), quantity: Number(d.quantity) }],
      notes: d.notes,
    }),
    onSuccess: () => {
      notify.success('Transferencia creada');
      setTransferDialog(false); trForm.reset();
      qc.invalidateQueries({ queryKey: ['warehouse-transfers', slug] });
    },
    onError: (err) => notify.error(err, 'Error al crear transferencia'),
  });

  const advanceTransfer = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      warehouseApi.updateTransferStatus(id, status),
    onSuccess: () => { notify.success('Estado actualizado'); qc.invalidateQueries({ queryKey: ['warehouse-transfers', slug] }); },
    onError: (err) => notify.error(err, 'Error al actualizar estado'),
  });

  const TABS = [
    { key: 'warehouses', label: 'Bodegas',         icon: Warehouse },
    { key: 'transfers',  label: 'Transferencias',  icon: ArrowLeftRight },
    { key: 'pallets',    label: 'Pallets',          icon: Box },
    { key: 'picking',    label: 'Picking',          icon: ClipboardList },
    { key: 'packing',    label: 'Empaque/Despacho', icon: Package },
  ] as const;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Almacén</h1>
          <p className="text-muted-foreground text-sm">Gestiona bodegas y transferencias de stock</p>
        </div>
        {tab === 'warehouses' && (
          <Button onClick={() => { setEditWh(null); setWhDialog(true); }} className="gap-2">
            <Plus className="size-4" />Nueva bodega
          </Button>
        )}
        {tab === 'transfers' && (
          <Button onClick={() => setTransferDialog(true)} className="gap-2">
            <ArrowLeftRight className="size-4" />Nueva transferencia
          </Button>
        )}
        {tab === 'pallets' && (
          <Button onClick={() => setPalletDialog(true)} className="gap-2">
            <Plus className="size-4" />Nuevo pallet
          </Button>
        )}
        {tab === 'picking' && (
          <Button onClick={() => { setPickingItems([{ product_id: '', product_name: '', quantity_requested: '1' }]); setPickingNotes(''); setPickingDueDate(''); setPickingWarehouse(''); setPickingDialog(true); }} className="gap-2">
            <Plus className="size-4" />Nueva orden picking
          </Button>
        )}
        {tab === 'packing' && (
          <Button onClick={() => { setPackingPickingId(''); setPackingCarrier(''); setPackingTracking(''); setPackingRecipient(''); setPackingAddress(''); setPackingNotes(''); setPackingDialog(true); }} className="gap-2">
            <Plus className="size-4" />Nueva lista empaque
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon className="size-4" />{label}
          </button>
        ))}
      </div>

      {/* Bodegas */}
      {tab === 'warehouses' && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {loadingWh
            ? Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-36 rounded-lg" />)
            : warehouses.map((wh: WarehouseData) => (
                <Card key={wh.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <Warehouse className="size-5 text-primary" />
                        <CardTitle className="text-base">{wh.name}</CardTitle>
                      </div>
                      {wh.is_default && <Badge variant="default">Principal</Badge>}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <p className="text-xs font-mono text-muted-foreground">{wh.code}</p>
                    {wh.address && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <MapPin className="size-3" />{wh.address}
                      </p>
                    )}
                    <div className="flex gap-2 pt-1">
                      <Button variant="outline" size="sm" className="flex-1 gap-1"
                        onClick={() => { setEditWh(wh); setWhDialog(true); }}>
                        <Pencil className="size-3" />Editar
                      </Button>
                      {!wh.is_default && (
                        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive"
                          onClick={() => window.confirm(`¿Eliminar bodega "${wh.name}"?`) && deleteWh.mutate(wh.id)}>
                          <Trash2 className="size-4" />
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
          {!loadingWh && warehouses.length === 0 && (
            <div className="col-span-3 text-center py-12 text-muted-foreground">
              <Warehouse className="size-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No hay bodegas registradas</p>
            </div>
          )}
        </div>
      )}

      {/* Transferencias */}
      {tab === 'transfers' && (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Origen</th>
                  <th className="text-left px-4 py-3 font-medium">Destino</th>
                  <th className="text-left px-4 py-3 font-medium">Estado</th>
                  <th className="text-left px-4 py-3 font-medium">Fecha</th>
                  <th className="text-left px-4 py-3 font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {loadingTr
                  ? Array.from({ length: 4 }).map((_, i) => (
                      <tr key={i}>{Array.from({ length: 5 }).map((__, j) => (
                        <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-20" /></td>
                      ))}</tr>
                    ))
                  : transfers?.map((tr: TransferData) => (
                      <tr key={tr.id} className="hover:bg-muted/30">
                        <td className="px-4 py-3">{tr.from_warehouse?.name}</td>
                        <td className="px-4 py-3">{tr.to_warehouse?.name}</td>
                        <td className="px-4 py-3">
                          <Badge variant={STATUS_VARIANT[tr.status] ?? 'outline'}>
                            {STATUS_LABEL[tr.status] ?? tr.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {new Date(tr.created_at).toLocaleDateString('es-CO')}
                        </td>
                        <td className="px-4 py-3">
                          {tr.status === 'pending' && (
                            <Button variant="outline" size="sm" className="gap-1"
                              onClick={() => advanceTransfer.mutate({ id: tr.id, status: 'in_transit' })}>
                              <RefreshCw className="size-3" />Despachar
                            </Button>
                          )}
                          {tr.status === 'in_transit' && (
                            <Button variant="outline" size="sm" className="gap-1"
                              onClick={() => advanceTransfer.mutate({ id: tr.id, status: 'completed' })}>
                              <RefreshCw className="size-3" />Completar
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                {!loadingTr && (!transfers || transfers.length === 0) && (
                  <tr><td colSpan={5} className="text-center py-8 text-muted-foreground text-sm">
                    No hay transferencias registradas
                  </td></tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Pallets */}
      {tab === 'pallets' && (
        <div className="space-y-4">
          {loadingPallets
            ? Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-36 rounded-lg" />)
            : (pallets as PalletData[]).map((pallet) => (
                <Card key={pallet.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <Box className="size-5 text-primary" />
                        <CardTitle className="text-base font-mono">{pallet.code}</CardTitle>
                        {pallet.zone && <span className="text-xs text-muted-foreground">{pallet.zone.name}</span>}
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" className="gap-1"
                          onClick={() => setAddProductDialog(pallet)}>
                          <Plus className="size-3" />Agregar
                        </Button>
                        <Button variant="ghost" size="sm" className="text-destructive"
                          onClick={() => window.confirm(`¿Eliminar pallet ${pallet.code}?`) && deletePallet.mutate(pallet.id)}>
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {pallet.description && <p className="text-xs text-muted-foreground mb-2">{pallet.description}</p>}
                    {pallet.products && pallet.products.length > 0 ? (
                      <table className="w-full text-sm">
                        <thead><tr className="text-xs text-muted-foreground border-b">
                          <th className="text-left py-1">Producto</th>
                          <th className="text-left py-1">SKU</th>
                          <th className="text-right py-1">Qty</th>
                          <th className="py-1"></th>
                        </tr></thead>
                        <tbody className="divide-y">
                          {pallet.products.map((pp, idx) => (
                            <tr key={idx} className="hover:bg-muted/20">
                              <td className="py-1.5">{pp.product.name}</td>
                              <td className="py-1.5 font-mono text-xs text-muted-foreground">{pp.product.sku}</td>
                              <td className="py-1.5 text-right font-medium">{pp.quantity}</td>
                              <td className="py-1.5">
                                <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive"
                                  onClick={() => removePalletProduct.mutate({ palletId: pallet.id, productId: 0 })}>
                                  <Trash2 className="size-3" />
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <p className="text-xs text-muted-foreground">Sin productos asignados</p>
                    )}
                  </CardContent>
                </Card>
              ))}
          {!loadingPallets && pallets.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <Box className="size-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No hay pallets registrados</p>
            </div>
          )}
        </div>
      )}

      {/* ── Picking ── */}
      {tab === 'picking' && (
        <div className="space-y-4">
          <div className="flex gap-2">
            <Select value={pickingStatusFilter} onValueChange={(v) => setPickingStatusFilter(!v || v === '_all' ? '' : v)}>
              <SelectTrigger className="w-44"><SelectValue placeholder="Todos los estados" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">Todos los estados</SelectItem>
                <SelectItem value="pending">Pendiente</SelectItem>
                <SelectItem value="in_progress">En progreso</SelectItem>
                <SelectItem value="completed">Completado</SelectItem>
                <SelectItem value="cancelled">Cancelado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium">N.° Orden</th>
                    <th className="text-left px-4 py-3 font-medium">Bodega</th>
                    <th className="text-left px-4 py-3 font-medium">Ítems</th>
                    <th className="text-left px-4 py-3 font-medium">Fecha límite</th>
                    <th className="text-left px-4 py-3 font-medium">Estado</th>
                    <th className="text-left px-4 py-3 font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {loadingPicking
                    ? Array.from({ length: 3 }).map((_, i) => <tr key={i}>{Array.from({ length: 6 }).map((__, j) => <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-20" /></td>)}</tr>)
                    : pickingOrders.map((po) => {
                        const pickStatusMap: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' }> = {
                          pending:     { label: 'Pendiente',    variant: 'secondary' },
                          in_progress: { label: 'En progreso', variant: 'default' },
                          completed:   { label: 'Completado',  variant: 'default' },
                          cancelled:   { label: 'Cancelado',   variant: 'outline' },
                        };
                        const s = pickStatusMap[po.status] ?? { label: po.status, variant: 'outline' as const };
                        const pickedCount = (po.items ?? []).filter((i) => i.quantity_picked >= i.quantity_requested).length;
                        const totalCount  = (po.items ?? []).length;
                        return (
                          <tr key={po.id} className="hover:bg-muted/30">
                            <td className="px-4 py-3 font-mono text-xs font-semibold">{po.order_number}</td>
                            <td className="px-4 py-3 text-xs">{po.warehouse?.name ?? '—'}</td>
                            <td className="px-4 py-3 text-xs">
                              <div className="flex items-center gap-1.5">
                                <span className="font-medium">{pickedCount}/{totalCount}</span>
                                <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                                  <div className="h-full bg-primary rounded-full" style={{ width: totalCount > 0 ? `${(pickedCount / totalCount) * 100}%` : '0%' }} />
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-xs text-muted-foreground">{po.due_date ? new Date(po.due_date + 'T12:00:00').toLocaleDateString('es-CO') : '—'}</td>
                            <td className="px-4 py-3"><Badge variant={s.variant}>{s.label}</Badge></td>
                            <td className="px-4 py-3">
                              <div className="flex gap-1 flex-wrap">
                                {(po.items ?? []).map((item) => item.quantity_picked < item.quantity_requested && (
                                  <Button key={item.id} size="sm" variant="outline" className="gap-1 h-7 text-xs"
                                    onClick={() => { setUpdatePickItem({ orderId: po.id, item }); setPickQty(String(item.quantity_picked)); }}>
                                    <Package className="size-3" />{item.product_name.split(' ')[0]}
                                  </Button>
                                ))}
                                {po.status !== 'completed' && po.status !== 'cancelled' && (
                                  <Button size="sm" variant="outline" className="gap-1 h-7 text-xs text-green-700"
                                    onClick={() => completePickingMut.mutate(po.id)} disabled={completePickingMut.isPending}>
                                    <CheckCircle2 className="size-3" />Completar
                                  </Button>
                                )}
                                {po.status === 'pending' && (
                                  <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive"
                                    onClick={() => cancelPickingMut.mutate(po.id)} disabled={cancelPickingMut.isPending}>
                                    <X className="size-3" />Cancelar
                                  </Button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                  {!loadingPicking && pickingOrders.length === 0 && (
                    <tr><td colSpan={6} className="text-center py-8 text-muted-foreground text-sm"><ClipboardList className="size-8 mx-auto mb-2 opacity-30" /><p>Sin órdenes de picking</p></td></tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Packing ── */}
      {tab === 'packing' && (
        <div className="space-y-4">
          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium">N.° Lista</th>
                    <th className="text-left px-4 py-3 font-medium">Orden Picking</th>
                    <th className="text-left px-4 py-3 font-medium">Destinatario</th>
                    <th className="text-left px-4 py-3 font-medium">Transportador</th>
                    <th className="text-left px-4 py-3 font-medium">Tracking</th>
                    <th className="text-left px-4 py-3 font-medium">Estado</th>
                    <th className="text-left px-4 py-3 font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {loadingPacking
                    ? Array.from({ length: 3 }).map((_, i) => <tr key={i}>{Array.from({ length: 7 }).map((__, j) => <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-16" /></td>)}</tr>)
                    : packingLists.map((pl) => {
                        const packStatusMap: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' }> = {
                          pending:    { label: 'Pendiente',    variant: 'secondary' },
                          packing:    { label: 'Empacando',   variant: 'default' },
                          packed:     { label: 'Empacado',    variant: 'default' },
                          dispatched: { label: 'Despachado',  variant: 'default' },
                          cancelled:  { label: 'Cancelado',   variant: 'outline' },
                        };
                        const s = packStatusMap[pl.status] ?? { label: pl.status, variant: 'outline' as const };
                        return (
                          <tr key={pl.id} className="hover:bg-muted/30">
                            <td className="px-4 py-3 font-mono text-xs font-semibold">{pl.list_number}</td>
                            <td className="px-4 py-3 font-mono text-xs">{pl.picking_order?.order_number ?? '—'}</td>
                            <td className="px-4 py-3 text-xs">{pl.recipient_name ?? '—'}</td>
                            <td className="px-4 py-3 text-xs">{pl.carrier ?? '—'}</td>
                            <td className="px-4 py-3 text-xs font-mono">{pl.tracking_number ?? '—'}</td>
                            <td className="px-4 py-3"><Badge variant={s.variant}>{s.label}</Badge></td>
                            <td className="px-4 py-3">
                              <div className="flex gap-1 flex-wrap">
                                {(pl.status === 'pending' || pl.status === 'packing') && (
                                  <Button size="sm" variant="outline" className="gap-1 h-7 text-xs text-blue-700"
                                    onClick={() => markPackedMut.mutate(pl.id)} disabled={markPackedMut.isPending}>
                                    <PackageCheck className="size-3" />Empacado
                                  </Button>
                                )}
                                {pl.status === 'packed' && (
                                  <Button size="sm" variant="outline" className="gap-1 h-7 text-xs text-green-700"
                                    onClick={() => { setDispatchDialog(pl); setDispatchCarrier(pl.carrier ?? ''); setDispatchTracking(pl.tracking_number ?? ''); }}>
                                    <Truck className="size-3" />Despachar
                                  </Button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                  {!loadingPacking && packingLists.length === 0 && (
                    <tr><td colSpan={7} className="text-center py-8 text-muted-foreground text-sm"><Package className="size-8 mx-auto mb-2 opacity-30" /><p>Sin listas de empaque</p></td></tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Dialog: Nuevo pallet */}
      <Dialog open={palletDialog} onOpenChange={setPalletDialog}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Box className="size-4" />Nuevo pallet</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Código *</Label>
              <Input value={palletForm.code} onChange={(e) => setPalletForm((f) => ({ ...f, code: e.target.value }))} placeholder="PAL-001" className="font-mono uppercase" />
            </div>
            <div className="space-y-1.5">
              <Label>Descripción</Label>
              <Input value={palletForm.description} onChange={(e) => setPalletForm((f) => ({ ...f, description: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPalletDialog(false)}>Cancelar</Button>
            <Button onClick={() => createPallet.mutate(palletForm)} disabled={!palletForm.code || createPallet.isPending}>
              {createPallet.isPending ? 'Creando...' : 'Crear'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Agregar producto a pallet */}
      <Dialog open={!!addProductDialog} onOpenChange={(o) => { if (!o) setAddProductDialog(null); }}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader><DialogTitle>Agregar producto — {addProductDialog?.code}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Producto *</Label>
              <Select onValueChange={(v: string | null) => setAddProductForm((f) => ({ ...f, product_id: v ?? '' }))}>
                <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                <SelectContent>
                  {(products as Product[]).map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Cantidad *</Label>
              <Input type="number" min={1} value={addProductForm.quantity}
                onChange={(e) => setAddProductForm((f) => ({ ...f, quantity: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddProductDialog(null)}>Cancelar</Button>
            <Button disabled={!addProductForm.product_id || addPalletProduct.isPending}
              onClick={() => addProductDialog && addPalletProduct.mutate({
                id: addProductDialog.id,
                product_id: Number(addProductForm.product_id),
                quantity: Number(addProductForm.quantity),
              })}>
              {addPalletProduct.isPending ? 'Agregando...' : 'Agregar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Nueva orden de picking */}
      <Dialog open={pickingDialog} onOpenChange={setPickingDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><ClipboardList className="size-4" />Nueva orden de picking</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Bodega</Label>
                <Select value={pickingWarehouse} onValueChange={(v) => setPickingWarehouse(v ?? '')}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                  <SelectContent>
                    {warehouses.map((w: WarehouseData) => <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Fecha límite</Label>
                <Input type="date" value={pickingDueDate} onChange={(e) => setPickingDueDate(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Productos a pickear *</Label>
                <Button type="button" variant="ghost" size="sm" className="h-7 text-xs gap-1"
                  onClick={() => setPickingItems((prev) => [...prev, { product_id: '', product_name: '', quantity_requested: '1' }])}>
                  <Plus className="size-3" />Agregar ítem
                </Button>
              </div>
              {pickingItems.map((item, idx) => (
                <div key={idx} className="flex gap-2 items-end">
                  <div className="flex-1 space-y-1">
                    <Input placeholder="Nombre producto" value={item.product_name}
                      onChange={(e) => setPickingItems((prev) => prev.map((x, i) => i === idx ? { ...x, product_name: e.target.value } : x))} />
                  </div>
                  <div className="w-20 space-y-1">
                    <Input type="number" min={0.01} step="0.01" placeholder="Qty" value={item.quantity_requested}
                      onChange={(e) => setPickingItems((prev) => prev.map((x, i) => i === idx ? { ...x, quantity_requested: e.target.value } : x))} />
                  </div>
                  {pickingItems.length > 1 && (
                    <Button type="button" variant="ghost" size="icon" className="h-9 w-9 text-destructive shrink-0"
                      onClick={() => setPickingItems((prev) => prev.filter((_, i) => i !== idx))}>
                      <X className="size-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
            <div className="space-y-1.5">
              <Label>Notas</Label>
              <Input value={pickingNotes} onChange={(e) => setPickingNotes(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPickingDialog(false)}>Cancelar</Button>
            <Button onClick={() => createPickingMut.mutate()} disabled={!pickingItems.some((i) => i.product_name) || createPickingMut.isPending}>
              {createPickingMut.isPending ? 'Creando...' : 'Crear orden'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Actualizar ítem picking */}
      <Dialog open={!!updatePickItem} onOpenChange={(o) => { if (!o) setUpdatePickItem(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Registrar cantidad pickeada</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm"><span className="font-medium">{updatePickItem?.item.product_name}</span></p>
            <p className="text-xs text-muted-foreground">Solicitada: {updatePickItem?.item.quantity_requested} — Pickeada hasta ahora: {updatePickItem?.item.quantity_picked}</p>
            <div className="space-y-1.5">
              <Label>Cantidad pickeada *</Label>
              <Input type="number" min={0} max={updatePickItem?.item.quantity_requested} step="0.01" value={pickQty} onChange={(e) => setPickQty(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUpdatePickItem(null)}>Cancelar</Button>
            <Button onClick={() => updatePickItem && updatePickItemMut.mutate({ orderId: updatePickItem.orderId, itemId: updatePickItem.item.id, qty: Number(pickQty) })} disabled={!pickQty || updatePickItemMut.isPending}>
              {updatePickItemMut.isPending ? 'Guardando...' : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Nueva lista de empaque */}
      <Dialog open={packingDialog} onOpenChange={setPackingDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Package className="size-4" />Nueva lista de empaque</DialogTitle></DialogHeader>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Orden de picking (completada) *</Label>
              <Select value={packingPickingId} onValueChange={(v) => setPackingPickingId(v ?? '')}>
                <SelectTrigger><SelectValue placeholder="Seleccionar orden..." /></SelectTrigger>
                <SelectContent>
                  {(tab === 'packing' ? pickingOrders.filter((p) => p.status === 'completed') : completedPickings).map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>{p.order_number}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Destinatario</Label>
              <Input value={packingRecipient} onChange={(e) => setPackingRecipient(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Transportador</Label>
              <Input value={packingCarrier} onChange={(e) => setPackingCarrier(e.target.value)} placeholder="Ej: Servientrega" />
            </div>
            <div className="space-y-1.5">
              <Label>N.° tracking</Label>
              <Input value={packingTracking} onChange={(e) => setPackingTracking(e.target.value)} placeholder="Opcional" />
            </div>
            <div className="space-y-1.5">
              <Label>Dirección destino</Label>
              <Input value={packingAddress} onChange={(e) => setPackingAddress(e.target.value)} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Notas</Label>
              <Input value={packingNotes} onChange={(e) => setPackingNotes(e.target.value)} />
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setPackingDialog(false)}>Cancelar</Button>
            <Button onClick={() => createPackingMut.mutate()} disabled={!packingPickingId || createPackingMut.isPending}>
              {createPackingMut.isPending ? 'Creando...' : 'Crear lista'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Despachar */}
      <Dialog open={!!dispatchDialog} onOpenChange={(o) => { if (!o) setDispatchDialog(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Truck className="size-4" />Despachar envío</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Lista: <span className="font-medium text-foreground">{dispatchDialog?.list_number}</span></p>
          <div className="space-y-3 mt-2">
            <div className="space-y-1.5">
              <Label>Transportador</Label>
              <Input value={dispatchCarrier} onChange={(e) => setDispatchCarrier(e.target.value)} placeholder="Ej: Servientrega" />
            </div>
            <div className="space-y-1.5">
              <Label>N.° tracking</Label>
              <Input value={dispatchTracking} onChange={(e) => setDispatchTracking(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDispatchDialog(null)}>Cancelar</Button>
            <Button onClick={() => dispatchDialog && dispatchMut.mutate({ id: dispatchDialog.id, carrier: dispatchCarrier, tracking: dispatchTracking })} disabled={dispatchMut.isPending}>
              {dispatchMut.isPending ? 'Despachando...' : 'Confirmar despacho'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Bodega */}
      <Dialog open={whDialog} onOpenChange={(o) => { setWhDialog(o); if (!o) setEditWh(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{editWh ? 'Editar bodega' : 'Nueva bodega'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={whForm.handleSubmit((d) => saveWh.mutate(d))} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Nombre *</Label>
              <Input {...whForm.register('name')} />
              {whForm.formState.errors.name && <p className="text-xs text-destructive">{whForm.formState.errors.name.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Código *</Label>
              <Input {...whForm.register('code')} placeholder="BODEGA-01" className="font-mono uppercase" />
              {whForm.formState.errors.code && <p className="text-xs text-destructive">{whForm.formState.errors.code.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Dirección</Label>
              <Input {...whForm.register('address')} />
            </div>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setWhDialog(false)}>Cancelar</Button>
              <Button type="submit" disabled={saveWh.isPending}>
                {saveWh.isPending ? 'Guardando...' : 'Guardar'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog: Transferencia */}
      <Dialog open={transferDialog} onOpenChange={setTransferDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowLeftRight className="size-4" />Nueva transferencia
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={trForm.handleSubmit((d) => createTransfer.mutate(d))} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Bodega origen *</Label>
              <Select onValueChange={(v: string | null) => trForm.setValue('from_warehouse_id', v ?? '')}>
                <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                <SelectContent>
                  {warehouses.map((w: WarehouseData) => (
                    <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Bodega destino *</Label>
              <Select onValueChange={(v: string | null) => trForm.setValue('to_warehouse_id', v ?? '')}>
                <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                <SelectContent>
                  {warehouses.map((w: WarehouseData) => (
                    <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Producto *</Label>
              <Select onValueChange={(v: string | null) => trForm.setValue('product_id', v ?? '')}>
                <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                <SelectContent>
                  {products.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Cantidad *</Label>
              <Input type="number" min={1} {...trForm.register('quantity')} />
            </div>
            <div className="space-y-1.5">
              <Label>Notas</Label>
              <Input {...trForm.register('notes')} />
            </div>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setTransferDialog(false)}>Cancelar</Button>
              <Button type="submit" disabled={createTransfer.isPending}>
                {createTransfer.isPending ? 'Creando...' : 'Crear transferencia'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
