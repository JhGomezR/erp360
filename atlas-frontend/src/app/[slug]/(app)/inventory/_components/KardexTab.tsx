'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Search,
  TrendingUp,
  TrendingDown,
  ArrowLeftRight,
  History,
} from 'lucide-react';

import { kardexApi, productsApi } from '@/lib/api/tenant.api';

import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// ─── Types ────────────────────────────────────────────────────────────────────

interface KardexRow {
  id: number;
  product_id: number;
  type: string;
  quantity: number;
  balance_stock: number;
  notes: string;
  reference_type: string;
  created_at: string;
  product?: { name: string };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TYPE_META: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  in:         { label: 'Entrada',  color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400', icon: <TrendingUp  className="size-3.5" /> },
  out:        { label: 'Salida',   color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',             icon: <TrendingDown className="size-3.5" /> },
  adjustment: { label: 'Ajuste',   color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',     icon: <ArrowLeftRight className="size-3.5" /> },
};

function typeMeta(type: string) {
  return TYPE_META[type] ?? { label: type, color: 'bg-muted text-muted-foreground', icon: null };
}

const formatDate = (iso: string) =>
  new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(iso));

// ─── Component ────────────────────────────────────────────────────────────────

export function KardexTab({ slug }: { slug: string }) {
  const [productId, setProductId] = useState<string>('all');
  const [search, setSearch]       = useState('');
  const [page, setPage]           = useState(1);

  // Product list for the filter selector
  const { data: productsData } = useQuery({
    queryKey: ['products', slug, 'for-filter'],
    queryFn: () => productsApi.list({ per_page: 200 }).then((r) => r.data),
    staleTime: 60_000,
  });

  // Kardex entries
  const { data, isLoading } = useQuery({
    queryKey: ['kardex', slug, productId, page],
    queryFn: () =>
      kardexApi
        .list({
          product_id: productId !== 'all' ? Number(productId) : undefined,
          page,
          per_page: 30,
        })
        .then((r) => r.data),
    staleTime: 15_000,
  });

  const rows: KardexRow[] = (data as any)?.data ?? [];
  const lastPage: number  = (data as any)?.last_page ?? 1;

  // Client-side search filter (by product name or notes)
  const filtered = search.trim()
    ? rows.filter(
        (r) =>
          r.product?.name?.toLowerCase().includes(search.toLowerCase()) ||
          r.notes?.toLowerCase().includes(search.toLowerCase()),
      )
    : rows;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Buscar por producto o nota…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <Select
          value={productId}
          onValueChange={(v) => { setProductId(v ?? 'all'); setPage(1); }}
        >
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Todos los productos" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los productos</SelectItem>
            {productsData?.data?.map((p: { id: number; name: string }) => (
              <SelectItem key={p.id} value={String(p.id)}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-muted-foreground text-xs uppercase">
            <tr>
              <th className="px-4 py-3 text-left">Producto</th>
              <th className="px-4 py-3 text-left">Tipo</th>
              <th className="px-4 py-3 text-right">Cantidad</th>
              <th className="px-4 py-3 text-right">Saldo</th>
              <th className="px-4 py-3 text-left">Referencia</th>
              <th className="px-4 py-3 text-left">Nota</th>
              <th className="px-4 py-3 text-left">Fecha</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading &&
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 7 }).map((__, j) => (
                    <td key={j} className="px-4 py-3">
                      <Skeleton className="h-4 w-full" />
                    </td>
                  ))}
                </tr>
              ))}

            {!isLoading && filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                  <History className="mx-auto mb-2 size-8 opacity-30" />
                  No hay movimientos registrados
                </td>
              </tr>
            )}

            {!isLoading &&
              filtered.map((row) => {
                const meta = typeMeta(row.type);
                return (
                  <tr key={row.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-medium">
                      {row.product?.name ?? `#${row.product_id}`}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${meta.color}`}
                      >
                        {meta.icon}
                        {meta.label}
                      </span>
                    </td>
                    <td className={`px-4 py-3 text-right font-mono font-semibold ${
                      row.quantity > 0
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-red-600 dark:text-red-400'
                    }`}>
                      {row.quantity > 0 ? '+' : ''}{row.quantity}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-muted-foreground">
                      {row.balance_stock}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {row.reference_type ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground max-w-[200px] truncate">
                      {row.notes || '—'}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                      {formatDate(row.created_at)}
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {lastPage > 1 && (
        <div className="flex items-center justify-end gap-2 text-sm">
          <button
            className="px-3 py-1.5 rounded-md border hover:bg-muted disabled:opacity-40"
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Anterior
          </button>
          <span className="text-muted-foreground">
            Página {page} de {lastPage}
          </span>
          <button
            className="px-3 py-1.5 rounded-md border hover:bg-muted disabled:opacity-40"
            disabled={page === lastPage}
            onClick={() => setPage((p) => p + 1)}
          >
            Siguiente
          </button>
        </div>
      )}
    </div>
  );
}
