'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { standardSchemaResolver as zodResolver } from '@hookform/resolvers/standard-schema';
import { z } from 'zod';
import { useQuery, useMutation, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { notify } from '@/lib/notify';
import {
  Store,
  Globe,
  Package,
  Save,
  Eye,
  EyeOff,
  Search,
  ExternalLink,
  ToggleLeft,
  ToggleRight,
  ShoppingCart,
  RefreshCw,
  Lock,
  Zap,
  CheckCircle2,
  ShoppingBag,
  Mail,
  XCircle,
  TrendingDown,
  Link2,
  Plus,
  Trash2,
  RotateCcw,
} from 'lucide-react';

import { ecommerceApi, productsApi, billingApi, setTenantSlug } from '@/lib/api/tenant.api';
import type { Product } from '@/types';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface EcommerceConfig {
  store_name?: string;
  store_description?: string;
  store_url?: string;
  contact_email?: string;
  contact_phone?: string;
  is_active: boolean;
  banner_url?: string;
  primary_color?: string;
}

interface EcommerceProduct {
  id: number;
  product_id: number;
  product?: Product;
  enabled: boolean;
  display_order?: number;
}

// ─── Zod schema ───────────────────────────────────────────────────────────────

const configSchema = z.object({
  store_name: z.string().min(2, 'Mínimo 2 caracteres'),
  store_description: z.string().optional(),
  store_url: z.string().optional(),
  contact_email: z.string().email('Email inválido').optional().or(z.literal('')),
  contact_phone: z.string().optional(),
  primary_color: z.string().optional(),
  is_active: z.boolean(),
});

type ConfigForm = z.infer<typeof configSchema>;

// ─── Helpers ─────────────────────────────────────────────────────────────────

const formatCurrency = (n: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);

// ─── Store Config Tab ─────────────────────────────────────────────────────────

interface ConfigTabProps { slug: string }

function ConfigTab({ slug }: ConfigTabProps) {
  const qc = useQueryClient();

  const { data: config, isLoading } = useQuery({
    queryKey: ['ecommerce-config', slug],
    queryFn: () => ecommerceApi.getConfig().then((r) => r.data as EcommerceConfig),
  });

  const { register, handleSubmit, reset, formState: { errors, isDirty, isSubmitting } } =
    useForm<ConfigForm>({ resolver: zodResolver(configSchema) });

  useEffect(() => {
    if (config) reset({
      store_name: config.store_name ?? '',
      store_description: config.store_description ?? '',
      store_url: config.store_url ?? '',
      contact_email: config.contact_email ?? '',
      contact_phone: config.contact_phone ?? '',
      primary_color: config.primary_color ?? '#6366f1',
      is_active: config.is_active ?? false,
    });
  }, [config, reset]);

  const saveMutation = useMutation({
    mutationFn: (data: ConfigForm) => ecommerceApi.updateConfig(data),
    onSuccess: () => {
      notify.success('Configuración guardada');
      qc.invalidateQueries({ queryKey: ['ecommerce-config', slug] });
    },
    onError: (err) => notify.error(err, 'Error al guardar'),
  });

  if (isLoading) return (
    <div className="space-y-4 max-w-2xl">
      {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
    </div>
  );

  return (
    <form onSubmit={handleSubmit((d) => saveMutation.mutate(d))} className="space-y-6 max-w-2xl">
      {/* Status banner */}
      <div className={`flex items-center justify-between rounded-lg border px-4 py-3 ${config?.is_active ? 'border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 dark:border-emerald-900' : 'border-border bg-muted/40'}`}>
        <div>
          <p className="text-sm font-medium">
            Tienda en línea {config?.is_active ? 'activa' : 'inactiva'}
          </p>
          {config?.store_url && (
            <a
              href={config.store_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary hover:underline flex items-center gap-1"
            >
              {config.store_url}
              <ExternalLink className="size-3" />
            </a>
          )}
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" className="sr-only" {...register('is_active')} />
          {config?.is_active
            ? <ToggleRight className="size-8 text-emerald-600" />
            : <ToggleLeft className="size-8 text-muted-foreground" />}
        </label>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Nombre de la tienda *</Label>
          <Input {...register('store_name')} placeholder="Mi Tienda Online" />
          {errors.store_name && <p className="text-xs text-destructive">{errors.store_name.message}</p>}
        </div>

        <div className="space-y-1.5">
          <Label>URL de la tienda</Label>
          <Input {...register('store_url')} placeholder="https://mitienda.com" />
        </div>

        <div className="sm:col-span-2 space-y-1.5">
          <Label>Descripción</Label>
          <textarea
            {...register('store_description')}
            placeholder="Describe tu tienda online..."
            className="min-h-[80px] w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </div>

        <div className="space-y-1.5">
          <Label>Email de contacto</Label>
          <Input type="email" {...register('contact_email')} placeholder="ventas@mitienda.com" />
          {errors.contact_email && <p className="text-xs text-destructive">{errors.contact_email.message}</p>}
        </div>

        <div className="space-y-1.5">
          <Label>Teléfono de contacto</Label>
          <Input {...register('contact_phone')} placeholder="+57 300 000 0000" />
        </div>

        <div className="space-y-1.5">
          <Label>Color principal</Label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              {...register('primary_color')}
              className="h-9 w-16 cursor-pointer rounded-md border border-input bg-transparent p-1"
            />
            <Input {...register('primary_color')} placeholder="#6366f1" className="font-mono" />
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={!isDirty || isSubmitting || saveMutation.isPending} className="gap-2">
          <Save className="size-4" />
          {isSubmitting || saveMutation.isPending ? 'Guardando...' : 'Guardar cambios'}
        </Button>
      </div>
    </form>
  );
}

// ─── Catalog Tab ──────────────────────────────────────────────────────────────

interface CatalogTabProps { slug: string }

function CatalogTab({ slug }: CatalogTabProps) {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'enabled' | 'disabled'>('all');

  // Load all products
  const { data: productsData, isLoading: loadingProducts } = useQuery({
    queryKey: ['products', slug],
    queryFn: () => productsApi.list({ per_page: 500 }).then((r) => r.data),
  });

  // Load ecommerce product statuses
  const { data: ecomProducts, isLoading: loadingEcom } = useQuery({
    queryKey: ['ecommerce-products', slug],
    queryFn: () => ecommerceApi.listProducts().then((r) => {
      const list = (r.data as { data?: EcommerceProduct[] }).data ?? (r.data as EcommerceProduct[]) ?? [];
      // Build a map: product_id → enabled
      const map: Record<number, boolean> = {};
      list.forEach((ep) => { map[ep.product_id] = ep.enabled; });
      return map;
    }),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) =>
      ecommerceApi.toggleProduct(id, enabled),
    onSuccess: (_, { enabled }) => {
      qc.invalidateQueries({ queryKey: ['ecommerce-products', slug] });
      notify.success(enabled ? 'Producto habilitado en tienda' : 'Producto ocultado de tienda');
    },
    onError: (err) => notify.error(err, 'Error al cambiar estado'),
  });

  const allProducts: Product[] = productsData?.data ?? [];
  const enabledMap = ecomProducts ?? {};

  const filtered = allProducts.filter((p) => {
    const matchSearch = !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.sku.toLowerCase().includes(search.toLowerCase());
    const isEnabled = enabledMap[p.id] ?? false;
    const matchFilter =
      filter === 'all' || (filter === 'enabled' && isEnabled) || (filter === 'disabled' && !isEnabled);
    return matchSearch && matchFilter && p.is_active;
  });

  const enabledCount = allProducts.filter((p) => enabledMap[p.id]).length;
  const isLoading = loadingProducts || loadingEcom;

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total productos', value: allProducts.length, color: 'text-foreground' },
          { label: 'En tienda', value: enabledCount, color: 'text-emerald-600' },
          { label: 'Ocultos', value: allProducts.length - enabledCount, color: 'text-muted-foreground' },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="pt-4 pb-3">
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Buscar producto o SKU..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-1">
          {(['all', 'enabled', 'disabled'] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                filter === f
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border text-muted-foreground hover:bg-muted'
              }`}
            >
              {f === 'all' ? 'Todos' : f === 'enabled' ? 'En tienda' : 'Ocultos'}
            </button>
          ))}
        </div>
      </div>

      {/* Product list */}
      <div className="space-y-2">
        {isLoading
          ? Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-2xl" />)
          : filtered.length === 0
          ? (
              <div className="flex flex-col items-center justify-center py-14 gap-3 text-muted-foreground">
                <div className="size-14 rounded-full bg-muted flex items-center justify-center">
                  <Package className="size-7 opacity-40" />
                </div>
                <p className="font-medium">No se encontraron productos</p>
              </div>
            )
          : filtered.map((product) => {
              const enabled = enabledMap[product.id] ?? false;
              const isPending = toggleMutation.isPending && toggleMutation.variables?.id === product.id;
              return (
                <div key={product.id} className="rounded-2xl border bg-card p-4 flex items-center gap-4 hover:shadow-sm hover:border-primary/20 transition-all">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{product.name}</p>
                    {product.category?.name && <p className="text-xs text-muted-foreground">{product.category.name}</p>}
                  </div>
                  <span className="hidden sm:block font-mono text-xs text-muted-foreground">{product.sku}</span>
                  <span className="font-mono text-sm tabular-nums">{formatCurrency(product.price)}</span>
                  <div className="hidden sm:block">
                    {product.stock <= 0
                      ? <Badge variant="destructive" className="text-[10px]">Sin stock</Badge>
                      : product.stock <= product.min_stock
                      ? <Badge variant="secondary" className="text-[10px]">{product.stock}</Badge>
                      : <span className="text-sm tabular-nums">{product.stock}</span>}
                  </div>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => toggleMutation.mutate({ id: product.id, enabled: !enabled })}
                    className={`inline-flex items-center justify-center size-8 rounded-full transition-colors ${
                      enabled
                        ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400'
                        : 'bg-muted text-muted-foreground hover:bg-muted/80'
                    } disabled:opacity-50`}
                    title={enabled ? 'Ocultar de tienda' : 'Mostrar en tienda'}
                  >
                    {enabled ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                  </button>
                </div>
              );
            })}
      </div>
    </div>
  );
}

// ─── Orders Tab ───────────────────────────────────────────────────────────────

interface StoreOrder {
  id: number; order_number: string; status: string;
  customer_name: string; customer_email?: string; customer_phone?: string;
  total: number; payment_method?: string; created_at: string;
}

const ORDER_STATUS_LABEL: Record<string, string> = {
  pending: 'Pendiente', confirmed: 'Confirmado', processing: 'Procesando',
  shipped: 'Enviado', delivered: 'Entregado', cancelled: 'Cancelado',
};
const ORDER_STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'outline'> = {
  pending: 'secondary', confirmed: 'default', processing: 'default',
  shipped: 'default', delivered: 'default', cancelled: 'outline',
};

function OrdersTab({ slug }: { slug: string }) {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('all');

  const { data: orders = [], isLoading } = useQuery<StoreOrder[]>({
    queryKey: ['store-orders', slug, statusFilter],
    queryFn: async () => {
      const r = await ecommerceApi.orders({ status: statusFilter !== 'all' ? statusFilter : undefined });
      return (r.data as { data?: StoreOrder[] }).data ?? (r.data as StoreOrder[]) ?? [];
    },
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      ecommerceApi.updateOrderStatus(id, status),
    onSuccess: () => { notify.success('Estado actualizado'); qc.invalidateQueries({ queryKey: ['store-orders', slug] }); },
    onError: (err) => notify.error(err, 'Error al actualizar'),
  });

  const NEXT_STATUS: Record<string, string> = {
    pending: 'confirmed', confirmed: 'processing', processing: 'shipped', shipped: 'delivered',
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        {(['all', 'pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'] as const).map((s) => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
              statusFilter === s ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:bg-muted'
            }`}>
            {s === 'all' ? 'Todos' : ORDER_STATUS_LABEL[s]}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {isLoading
          ? Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-2xl" />)
          : orders.length === 0
          ? (
              <div className="flex flex-col items-center justify-center py-14 gap-3 text-muted-foreground">
                <div className="size-14 rounded-full bg-muted flex items-center justify-center">
                  <ShoppingCart className="size-7 opacity-40" />
                </div>
                <p className="font-medium">No hay órdenes</p>
              </div>
            )
          : orders.map((order) => {
              const next = NEXT_STATUS[order.status];
              return (
                <div key={order.id} className="rounded-2xl border bg-card p-4 flex items-center gap-4 hover:shadow-sm hover:border-primary/20 transition-all">
                  <span className="font-mono text-xs font-medium w-28">{order.order_number}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{order.customer_name}</p>
                    {order.customer_email && <p className="text-xs text-muted-foreground hidden sm:block">{order.customer_email}</p>}
                  </div>
                  <Badge variant={ORDER_STATUS_VARIANT[order.status] ?? 'outline'}>
                    {ORDER_STATUS_LABEL[order.status] ?? order.status}
                  </Badge>
                  <span className="font-mono font-medium hidden sm:block">{formatCurrency(order.total)}</span>
                  <span className="text-xs text-muted-foreground hidden md:block">
                    {new Date(order.created_at).toLocaleDateString('es-CO')}
                  </span>
                  {next && (
                    <Button variant="outline" size="sm" className="gap-1 h-7 text-xs"
                      disabled={updateStatus.isPending}
                      onClick={() => updateStatus.mutate({ id: order.id, status: next })}>
                      <RefreshCw className="size-3" />{ORDER_STATUS_LABEL[next]}
                    </Button>
                  )}
                </div>
              );
            })}
      </div>
    </div>
  );
}

// ─── Abandoned Carts Tab ──────────────────────────────────────────────────────

function AbandonedCartsTab({ slug }: { slug: string }) {
  const qc = useQueryClient();
  const fmtCOP = (v: number) => `$${Number(v).toLocaleString('es-CO', { minimumFractionDigits: 0 })}`;
  const fmtDate = (d: string) => new Date(d).toLocaleDateString('es-CO');

  const statsQ = useQuery({
    queryKey: [slug, 'abandoned-carts-stats'],
    queryFn: () => ecommerceApi.abandonedCartsStats(),
  });

  const listQ = useQuery({
    queryKey: [slug, 'abandoned-carts'],
    queryFn: () => ecommerceApi.abandonedCarts({ status: 'abandoned' }),
  });

  const stats = statsQ.data as {
    total: number; abandoned: number; recovered: number;
    revenue: number; potentialRevenue: number; recoveryRate: number;
  } | undefined;

  const carts = ((listQ.data as { data?: unknown[] })?.data ?? []) as {
    id: number; customer_email: string | null; customer_name: string | null;
    total: number; items_count: number; status: string;
    created_at: string; reminders_sent: number;
  }[];

  function inv() {
    qc.invalidateQueries({ queryKey: [slug, 'abandoned-carts'] });
    qc.invalidateQueries({ queryKey: [slug, 'abandoned-carts-stats'] });
  }

  const remindMut = useMutation({
    mutationFn: (id: number) => ecommerceApi.sendAbandonedCartReminder(id),
    onSuccess: () => { notify.success('Recordatorio enviado'); inv(); },
  });
  const lostMut = useMutation({
    mutationFn: (id: number) => ecommerceApi.markAbandonedCartLost(id),
    onSuccess: () => { notify.success('Marcado como perdido'); inv(); },
  });

  return (
    <div className="space-y-4">
      {/* KPI */}
      {stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: 'Total carritos',    value: stats.total,                             color: '' },
            { label: 'Abandonados',       value: stats.abandoned,                         color: 'text-yellow-600' },
            { label: 'Recuperados',       value: `${stats.recovered} (${stats.recoveryRate}%)`, color: 'text-green-600' },
            { label: 'Ingresos perdidos', value: fmtCOP(stats.potentialRevenue),          color: 'text-red-600' },
          ].map(({ label, value, color }) => (
            <div key={label} className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className={`text-lg font-bold ${color}`}>{String(value)}</p>
            </div>
          ))}
        </div>
      )}

      {/* Table */}
      {listQ.isPending ? (
        <div className="h-48 bg-muted animate-pulse rounded" />
      ) : carts.length === 0 ? (
        <div className="py-14 text-center text-muted-foreground">
          <ShoppingBag className="mx-auto size-8 mb-2 opacity-30" />
          <p>Sin carritos abandonados</p>
        </div>
      ) : (
        <div className="space-y-2">
          {carts.map((cart) => (
            <div key={cart.id} className="rounded-2xl border bg-card p-4 flex items-center gap-4 hover:shadow-sm hover:border-primary/20 transition-all">
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{cart.customer_name ?? '—'}</p>
                <p className="text-xs text-muted-foreground hidden sm:block">{cart.customer_email ?? '—'}</p>
              </div>
              <span className="text-xs text-muted-foreground hidden sm:block">{cart.items_count} ítems</span>
              <span className="font-semibold font-mono text-sm">{fmtCOP(cart.total)}</span>
              <span className="text-xs text-muted-foreground hidden md:block">{fmtDate(cart.created_at)}</span>
              {cart.reminders_sent > 0
                ? <span className="text-xs text-blue-600">{cart.reminders_sent} env.</span>
                : <span className="text-xs text-muted-foreground">0 recordatorios</span>
              }
              <div className="flex gap-1">
                {cart.customer_email && (
                  <button
                    onClick={() => remindMut.mutate(cart.id)}
                    disabled={remindMut.isPending}
                    className="p-1 rounded hover:bg-blue-100 text-blue-600"
                    title="Enviar recordatorio"
                  >
                    <Mail className="size-3.5" />
                  </button>
                )}
                <button
                  onClick={() => lostMut.mutate(cart.id)}
                  disabled={lostMut.isPending}
                  className="p-1 rounded hover:bg-red-100 text-red-500"
                  title="Marcar como perdido"
                >
                  <XCircle className="size-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Marketplace Integrations Tab ─────────────────────────────────────────────

function IntegrationsTab({ slug }: { slug: string }) {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [platform, setPlatform] = useState('shopify');
  const [name, setName]         = useState('');
  const [shopUrl, setShopUrl]   = useState('');
  const [apiKey, setApiKey]     = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [whSecret, setWhSecret] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const listQ = useQuery({
    queryKey: [slug, 'marketplace-integrations'],
    queryFn: () => ecommerceApi.marketplaceIntegrations(),
  });

  const logsQ = useQuery({
    queryKey: [slug, 'marketplace-logs', selectedId],
    queryFn: () => ecommerceApi.integrationLogs(selectedId!),
    enabled: selectedId !== null,
  });

  const integrations = (listQ.data as unknown[]) ?? [];
  const logs = ((logsQ.data as { data?: unknown[] })?.data ?? []) as {
    id: number; event_type: string; external_id: string | null;
    status: string; error_message: string | null; created_at: string;
  }[];

  function inv() { qc.invalidateQueries({ queryKey: [slug, 'marketplace-integrations'] }); }

  const createMut = useMutation({
    mutationFn: () => ecommerceApi.createIntegration({
      platform, name, shop_url: shopUrl || undefined,
      api_key: apiKey || undefined, api_secret: apiSecret || undefined,
      webhook_secret: whSecret || undefined,
      sync_orders: true, sync_products: false, sync_inventory: false,
    }),
    onSuccess: () => { notify.success('Integración creada'); setCreating(false); inv(); },
    onError: () => notify.error('Error al crear integración'),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => ecommerceApi.deleteIntegration(id),
    onSuccess: () => { notify.success('Integración eliminada'); inv(); },
  });

  const replayMut = useMutation({
    mutationFn: ({ integrationId, logId }: { integrationId: number; logId: number }) =>
      ecommerceApi.replayWebhook(integrationId, logId),
    onSuccess: () => {
      notify.success('Webhook reprocesado');
      qc.invalidateQueries({ queryKey: [slug, 'marketplace-logs', selectedId] });
    },
  });

  const currentSlug = slug;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Conecta tu tienda con marketplaces externos para importar pedidos automáticamente.</p>
        <Button size="sm" onClick={() => setCreating(true)}><Plus className="size-3.5 mr-1" />Nueva Integración</Button>
      </div>

      {/* Create form */}
      {creating && (
        <div className="rounded-lg border p-4 space-y-3 bg-muted/20">
          <p className="font-semibold text-sm">Nueva integración</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><label className="text-xs">Plataforma</label>
              <select className="w-full h-8 rounded border text-xs px-2" value={platform} onChange={(e) => setPlatform(e.target.value)}>
                <option value="shopify">Shopify</option>
                <option value="woocommerce">WooCommerce</option>
                <option value="mercadolibre">MercadoLibre</option>
              </select>
            </div>
            <div className="space-y-1"><label className="text-xs">Nombre</label>
              <input className="w-full h-8 rounded border text-xs px-2" value={name} onChange={(e) => setName(e.target.value)} placeholder="Mi tienda Shopify" /></div>
            <div className="space-y-1"><label className="text-xs">URL tienda</label>
              <input className="w-full h-8 rounded border text-xs px-2" value={shopUrl} onChange={(e) => setShopUrl(e.target.value)} placeholder="https://mi-tienda.myshopify.com" /></div>
            <div className="space-y-1"><label className="text-xs">API Key</label>
              <input className="w-full h-8 rounded border text-xs px-2" value={apiKey} onChange={(e) => setApiKey(e.target.value)} /></div>
            <div className="space-y-1"><label className="text-xs">API Secret</label>
              <input type="password" className="w-full h-8 rounded border text-xs px-2" value={apiSecret} onChange={(e) => setApiSecret(e.target.value)} /></div>
            <div className="space-y-1"><label className="text-xs">Webhook Secret</label>
              <input type="password" className="w-full h-8 rounded border text-xs px-2" value={whSecret} onChange={(e) => setWhSecret(e.target.value)} /></div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => createMut.mutate()} disabled={createMut.isPending || !name}>
              {createMut.isPending ? 'Guardando…' : 'Guardar'}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setCreating(false)}>Cancelar</Button>
          </div>
        </div>
      )}

      {/* Integration cards */}
      {listQ.isPending ? <div className="h-24 bg-muted animate-pulse rounded" /> : integrations.length === 0 ? (
        <div className="py-10 text-center text-muted-foreground">
          <Link2 className="mx-auto size-8 mb-2 opacity-30" />
          <p>Sin integraciones configuradas</p>
        </div>
      ) : (
        <div className="space-y-2">
          {(integrations as {
            id: number; platform: string; name: string; shop_url: string | null;
            status: string; last_sync_at: string | null; last_error: string | null;
          }[]).map((intg) => (
            <div key={intg.id} className="rounded-lg border p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Link2 className="size-4 text-muted-foreground" />
                  <div>
                    <p className="font-medium text-sm">{intg.name}</p>
                    <p className="text-xs text-muted-foreground">{intg.platform} {intg.shop_url ? `— ${intg.shop_url}` : ''}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-medium ${intg.status === 'active' ? 'text-green-600' : 'text-muted-foreground'}`}>
                    {intg.status}
                  </span>
                  {intg.last_sync_at && (
                    <span className="text-xs text-muted-foreground">
                      Última sync: {new Date(intg.last_sync_at).toLocaleString('es-CO')}
                    </span>
                  )}
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setSelectedId(intg.id === selectedId ? null : intg.id)}>
                    Logs
                  </Button>
                  <Button size="icon" variant="ghost" className="size-7 text-destructive"
                    onClick={() => { if (confirm('¿Eliminar integración?')) deleteMut.mutate(intg.id); }}>
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
              {intg.last_error && (
                <p className="text-xs text-destructive mt-1">Error: {intg.last_error}</p>
              )}

              {/* Webhook URL hint */}
              <div className="mt-2 text-xs text-muted-foreground bg-muted rounded px-2 py-1 font-mono">
                Webhook URL: …/api/webhooks/{intg.platform}/{intg.id}
              </div>

              {/* Logs */}
              {selectedId === intg.id && (
                <div className="mt-3 border-t pt-3">
                  <p className="text-xs font-semibold text-muted-foreground mb-2">WEBHOOK LOGS</p>
                  {logsQ.isPending ? <div className="h-16 bg-muted animate-pulse rounded" /> : logs.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Sin logs</p>
                  ) : (
                    <div className="space-y-1">
                      {logs.map((log) => (
                        <div key={log.id} className="flex items-center gap-2 text-xs">
                          <span className={`w-16 shrink-0 font-medium ${log.status === 'processed' ? 'text-green-600' : log.status === 'failed' ? 'text-red-600' : 'text-muted-foreground'}`}>
                            {log.status}
                          </span>
                          <span className="text-muted-foreground">{log.event_type}</span>
                          <span className="text-muted-foreground">{log.external_id ?? '—'}</span>
                          <span className="text-muted-foreground">{new Date(log.created_at).toLocaleString('es-CO')}</span>
                          {log.error_message && <span className="text-red-500 truncate">{log.error_message}</span>}
                          {log.status === 'failed' && (
                            <button className="ml-auto text-blue-600 hover:underline"
                              onClick={() => replayMut.mutate({ integrationId: intg.id, logId: log.id })}>
                              <RotateCcw className="size-3" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

const TABS = [
  { key: 'orders', label: 'Órdenes', icon: ShoppingCart },
  { key: 'catalog', label: 'Catálogo', icon: Package },
  { key: 'abandoned', label: 'Carritos abandonados', icon: TrendingDown },
  { key: 'integrations', label: 'Integraciones', icon: Link2 },
  { key: 'config', label: 'Configuración', icon: Store },
] as const;

function EcommerceAddonPaywall({ addonId }: { addonId: number | null }) {
  const requestMutation = useMutation({
    mutationFn: () => {
      if (!addonId) return Promise.reject(new Error('Add-on no disponible.'));
      return billingApi.requestAddon(addonId);
    },
    onSuccess: () => notify.success('Solicitud enviada. El equipo de Atlas ERP la procesará pronto.'),
    onError: (err: any) => notify.error(err?.response?.data?.message ?? 'Error al enviar la solicitud.'),
  });

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center px-4">
      <div className="size-20 rounded-full bg-blue-50 dark:bg-blue-950/30 flex items-center justify-center">
        <Lock className="size-9 text-blue-500" />
      </div>
      <div className="space-y-2 max-w-md">
        <h2 className="text-2xl font-bold tracking-tight">Tienda en Línea</h2>
        <p className="text-muted-foreground">
          Este módulo es un <span className="font-semibold text-foreground">add-on de pago</span>.
          Publica tu catálogo en línea, recibe pedidos y gestiona envíos directamente desde Atlas ERP.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-lg text-left">
        {[
          'Catálogo de productos en línea',
          'Gestión de pedidos y estados',
          'Configuración de tienda personalizada',
          'Publicación/despublicación de productos',
          'Seguimiento de envíos',
          'Integración con inventario en tiempo real',
        ].map((feature) => (
          <div key={feature} className="flex items-center gap-2 text-sm">
            <CheckCircle2 className="size-4 text-green-500 shrink-0" />
            <span>{feature}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-col items-center gap-3">
        <div className="text-3xl font-bold">
          $25.000<span className="text-base font-normal text-muted-foreground">/mes</span>
        </div>
        <Button
          size="lg"
          className="gap-2 px-8"
          onClick={() => requestMutation.mutate()}
          disabled={!addonId || requestMutation.isPending || requestMutation.isSuccess}
        >
          <Zap className="size-4" />
          {requestMutation.isSuccess
            ? 'Solicitud enviada'
            : requestMutation.isPending
              ? 'Enviando solicitud…'
              : 'Solicitar add-on'}
        </Button>
        <p className="text-xs text-muted-foreground">
          Un asesor se comunicará contigo para activar el servicio.
        </p>
      </div>
    </div>
  );
}

export default function EcommercePage() {
  const params = useParams();
  const slug = params.slug as string;
  const [tab, setTab] = useState<'orders' | 'catalog' | 'abandoned' | 'integrations' | 'config'>('orders');

  useEffect(() => {
    if (slug) setTenantSlug(slug);
  }, [slug]);

  const { data: billingData, isLoading: loadingAddon } = useQuery({
    queryKey: ['billing-addons', slug],
    queryFn: () => billingApi.addons().then((r) => r.data),
  });
  const ecommerceAddon = (billingData as any)?.available?.find((a: any) => a.module_key === 'ecommerce');
  const hasAddon = ecommerceAddon?.is_owned;

  if (loadingAddon) {
    return (
      <div className="flex flex-col gap-4 p-6">
        <div className="h-8 w-64 bg-muted animate-pulse rounded" />
        <div className="h-48 bg-muted animate-pulse rounded-lg" />
      </div>
    );
  }

  if (!hasAddon) {
    return <EcommerceAddonPaywall addonId={ecommerceAddon?.id ?? null} />;
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">E-commerce</h1>
          <p className="text-sm text-muted-foreground">
            Gestiona tu tienda en línea y catálogo de productos
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Globe className="size-5 text-muted-foreground" />
        </div>
      </div>

      {/* Tab nav */}
      <div className="flex gap-1 border-b">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon className="size-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'orders'       && <OrdersTab slug={slug} />}
      {tab === 'catalog'      && <CatalogTab slug={slug} />}
      {tab === 'abandoned'    && <AbandonedCartsTab slug={slug} />}
      {tab === 'integrations' && <IntegrationsTab slug={slug} />}
      {tab === 'config'       && <ConfigTab slug={slug} />}
    </div>
  );
}
