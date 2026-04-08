'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { b2bApi } from '@/lib/api/tenant.api';
import { AddonGate } from '@/components/shared/AddonPaywall';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { Plus, RefreshCw, Eye, DollarSign, Package, Users, ShoppingCart, Copy } from 'lucide-react';

type Distributor = {
  id: number; code: string; name: string; email: string; company: string | null;
  nit: string | null; phone: string | null; contact_name: string | null;
  status: string; credit_limit: number; balance: number; payment_terms: number;
  discount_pct: number; orders_count?: number;
};

type B2bOrder = {
  id: number; order_number: string; status: string; total: number;
  payment_status: string; paid_amount: number; created_at: string;
  distributor?: { name: string; code: string };
};

const statusColors: Record<string, string> = {
  pending: 'secondary', confirmed: 'default', processing: 'default',
  shipped: 'default', delivered: 'default', cancelled: 'destructive',
};

const statusLabels: Record<string, string> = {
  pending: 'Pendiente', confirmed: 'Confirmado', processing: 'En proceso',
  shipped: 'Enviado', delivered: 'Entregado', cancelled: 'Cancelado',
};

const payStatusColors: Record<string, string> = {
  pending: 'secondary', partial: 'default', paid: 'default',
};

const payStatusLabels: Record<string, string> = {
  pending: 'Pendiente', partial: 'Parcial', paid: 'Pagado',
};

function fmt(n: number) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);
}

