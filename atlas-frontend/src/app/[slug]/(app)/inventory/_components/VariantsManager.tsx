'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notify } from '@/lib/notify';
import { Plus, Trash2, ArrowUpDown, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { variantsApi, productsApi } from '@/lib/api/tenant.api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Attribute {
  id: number; name: string;
  options?: { id: number; value: string }[];
}
interface ProductVariant {
  id: number; sku?: string; price?: number; stock: number;
  options?: { attribute: { name: string }; option: { value: string } }[];
}
interface SimpleProduct { id: number; name: string; sku: string; }

// ─── Attributes Panel ─────────────────────────────────────────────────────────

function AttributesPanel({ slug }: { slug: string }) {
  const qc = useQueryClient();
  const [newAttrName, setNewAttrName] = useState('');
  const [newOption, setNewOption] = useState<Record<number, string>>({});

  const { data: attributes = [], isLoading } = useQuery<Attribute[]>({
    queryKey: ['attributes', slug],
    queryFn: async () => {
      const r = await variantsApi.attributes();
      return (r.data as Attribute[]) ?? [];
    },
  });

  const createAttr = useMutation({
    mutationFn: () => variantsApi.createAttribute({ name: newAttrName }),
    onSuccess: () => { notify.success('Atributo creado'); setNewAttrName(''); qc.invalidateQueries({ queryKey: ['attributes', slug] }); },
    onError: (err) => notify.error(err, 'Error al crear'),
  });

  const deleteAttr = useMutation({
    mutationFn: (id: number) => variantsApi.deleteAttribute(id),
    onSuccess: () => { notify.success('Eliminado'); qc.invalidateQueries({ queryKey: ['attributes', slug] }); },
    onError: (err) => notify.error(err, 'Error al eliminar'),
  });

  const addOption = useMutation({
    mutationFn: ({ attrId, value }: { attrId: number; value: string }) =>
      variantsApi.addOption(attrId, { value }),
    onSuccess: (_, { attrId }) => {
      notify.success('Opción agregada');
      setNewOption((prev) => ({ ...prev, [attrId]: '' }));
      qc.invalidateQueries({ queryKey: ['attributes', slug] });
    },
    onError: (err) => notify.error(err, 'Error al agregar'),
  });

  const removeOption = useMutation({
    mutationFn: ({ attrId, optionId }: { attrId: number; optionId: number }) =>
      variantsApi.removeOption(attrId, optionId),
    onSuccess: () => { notify.success('Opción eliminada'); qc.invalidateQueries({ queryKey: ['attributes', slug] }); },
    onError: (err) => notify.error(err, 'Error al eliminar'),
  });

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input value={newAttrName} onChange={(e) => setNewAttrName(e.target.value)}
          placeholder="Ej: Color, Talla, Sabor..." className="max-w-xs" />
        <Button size="sm" className="gap-1" disabled={!newAttrName || createAttr.isPending}
          onClick={() => createAttr.mutate()}>
          <Plus className="size-4" />Crear atributo
        </Button>
      </div>

      {isLoading
        ? Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)
        : attributes.map((attr) => (
            <Card key={attr.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Settings2 className="size-4 text-muted-foreground" />{attr.name}
                  </CardTitle>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive"
                    onClick={() => window.confirm(`¿Eliminar atributo "${attr.name}"?`) && deleteAttr.mutate(attr.id)}>
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex flex-wrap gap-1.5">
                  {(attr.options ?? []).map((opt) => (
                    <span key={opt.id} className="inline-flex items-center gap-1 bg-muted rounded-full px-2.5 py-0.5 text-xs">
                      {opt.value}
                      <button className="hover:text-destructive transition-colors"
                        onClick={() => removeOption.mutate({ attrId: attr.id, optionId: opt.id })}>×</button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input value={newOption[attr.id] ?? ''} placeholder="Nueva opción..."
                    onChange={(e) => setNewOption((prev) => ({ ...prev, [attr.id]: e.target.value }))}
                    className="h-7 text-xs max-w-[180px]" />
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
                    disabled={!newOption[attr.id] || addOption.isPending}
                    onClick={() => addOption.mutate({ attrId: attr.id, value: newOption[attr.id] ?? '' })}>
                    <Plus className="size-3" />Agregar
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}

      {!isLoading && attributes.length === 0 && (
        <div className="py-8 text-center text-muted-foreground text-sm">
          <Settings2 className="size-8 mx-auto mb-2 opacity-30" />
          Sin atributos. Crea uno (Color, Talla, etc.) para usarlo en variantes.
        </div>
      )}
    </div>
  );
}

// ─── Variants Panel ────────────────────────────────────────────────────────────

function VariantsPanel({ slug }: { slug: string }) {
  const qc = useQueryClient();
  const [productId, setProductId] = useState<string>('');
  const [addDialog, setAddDialog] = useState(false);
  const [stockDialog, setStockDialog] = useState<ProductVariant | null>(null);
  const [varForm, setVarForm] = useState({ sku: '', price: '', stock: '0' });
  const [stockForm, setStockForm] = useState({ quantity: '', reason: 'Ajuste manual' });

  const { data: products = [] } = useQuery<SimpleProduct[]>({
    queryKey: ['products-simple', slug],
    queryFn: async () => {
      const r = await productsApi.list({ per_page: 300 });
      return r.data.data ?? [];
    },
    staleTime: 60_000,
  });

  const { data: variants = [], isLoading } = useQuery<ProductVariant[]>({
    queryKey: ['variants', slug, productId],
    queryFn: async () => {
      const r = await variantsApi.list(Number(productId));
      return (r.data as ProductVariant[]) ?? [];
    },
    enabled: !!productId,
  });

  const createVariant = useMutation({
    mutationFn: () => variantsApi.create(Number(productId), {
      sku: varForm.sku || undefined,
      price: varForm.price ? Number(varForm.price) : undefined,
      stock: Number(varForm.stock),
    }),
    onSuccess: () => {
      notify.success('Variante creada'); setAddDialog(false); setVarForm({ sku: '', price: '', stock: '0' });
      qc.invalidateQueries({ queryKey: ['variants', slug, productId] });
    },
    onError: (err) => notify.error(err, 'Error al crear variante'),
  });

  const deleteVariant = useMutation({
    mutationFn: (variantId: number) => variantsApi.destroy(Number(productId), variantId),
    onSuccess: () => { notify.success('Variante eliminada'); qc.invalidateQueries({ queryKey: ['variants', slug, productId] }); },
    onError: (err) => notify.error(err, 'Error al eliminar'),
  });

  const adjustStock = useMutation({
    mutationFn: () => variantsApi.adjustStock(Number(productId), stockDialog!.id, {
      quantity: Number(stockForm.quantity),
      reason: stockForm.reason,
    }),
    onSuccess: () => {
      notify.success('Stock ajustado'); setStockDialog(null); setStockForm({ quantity: '', reason: 'Ajuste manual' });
      qc.invalidateQueries({ queryKey: ['variants', slug, productId] });
    },
    onError: (err) => notify.error(err, 'Error al ajustar'),
  });

  const fmt = (n: number) =>
    new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Select value={productId} onValueChange={(v) => setProductId(v ?? '')}>
          <SelectTrigger className="w-72">
            <SelectValue placeholder="Seleccionar producto con variantes..." />
          </SelectTrigger>
          <SelectContent>
            {products.map((p) => (
              <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {productId && (
          <Button size="sm" className="gap-1" onClick={() => setAddDialog(true)}>
            <Plus className="size-4" />Nueva variante
          </Button>
        )}
      </div>

      {productId && (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-3 font-medium">SKU</th>
                <th className="text-left px-4 py-3 font-medium">Atributos</th>
                <th className="text-right px-4 py-3 font-medium">Precio</th>
                <th className="text-right px-4 py-3 font-medium">Stock</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {isLoading
                ? Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i}>{Array.from({ length: 5 }).map((__, j) => (
                      <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-16" /></td>
                    ))}</tr>
                  ))
                : variants.map((v) => (
                    <tr key={v.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3 font-mono text-xs">{v.sku ?? '—'}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {(v.options ?? []).map((o, i) => (
                            <Badge key={i} variant="secondary" className="text-xs">
                              {o.attribute.name}: {o.option.value}
                            </Badge>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">{v.price != null ? fmt(v.price) : '—'}</td>
                      <td className={`px-4 py-3 text-right font-medium ${v.stock <= 0 ? 'text-destructive' : ''}`}>{v.stock}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1 justify-end">
                          <Button variant="ghost" size="icon" className="h-7 w-7" title="Ajustar stock"
                            onClick={() => { setStockDialog(v); setStockForm({ quantity: '', reason: 'Ajuste manual' }); }}>
                            <ArrowUpDown className="size-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive"
                            onClick={() => window.confirm('¿Eliminar variante?') && deleteVariant.mutate(v.id)}>
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
              {!isLoading && variants.length === 0 && (
                <tr><td colSpan={5} className="text-center py-8 text-muted-foreground text-sm">
                  No hay variantes para este producto
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Dialog: nueva variante */}
      <Dialog open={addDialog} onOpenChange={setAddDialog}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader><DialogTitle>Nueva variante</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>SKU variante</Label>
              <Input value={varForm.sku} onChange={(e) => setVarForm((f) => ({ ...f, sku: e.target.value }))} className="font-mono" />
            </div>
            <div className="space-y-1.5">
              <Label>Precio (deja vacío para heredar del producto)</Label>
              <Input type="number" min={0} value={varForm.price}
                onChange={(e) => setVarForm((f) => ({ ...f, price: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Stock inicial</Label>
              <Input type="number" min={0} value={varForm.stock}
                onChange={(e) => setVarForm((f) => ({ ...f, stock: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialog(false)}>Cancelar</Button>
            <Button onClick={() => createVariant.mutate()} disabled={createVariant.isPending}>
              {createVariant.isPending ? 'Creando...' : 'Crear'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: ajustar stock */}
      <Dialog open={!!stockDialog} onOpenChange={(o) => { if (!o) setStockDialog(null); }}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader><DialogTitle>Ajustar stock — variante #{stockDialog?.id}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="p-3 bg-muted/40 rounded-lg text-sm">
              <p className="text-muted-foreground">Stock actual</p>
              <p className="text-lg font-bold">{stockDialog?.stock ?? 0}</p>
            </div>
            <div className="space-y-1.5">
              <Label>Cantidad (+ entrada / - salida) *</Label>
              <Input type="number" value={stockForm.quantity}
                onChange={(e) => setStockForm((f) => ({ ...f, quantity: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Motivo</Label>
              <Select value={stockForm.reason} onValueChange={(v) => setStockForm((f) => ({ ...f, reason: v ?? 'Ajuste manual' }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Ajuste manual">Ajuste manual</SelectItem>
                  <SelectItem value="Compra">Compra</SelectItem>
                  <SelectItem value="Devolución">Devolución</SelectItem>
                  <SelectItem value="Daño/Pérdida">Daño / Pérdida</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStockDialog(null)}>Cancelar</Button>
            <Button onClick={() => adjustStock.mutate()} disabled={!stockForm.quantity || adjustStock.isPending}>
              {adjustStock.isPending ? 'Ajustando...' : 'Ajustar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export function VariantsManager({ slug }: { slug: string }) {
  const [panel, setPanel] = useState<'variants' | 'attributes'>('variants');

  return (
    <div className="space-y-4">
      <div className="flex gap-2 border-b">
        {([['variants', 'Variantes'], ['attributes', 'Atributos globales']] as const).map(([key, label]) => (
          <button key={key} onClick={() => setPanel(key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
              panel === key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}>{label}</button>
        ))}
      </div>
      {panel === 'variants'   && <VariantsPanel    slug={slug} />}
      {panel === 'attributes' && <AttributesPanel  slug={slug} />}
    </div>
  );
}
