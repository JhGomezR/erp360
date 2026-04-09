'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notify } from '@/lib/notify';
import { mrpApi, productsApi } from '@/lib/api/tenant.api';
import {
  Factory, ListTree, Calculator, Plus, Trash2,
  Eye, PlayCircle, CheckCircle, XCircle,
} from 'lucide-react';

import { Button }    from '@/components/ui/button';
import { Badge }     from '@/components/ui/badge';
import { Input }     from '@/components/ui/input';
import { Label }     from '@/components/ui/label';
import { Textarea }  from '@/components/ui/textarea';
import { Skeleton }  from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Progress }  from '@/components/ui/progress';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

// ─── Types ────────────────────────────────────────────────────────────────────

interface BomLine {
  id?: number;
  component_id: number;
  component_name?: string;
  quantity: number;
  unit: string;
}

interface Bom {
  id: number;
  product_id: number;
  name: string | null;
  version: string;
  quantity: number;
  is_active: boolean;
  lines_count?: number;
  lines?: BomLine[];
}

interface OrderComponent {
  id: number;
  product_name: string;
  quantity_required: number;
  quantity_consumed: number;
  unit: string | null;
}

interface ProductionOrder {
  id: number;
  order_number: string;
  product_id: number;
  quantity_planned: number;
  quantity_produced: number;
  status: 'draft' | 'confirmed' | 'in_progress' | 'done' | 'cancelled';
  planned_start: string | null;
  planned_end: string | null;
  components?: OrderComponent[];
  progress?: number;
}

interface Product {
  id: number;
  name: string;
  sku: string;
  stock: number;
}

interface Requirement {
  product_id: number;
  product_name: string;
  product_sku: string | null;
  unit: string | null;
  gross_qty: number;
  stock: number;
  net_qty: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ORD_STATUS_COLORS: Record<ProductionOrder['status'], 'secondary' | 'default' | 'destructive' | 'outline'> = {
  draft: 'secondary', confirmed: 'secondary', in_progress: 'default', done: 'outline', cancelled: 'destructive',
};
const ORD_STATUS_LABELS: Record<ProductionOrder['status'], string> = {
  draft: 'Borrador', confirmed: 'Confirmada', in_progress: 'En Proceso', done: 'Completada', cancelled: 'Cancelada',
};

function emptyBomLine(): BomLine { return { component_id: 0, quantity: 1, unit: 'unidad' }; }

// ══════════════════════════════════════════════════════════════════════════════
// BOM TAB
// ══════════════════════════════════════════════════════════════════════════════

function BomTab({ slug }: { slug: string }) {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId]     = useState<number | null>(null);

  // Create form
  const [productSearch, setPSearch]   = useState('');
  const [selectedProductId, setProductId] = useState<number | null>(null);
  const [selectedProductName, setProductName] = useState('');
  const [bomName, setBomName]         = useState('');
  const [bomQty, setBomQty]           = useState('1');
  const [lines, setLines]             = useState<BomLine[]>([emptyBomLine()]);

  const bomsQ = useQuery({ queryKey: [slug, 'mrp-boms'], queryFn: () => mrpApi.boms() });
  const detailQ = useQuery({
    queryKey: [slug, 'mrp-bom-detail', detailId],
    queryFn:  () => mrpApi.getBom(detailId!),
    enabled:  detailId !== null,
  });
  const productsQ = useQuery({
    queryKey: [slug, 'products-mrp', productSearch],
    queryFn:  () => productsApi.list({ search: productSearch, per_page: 20 }),
    enabled:  productSearch.length > 1,
  });

  const boms: Bom[] = (bomsQ.data as { data?: Bom[] })?.data ?? [];
  const detail = detailQ.data as Bom | undefined;
  const products: Product[] = (productsQ.data as { data?: Product[] })?.data ?? [];

  function inv() { qc.invalidateQueries({ queryKey: [slug, 'mrp-boms'] }); }

