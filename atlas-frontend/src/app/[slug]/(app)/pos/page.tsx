'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notify } from '@/lib/notify';
import {
  Search,
  Package,
  ShoppingCart,
  Trash2,
  Plus,
  Minus,
  X,
  Clock,
  Eye,
  Ban,
  FileText,
  RotateCcw,
  WifiOff,
  Wifi,
  RefreshCw,
  Lock,
  Store,
  DollarSign,
  CheckCircle2,
  Banknote,
  CreditCard,
  ArrowLeftRight,
  Smartphone,
} from 'lucide-react';

import { productsApi, categoriesApi, posApi, billingApi, fractionsApi, cashApi, setTenantSlug } from '@/lib/api/tenant.api';
import {
  enqueue as offlineEnqueue,
  syncQueue as offlineSync,
  pendingCount as offlinePending,
  clearSynced as offlineClearSynced,
  type OfflineSalePayload,
} from '@/lib/pos-offline';
import { useCartStore } from '@/store/cartStore';
import type { Product, Category, Sale } from '@/types';
import { SaleReceiptDialog } from '@/components/shared/SaleReceiptDialog';
import { SaleInvoiceDialog } from '@/components/shared/SaleInvoiceDialog';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCurrency(value: number) {
  return `$${value.toLocaleString('es-CO')}`;
}

