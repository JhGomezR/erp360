'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { replenishmentApi } from '@/lib/api/tenant.api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RefreshCw, AlertTriangle, Settings, Package } from 'lucide-react';
import { toast } from 'sonner';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AlertProduct {
  id: number;
  name: string;
  sku: string;
  current_stock: number;
  reorder_point: number;
  reorder_qty: number | null;
  auto_reorder: boolean;
  supplier_name: string | null;
  shortage: number;
}

interface SettingsProduct {
  id: number;
  name: string;
  sku: string;
  reorder_point: number | null;
  reorder_qty: number | null;
  auto_reorder: boolean;
  preferred_supplier_id: number | null;
  supplier_name: string | null;
}

// ─── Edit Settings Dialog ─────────────────────────────────────────────────────

function EditSettingsDialog({ product, onClose }: { product: SettingsProduct; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    reorder_point: product.reorder_point ?? '',
    reorder_qty: product.reorder_qty ?? '',
    auto_reorder: product.auto_reorder,
  });

  const mut = useMutation({
    mutationFn: () => replenishmentApi.updateSettings(product.id, form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['replenishment'] });
      toast.success('Configuración actualizada');
      onClose();
    },
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Config. Reposición</DialogTitle>
          <p className="text-sm text-gray-500">{product.name} — {product.sku}</p>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div>
            <label className="font-medium">Punto de reorden (unidades)</label>
            <Input type="number" value={form.reorder_point} onChange={e => setForm(p => ({ ...p, reorder_point: e.target.value }))} placeholder="Ej: 10" min={0} />
            <p className="text-xs text-gray-400 mt-1">Cuando el stock baja a este nivel, se genera la alerta/OC</p>
          </div>
          <div>
            <label className="font-medium">Cantidad a reponer</label>
            <Input type="number" value={form.reorder_qty} onChange={e => setForm(p => ({ ...p, reorder_qty: e.target.value }))} placeholder="Ej: 50" min={1} />
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="auto" checked={form.auto_reorder} onChange={e => setForm(p => ({ ...p, auto_reorder: e.target.checked }))} className="rounded" />
            <label htmlFor="auto" className="font-medium">Reposición automática (genera OC automáticamente)</label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
            {mut.isPending ? 'Guardando...' : 'Guardar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ReplenishmentPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState('alerts');
  const [editProduct, setEditProduct] = useState<SettingsProduct | null>(null);

  const alertsQ   = useQuery({ queryKey: ['replenishment', 'alerts'], queryFn: () => replenishmentApi.alerts(), enabled: tab === 'alerts' });
  const settingsQ = useQuery({ queryKey: ['replenishment', 'settings'], queryFn: () => replenishmentApi.settings(), enabled: tab === 'settings' });

  const alerts: AlertProduct[]     = (alertsQ.data as unknown as { data: { data: AlertProduct[] } })?.data?.data ?? [];
  const settings: SettingsProduct[] = (settingsQ.data as unknown as { data: { data: SettingsProduct[] } })?.data?.data ?? [];

  const triggerMut = useMutation({
    mutationFn: () => replenishmentApi.trigger(),
    onSuccess: () => {
      toast.success('Reposición ejecutada. Las OC se generaron automáticamente.');
      qc.invalidateQueries({ queryKey: ['replenishment'] });
    },
  });

  const autoCount   = alerts.filter(a => a.auto_reorder).length;
  const manualCount = alerts.filter(a => !a.auto_reorder).length;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Reposición Automática de Inventario</h1>
          <p className="text-sm text-gray-500">Genera órdenes de compra automáticas cuando el stock baja del punto de reorden</p>
        </div>
        <Button onClick={() => triggerMut.mutate()} disabled={triggerMut.isPending}>
          <RefreshCw className={`w-4 h-4 mr-2 ${triggerMut.isPending ? 'animate-spin' : ''}`} />
          {triggerMut.isPending ? 'Ejecutando...' : 'Ejecutar reposición ahora'}
        </Button>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-500" />
              <span className="text-sm text-gray-500">Productos bajo reorder</span>
            </div>
            <div className="text-2xl font-bold text-red-600 mt-1">{alerts.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-green-500" />
              <span className="text-sm text-gray-500">Con reposición automática</span>
            </div>
            <div className="text-2xl font-bold text-green-600 mt-1">{autoCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <Package className="w-4 h-4 text-orange-500" />
              <span className="text-sm text-gray-500">Solo alertas (manuales)</span>
            </div>
            <div className="text-2xl font-bold text-orange-600 mt-1">{manualCount}</div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="alerts"><AlertTriangle className="w-4 h-4 mr-2" />Alertas de Stock</TabsTrigger>
          <TabsTrigger value="settings"><Settings className="w-4 h-4 mr-2" />Configuración</TabsTrigger>
        </TabsList>

        {/* Alerts */}
        <TabsContent value="alerts">
          <Card>
            <CardHeader>
              <CardTitle>Productos bajo el punto de reorden</CardTitle>
              <p className="text-sm text-gray-500">
                Los productos con <strong>reposición automática</strong> generarán OC automáticamente al ejecutar.
              </p>
            </CardHeader>
            <CardContent>
              {alertsQ.isLoading ? (
                <div className="text-center py-8 text-gray-400">Cargando...</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-gray-500">
                      <th className="pb-2">Producto</th>
                      <th className="text-right">Stock actual</th>
                      <th className="text-right">Punto reorden</th>
                      <th className="text-right">Faltante</th>
                      <th className="text-right">Qty a pedir</th>
                      <th>Proveedor</th>
                      <th>Auto OC</th>
                    </tr>
                  </thead>
                  <tbody>
                    {alerts.map(p => (
                      <tr key={p.id} className="border-b hover:bg-gray-50">
                        <td className="py-2">
                          <div className="font-medium">{p.name}</div>
                          <div className="text-xs text-gray-500">{p.sku}</div>
                        </td>
                        <td className="text-right text-red-600 font-bold">{p.current_stock}</td>
                        <td className="text-right text-gray-600">{p.reorder_point}</td>
                        <td className="text-right text-red-600 font-medium">{p.shortage}</td>
                        <td className="text-right text-blue-600">{p.reorder_qty ?? '—'}</td>
                        <td className="text-gray-600">{p.supplier_name ?? <span className="text-orange-500">Sin proveedor</span>}</td>
                        <td>
                          {p.auto_reorder
                            ? <span className="px-2 py-0.5 rounded text-xs bg-green-100 text-green-700">Auto</span>
                            : <span className="px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-500">Manual</span>}
                        </td>
                      </tr>
                    ))}
                    {alerts.length === 0 && (
                      <tr><td colSpan={7} className="text-center py-8 text-green-600">¡Todo el inventario está sobre el punto de reorden!</td></tr>
                    )}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Settings */}
        <TabsContent value="settings">
          <Card>
            <CardHeader>
              <CardTitle>Configuración por Producto</CardTitle>
              <p className="text-sm text-gray-500">Define el punto de reorden, cantidad a pedir y si la reposición es automática.</p>
            </CardHeader>
            <CardContent>
              {settingsQ.isLoading ? (
                <div className="text-center py-8 text-gray-400">Cargando...</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-gray-500">
                      <th className="pb-2">Producto</th>
                      <th className="text-right">Punto reorden</th>
                      <th className="text-right">Qty reposición</th>
                      <th>Proveedor preferido</th>
                      <th>Auto OC</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {settings.map(p => (
                      <tr key={p.id} className="border-b hover:bg-gray-50">
                        <td className="py-2">
                          <div className="font-medium">{p.name}</div>
                          <div className="text-xs text-gray-500">{p.sku}</div>
                        </td>
                        <td className="text-right">{p.reorder_point ?? <span className="text-gray-400">—</span>}</td>
                        <td className="text-right">{p.reorder_qty ?? <span className="text-gray-400">—</span>}</td>
                        <td className="text-gray-600">{p.supplier_name ?? '—'}</td>
                        <td>
                          {p.auto_reorder
                            ? <span className="px-2 py-0.5 rounded text-xs bg-green-100 text-green-700">Sí</span>
                            : <span className="px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-500">No</span>}
                        </td>
                        <td>
                          <Button size="sm" variant="outline" onClick={() => setEditProduct(p)}>
                            <Settings className="w-3 h-3" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                    {settings.length === 0 && (
                      <tr><td colSpan={6} className="text-center py-8 text-gray-400">Configure el punto de reorden en cada producto</td></tr>
                    )}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {editProduct && <EditSettingsDialog product={editProduct} onClose={() => setEditProduct(null)} />}
    </div>
  );
}