  const createMut = useMutation({
    mutationFn: (d: unknown) => mrpApi.createBom(d),
    onSuccess: () => { notify.success('BOM creado.'); inv(); setCreateOpen(false); setLines([emptyBomLine()]); setProductId(null); setProductName(''); setBomName(''); setBomQty('1'); },
    onError: (e: unknown) => notify.error((e as { message?: string }).message ?? 'Error'),
  });
  const deleteMut = useMutation({
    mutationFn: (id: number) => mrpApi.deleteBom(id),
    onSuccess: () => { notify.success('Eliminado.'); inv(); },
    onError: (e: unknown) => notify.error((e as { message?: string }).message ?? 'Error'),
  });

  function updateLine(idx: number, field: keyof BomLine, val: string | number) {
    setLines((prev) => prev.map((l, i) => i === idx ? { ...l, [field]: val } : l));
  }

  function pickProductForLine(idx: number, p: Product) {
    updateLine(idx, 'component_id', p.id);
    updateLine(idx, 'component_name', p.name);
    setPSearch('');
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{boms.length} BOM(s)</p>
        <Button onClick={() => setCreateOpen(true)}><Plus className="mr-2 size-4" />Nueva BOM</Button>
      </div>

      {bomsQ.isPending ? <Skeleton className="h-40 w-full" /> : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {boms.map((b) => (
            <Card key={b.id} className="cursor-pointer hover:shadow-sm" onClick={() => setDetailId(b.id)}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <CardTitle className="text-sm">Producto #{b.product_id}</CardTitle>
                  <Badge variant={b.is_active ? 'outline' : 'secondary'}>v{b.version}</Badge>
                </div>
                {b.name && <p className="text-xs text-muted-foreground">{b.name}</p>}
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">Produce: {b.quantity} unidad(es)</p>
                <p className="text-xs text-muted-foreground">{b.lines_count ?? 0} componente(s)</p>
                <div className="flex justify-end mt-2" onClick={(e) => e.stopPropagation()}>
                  <Button size="icon" variant="ghost" className="size-7 text-destructive"
                    onClick={() => { if (confirm('¿Eliminar BOM?')) deleteMut.mutate(b.id); }}>
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
          {boms.length === 0 && <div className="col-span-3 py-14 text-center text-muted-foreground"><ListTree className="mx-auto size-10 mb-3 opacity-30" /><p>No hay BOMs</p></div>}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col">
          <DialogHeader><DialogTitle>Nueva Lista de Materiales (BOM)</DialogTitle></DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-3 pr-1">
            <div className="space-y-1.5">
              <Label>Producto terminado <span className="text-destructive">*</span></Label>
              <Input placeholder="Buscar producto…" value={selectedProductName || productSearch}
                onChange={(e) => { setPSearch(e.target.value); setProductName(''); setProductId(null); }} />
              {productSearch && !selectedProductId && products.length > 0 && (
                <div className="rounded border bg-background shadow-md max-h-36 overflow-y-auto">
                  {products.map((p) => (
                    <button key={p.id} type="button" className="w-full px-3 py-2 text-left text-sm hover:bg-accent"
                      onClick={() => { setProductId(p.id); setProductName(p.name); setPSearch(''); }}>
                      {p.name} <span className="text-muted-foreground text-xs ml-2">{p.sku}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Nombre BOM</Label>
                <Input value={bomName} onChange={(e) => setBomName(e.target.value)} placeholder="Opcional" /></div>
              <div className="space-y-1.5"><Label>Cantidad producida</Label>
                <Input type="number" min={0.001} value={bomQty} onChange={(e) => setBomQty(e.target.value)} /></div>
            </div>
            <Separator />
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Componentes</Label>
                <Button size="sm" variant="outline" onClick={() => setLines((p) => [...p, emptyBomLine()])}>
                  <Plus className="size-3 mr-1" />Añadir
                </Button>
              </div>
              {lines.map((line, idx) => (
                <div key={idx} className="flex gap-2 mb-2 items-end">
                  <div className="flex-1 space-y-1">
                    <Label className="text-xs">Componente</Label>
                    <Input placeholder="Buscar…" value={line.component_name ?? ''}
                      onChange={(e) => updateLine(idx, 'component_name', e.target.value)}
                      className="h-8 text-sm" />
                  </div>
                  <div className="w-20 space-y-1">
                    <Label className="text-xs">Cantidad</Label>
                    <Input type="number" min={0.001} value={line.quantity} className="h-8 text-sm"
                      onChange={(e) => updateLine(idx, 'quantity', parseFloat(e.target.value) || 1)} />
                  </div>
                  <div className="w-20 space-y-1">
                    <Label className="text-xs">Unidad</Label>
                    <Input value={line.unit} className="h-8 text-sm"
                      onChange={(e) => updateLine(idx, 'unit', e.target.value)} />
                  </div>
                  {lines.length > 1 && (
                    <button type="button" onClick={() => setLines((p) => p.filter((_, i) => i !== idx))}
                      className="text-destructive mb-1"><Trash2 className="size-4" /></button>
                  )}
                </div>
              ))}
              <p className="text-xs text-muted-foreground mt-1">Nota: ingresa el nombre del componente y el sistema lo buscará por nombre exacto al guardar.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button onClick={() => {
              if (!selectedProductId) { notify.error('Selecciona un producto terminado'); return; }
              createMut.mutate({
                product_id: selectedProductId,
                name: bomName || undefined,
                quantity: parseFloat(bomQty) || 1,
                lines: lines.filter((l) => l.component_id || l.component_name).map((l) => ({
                  component_id: l.component_id || 0,
                  quantity: l.quantity,
                  unit: l.unit,
                })),
              });
            }} disabled={createMut.isPending}>
              {createMut.isPending ? 'Creando…' : 'Crear BOM'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={detailId !== null} onOpenChange={(v) => { if (!v) setDetailId(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>BOM — Producto #{detail?.product_id}</DialogTitle></DialogHeader>
          {detail && (
            <div className="space-y-3">
              <div className="flex gap-2">
                <Badge variant="outline">v{detail.version}</Badge>
                <Badge variant={detail.is_active ? 'default' : 'secondary'}>{detail.is_active ? 'Activa' : 'Inactiva'}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">Produce <strong>{detail.quantity}</strong> unidad(es) por ejecución</p>
              <Separator />
              <div className="space-y-2">
                {(detail.lines ?? []).map((l, i) => (
                  <div key={i} className="flex justify-between text-sm border rounded px-3 py-2">
                    <span className="font-medium">Componente #{l.component_id}</span>
                    <span className="text-muted-foreground">{l.quantity} {l.unit}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <DialogFooter><Button variant="outline" onClick={() => setDetailId(null)}>Cerrar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// PRODUCTION ORDERS TAB
// ══════════════════════════════════════════════════════════════════════════════

function ProductionOrdersTab({ slug }: { slug: string }) {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId]     = useState<number | null>(null);
  const [produceOpen, setProduceOpen] = useState(false);
  const [produceQty, setProduceQty]   = useState('');

  // Create form
  const [productId, setProductId]   = useState('');
  const [bomId, setBomId]           = useState('');
  const [qty, setQty]               = useState('1');
  const [planStart, setPlanStart]   = useState('');
  const [planEnd, setPlanEnd]       = useState('');

  const ordersQ = useQuery({ queryKey: [slug, 'mrp-orders'], queryFn: () => mrpApi.productionOrders() });
  const detailQ = useQuery({
    queryKey: [slug, 'mrp-order-detail', detailId],
    queryFn:  () => mrpApi.getOrder(detailId!),
    enabled:  detailId !== null,
  });
  const bomsQ = useQuery({ queryKey: [slug, 'mrp-boms-mini'], queryFn: () => mrpApi.boms({ is_active: true }) });

  const orders: ProductionOrder[] = (ordersQ.data as { data?: ProductionOrder[] })?.data ?? [];
  const detail = detailQ.data as ProductionOrder | undefined;
  const boms: Bom[] = (bomsQ.data as { data?: Bom[] })?.data ?? [];

  function inv() { qc.invalidateQueries({ queryKey: [slug, 'mrp-orders'] }); }
  function invDetail() { qc.invalidateQueries({ queryKey: [slug, 'mrp-order-detail', detailId] }); }

  const createMut = useMutation({
    mutationFn: (d: unknown) => mrpApi.createOrder(d),
    onSuccess: () => { notify.success('Orden creada.'); inv(); setCreateOpen(false); setProductId(''); setBomId(''); setQty('1'); },
    onError: (e: unknown) => notify.error((e as { message?: string }).message ?? 'Error'),
  });
  const startMut = useMutation({
    mutationFn: (id: number) => mrpApi.startOrder(id),
    onSuccess: () => { notify.success('Orden iniciada.'); inv(); invDetail(); },
    onError: (e: unknown) => notify.error((e as { message?: string }).message ?? 'Error'),
  });
  const produceMut = useMutation({
    mutationFn: ({ id, qty }: { id: number; qty: number }) => mrpApi.produce(id, { quantity: qty }),
    onSuccess: () => { notify.success('Producción registrada.'); inv(); invDetail(); setProduceOpen(false); setProduceQty(''); },
    onError: (e: unknown) => notify.error((e as { message?: string }).message ?? 'Error'),
  });
  const cancelMut = useMutation({
    mutationFn: (id: number) => mrpApi.cancelOrder(id),
    onSuccess: () => { notify.success('Cancelada.'); inv(); invDetail(); setDetailId(null); },
    onError: (e: unknown) => notify.error((e as { message?: string }).message ?? 'Error'),
  });

  const progress = detail ? (detail.quantity_produced / Math.max(detail.quantity_planned, 0.001)) * 100 : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{orders.length} orden(es)</p>
        <Button onClick={() => setCreateOpen(true)}><Plus className="mr-2 size-4" />Nueva Orden</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {ordersQ.isPending ? <div className="p-4"><Skeleton className="h-40 w-full" /></div> :
          orders.length === 0 ? (
            <div className="py-14 text-center text-muted-foreground"><Factory className="mx-auto size-10 mb-3 opacity-30" /><p>Sin órdenes</p></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>N°</TableHead>
                  <TableHead>Producto</TableHead>
                  <TableHead>Cantidad</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Progreso</TableHead>
                  <TableHead>Planificado</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((o) => {
                  const pct = (o.quantity_produced / Math.max(o.quantity_planned, 0.001)) * 100;
                  return (
                    <TableRow key={o.id} className="cursor-pointer hover:bg-muted/40" onClick={() => setDetailId(o.id)}>
                      <TableCell className="font-mono text-xs">{o.order_number}</TableCell>
                      <TableCell className="text-sm">Prod #{o.product_id}</TableCell>
                      <TableCell className="text-sm">{o.quantity_produced}/{o.quantity_planned}</TableCell>
                      <TableCell><Badge variant={ORD_STATUS_COLORS[o.status]}>{ORD_STATUS_LABELS[o.status]}</Badge></TableCell>
                      <TableCell className="w-32">
                        <Progress value={pct} className="h-1.5" />
                        <p className="text-xs text-muted-foreground mt-0.5">{Math.round(pct)}%</p>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {o.planned_start ? new Date(o.planned_start).toLocaleDateString('es-CO') : '—'}
                      </TableCell>
                      <TableCell><Button size="icon" variant="ghost" className="size-7" onClick={() => setDetailId(o.id)}><Eye className="size-3.5" /></Button></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Nueva Orden de Producción</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>ID Producto terminado <span className="text-destructive">*</span></Label>
              <Input type="number" value={productId} onChange={(e) => setProductId(e.target.value)} placeholder="ID del producto" /></div>
            <div className="space-y-1.5"><Label>BOM a usar</Label>
              <Select value={bomId} onValueChange={(v) => setBomId(v ?? '')}>
                <SelectTrigger><SelectValue placeholder="Seleccionar BOM…" /></SelectTrigger>
                <SelectContent>{boms.map((b) => <SelectItem key={b.id} value={String(b.id)}>BOM #{b.id} — Prod #{b.product_id} v{b.version}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5"><Label>Cantidad</Label>
                <Input type="number" min={0.001} value={qty} onChange={(e) => setQty(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Inicio plan.</Label>
                <Input type="date" value={planStart} onChange={(e) => setPlanStart(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Fin plan.</Label>
                <Input type="date" value={planEnd} onChange={(e) => setPlanEnd(e.target.value)} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button onClick={() => createMut.mutate({ product_id: parseInt(productId), bom_id: bomId ? parseInt(bomId) : undefined, quantity_planned: parseFloat(qty) || 1, planned_start: planStart || undefined, planned_end: planEnd || undefined })}
              disabled={createMut.isPending || !productId}>
              {createMut.isPending ? 'Creando…' : 'Crear Orden'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail */}
      <Dialog open={detailId !== null} onOpenChange={(v) => { if (!v) { setDetailId(null); setProduceOpen(false); } }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col">
          <DialogHeader><DialogTitle>{detail?.order_number ?? '…'}</DialogTitle></DialogHeader>
          {detail && (
            <div className="flex-1 overflow-y-auto space-y-4 pr-1">
              <div className="flex items-center gap-2">
                <Badge variant={ORD_STATUS_COLORS[detail.status]}>{ORD_STATUS_LABELS[detail.status]}</Badge>
                <span className="text-sm text-muted-foreground ml-auto">{detail.quantity_produced}/{detail.quantity_planned} unidades</span>
              </div>
              <Progress value={progress} className="h-2" />

              {/* Components */}
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Componentes requeridos</p>
                <div className="space-y-1">
                  {(detail.components ?? []).map((c) => (
                    <div key={c.id} className="flex justify-between text-sm border rounded px-3 py-2">
                      <span>{c.product_name}</span>
                      <span className="text-muted-foreground">{c.quantity_consumed}/{c.quantity_required} {c.unit ?? ''}</span>
                    </div>
                  ))}
                  {(detail.components ?? []).length === 0 && <p className="text-sm text-muted-foreground">Sin componentes.</p>}
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2 flex-wrap">
                {detail.status === 'draft' && (
                  <Button size="sm" onClick={() => startMut.mutate(detail.id)} disabled={startMut.isPending}>
                    <PlayCircle className="mr-1 size-4" />{startMut.isPending ? 'Iniciando…' : 'Iniciar Producción'}
                  </Button>
                )}
                {detail.status === 'in_progress' && !produceOpen && (
                  <Button size="sm" onClick={() => setProduceOpen(true)}>
                    <CheckCircle className="mr-1 size-4" />Registrar Producción
                  </Button>
                )}
                {produceOpen && (
                  <div className="w-full space-y-2 rounded border p-3 bg-muted/20">
                    <Label>Cantidad producida</Label>
                    <div className="flex gap-2">
                      <Input type="number" min={0.001} max={detail.quantity_planned - detail.quantity_produced}
                        value={produceQty} onChange={(e) => setProduceQty(e.target.value)} className="flex-1" />
                      <Button onClick={() => produceMut.mutate({ id: detail.id, qty: parseFloat(produceQty) || 1 })}
                        disabled={produceMut.isPending || !produceQty}>
                        {produceMut.isPending ? '…' : 'Confirmar'}
                      </Button>
                      <Button variant="outline" onClick={() => setProduceOpen(false)}>Cancelar</Button>
                    </div>
                  </div>
                )}
                {!['done','cancelled'].includes(detail.status) && (
                  <Button size="sm" variant="ghost" className="text-destructive"
                    onClick={() => cancelMut.mutate(detail.id)} disabled={cancelMut.isPending}>
                    <XCircle className="mr-1 size-4" />Cancelar orden
                  </Button>
                )}
              </div>
            </div>
          )}
          <DialogFooter><Button variant="outline" onClick={() => setDetailId(null)}>Cerrar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// REQUIREMENTS TAB
// ══════════════════════════════════════════════════════════════════════════════

function RequirementsTab({ slug }: { slug: string }) {
  const [items, setItems] = useState([{ product_id: '', quantity: '1' }]);
  const [results, setResults] = useState<Requirement[] | null>(null);

  const calcMut = useMutation({
    mutationFn: (payload: Array<{ product_id: number; quantity: number }>) => mrpApi.requirements(payload),
    onSuccess: (data) => setResults(data as Requirement[]),
    onError: (e: unknown) => notify.error((e as { message?: string }).message ?? 'Error'),
  });

  function calc() {
    const payload = items
      .filter((i) => i.product_id && parseFloat(i.quantity) > 0)
      .map((i) => ({ product_id: parseInt(i.product_id), quantity: parseFloat(i.quantity) }));
    if (payload.length === 0) { notify.error('Agrega al menos un producto'); return; }
    calcMut.mutate(payload);
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <p className="text-sm text-muted-foreground">
        Calcula los requerimientos brutos y netos de materiales según las BOMs activas.
      </p>

      <div className="space-y-2">
        {items.map((item, idx) => (
          <div key={idx} className="flex gap-2 items-end">
            <div className="flex-1 space-y-1">
              <Label className="text-xs">ID Producto terminado</Label>
              <Input type="number" value={item.product_id} placeholder="ID producto" className="h-8 text-sm"
                onChange={(e) => setItems((p) => p.map((it, i) => i === idx ? { ...it, product_id: e.target.value } : it))} />
            </div>
            <div className="w-24 space-y-1">
              <Label className="text-xs">Cantidad</Label>
              <Input type="number" min={0.001} value={item.quantity} className="h-8 text-sm"
                onChange={(e) => setItems((p) => p.map((it, i) => i === idx ? { ...it, quantity: e.target.value } : it))} />
            </div>
            {items.length > 1 && (
              <button type="button" onClick={() => setItems((p) => p.filter((_, i) => i !== idx))}
                className="text-destructive mb-1"><Trash2 className="size-4" /></button>
            )}
          </div>
        ))}
        <Button size="sm" variant="outline" onClick={() => setItems((p) => [...p, { product_id: '', quantity: '1' }])}>
          <Plus className="size-3 mr-1" />Añadir producto
        </Button>
      </div>

      <Button onClick={calc} disabled={calcMut.isPending}>
        <Calculator className="mr-2 size-4" />{calcMut.isPending ? 'Calculando…' : 'Calcular Requerimientos'}
      </Button>

      {results && (
        <div className="space-y-3">
          <Separator />
          <p className="text-sm font-medium">Requerimientos de materiales</p>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Componente</TableHead>
                    <TableHead className="text-right">Bruto</TableHead>
                    <TableHead className="text-right">Stock actual</TableHead>
                    <TableHead className="text-right font-semibold">Neto (a comprar)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map((r) => (
                    <TableRow key={r.product_id} className={r.net_qty > 0 ? 'bg-red-50 dark:bg-red-950/20' : ''}>
                      <TableCell>
                        <p className="text-sm font-medium">{r.product_name}</p>
                        {r.product_sku && <p className="text-xs text-muted-foreground">{r.product_sku}</p>}
                      </TableCell>
                      <TableCell className="text-right">{r.gross_qty} {r.unit ?? ''}</TableCell>
                      <TableCell className="text-right text-green-600">{r.stock}</TableCell>
                      <TableCell className={`text-right font-semibold ${r.net_qty > 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {r.net_qty > 0 ? `${r.net_qty} ${r.unit ?? ''}` : '✓ Suficiente'}
                      </TableCell>
                    </TableRow>
                  ))}
                  {results.length === 0 && (
                    <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">No se encontraron requerimientos (verifica que los productos tengan BOM activa)</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════════════════════════════

export default function MrpPage() {
  const params = useParams();
  const slug   = params.slug as string;
  const [activeTab, setActiveTab] = useState('orders');

  return (
    <div className="flex flex-col gap-6 p-6">
      <h1 className="text-2xl font-bold tracking-tight">MRP — Manufactura y Planificación</h1>

      <div className="flex gap-0.5 p-1 rounded-lg bg-muted w-fit">
        {([
          { key: 'orders', icon: Factory, label: 'Órdenes Producción' },
          { key: 'bom', icon: ListTree, label: 'Listas de Materiales' },
          { key: 'requirements', icon: Calculator, label: 'Requerimientos MRP' },
        ] as const).map(({ key, icon: Icon, label }) => (
          <button key={key} onClick={() => setActiveTab(key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${activeTab === key ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
            <Icon className="size-3.5" />{label}
          </button>
        ))}
      </div>

      <div className="mt-2">
        {activeTab === 'orders' && <ProductionOrdersTab slug={slug} />}
        {activeTab === 'bom' && <BomTab slug={slug} />}
        {activeTab === 'requirements' && <RequirementsTab slug={slug} />}
      </div>
    </div>
  );
}