// ─── CreateDistributorDialog ─────────────────────────────────────────────────
function CreateDistributorDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: '', email: '', password: '', company: '', nit: '', phone: '',
    contact_name: '', credit_limit: '', payment_terms: '30', discount_pct: '0',
  });

  const mut = useMutation({
    mutationFn: () => b2bApi.createDistributor(form),
    onSuccess: () => {
      toast.success('Distribuidor creado');
      qc.invalidateQueries({ queryKey: ['b2b-distributors'] });
      onClose();
    },
    onError: () => toast.error('Error al crear distribuidor'),
  });

  const field = (key: keyof typeof form) => ({
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm(p => ({ ...p, [key]: e.target.value })),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Nuevo Distribuidor B2B</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3 py-2">
          <div className="col-span-2">
            <Label>Nombre *</Label>
            <Input {...field('name')} placeholder="Distribuidora del Norte S.A.S" />
          </div>
          <div>
            <Label>Email *</Label>
            <Input type="email" {...field('email')} placeholder="contacto@dist.com" />
          </div>
          <div>
            <Label>Contraseña *</Label>
            <Input type="password" {...field('password')} placeholder="Mínimo 8 caracteres" />
          </div>
          <div>
            <Label>Empresa</Label>
            <Input {...field('company')} />
          </div>
          <div>
            <Label>NIT</Label>
            <Input {...field('nit')} placeholder="900123456-1" />
          </div>
          <div>
            <Label>Teléfono</Label>
            <Input {...field('phone')} />
          </div>
          <div>
            <Label>Contacto</Label>
            <Input {...field('contact_name')} />
          </div>
          <div>
            <Label>Cupo de crédito</Label>
            <Input type="number" {...field('credit_limit')} placeholder="0" />
          </div>
          <div>
            <Label>Plazo (días)</Label>
            <Input type="number" {...field('payment_terms')} />
          </div>
          <div>
            <Label>Descuento global (%)</Label>
            <Input type="number" {...field('discount_pct')} min="0" max="100" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
            {mut.isPending ? 'Creando...' : 'Crear'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── DistributorDetailDialog ──────────────────────────────────────────────────
function DistributorDetailDialog({
  distributor,
  onClose,
}: {
  distributor: Distributor | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [token, setToken] = useState<string | null>(null);
  const [paymentDlg, setPaymentDlg] = useState(false);

  const tokenMut = useMutation({
    mutationFn: () => b2bApi.regenerateToken(distributor!.id),
    onSuccess: (res) => {
      setToken(res.data.token);
      toast.success('Token regenerado — cópialo ahora, no se mostrará de nuevo');
    },
  });

  const rulesQ = useQuery({
    queryKey: ['b2b-price-rules', distributor?.id],
    queryFn: () => b2bApi.priceRules(distributor!.id),
    enabled: !!distributor,
  });

  if (!distributor) return null;

  const available = Math.max(0, distributor.credit_limit - distributor.balance);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{distributor.name} — {distributor.code}</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="info">
          <TabsList>
            <TabsTrigger value="info">Información</TabsTrigger>
            <TabsTrigger value="prices">Precios especiales</TabsTrigger>
            <TabsTrigger value="access">Acceso portal</TabsTrigger>
          </TabsList>

          <TabsContent value="info" className="space-y-3 pt-3">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div><span className="text-muted-foreground">Email:</span> {distributor.email}</div>
              <div><span className="text-muted-foreground">Empresa:</span> {distributor.company ?? '—'}</div>
              <div><span className="text-muted-foreground">NIT:</span> {distributor.nit ?? '—'}</div>
              <div><span className="text-muted-foreground">Contacto:</span> {distributor.contact_name ?? '—'}</div>
              <div><span className="text-muted-foreground">Teléfono:</span> {distributor.phone ?? '—'}</div>
              <div><span className="text-muted-foreground">Descuento global:</span> {distributor.discount_pct}%</div>
            </div>
            <div className="grid grid-cols-3 gap-3 mt-3">
              <Card>
                <CardContent className="pt-4 text-center">
                  <p className="text-2xl font-bold">{fmt(distributor.credit_limit)}</p>
                  <p className="text-xs text-muted-foreground">Cupo total</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 text-center">
                  <p className="text-2xl font-bold text-destructive">{fmt(distributor.balance)}</p>
                  <p className="text-xs text-muted-foreground">Saldo pendiente</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 text-center">
                  <p className="text-2xl font-bold text-green-600">{fmt(available)}</p>
                  <p className="text-xs text-muted-foreground">Disponible</p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="prices" className="pt-3">
            <p className="text-sm text-muted-foreground mb-3">
              Precios o descuentos especiales por producto para este distribuidor.
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Precio/Descuento</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(rulesQ.data?.data as unknown as { id: number; product?: { name: string; sku?: string }; rule_type: string; price: number; discount_pct: number }[] | undefined)?.map(rule => (
                  <TableRow key={rule.id}>
                    <TableCell>
                      <p className="font-medium">{rule.product?.name}</p>
                      <p className="text-xs text-muted-foreground">{rule.product?.sku}</p>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {rule.rule_type === 'fixed_price' ? 'Precio fijo' : 'Descuento %'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {rule.rule_type === 'fixed_price' ? fmt(rule.price) : `${rule.discount_pct}%`}
                    </TableCell>
                  </TableRow>
                ))}
                {(!rulesQ.data?.data || (rulesQ.data.data as unknown[]).length === 0) && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground">
                      Sin reglas específicas. Aplica descuento global del {distributor.discount_pct}%.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TabsContent>

          <TabsContent value="access" className="space-y-4 pt-3">
            <p className="text-sm text-muted-foreground">
              Genera un token de acceso al portal B2B. El distribuidor debe usar su
              email + contraseña para iniciar sesión en el portal.
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => tokenMut.mutate()}
                disabled={tokenMut.isPending}
              >
                <RefreshCw className="size-4 mr-2" />
                Regenerar token de API
              </Button>
            </div>
            {token && (
              <div className="rounded-md border bg-muted p-3 space-y-2">
                <p className="text-xs text-muted-foreground font-medium">Token (cópialo ahora):</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs break-all font-mono">{token}</code>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => { navigator.clipboard.writeText(token); toast.success('Copiado'); }}
                  >
                    <Copy className="size-4" />
                  </Button>
                </div>
                <p className="text-xs text-amber-600">
                  Este token no se volverá a mostrar. Válido por 24 horas.
                </p>
              </div>
            )}
            <div className="border rounded-md p-3 space-y-1 text-sm">
              <p className="font-medium">Credenciales del portal</p>
              <p><span className="text-muted-foreground">Email:</span> {distributor.email}</p>
              <p><span className="text-muted-foreground">Contraseña:</span> la definida al crear / actualizar</p>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

// ─── OrderDetailDialog ────────────────────────────────────────────────────────
function OrderDetailDialog({
  orderId,
  onClose,
}: {
  orderId: number | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [payForm, setPayForm] = useState({ amount: '', method: 'transfer', reference: '', payment_date: new Date().toISOString().split('T')[0] });

  const orderQ = useQuery({
    queryKey: ['b2b-order', orderId],
    queryFn: () => b2bApi.getOrder(orderId!),
    enabled: !!orderId,
  });

  const actionMut = useMutation({
    mutationFn: (action: 'confirm' | 'ship' | 'deliver' | 'cancel') => {
      if (action === 'confirm') return b2bApi.confirmOrder(orderId!);
      if (action === 'ship') return b2bApi.shipOrder(orderId!);
      if (action === 'deliver') return b2bApi.deliverOrder(orderId!);
      return b2bApi.cancelOrder(orderId!);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['b2b-order', orderId] });
      qc.invalidateQueries({ queryKey: ['b2b-orders'] });
      toast.success('Pedido actualizado');
    },
    onError: () => toast.error('Error al actualizar pedido'),
  });

  const payMut = useMutation({
    mutationFn: () => b2bApi.registerPayment(orderId!, {
      amount: parseFloat(payForm.amount),
      method: payForm.method,
      reference: payForm.reference || undefined,
      payment_date: payForm.payment_date,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['b2b-order', orderId] });
      qc.invalidateQueries({ queryKey: ['b2b-orders'] });
      setPayForm(p => ({ ...p, amount: '' }));
      toast.success('Pago registrado');
    },
    onError: () => toast.error('Error al registrar pago'),
  });

  type FullOrder = B2bOrder & {
    items?: { id: number; product_name: string; quantity: number; unit_price: number; subtotal: number }[];
    distributor?: { name: string; code: string; phone?: string };
  };
  const order = orderQ.data?.data as unknown as FullOrder | undefined;

  if (!orderId) return null;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Pedido {order?.order_number ?? '...'}</DialogTitle>
        </DialogHeader>
        {orderQ.isLoading ? (
          <p className="text-center py-8 text-muted-foreground">Cargando...</p>
        ) : order ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Badge variant={statusColors[order.status] as 'default' | 'secondary' | 'destructive'}>
                {statusLabels[order.status]}
              </Badge>
              <Badge variant={payStatusColors[order.payment_status] as 'default' | 'secondary'}>
                {payStatusLabels[order.payment_status]}
              </Badge>
              <span className="ml-auto text-sm text-muted-foreground">
                {order.distributor?.name} ({order.distributor?.code})
              </span>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead className="text-right">Cant.</TableHead>
                  <TableHead className="text-right">Precio</TableHead>
                  <TableHead className="text-right">Subtotal</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {order.items?.map(item => (
                  <TableRow key={item.id}>
                    <TableCell>{item.product_name}</TableCell>
                    <TableCell className="text-right">{item.quantity}</TableCell>
                    <TableCell className="text-right font-mono">{fmt(item.unit_price)}</TableCell>
                    <TableCell className="text-right font-mono">{fmt(item.subtotal)}</TableCell>
                  </TableRow>
                ))}
                <TableRow>
                  <TableCell colSpan={3} className="text-right font-bold">Total:</TableCell>
                  <TableCell className="text-right font-bold font-mono">{fmt(order.total)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>

            {/* Pagos */}
            <div className="border rounded-md p-3 space-y-2">
              <p className="text-sm font-medium">Registrar pago</p>
              <div className="flex gap-2">
                <Input
                  type="number"
                  placeholder="Monto"
                  value={payForm.amount}
                  onChange={e => setPayForm(p => ({ ...p, amount: e.target.value }))}
                  className="w-32"
                />
                <Input
                  type="date"
                  value={payForm.payment_date}
                  onChange={e => setPayForm(p => ({ ...p, payment_date: e.target.value }))}
                  className="w-36"
                />
                <Select value={payForm.method} onValueChange={v => setPayForm(p => ({ ...p, method: v }))}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="transfer">Transferencia</SelectItem>
                    <SelectItem value="cash">Efectivo</SelectItem>
                    <SelectItem value="check">Cheque</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  onClick={() => payMut.mutate()}
                  disabled={!payForm.amount || payMut.isPending}
                >
                  <DollarSign className="size-4 mr-1" /> Registrar
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Pagado: {fmt(order.paid_amount)} / {fmt(order.total)}
              </p>
            </div>

            {/* Acciones de estado */}
            <div className="flex gap-2 flex-wrap">
              {order.status === 'pending' && (
                <Button size="sm" onClick={() => actionMut.mutate('confirm')}>
                  Confirmar pedido
                </Button>
              )}
              {['confirmed', 'processing'].includes(order.status) && (
                <Button size="sm" onClick={() => actionMut.mutate('ship')}>
                  Marcar enviado
                </Button>
              )}
              {order.status === 'shipped' && (
                <Button size="sm" onClick={() => actionMut.mutate('deliver')}>
                  Marcar entregado
                </Button>
              )}
              {!['delivered', 'cancelled'].includes(order.status) && (
                <Button size="sm" variant="destructive" onClick={() => actionMut.mutate('cancel')}>
                  Cancelar
                </Button>
              )}
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

// ─── DistributorsTab ──────────────────────────────────────────────────────────
function DistributorsTab() {
  const [search, setSearch] = useState('');
  const [createDlg, setCreateDlg] = useState(false);
  const [selectedDist, setSelectedDist] = useState<Distributor | null>(null);

  const distQ = useQuery({
    queryKey: ['b2b-distributors', search],
    queryFn: () => b2bApi.distributors({ search: search || undefined }),
  });

  const distributors = (distQ.data?.data as unknown as { data?: Distributor[] } | undefined)?.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input
          placeholder="Buscar distribuidor..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Button className="ml-auto" onClick={() => setCreateDlg(true)}>
          <Plus className="size-4 mr-2" /> Nuevo distribuidor
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Nombre / Empresa</TableHead>
              <TableHead>Email</TableHead>
              <TableHead className="text-right">Cupo</TableHead>
              <TableHead className="text-right">Saldo</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Pedidos</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {distQ.isLoading ? (
              <TableRow><TableCell colSpan={8} className="text-center py-8">Cargando...</TableCell></TableRow>
            ) : distributors.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Sin distribuidores</TableCell></TableRow>
            ) : distributors.map(d => (
              <TableRow key={d.id}>
                <TableCell className="font-mono text-xs">{d.code}</TableCell>
                <TableCell>
                  <p className="font-medium">{d.name}</p>
                  <p className="text-xs text-muted-foreground">{d.company ?? '—'}</p>
                </TableCell>
                <TableCell className="text-sm">{d.email}</TableCell>
                <TableCell className="text-right font-mono text-sm">{fmt(d.credit_limit)}</TableCell>
                <TableCell className="text-right font-mono text-sm text-destructive">{fmt(d.balance)}</TableCell>
                <TableCell>
                  <Badge variant={d.status === 'active' ? 'default' : 'secondary'}>
                    {d.status === 'active' ? 'Activo' : d.status === 'inactive' ? 'Inactivo' : 'Suspendido'}
                  </Badge>
                </TableCell>
                <TableCell className="text-center">{d.orders_count ?? 0}</TableCell>
                <TableCell>
                  <Button size="sm" variant="ghost" onClick={() => setSelectedDist(d)}>
                    <Eye className="size-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <CreateDistributorDialog open={createDlg} onClose={() => setCreateDlg(false)} />
      <DistributorDetailDialog distributor={selectedDist} onClose={() => setSelectedDist(null)} />
    </div>
  );
}

// ─── OrdersTab ────────────────────────────────────────────────────────────────
function OrdersTab() {
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);

  const ordersQ = useQuery({
    queryKey: ['b2b-orders', statusFilter],
    queryFn: () => b2bApi.orders({ status: statusFilter === 'all' ? undefined : statusFilter }),
  });

  const orders = (ordersQ.data?.data as unknown as { data?: B2bOrder[] } | undefined)?.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="pending">Pendiente</SelectItem>
            <SelectItem value="confirmed">Confirmado</SelectItem>
            <SelectItem value="shipped">Enviado</SelectItem>
            <SelectItem value="delivered">Entregado</SelectItem>
            <SelectItem value="cancelled">Cancelado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Pedido</TableHead>
              <TableHead>Distribuidor</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Pago</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {ordersQ.isLoading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8">Cargando...</TableCell></TableRow>
            ) : orders.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Sin pedidos</TableCell></TableRow>
            ) : orders.map(o => (
              <TableRow key={o.id}>
                <TableCell className="font-mono font-medium">{o.order_number}</TableCell>
                <TableCell className="text-sm">{o.distributor?.name ?? '—'}</TableCell>
                <TableCell>
                  <Badge variant={statusColors[o.status] as 'default' | 'secondary' | 'destructive'}>
                    {statusLabels[o.status]}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={payStatusColors[o.payment_status] as 'default' | 'secondary'}>
                    {payStatusLabels[o.payment_status]}
                  </Badge>
                </TableCell>
                <TableCell className="text-right font-mono">{fmt(o.total)}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {new Date(o.created_at).toLocaleDateString('es-CO')}
                </TableCell>
                <TableCell>
                  <Button size="sm" variant="ghost" onClick={() => setSelectedOrderId(o.id)}>
                    <Eye className="size-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <OrderDetailDialog orderId={selectedOrderId} onClose={() => setSelectedOrderId(null)} />
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function B2bPage() {
  const params = useParams();
  const slug = params.slug as string;

  const distQ = useQuery({
    queryKey: ['b2b-distributors'],
    queryFn: () => b2bApi.distributors(),
  });
  const ordersQ = useQuery({
    queryKey: ['b2b-orders'],
    queryFn: () => b2bApi.orders(),
  });

  const totalDist = (distQ.data?.data as unknown as { total?: number } | undefined)?.total ?? 0;
  const totalOrders = (ordersQ.data?.data as unknown as { total?: number } | undefined)?.total ?? 0;
  const pendingOrders = (ordersQ.data?.data as unknown as { data?: B2bOrder[] } | undefined)?.data?.filter(o => o.status === 'pending').length ?? 0;
  const totalBilled = (ordersQ.data?.data as unknown as { data?: B2bOrder[] } | undefined)?.data?.reduce((s, o) => s + o.total, 0) ?? 0;

  return (
    <AddonGate moduleKey="b2b" slug={slug}>
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Portal B2B</h1>
        <p className="text-muted-foreground text-sm">Gestión de distribuidores, precios especiales y pedidos B2B</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 flex items-center gap-3">
            <Users className="size-8 text-primary" />
            <div>
              <p className="text-2xl font-bold">{totalDist}</p>
              <p className="text-xs text-muted-foreground">Distribuidores</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 flex items-center gap-3">
            <ShoppingCart className="size-8 text-primary" />
            <div>
              <p className="text-2xl font-bold">{totalOrders}</p>
              <p className="text-xs text-muted-foreground">Pedidos totales</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 flex items-center gap-3">
            <Package className="size-8 text-amber-500" />
            <div>
              <p className="text-2xl font-bold text-amber-600">{pendingOrders}</p>
              <p className="text-xs text-muted-foreground">Pendientes</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 flex items-center gap-3">
            <DollarSign className="size-8 text-green-500" />
            <div>
              <p className="text-2xl font-bold text-green-600">{fmt(totalBilled)}</p>
              <p className="text-xs text-muted-foreground">Facturado B2B</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="distributors">
        <TabsList>
          <TabsTrigger value="distributors">Distribuidores</TabsTrigger>
          <TabsTrigger value="orders">Pedidos</TabsTrigger>
        </TabsList>
        <TabsContent value="distributors" className="mt-4">
          <DistributorsTab />
        </TabsContent>
        <TabsContent value="orders" className="mt-4">
          <OrdersTab />
        </TabsContent>
      </Tabs>
    </div>
    </AddonGate>
  );
}
