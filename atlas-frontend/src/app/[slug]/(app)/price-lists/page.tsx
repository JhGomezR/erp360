'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notify } from '@/lib/notify';
import {
  Plus, Pencil, Trash2, Star, Search, X, Save,
  Tags, ChevronRight, PackageSearch,
} from 'lucide-react';

import {
  priceListsApi, productsApi,
  type PriceList, type PriceListItem,
} from '@/lib/api/tenant.api';
import type { Product } from '@/types';

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
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);

// ─── Create / Edit list dialog ────────────────────────────────────────────────

interface ListDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  list: PriceList | null;
  slug: string;
}

function ListDialog({ open, onOpenChange, list, slug }: ListDialogProps) {
  const qc = useQueryClient();
  const isEdit = Boolean(list);

  const [name, setName]           = useState(list?.name ?? '');
  const [description, setDesc]    = useState(list?.description ?? '');
  const [isDefault, setIsDefault] = useState(list?.is_default ?? false);
  const [isActive, setIsActive]   = useState(list?.is_active ?? true);

  // Reset when dialog opens
  const handleOpenChange = (v: boolean) => {
    if (v) {
      setName(list?.name ?? '');
      setDesc(list?.description ?? '');
      setIsDefault(list?.is_default ?? false);
      setIsActive(list?.is_active ?? true);
    }
    onOpenChange(v);
  };

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = { name, description: description || undefined, is_default: isDefault, is_active: isActive };
      return isEdit
        ? priceListsApi.update(list!.id, payload)
        : priceListsApi.create(payload);
    },
    onSuccess: () => {
      notify.success(isEdit ? 'Lista actualizada' : 'Lista creada');
      qc.invalidateQueries({ queryKey: ['price-lists', slug] });
      onOpenChange(false);
    },
    onError: (err) => notify.error(err, 'Error al guardar la lista'),
  });

  const canSave = name.trim().length >= 2;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar lista de precios' : 'Nueva lista de precios'}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Nombre *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Precio mayorista, Precio VIP…"
              autoFocus
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Descripción</Label>
            <Input
              value={description}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="Opcional"
            />
          </div>

          <div className="flex flex-col gap-2.5">
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input
                type="checkbox"
                checked={isDefault}
                onChange={(e) => setIsDefault(e.target.checked)}
                className="size-4 rounded accent-primary"
              />
              Lista por defecto
              <span className="text-xs text-muted-foreground">(se aplica a todos los clientes sin lista asignada)</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="size-4 rounded accent-primary"
              />
              Lista activa
            </label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            disabled={!canSave || saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
          >
            {saveMutation.isPending ? 'Guardando…' : 'Guardar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Add item row (inline inside the detail sheet) ────────────────────────────

interface AddItemRowProps {
  listId: number;
  slug: string;
  existingProductIds: number[];
  onDone: () => void;
}

function AddItemRow({ listId, slug, existingProductIds, onDone }: AddItemRowProps) {
  const qc = useQueryClient();
  const [search, setSearch]       = useState('');
  const [selected, setSelected]   = useState<Product | null>(null);
  const [price, setPrice]         = useState('');
  const [minQty, setMinQty]       = useState('1');
  const [showResults, setShowResults] = useState(false);

  const { data: productsData } = useQuery({
    queryKey: ['products-for-pricelist', slug],
    queryFn: () => productsApi.list({ per_page: 500 }).then((r) => r.data),
    staleTime: 60_000,
  });

  const allProducts: Product[] = productsData?.data ?? [];

  const results = search.length >= 2
    ? allProducts
        .filter((p) =>
          !existingProductIds.includes(p.id) &&
          (p.name.toLowerCase().includes(search.toLowerCase()) ||
            p.sku.toLowerCase().includes(search.toLowerCase()))
        )
        .slice(0, 8)
    : [];

  const saveMutation = useMutation({
    mutationFn: () =>
      priceListsApi.syncItems(listId, [{
        product_id: selected!.id,
        price: Number(price),
        min_quantity: Number(minQty) || 1,
      }]),
    onSuccess: () => {
      notify.success('Precio agregado');
      qc.invalidateQueries({ queryKey: ['price-list-detail', slug, listId] });
      onDone();
    },
    onError: (err) => notify.error(err, 'Error al agregar precio'),
  });

  const isValid = selected && Number(price) >= 0 && Number(minQty) >= 1;

  return (
    <tr className="bg-primary/5 border-t-2 border-primary/20">
      {/* Product search */}
      <td className="px-2 py-2" colSpan={1}>
        <div className="relative">
          {selected ? (
            <div className="flex items-center gap-1.5 h-7 px-2 rounded-md border bg-background text-sm">
              <span className="flex-1 truncate">{selected.name}</span>
              <button type="button" onClick={() => { setSelected(null); setSearch(''); }}>
                <X className="size-3.5 text-muted-foreground" />
              </button>
            </div>
          ) : (
            <>
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
              <Input
                value={search}
                onChange={(e) => { setSearch(e.target.value); setShowResults(true); }}
                onFocus={() => setShowResults(true)}
                onBlur={() => setTimeout(() => setShowResults(false), 150)}
                placeholder="Buscar producto…"
                className="h-7 text-sm pl-7"
                autoFocus
              />
              {showResults && results.length > 0 && (
                <div className="absolute top-full left-0 right-0 z-50 mt-1 rounded-md border bg-popover shadow-md overflow-hidden">
                  {results.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-accent text-left"
                      onMouseDown={() => {
                        setSelected(p);
                        setSearch(p.name);
                        setPrice(String(p.price));
                        setShowResults(false);
                      }}
                    >
                      <span className="flex-1">{p.name}</span>
                      <span className="text-muted-foreground font-mono">{p.sku}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </td>

      {/* Min qty */}
      <td className="px-2 py-2 w-24">
        <Input
          type="number"
          min={1}
          step={1}
          value={minQty}
          onChange={(e) => setMinQty(e.target.value)}
          className="h-7 text-sm w-full"
          placeholder="1"
        />
      </td>

      {/* Price */}
      <td className="px-2 py-2 w-32">
        <Input
          type="number"
          min={0}
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          className="h-7 text-sm w-full"
          placeholder="0"
        />
      </td>

      {/* Actions */}
      <td className="px-2 py-2 w-20">
        <div className="flex items-center gap-1 justify-end">
          <Button
            size="sm"
            className="h-7 text-xs gap-1"
            disabled={!isValid || saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
          >
            <Save className="size-3.5" />
            OK
          </Button>
          <Button size="icon" variant="ghost" className="size-7" onClick={onDone}>
            <X className="size-3.5" />
          </Button>
        </div>
      </td>
    </tr>
  );
}

// ─── Editable price row ────────────────────────────────────────────────────────

interface ItemRowProps {
  item: PriceListItem;
  listId: number;
  slug: string;
}

function ItemRow({ item, listId, slug }: ItemRowProps) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [price, setPrice]     = useState(String(item.price));
  const [minQty, setMinQty]   = useState(String(item.min_quantity));

  const updateMutation = useMutation({
    mutationFn: () =>
      priceListsApi.syncItems(listId, [{
        product_id: item.product_id,
        price: Number(price),
        min_quantity: Number(minQty) || 1,
      }]),
    onSuccess: () => {
      notify.success('Precio actualizado');
      qc.invalidateQueries({ queryKey: ['price-list-detail', slug, listId] });
      setEditing(false);
    },
    onError: (err) => notify.error(err, 'Error al actualizar'),
  });

  const deleteMutation = useMutation({
    mutationFn: () => priceListsApi.removeItem(listId, item.id),
    onSuccess: () => {
      notify.success('Precio eliminado');
      qc.invalidateQueries({ queryKey: ['price-list-detail', slug, listId] });
    },
    onError: (err) => notify.error(err, 'Error al eliminar'),
  });

  if (!editing) {
    return (
      <tr className="hover:bg-muted/30 transition-colors">
        <td className="px-3 py-2">
          <p className="text-sm font-medium">{item.product?.name ?? `Producto #${item.product_id}`}</p>
          <p className="text-xs text-muted-foreground font-mono">{item.product?.sku}</p>
        </td>
        <td className="px-3 py-2 text-sm text-center text-muted-foreground">≥ {item.min_quantity}</td>
        <td className="px-3 py-2 text-sm font-semibold text-right">{fmt(item.price)}</td>
        <td className="px-3 py-2">
          <div className="flex items-center justify-end gap-1">
            <Button size="icon" variant="ghost" className="size-7" onClick={() => setEditing(true)}>
              <Pencil className="size-3.5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="size-7"
              disabled={deleteMutation.isPending}
              onClick={() => {
                if (window.confirm(`¿Eliminar precio de "${item.product?.name}"?`)) {
                  deleteMutation.mutate();
                }
              }}
            >
              <Trash2 className="size-3.5 text-destructive" />
            </Button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="bg-muted/20">
      <td className="px-3 py-2">
        <p className="text-sm font-medium">{item.product?.name ?? `Producto #${item.product_id}`}</p>
      </td>
      <td className="px-2 py-2 w-24">
        <Input
          type="number"
          min={1}
          value={minQty}
          onChange={(e) => setMinQty(e.target.value)}
          className="h-7 text-sm w-full"
        />
      </td>
      <td className="px-2 py-2 w-32">
        <Input
          type="number"
          min={0}
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          className="h-7 text-sm w-full"
          autoFocus
        />
      </td>
      <td className="px-2 py-2">
        <div className="flex items-center justify-end gap-1">
          <Button
            size="icon"
            variant="ghost"
            className="size-7"
            disabled={updateMutation.isPending}
            onClick={() => updateMutation.mutate()}
          >
            <Save className="size-3.5" />
          </Button>
          <Button size="icon" variant="ghost" className="size-7" onClick={() => setEditing(false)}>
            <X className="size-3.5" />
          </Button>
        </div>
      </td>
    </tr>
  );
}

// ─── Detail Sheet ─────────────────────────────────────────────────────────────

interface DetailSheetProps {
  listId: number | null;
  slug: string;
  onClose: () => void;
  onEdit: (list: PriceList) => void;
}

function DetailSheet({ listId, slug, onClose, onEdit }: DetailSheetProps) {
  const qc = useQueryClient();
  const [addingItem, setAddingItem] = useState(false);
  const [itemSearch, setItemSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['price-list-detail', slug, listId],
    queryFn: () => priceListsApi.show(listId!).then((r) => r.data),
    enabled: listId !== null,
  });

  const list = data as PriceList | undefined;
  const items: PriceListItem[] = list?.items ?? [];

  const filteredItems = itemSearch
    ? items.filter((i) =>
        i.product?.name?.toLowerCase().includes(itemSearch.toLowerCase()) ||
        i.product?.sku?.toLowerCase().includes(itemSearch.toLowerCase())
      )
    : items;

  const existingProductIds = items.map((i) => i.product_id);

  const toggleActiveMutation = useMutation({
    mutationFn: () => priceListsApi.update(listId!, { is_active: !list?.is_active }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['price-list-detail', slug, listId] });
      qc.invalidateQueries({ queryKey: ['price-lists', slug] });
    },
    onError: (err) => notify.error(err, 'Error al actualizar estado'),
  });

  return (
    <Sheet open={listId !== null} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl flex flex-col p-0 gap-0">
        {isLoading || !list ? (
          <div className="p-6 flex flex-col gap-3">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-64" />
            <Skeleton className="h-64 w-full mt-4" />
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-start justify-between px-6 py-4 border-b">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <SheetTitle className="text-base font-semibold">{list.name}</SheetTitle>
                  {list.is_default && (
                    <Badge className="gap-1 text-[11px] bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400">
                      <Star className="size-3" />
                      Por defecto
                    </Badge>
                  )}
                  <button
                    type="button"
                    onClick={() => toggleActiveMutation.mutate()}
                    disabled={toggleActiveMutation.isPending}
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium transition-colors ${
                      list.is_active
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {list.is_active ? 'Activa' : 'Inactiva'}
                  </button>
                </div>
                {list.description && (
                  <p className="text-sm text-muted-foreground">{list.description}</p>
                )}
                <p className="text-xs text-muted-foreground">{items.length} producto{items.length !== 1 ? 's' : ''} con precio especial</p>
              </div>
              <Button size="sm" variant="outline" className="gap-1.5 shrink-0" onClick={() => onEdit(list)}>
                <Pencil className="size-3.5" />
                Editar lista
              </Button>
            </div>

            {/* Items section */}
            <div className="flex-1 overflow-y-auto flex flex-col gap-0">
              {/* Toolbar */}
              <div className="flex items-center gap-2 px-4 py-3 border-b bg-muted/30">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                  <Input
                    value={itemSearch}
                    onChange={(e) => setItemSearch(e.target.value)}
                    placeholder="Filtrar productos…"
                    className="h-8 pl-8 text-sm"
                  />
                </div>
                {!addingItem && (
                  <Button size="sm" className="gap-1.5 shrink-0 h-8" onClick={() => setAddingItem(true)}>
                    <Plus className="size-3.5" />
                    Agregar precio
                  </Button>
                )}
              </div>

              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-muted-foreground text-xs uppercase">
                    <tr>
                      <th className="px-3 py-2 text-left">Producto</th>
                      <th className="px-3 py-2 text-center w-24">Cant. mín.</th>
                      <th className="px-3 py-2 text-right w-32">Precio</th>
                      <th className="px-3 py-2 w-20" />
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {addingItem && (
                      <AddItemRow
                        listId={list.id}
                        slug={slug}
                        existingProductIds={existingProductIds}
                        onDone={() => setAddingItem(false)}
                      />
                    )}
                    {filteredItems.length === 0 && !addingItem && (
                      <tr>
                        <td colSpan={4} className="px-3 py-10 text-center text-muted-foreground text-xs">
                          <PackageSearch className="size-8 mx-auto mb-2 opacity-40" />
                          {items.length === 0
                            ? 'Sin productos. Agrega un precio especial para empezar.'
                            : 'Sin resultados para esa búsqueda.'}
                        </td>
                      </tr>
                    )}
                    {filteredItems.map((item) => (
                      <ItemRow key={item.id} item={item} listId={list.id} slug={slug} />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PriceListsPage() {
  const params = useParams();
  const slug   = params.slug as string;

  const [dialogOpen, setDialogOpen]   = useState(false);
  const [editTarget, setEditTarget]   = useState<PriceList | null>(null);
  const [detailId, setDetailId]       = useState<number | null>(null);
  const [search, setSearch]           = useState('');

  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['price-lists', slug],
    queryFn: () => priceListsApi.list().then((r) => r.data),
    staleTime: 30_000,
  });

  const lists: PriceList[] = (data as PriceList[]) ?? [];

  const filteredLists = lists.filter((l) =>
    !search || l.name.toLowerCase().includes(search.toLowerCase())
  );

  const destroyMutation = useMutation({
    mutationFn: (id: number) => priceListsApi.destroy(id),
    onSuccess: () => {
      notify.success('Lista eliminada');
      qc.invalidateQueries({ queryKey: ['price-lists', slug] });
    },
    onError: (e: any) => {
      const msg = e?.response?.data?.message ?? 'Error al eliminar';
      notify.error(msg);
    },
  });

  const openCreate = () => {
    setEditTarget(null);
    setDialogOpen(true);
  };

  const openEdit = (list: PriceList) => {
    setEditTarget(list);
    setDialogOpen(true);
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Page header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Tags className="size-5 text-muted-foreground" />
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Listas de precios</h1>
            <p className="text-sm text-muted-foreground">
              Define precios especiales por cliente, volumen o segmento.
            </p>
          </div>
        </div>
        <Button className="gap-2" onClick={openCreate}>
          <Plus className="size-4" />
          Nueva lista
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar lista…"
          className="pl-9"
        />
      </div>

      {/* List table */}
      <div className="rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-muted-foreground text-xs uppercase">
            <tr>
              <th className="px-4 py-3 text-left">Nombre</th>
              <th className="px-4 py-3 text-center">Productos</th>
              <th className="px-4 py-3 text-center">Estado</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading &&
              Array.from({ length: 3 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 4 }).map((__, j) => (
                    <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                  ))}
                </tr>
              ))}

            {!isLoading && filteredLists.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-12 text-center text-muted-foreground text-sm">
                  <Tags className="size-10 mx-auto mb-3 opacity-30" />
                  {lists.length === 0
                    ? 'Aún no hay listas de precios. Crea una para empezar.'
                    : 'Sin resultados para esa búsqueda.'}
                </td>
              </tr>
            )}

            {!isLoading &&
              filteredLists.map((list) => (
                <tr
                  key={list.id}
                  className="hover:bg-muted/30 transition-colors cursor-pointer"
                  onClick={() => setDetailId(list.id)}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{list.name}</span>
                      {list.is_default && (
                        <Badge className="gap-1 text-[10px] py-0 bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400">
                          <Star className="size-2.5" />
                          Por defecto
                        </Badge>
                      )}
                    </div>
                    {list.description && (
                      <p className="text-xs text-muted-foreground mt-0.5">{list.description}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center text-muted-foreground">
                    {list.items_count ?? 0}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                      list.is_active
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                        : 'bg-muted text-muted-foreground'
                    }`}>
                      {list.is_active ? 'Activa' : 'Inactiva'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-8"
                        onClick={() => openEdit(list)}
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-8"
                        disabled={list.is_default || destroyMutation.isPending}
                        title={list.is_default ? 'No se puede eliminar la lista por defecto' : undefined}
                        onClick={() => {
                          if (window.confirm(`¿Eliminar la lista "${list.name}"?`)) {
                            destroyMutation.mutate(list.id);
                          }
                        }}
                      >
                        <Trash2 className="size-3.5 text-destructive" />
                      </Button>
                      <ChevronRight className="size-4 text-muted-foreground" />
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {/* Create / Edit Dialog */}
      <ListDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        list={editTarget}
        slug={slug}
      />

      {/* Detail Sheet */}
      <DetailSheet
        listId={detailId}
        slug={slug}
        onClose={() => setDetailId(null)}
        onEdit={(list) => {
          openEdit(list);
        }}
      />
    </div>
  );
}
