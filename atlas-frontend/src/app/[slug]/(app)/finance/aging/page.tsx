'use client';

import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { agingApi } from '@/lib/api/tenant.api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DollarSign, AlertTriangle, Send, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AgingSummary {
  total_receivable: number;
  current: number;
  overdue: number;
  critical_overdue: number;
  customer_count: number;
  invoice_count: number;
  collection_rate: number;
}

interface AgingBucket {
  label: string;
  days: string;
  total: number;
  invoices: AgingInvoice[];
}

interface AgingInvoice {
  id: number;
  invoice_number: string;
  customer_name: string;
  customer_email: string;
  balance: number;
  due_date: string;
  days_overdue: number;
}

interface CustomerSummary {
  customer_id: number;
  customer_name: string;
  customer_email: string;
  invoice_count: number;
  total_balance: number;
  overdue: number;
  oldest_overdue: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmt = (v: number) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(v);

function BucketCard({ bucket }: { bucket: AgingBucket }) {
  const [expanded, setExpanded] = useState(false);
  const hasAmount = bucket.total > 0;

  return (
    <Card className={hasAmount ? 'border-orange-200' : ''}>
      <CardHeader className="pb-2 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm">{bucket.label}</CardTitle>
            <div className="text-xs text-gray-500 mt-0.5">{bucket.invoices.length} facturas</div>
          </div>
          <div className={`text-lg font-bold ${hasAmount ? 'text-orange-600' : 'text-gray-400'}`}>
            {fmt(bucket.total)}
          </div>
        </div>
      </CardHeader>
      {expanded && bucket.invoices.length > 0 && (
        <CardContent className="pt-0">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b text-gray-500">
                <th className="text-left pb-1">Factura</th>
                <th className="text-left">Cliente</th>
                <th className="text-right">Saldo</th>
                <th className="text-right">Días</th>
              </tr>
            </thead>
            <tbody>
              {bucket.invoices.map((inv: AgingInvoice) => (
                <tr key={inv.id} className="border-b hover:bg-gray-50">
                  <td className="py-1 font-mono">{inv.invoice_number}</td>
                  <td>{inv.customer_name}</td>
                  <td className="text-right font-medium">{fmt(inv.balance)}</td>
                  <td className="text-right text-red-600">{inv.days_overdue}d</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      )}
    </Card>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AgingPage() {
  const [tab, setTab] = useState('report');

  const summaryQ = useQuery({ queryKey: ['aging', 'summary'], queryFn: () => agingApi.summary() });
  const reportQ  = useQuery({ queryKey: ['aging', 'report'], queryFn: () => agingApi.report(), enabled: tab === 'report' });
  const logQ     = useQuery({ queryKey: ['aging', 'log'], queryFn: () => agingApi.collectionLog(), enabled: tab === 'log' });

  const summary: AgingSummary = (summaryQ.data as unknown as { data: AgingSummary })?.data ?? {} as AgingSummary;
  const report   = (reportQ.data as unknown as { data: { buckets: Record<string, AgingBucket>; by_customer: CustomerSummary[]; grand_total: number; as_of: string } })?.data;
  const buckets  = report?.buckets ? Object.values(report.buckets) : [];
  const byCustomer: CustomerSummary[] = report?.by_customer ?? [];

  const reminderMut = useMutation({
    mutationFn: () => agingApi.sendReminders({ days_overdue_min: 1 }),
    onSuccess: (res: unknown) => {
      const d = (res as { data: { sent: number; failed: number } }).data;
      toast.success(`Recordatorios enviados: ${d.sent} clientes`);
    },
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Cartera de Cobros — Aging</h1>
          <p className="text-sm text-gray-500">Reporte de antigüedad de cuentas por cobrar</p>
        </div>
        <Button onClick={() => reminderMut.mutate()} disabled={reminderMut.isPending}>
          <Send className="w-4 h-4 mr-2" />
          {reminderMut.isPending ? 'Enviando...' : 'Enviar recordatorios'}
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total CxC', value: summary.total_receivable, icon: DollarSign, color: 'text-blue-600' },
          { label: 'Al día', value: summary.current, icon: TrendingUp, color: 'text-green-600' },
          { label: 'Vencido', value: summary.overdue, icon: AlertTriangle, color: 'text-red-600' },
          { label: 'Tasa cobro', value: `${summary.collection_rate ?? 0}%`, icon: TrendingUp, color: summary.collection_rate > 80 ? 'text-green-600' : 'text-orange-500', isText: true },
        ].map(({ label, value, icon: Icon, color, isText }) => (
          <Card key={label}>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2">
                <Icon className={`w-4 h-4 ${color}`} />
                <span className="text-sm text-gray-500">{label}</span>
              </div>
              <div className={`text-xl font-bold mt-1 ${color}`}>
                {isText ? value : fmt(typeof value === 'number' ? value : 0)}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="report">Reporte Aging</TabsTrigger>
          <TabsTrigger value="customers">Por Cliente</TabsTrigger>
          <TabsTrigger value="log">Log de Cobros</TabsTrigger>
        </TabsList>

        {/* Aging buckets */}
        <TabsContent value="report">
          {reportQ.isLoading ? (
            <div className="text-center py-12 text-gray-400">Calculando aging...</div>
          ) : (
            <div className="space-y-4">
              <div className="text-sm text-gray-500">
                Al {report?.as_of} — Total: <strong className="text-gray-900">{fmt(report?.grand_total ?? 0)}</strong>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {buckets.map((b: AgingBucket) => <BucketCard key={b.label} bucket={b} />)}
              </div>
            </div>
          )}
        </TabsContent>

        {/* Por cliente */}
        <TabsContent value="customers">
          <Card>
            <CardContent className="pt-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-gray-500">
                    <th className="pb-2">Cliente</th>
                    <th className="text-right">Facturas</th>
                    <th className="text-right">Saldo total</th>
                    <th className="text-right">Vencido</th>
                    <th className="text-right">Días máx.</th>
                  </tr>
                </thead>
                <tbody>
                  {byCustomer.map(c => (
                    <tr key={c.customer_id} className="border-b hover:bg-gray-50">
                      <td className="py-2">
                        <div className="font-medium">{c.customer_name}</div>
                        <div className="text-xs text-gray-500">{c.customer_email}</div>
                      </td>
                      <td className="text-right">{c.invoice_count}</td>
                      <td className="text-right font-medium">{fmt(c.total_balance)}</td>
                      <td className={`text-right font-medium ${c.overdue > 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {fmt(c.overdue)}
                      </td>
                      <td className={`text-right ${c.oldest_overdue > 90 ? 'text-red-600 font-bold' : c.oldest_overdue > 30 ? 'text-orange-500' : ''}`}>
                        {c.oldest_overdue}d
                      </td>
                    </tr>
                  ))}
                  {byCustomer.length === 0 && (
                    <tr><td colSpan={5} className="text-center py-8 text-gray-400">Sin cartera pendiente</td></tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Log */}
        <TabsContent value="log">
          <Card>
            <CardContent className="pt-4">
              {logQ.isLoading ? (
                <div className="text-center py-8 text-gray-400">Cargando...</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-gray-500">
                      <th className="pb-2">Cliente</th>
                      <th>Canal</th>
                      <th className="text-right">Facturas</th>
                      <th className="text-right">Saldo notificado</th>
                      <th>Enviado</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {((logQ.data as unknown as { data: { data: unknown[] } })?.data?.data ?? []).map((log: unknown, i: number) => {
                      const l = log as { id: number; customer_name: string; channel: string; invoice_count: number; total_balance: number; sent_at: string; status: string };
                      return (
                        <tr key={i} className="border-b hover:bg-gray-50">
                          <td className="py-2">{l.customer_name}</td>
                          <td className="capitalize">{l.channel}</td>
                          <td className="text-right">{l.invoice_count}</td>
                          <td className="text-right">{fmt(l.total_balance)}</td>
                          <td className="text-xs text-gray-500">{new Date(l.sent_at).toLocaleString('es-CO')}</td>
                          <td><span className="px-2 py-0.5 rounded text-xs bg-green-100 text-green-700">{l.status}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