function formatDateTime(date: Date) {
  return date.toLocaleString('es-CO', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

// ─── Product Card ──────────────────────────────────────────────────────────────

interface ProductCardProps {
  product: Product;
  onAdd: (product: Product) => void;
  added: boolean;
}

function ProductCard({ product, onAdd, added }: ProductCardProps) {
  const outOfStock = product.stock <= 0;
  const lowStock = !outOfStock && product.stock <= product.min_stock;

  return (
    <button
      type="button"
      disabled={outOfStock}
      onClick={() => onAdd(product)}
      className={[
        'flex flex-col rounded-lg border bg-card text-card-foreground text-left transition-all duration-150 overflow-hidden',
        outOfStock ? 'opacity-50 cursor-not-allowed' : 'hover:shadow-md hover:border-primary/50 cursor-pointer',
        added ? 'ring-2 ring-primary scale-95' : '',
      ].join(' ')}
    >
      {/* Image placeholder */}
      <div className="aspect-square w-full bg-muted flex items-center justify-center">
        <Package className="size-8 text-muted-foreground" />
      </div>

      {/* Info */}
      <div className="p-2 flex flex-col gap-1 flex-1">
        <p className="text-xs font-medium leading-tight line-clamp-2">{product.name}</p>
        <p className="text-sm font-bold text-primary">{formatCurrency(product.price)}</p>
        <div className="mt-auto pt-1 flex flex-wrap gap-1">
          {product.is_fraction && (
            <Badge className="text-[10px] px-1 py-0 bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400 border-0">
              Fracc.
            </Badge>
          )}
          {outOfStock ? (
            <Badge variant="destructive" className="text-[10px] px-1 py-0">Sin stock</Badge>
          ) : lowStock ? (
            <Badge variant="secondary" className="text-[10px] px-1 py-0">Bajo stock</Badge>
          ) : null}
        </div>
      </div>
    </button>
  );
}

// ─── Skeleton Card ─────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="flex flex-col rounded-lg border bg-card overflow-hidden">
      <Skeleton className="aspect-square w-full" />
      <div className="p-2 flex flex-col gap-2">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-2/3" />
        <Skeleton className="h-5 w-1/2 mt-1" />
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function PosPage() {
  const params = useParams();
  const slug = params.slug as string;
  const queryClient = useQueryClient();
  const router = useRouter();

  // Sync tenant slug for API calls
  useEffect(() => {
    if (slug) setTenantSlug(slug);
  }, [slug]);

  // ── State ──
  const [now, setNow] = useState(() => new Date());
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [discount, setDiscount] = useState('');
  const [notes, setNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [amountPaid, setAmountPaid] = useState('');
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [recentlyAdded, setRecentlyAdded] = useState<Set<number>>(new Set());
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const [receiptSale, setReceiptSale] = useState<Sale | null>(null);
  const [invoiceSale, setInvoiceSale] = useState<Sale | null>(null);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [returnSaleId, setReturnSaleId] = useState<number | null>(null);
  const [returnItems, setReturnItems] = useState<{ sale_item_id: number; product_name?: string; quantity: number; max_qty: number }[]>([]);
  const [returnReason, setReturnReason] = useState('');
  const [returnNotes, setReturnNotes] = useState('');

  // ── Offline mode ──
  const [isOnline, setIsOnline] = useState(true);
  const [offlineQueue, setOfflineQueue] = useState(0);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setIsOnline(navigator.onLine);
    setOfflineQueue(offlinePending(slug));

    const handleOnline  = () => { setIsOnline(true);  };
    const handleOffline = () => { setIsOnline(false); };

    window.addEventListener('online',  handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online',  handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [slug]);

  // Auto-sync when connectivity is restored
  useEffect(() => {
    if (isOnline && offlinePending(slug) > 0 && !syncing) {
      handleSyncQueue();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline]);

  async function handleSyncQueue() {
    const pending = offlinePending(slug);
    if (pending === 0) return;
    setSyncing(true);
    notify.success(`Sincronizando ${pending} venta(s) pendiente(s)…`);
    try {
      const { synced, failed } = await offlineSync(
        slug,
        (payload) => posApi.createSale(payload as Parameters<typeof posApi.createSale>[0]) as Promise<{ data: { code: string } }>,
      );
      offlineClearSynced(slug);
      setOfflineQueue(offlinePending(slug));
      if (synced > 0) {
        notify.success(`${synced} venta(s) sincronizada(s) correctamente.`);
        queryClient.invalidateQueries({ queryKey: ['pos-products', slug] });
        queryClient.invalidateQueries({ queryKey: ['dashboard-summary', slug] });
      }
      if (failed > 0) {
        notify.error(`${failed} venta(s) fallaron al sincronizar.`);
      }
    } finally {
      setSyncing(false);
    }
  }

  // ── Clock ──
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  // ── Cart ──
  const { items, addItem, removeItem, updateQuantity, clearCart, subtotal, itemCount } =
    useCartStore();

  const discountValue = parseFloat(discount) || 0;
  const subtotalValue = subtotal();
  const taxableBase = Math.max(0, subtotalValue - discountValue);
  const totalValue = taxableBase; // taxes are calculated per-product on the backend

  // ── Queries ──
  const { data: productsData, isLoading: productsLoading } = useQuery({
    queryKey: ['pos-products', slug],
    queryFn: async () => {
      const res = await productsApi.list({ per_page: 500 });
      return res.data;
    },
    staleTime: 1000 * 60 * 5,
  });

  const { data: categories } = useQuery({
    queryKey: ['pos-categories', slug],
    queryFn: async () => {
      const res = await categoriesApi.list();
      return res.data as Category[];
    },
    staleTime: 1000 * 60 * 10,
  });

  // ── Cash register ──
  const [openCashName, setOpenCashName] = useState('Caja Principal');
  const [openCashAmount, setOpenCashAmount] = useState('');
  const [openCashNotes, setOpenCashNotes] = useState('');
  const [openingCash, setOpeningCash] = useState(false);

  const { data: cashData, isLoading: cashLoading, refetch: refetchCash } = useQuery({
    queryKey: ['cash-current', slug],
    queryFn: async () => {
      try {
        const r = await cashApi.current();
        return (r as any).data as any;
      } catch {
        return null;
      }
    },
    staleTime: 30_000,
    retry: false,
  });

  const activeCash = cashData?.status === 'open' ? cashData : null;

  async function handleOpenCash() {
    if (!openCashName.trim()) return;
    setOpeningCash(true);
    try {
      await cashApi.open({
        name: openCashName.trim(),
        opening_amount: parseFloat(openCashAmount) || 0,
        notes: openCashNotes.trim() || undefined,
      });
      notify.success('Caja abierta. ¡Listo para vender!');
      refetchCash();
    } catch (err) {
      notify.error(err, 'Error al abrir caja');
    } finally {
      setOpeningCash(false);
    }
  }

  // ── Fractions addon check ──
  const { data: addonsData } = useQuery({
    queryKey: ['billing-addons', slug],
    queryFn: async () => {
      const r = await billingApi.addons();
      const body = r.data as { available?: any[] } | any[];
      return (Array.isArray(body) ? body : body?.available) ?? [];
    },
    staleTime: 5 * 60_000,
  });
  const addonsArray: any[] = Array.isArray(addonsData) ? addonsData : [];
  const hasFractionsAddon =
    addonsArray.find((a: any) => a.module_key === 'fractions')?.pivot?.status === 'approved';

  // ── Fractions query (only when addon active) ──
  const { data: fractionsData } = useQuery({
    queryKey: ['pos-fractions', slug],
    queryFn: () => fractionsApi.search('').then((r) => r.data),
    staleTime: 1000 * 60 * 5,
    enabled: hasFractionsAddon,
  });

  // ── Client-side filter ──
  const products: Product[] = productsData?.data ?? [];
  const fractions: Product[] = fractionsData ?? [];

  // Merge regular products + fractions (fractions appear at the end)
  const allProducts: Product[] = hasFractionsAddon ? [...products, ...fractions] : products;

  const filteredProducts = allProducts.filter((p: Product) => {
    const matchesSearch =
      !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.sku ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (p.barcode && p.barcode.toLowerCase().includes(search.toLowerCase()));
    const matchesCategory =
      !selectedCategory || (!p.is_fraction && p.category_id === selectedCategory);
    return matchesSearch && matchesCategory && p.is_active;
  });

  // ── Add to cart with feedback ──
  const handleAddItem = useCallback(
    (product: Product) => {
      addItem(product);
      setRecentlyAdded((prev) => new Set(prev).add(product.id));
      setTimeout(() => {
        setRecentlyAdded((prev) => {
          const next = new Set(prev);
          next.delete(product.id);
          return next;
        });
      }, 400);
    },
    [addItem]
  );

  // Store info is fetched inside SaleInvoiceDialog using the slug prop.

  // ── Barcode scanner (HID keyboard emulation) ──
  // Scanners fire keystrokes very rapidly (< 50 ms apart) and end with Enter.
  useEffect(() => {
    let buffer = '';
    let lastTime = 0;
    let allFast = true;

    const onKeyDown = (e: KeyboardEvent) => {
      const now = Date.now();
      const gap = now - lastTime;

      if (e.key === 'Enter') {
        if (buffer.length >= 3 && allFast) {
          const barcode = buffer;
          const found = allProducts.find((p: Product) => p.barcode === barcode);
          if (found) {
            handleAddItem(found);
            notify.success(`Escaneado: ${found.name}`);
          } else {
            notify.error(`Código no encontrado: ${barcode}`);
          }
        }
        buffer = '';
        lastTime = 0;
        allFast = true;
        return;
      }

      if (e.key.length === 1) {
        if (lastTime !== 0 && gap > 50) {
          allFast = false;
        }
        if (lastTime !== 0 && gap > 300) {
          // Too slow — this is a new sequence, reset
          buffer = '';
          allFast = true;
        }
        buffer += e.key;
        lastTime = now;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [allProducts, handleAddItem]);

  // ── Sales history query ──
  const { data: historyData, isLoading: historyLoading } = useQuery({
    queryKey: ['sales-history', slug, historyPage],
    queryFn: () => posApi.sales({ page: historyPage, per_page: 15 }),
    enabled: historyOpen,
  });

  const historySales: Sale[] = (historyData as any)?.data?.data ?? [];
  const historyLastPage = (historyData as any)?.data?.last_page ?? 1;

  // ── Cancel sale ──
  const cancelMutation = useMutation({
    mutationFn: (id: number) => posApi.cancelSale(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales-history', slug] });
      notify.success('Venta cancelada correctamente');
    },
    onError: (err) => notify.error(err, 'Error al cancelar la venta'),
  });

  // ── Return sale mutation ──
  const createReturnMutation = useMutation({
    mutationFn: (data: unknown) => posApi.createReturn(data),
    onSuccess: () => {
      notify.success('Devolución registrada');
      setReturnSaleId(null);
      setReturnItems([]);
      setReturnReason('');
      setReturnNotes('');
    },
    onError: (err) => notify.error(err, 'Error al registrar la devolución'),
  });

  function openReturnForSale(sale: Sale) {
    setReturnSaleId(sale.id);
    setReturnItems(
      ((sale as any).items ?? []).map((i: any) => ({
        sale_item_id: i.id,
        product_name: i.product_name ?? i.product?.name,
        quantity: i.quantity,
        max_qty: i.quantity,
      }))
    );
    setReturnReason('');
    setReturnNotes('');
  }

  // ── Create sale mutation ──
  const salePayload = () => ({
    items: items.map((i) => ({
      product_id: i.product.is_fraction
        ? (i.product.base_product_id ?? i.product.id)
        : i.product.id,
      fraction_id: i.product.is_fraction ? i.product.fraction_id : undefined,
      quantity: i.quantity,
      unit_price: i.unit_price,
    })),
    payment_method: paymentMethod,
    amount_paid: paymentMethod === 'cash' && amountPaid ? Number(amountPaid) : undefined,
    discount: discountValue > 0 ? discountValue : undefined,
    notes: notes.trim() || undefined,
  });

  const createSaleMutation = useMutation({
    mutationFn: () => {
      const payload = salePayload();
      // If offline, enqueue and resolve immediately
      if (!isOnline) {
        const entry = offlineEnqueue(slug, payload as OfflineSalePayload);
        setOfflineQueue(offlinePending(slug));
        return Promise.resolve({ data: { code: `OFFLINE-${entry.id.slice(-6).toUpperCase()}` } } as { data: { code: string } });
      }
      return posApi.createSale(payload);
    },
    onSuccess: (res) => {
      const sale = res.data as { code: string };
      if (!isOnline) {
        notify.success(`Venta guardada offline — se sincronizará al recuperar conexión. (${sale.code})`);
      } else {
        notify.success(`Venta completada — Código: ${sale.code}`);
        queryClient.invalidateQueries({ queryKey: ['pos-products', slug] });
        queryClient.invalidateQueries({ queryKey: ['dashboard-summary', slug] });
      }
      clearCart();
      setDiscount('');
      setNotes('');
      setPaymentMethod('cash');
      setAmountPaid('');
      setCheckoutOpen(false);
    },
    onError: () => {
      notify.error('Error al registrar la venta. Inténtalo de nuevo.');
    },
  });

  const cartCount = itemCount();

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────

  // ── Blocking screen: no open cash register ──
  if (cashLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-72 gap-4 text-muted-foreground">
        <div className="size-10 rounded-full border-4 border-primary/30 border-t-primary animate-spin" />
        <p className="text-sm">Verificando estado de caja…</p>
      </div>
    );
  }

  if (!activeCash) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] gap-0">
        {/* Card */}
        <div className="w-full max-w-md rounded-2xl border bg-card shadow-sm overflow-hidden">
          {/* Header */}
          <div className="bg-primary/5 border-b px-6 py-5 flex items-center gap-3">
            <div className="size-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Lock className="size-5 text-primary" />
            </div>
            <div>
              <h2 className="font-bold text-base">Abre tu turno</h2>
              <p className="text-xs text-muted-foreground">Debes abrir caja antes de registrar ventas</p>
            </div>
          </div>

          {/* Form */}
          <div className="px-6 py-5 flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cash-name" className="text-xs font-medium">
                Nombre de caja
              </Label>
              <div className="relative">
                <Store className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <input
                  id="cash-name"
                  type="text"
                  value={openCashName}
                  onChange={(e) => setOpenCashName(e.target.value)}
                  placeholder="Ej. Caja Principal"
                  className="w-full pl-9 pr-3 h-9 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cash-amount" className="text-xs font-medium">
                Monto de apertura <span className="text-muted-foreground font-normal">(opcional)</span>
              </Label>
              <div className="relative">
                <DollarSign className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <input
                  id="cash-amount"
                  type="number"
                  min="0"
                  value={openCashAmount}
                  onChange={(e) => setOpenCashAmount(e.target.value)}
                  placeholder="0"
                  className="w-full pl-9 pr-3 h-9 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cash-notes" className="text-xs font-medium">
                Observaciones <span className="text-muted-foreground font-normal">(opcional)</span>
              </Label>
              <input
                id="cash-notes"
                type="text"
                value={openCashNotes}
                onChange={(e) => setOpenCashNotes(e.target.value)}
                placeholder="Notas de apertura…"
                className="w-full px-3 h-9 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>

            <Button
              className="w-full mt-1"
              onClick={handleOpenCash}
              disabled={openingCash || !openCashName.trim()}
            >
              {openingCash ? (
                <span className="flex items-center gap-2">
                  <RefreshCw className="size-4 animate-spin" />
                  Abriendo caja…
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="size-4" />
                  Abrir turno
                </span>
              )}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Break out of the layout's padding: -m-4 sm:-m-6, then fill height */}
      <div className="-m-4 sm:-m-6 h-[calc(100vh-8rem)] flex flex-row overflow-hidden">

        {/* ── LEFT PANEL: Product Browser ────────────────────────────────────── */}
        <div className="flex-1 flex flex-col overflow-hidden p-4 gap-4">

          {/* Title bar */}
          <div className="flex items-center justify-between gap-2 flex-shrink-0">
            <div>
              <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2 flex-wrap">
                Punto de Venta
                {/* Active cash badge */}
                {activeCash && (
                  <span className="flex items-center gap-1 text-xs font-normal text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-700">
                    <CheckCircle2 className="size-3" />
                    {activeCash.name}
                    {activeCash.opening_amount != null && (
                      <span className="ml-0.5 opacity-70">· {formatCurrency(Number(activeCash.opening_amount))}</span>
                    )}
                  </span>
                )}
                {!isOnline && (
                  <span className="flex items-center gap-1 text-xs font-normal text-orange-600 bg-orange-50 border border-orange-200 rounded px-1.5 py-0.5">
                    <WifiOff className="size-3" />
                    Sin conexión
                    {offlineQueue > 0 && <span className="ml-1 font-semibold">{offlineQueue} pendiente(s)</span>}
                  </span>
                )}
                {isOnline && offlineQueue > 0 && (
                  <button
                    type="button"
                    onClick={() => handleSyncQueue()}
                    disabled={syncing}
                    className="flex items-center gap-1 text-xs font-normal text-blue-600 bg-blue-50 border border-blue-200 rounded px-1.5 py-0.5 hover:bg-blue-100"
                  >
                    {syncing ? <RefreshCw className="size-3 animate-spin" /> : <Wifi className="size-3" />}
                    {syncing ? 'Sincronizando…' : `Sync ${offlineQueue} venta(s)`}
                  </button>
                )}
              </h1>
              <p className="text-xs text-muted-foreground">{formatDateTime(now)}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => router.push(`/${slug}/returns`)}
                className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium border border-border hover:bg-muted transition-colors"
              >
                <RotateCcw className="size-3.5" />
                Devoluciones
              </button>
              <button
                type="button"
                onClick={() => setHistoryOpen(true)}
                className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium border border-border hover:bg-muted transition-colors"
              >
                <Clock className="size-3.5" />
                Historial
              </button>
            </div>
          </div>

          {/* Search */}
          <div className="relative flex-shrink-0">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Buscar producto o SKU..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Category filter */}
          <div className="flex gap-2 overflow-x-auto pb-1 flex-shrink-0 scrollbar-none">
            <button
              type="button"
              onClick={() => setSelectedCategory(null)}
              className={[
                'flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors',
                selectedCategory === null
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background text-foreground border-border hover:bg-muted',
              ].join(' ')}
            >
              Todos
            </button>
            {categories?.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategory(cat.id === selectedCategory ? null : cat.id)}
                className={[
                  'flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors',
                  selectedCategory === cat.id
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background text-foreground border-border hover:bg-muted',
                ].join(' ')}
              >
                {cat.name}
              </button>
            ))}
          </div>

          {/* Product grid */}
          <div className="flex-1 overflow-y-auto">
            {productsLoading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {Array.from({ length: 12 }).map((_, i) => (
                  <SkeletonCard key={i} />
                ))}
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 gap-2 text-muted-foreground">
                <Package className="size-10" />
                <p className="text-sm">No se encontraron productos</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {filteredProducts.map((product: Product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    onAdd={handleAddItem}
                    added={recentlyAdded.has(product.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT PANEL: Cart ───────────────────────────────────────────────── */}
        <div className="w-80 xl:w-96 flex flex-col border-l bg-card">

          {/* Cart header */}
          <div className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0">
            <div className="flex items-center gap-2">
              <ShoppingCart className="size-4" />
              <span className="font-semibold text-sm">Carrito</span>
              {cartCount > 0 && (
                <Badge variant="secondary" className="text-xs px-1.5 py-0">
                  {cartCount}
                </Badge>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={clearCart}
              disabled={items.length === 0}
              title="Vaciar carrito"
            >
              <Trash2 className="size-3.5 text-muted-foreground" />
            </Button>
          </div>

          {/* Cart items list */}
          <div className="flex-1 overflow-y-auto">
            {items.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground p-4">
                <ShoppingCart className="size-10 opacity-40" />
                <p className="text-sm text-center">El carrito está vacío</p>
              </div>
            ) : (
              <ul className="divide-y">
                {items.map((item) => (
                  <li key={item.product.id} className="flex flex-col gap-1.5 px-3 py-2.5">
                    {/* Name + remove */}
                    <div className="flex items-start justify-between gap-1">
                      <span className="text-xs font-medium leading-tight truncate flex-1">
                        {item.product.name}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-5 flex-shrink-0 -mt-0.5"
                        onClick={() => removeItem(item.product.id)}
                      >
                        <X className="size-3" />
                      </Button>
                    </div>

                    {/* Price per unit */}
                    <p className="text-xs text-muted-foreground">
                      {formatCurrency(item.unit_price)} / u
                    </p>

                    {/* Quantity controls + subtotal */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="icon"
                          className="size-6"
                          onClick={() => updateQuantity(item.product.id, item.quantity - 1)}
                        >
                          <Minus className="size-3" />
                        </Button>
                        <span className="w-7 text-center text-sm tabular-nums select-none">
                          {item.quantity}
                        </span>
                        <Button
                          variant="outline"
                          size="icon"
                          className="size-6"
                          onClick={() => updateQuantity(item.product.id, item.quantity + 1)}
                          disabled={item.quantity >= item.product.stock}
                        >
                          <Plus className="size-3" />
                        </Button>
                      </div>
                      <span className="text-sm font-medium tabular-nums">
                        {formatCurrency(item.subtotal)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Cart footer */}
          <div className="flex-shrink-0 border-t">
            <div className="px-4 pt-3 pb-2 flex flex-col gap-2">

              {/* Subtotal */}
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="tabular-nums">{formatCurrency(subtotalValue)}</span>
              </div>

              {/* Discount */}
              <div className="flex items-center gap-2">
                <Label htmlFor="discount" className="text-xs text-muted-foreground whitespace-nowrap">
                  Descuento
                </Label>
                <div className="relative flex-1">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
                  <Input
                    id="discount"
                    type="number"
                    min="0"
                    placeholder="0"
                    value={discount}
                    onChange={(e) => setDiscount(e.target.value)}
                    className="pl-5 h-7 text-xs"
                  />
                </div>
              </div>

              <Separator />

              {/* Total */}
              <div className="flex justify-between items-center">
                <span className="font-semibold">Total</span>
                <span className="text-lg font-bold tabular-nums">{formatCurrency(totalValue)}</span>
              </div>

              {/* Payment method */}
              <div className="flex flex-col gap-2">
                <Label className="text-xs text-muted-foreground">Método de pago</Label>
                <div className="grid grid-cols-4 gap-1.5">
                  {([
                    { value: 'cash',     label: 'Efectivo',      Icon: Banknote },
                    { value: 'card',     label: 'Tarjeta',       Icon: CreditCard },
                    { value: 'transfer', label: 'Transferencia', Icon: ArrowLeftRight },
                    { value: 'nequi',    label: 'Nequi',         Icon: Smartphone },
                  ] as const).map(({ value, label, Icon }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setPaymentMethod(value)}
                      className={`flex flex-col items-center gap-1 py-2 px-1 rounded-xl border-2 transition-all text-[10px] font-medium leading-tight
                        ${paymentMethod === value
                          ? 'border-primary bg-primary/5 text-primary'
                          : 'border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground'}`}
                    >
                      <Icon className="w-4 h-4 flex-shrink-0" />
                      <span className="text-center">{label}</span>
                    </button>
                  ))}
                </div>

                {/* Efectivo recibido + devuelta */}
                {paymentMethod === 'cash' && (
                  <div className="flex flex-col gap-1 mt-0.5">
                    <div className="relative">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
                      <Input
                        type="number"
                        min={0}
                        placeholder={String(totalValue)}
                        value={amountPaid}
                        onChange={(e) => setAmountPaid(e.target.value)}
                        className="pl-5 h-8 text-sm tabular-nums"
                      />
                    </div>
                    {Number(amountPaid) > 0 && (
                      <div className={`flex justify-between text-xs font-semibold px-1 ${Number(amountPaid) >= totalValue ? 'text-emerald-600' : 'text-destructive'}`}>
                        <span>{Number(amountPaid) >= totalValue ? 'Devuelta' : 'Falta'}</span>
                        <span>{formatCurrency(Math.abs(Number(amountPaid) - totalValue))}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Notes */}
              <Input
                placeholder="Observaciones..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="h-7 text-xs"
              />

              {/* Checkout button */}
              <Button
                className="w-full mt-1"
                size="default"
                disabled={items.length === 0}
                onClick={() => setCheckoutOpen(true)}
              >
                Cobrar {items.length > 0 ? formatCurrency(totalValue) : ''}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Checkout Dialog ─────────────────────────────────────────────────── */}
      <Dialog open={checkoutOpen} onOpenChange={setCheckoutOpen}>
        <DialogContent className="sm:max-w-md" showCloseButton={!createSaleMutation.isPending}>
          <DialogHeader>
            <DialogTitle>Confirmar venta</DialogTitle>
          </DialogHeader>

          {/* Summary */}
          <div className="flex flex-col gap-3 text-sm">
            {/* Items list */}
            <div className="max-h-48 overflow-y-auto flex flex-col gap-1.5">
              {items.map((item) => (
                <div key={item.product.id} className="flex justify-between gap-2">
                  <span className="text-muted-foreground truncate flex-1">
                    {item.quantity}× {item.product.name}
                  </span>
                  <span className="tabular-nums flex-shrink-0">{formatCurrency(item.subtotal)}</span>
                </div>
              ))}
            </div>

            <Separator />

            {/* Subtotal */}
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal</span>
              <span className="tabular-nums">{formatCurrency(subtotalValue)}</span>
            </div>

            {/* Discount */}
            {discountValue > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>Descuento</span>
                <span className="tabular-nums text-destructive">−{formatCurrency(discountValue)}</span>
              </div>
            )}

            {/* Total */}
            <div className="flex justify-between font-bold text-base">
              <span>Total</span>
              <span className="tabular-nums">{formatCurrency(totalValue)}</span>
            </div>

            {/* Payment method */}
            <div className="flex justify-between text-muted-foreground">
              <span>Método de pago</span>
              <span>
                {paymentMethod === 'cash' ? 'Efectivo'
                  : paymentMethod === 'card' ? 'Tarjeta'
                  : paymentMethod === 'nequi' ? 'Nequi'
                  : 'Transferencia'}
              </span>
            </div>

            {/* Efectivo recibido + devuelta */}
            {paymentMethod === 'cash' && Number(amountPaid) > 0 && (
              <>
                <div className="flex justify-between text-muted-foreground">
                  <span>Recibido</span>
                  <span className="tabular-nums">{formatCurrency(Number(amountPaid))}</span>
                </div>
                <div className={`flex justify-between font-semibold ${Number(amountPaid) >= totalValue ? 'text-emerald-600' : 'text-destructive'}`}>
                  <span>{Number(amountPaid) >= totalValue ? 'Devuelta' : 'Falta'}</span>
                  <span className="tabular-nums">{formatCurrency(Math.abs(Number(amountPaid) - totalValue))}</span>
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCheckoutOpen(false)}
              disabled={createSaleMutation.isPending}
            >
              Cancelar
            </Button>
            <Button
              onClick={() => createSaleMutation.mutate()}
              disabled={createSaleMutation.isPending}
            >
              {createSaleMutation.isPending ? 'Procesando...' : 'Confirmar venta'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Sales History Sheet ─────────────────────────────────────────────── */}
      <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
        <SheetContent className="w-full sm:max-w-2xl flex flex-col gap-0 p-0">
          <SheetHeader className="px-6 py-4 border-b">
            <SheetTitle className="flex items-center gap-2">
              <Clock className="size-4" />
              Historial de Ventas
            </SheetTitle>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-background border-b">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Código</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Fecha</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Estado</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Total</th>
                  <th className="px-4 py-3 text-center font-medium text-muted-foreground">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {historyLoading &&
                  Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="border-b">
                      <td className="px-4 py-3"><Skeleton className="h-4 w-20" /></td>
                      <td className="px-4 py-3"><Skeleton className="h-4 w-28" /></td>
                      <td className="px-4 py-3"><Skeleton className="h-5 w-20" /></td>
                      <td className="px-4 py-3 text-right"><Skeleton className="h-4 w-16 ml-auto" /></td>
                      <td className="px-4 py-3"><Skeleton className="h-7 w-16 mx-auto" /></td>
                    </tr>
                  ))}
                {!historyLoading && historySales.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">
                      Sin ventas registradas
                    </td>
                  </tr>
                )}
                {!historyLoading &&
                  historySales.map((sale) => (
                    <tr key={sale.id} className="border-b hover:bg-muted/30">
                      <td className="px-4 py-3 font-mono text-xs font-semibold">{sale.code}</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">
                        {new Date(sale.created_at).toLocaleString('es-CO', {
                          dateStyle: 'short', timeStyle: 'short',
                        })}
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant={
                            sale.status === 'completed' ? 'default'
                            : sale.status === 'cancelled' ? 'destructive'
                            : 'secondary'
                          }
                        >
                          {sale.status === 'completed' ? 'Completada'
                           : sale.status === 'cancelled' ? 'Cancelada'
                           : 'Pendiente'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums">
                        {formatCurrency(sale.total)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            title="Ver ticket"
                            onClick={() => setReceiptSale(sale)}
                            className="p-1.5 rounded hover:bg-muted transition-colors"
                          >
                            <Eye className="size-4 text-muted-foreground" />
                          </button>
                          <button
                            type="button"
                            title="Ver factura"
                            onClick={() => { setInvoiceSale(sale); setInvoiceOpen(true); }}
                            className="p-1.5 rounded hover:bg-muted transition-colors"
                          >
                            <FileText className="size-4 text-muted-foreground" />
                          </button>
                          {sale.status === 'completed' && (
                            <>
                              <button
                                type="button"
                                title="Registrar devolución"
                                onClick={() => openReturnForSale(sale)}
                                className="p-1.5 rounded hover:bg-muted transition-colors"
                              >
                                <RotateCcw className="size-4 text-muted-foreground" />
                              </button>
                              <button
                                type="button"
                                title="Cancelar venta"
                                disabled={cancelMutation.isPending}
                                onClick={() => {
                                  if (window.confirm(`¿Cancelar la venta ${sale.code}? Esta acción no se puede deshacer.`)) {
                                    cancelMutation.mutate(sale.id);
                                  }
                                }}
                                className="p-1.5 rounded hover:bg-destructive/10 transition-colors"
                              >
                                <Ban className="size-4 text-destructive" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {historyLastPage > 1 && (
            <div className="border-t px-6 py-3 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                Página {historyPage} de {historyLastPage}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                  disabled={historyPage === 1}
                  className="rounded border px-3 py-1 text-xs hover:bg-muted disabled:opacity-40"
                >
                  Anterior
                </button>
                <button
                  type="button"
                  onClick={() => setHistoryPage((p) => Math.min(historyLastPage, p + 1))}
                  disabled={historyPage === historyLastPage}
                  className="rounded border px-3 py-1 text-xs hover:bg-muted disabled:opacity-40"
                >
                  Siguiente
                </button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* ── Return Dialog ──────────────────────────────────────────────────── */}
      <Dialog open={returnSaleId !== null} onOpenChange={(v) => { if (!v) setReturnSaleId(null); }}>
        <DialogContent className="sm:max-w-md max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="size-4" />
              Devolución — Venta #{returnSaleId}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            {returnItems.length > 0 ? (
              <div className="flex flex-col gap-2">
                <Label className="text-xs font-semibold text-muted-foreground uppercase">Ítems</Label>
                {returnItems.map((item, idx) => (
                  <div key={item.sale_item_id} className="flex items-center gap-3 text-sm">
                    <p className="flex-1 truncate">{item.product_name ?? `Ítem #${item.sale_item_id}`}</p>
                    <p className="text-xs text-muted-foreground shrink-0">máx: {item.max_qty}</p>
                    <Input
                      type="number"
                      min={0}
                      max={item.max_qty}
                      value={item.quantity}
                      onChange={(e) => {
                        const val = Math.min(Math.max(0, parseFloat(e.target.value) || 0), item.max_qty);
                        setReturnItems((prev) => prev.map((it, i) => i === idx ? { ...it, quantity: val } : it));
                      }}
                      className="w-20 h-8 text-sm"
                    />
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                La venta no tiene ítems cargados. Puedes ir a{' '}
                <button
                  type="button"
                  className="underline"
                  onClick={() => { setReturnSaleId(null); router.push(`/${slug}/returns`); }}
                >
                  Devoluciones
                </button>{' '}
                para registrarla manualmente.
              </p>
            )}
            <div className="flex flex-col gap-1.5">
              <Label>Motivo <span className="text-destructive">*</span></Label>
              <Select value={returnReason} onValueChange={setReturnReason}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar motivo..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="defective">Producto defectuoso</SelectItem>
                  <SelectItem value="wrong_product">Producto incorrecto</SelectItem>
                  <SelectItem value="customer_request">Solicitud del cliente</SelectItem>
                  <SelectItem value="billing_error">Error de facturación</SelectItem>
                  <SelectItem value="other">Otro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Notas (opcional)</Label>
              <Input
                placeholder="Observaciones..."
                value={returnNotes}
                onChange={(e) => setReturnNotes(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReturnSaleId(null)} disabled={createReturnMutation.isPending}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                if (!returnReason) { notify.error('Selecciona un motivo'); return; }
                const filtered = returnItems.filter((it) => it.quantity > 0);
                if (filtered.length === 0) { notify.error('Indica al menos un ítem con cantidad > 0'); return; }
                createReturnMutation.mutate({
                  sale_id: returnSaleId,
                  reason: returnReason,
                  notes: returnNotes || undefined,
                  items: filtered.map(({ sale_item_id, quantity }) => ({ sale_item_id, quantity })),
                });
              }}
              disabled={createReturnMutation.isPending}
            >
              {createReturnMutation.isPending ? 'Registrando...' : 'Registrar devolución'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Sale Receipt Dialog ─────────────────────────────────────────────── */}
      <SaleReceiptDialog
        sale={receiptSale}
        open={!!receiptSale}
        onOpenChange={(v) => { if (!v) setReceiptSale(null); }}
      />

      {/* ── Sale Invoice Dialog ─────────────────────────────────────────────── */}
      <SaleInvoiceDialog
        sale={invoiceSale}
        open={invoiceOpen}
        onOpenChange={(v) => { setInvoiceOpen(v); if (!v) setInvoiceSale(null); }}
        slug={slug}
      />
    </>
  );
}
