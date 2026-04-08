'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { valuationApi } from '@/lib/api/tenant.api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { RefreshCw, TrendingUp } from 'lucide-react';

type ValuationRow = {
  product_id: number; product_name: string; sku: string;
  method: string; quantity: number; unit_cost: number; total_value: number;
};

const methodLabels: Record<string, string> = {
  fifo: 'FIFO', lifo: 'LIFO', average: 'Promedio',
};
const methodColors: Record<string, string> = {
  fifo: 'bg-blue-50 text-blue-700', lifo: 'bg-purple-50 text-purple-700', average: 'bg-green-50 text-green-700',
};

function fmt(n: number) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);
}

export function ValuationTab() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [editId, setEditId] = useState<number | null>(null);
  const [editMethod, setEditMethod] = useState<'fifo' | 'lifo' | 'average'>('average');

  const portfolioQ = useQuery({
    queryKey: ['inventory-valuation'],
    queryFn: () => valuationApi.portfolio(),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, method }: { id: number; method: 'fifo' | 'lifo' | 'average' }) =>
      valuationApi.updateMethod(id, method),
    onSuccess: () => {
      toast.success('Método de valoración actualizado');
      qc.invalidateQueries({ queryKey: ['inventory-valuation'] });
      setEditId(null);
    },
    onError: () => toast.error('Error al actualizar método'),
  });

  type PortfolioData = { rows?: ValuationRow[]; grand_total?: number; generated_at?: string };
  const data = portfolioQ.data?.data as unknown as PortfolioData | undefined;
  const rows = (data?.rows ?? []).filter(r =>
    !search || r.product_name.toLowerCase().includes(search.toLowerCase()) || r.sku?.toLowerCase().includes(search.toLowerCase())
  );
  const grandTotal = data?.grand_total ?? 0;

  const byMethod = rows.reduce((acc, r) => {
    acc[r.method] = (acc[r.method] ?? 0) + r.total_value;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-4">
        <Card className="col-span-4 lg:col-span-1">
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Valor total inventario</p>
            <p className="text-2xl font-bold">{fmt(grandTotal)}</p>
            {data?.generated_at && (
              <p className="text-xs text-muted-foreground mt-1">
                {new Date(data.generated_at).toLocaleString('es-CO')}
              </p>
            )}
          </CardContent>
        </Card>
        {(['fifo', 'lifo', 'average'] as const).map(m => (
          <Card key={m}>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">{methodLabels[m]}</p>
              <p className="text-xl font-bold">{fmt(byMethod[m] ?? 0)}</p>
              <p className="text-xs text-muted-foreground">
                {rows.filter(r => r.method === m).length} productos
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex gap-2 items-center">
        <Input
          placeholder="Buscar producto..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => qc.invalidateQueries({ queryKey: ['inventory-valuation'] })}
        >
          <RefreshCw className="size-4 mr-2" /> Recalcular
        </Button>
        <p className="text-sm text-muted-foreground ml-auto">
          {rows.length} productos con stock
        </p>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Producto</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead className="text-right">Stock</TableHead>
              <TableHead>Método</TableHead>
              <TableHead className="text-right">Costo unitario</TableHead>
              <TableHead className="text-right">Valor total</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {portfolioQ.isLoading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8">Calculando valoración...</TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Sin productos con stock</TableCell></TableRow>
            ) : rows.map(row => (
              <TableRow key={row.product_id}>
                <TableCell className="font-medium">{row.product_name}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">{row.sku}</TableCell>
                <TableCell className="text-right">{row.quantity.toLocaleString('es-CO')}</TableCell>
                <TableCell>
                  {editId === row.product_id ? (
                    <div className="flex gap-1">
                      <Select
                        value={editMethod}
                        onValueChange={v => setEditMethod(v as 'fifo' | 'lifo' | 'average')}
                      >
                        <SelectTrigger className="h-7 w-28 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="fifo">FIFO</SelectItem>
                          <SelectItem value="lifo">LIFO</SelectItem>
                          <SelectItem value="average">Promedio</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => updateMut.mutate({ id: row.product_id, method: editMethod })}
                        disabled={updateMut.isPending}
                      >
                        OK
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 px-1" onClick={() => setEditId(null)}>✕</Button>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setEditId(row.product_id); setEditMethod(row.method as 'fifo' | 'lifo' | 'average'); }}
                      className={`px-2 py-0.5 rounded text-xs font-medium ${methodColors[row.method]}`}
                    >
                      {methodLabels[row.method] ?? row.method}
                    </button>
                  )}
                </TableCell>
                <TableCell className="text-right font-mono">{fmt(row.unit_cost)}</TableCell>
                <TableCell className="text-right font-mono font-medium">{fmt(row.total_value)}</TableCell>
                <TableCell>
                  <TrendingUp className="size-4 text-muted-foreground" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {rows.length > 0 && (
        <div className="flex justify-end">
          <p className="text-sm font-medium">
            Total portafolio: <span className="font-bold text-lg">{fmt(rows.reduce((s, r) => s + r.total_value, 0))}</span>
          </p>
        </div>
      )}
    </div>
  );
}
