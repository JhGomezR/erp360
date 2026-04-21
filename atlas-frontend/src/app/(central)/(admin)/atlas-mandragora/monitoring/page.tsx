'use client';

import { useQuery } from '@tanstack/react-query';
import { dashboardApi } from '@/lib/api/central.api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Building2,
  TrendingUp,
  Clock,
  Ban,
  DollarSign,
  AlertCircle,
  Activity,
  UserCheck,
} from 'lucide-react';

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  color = 'text-primary',
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
            {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
          </div>
          <div className="p-2 bg-primary/10 rounded-lg">
            <Icon className="h-5 w-5 text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function MonitoringPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: () => dashboardApi.stats().then((r) => r.data),
    refetchInterval: 30_000,
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Monitoreo</h1>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-5 h-24 animate-pulse bg-muted/30 rounded-lg" />
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center gap-2 text-destructive p-6">
        <AlertCircle className="h-5 w-5" />
        <span>No se pudo cargar el dashboard. Verifica la conexión con el backend.</span>
      </div>
    );
  }

  const conversionPct =
    typeof data.trial_conversion_rate === 'number'
      ? `${data.trial_conversion_rate.toFixed(1)}%`
      : '—';

  const mrr =
    typeof data.mrr === 'number'
      ? `$${Number(data.mrr).toLocaleString('es-CO')}`
      : '—';

  const arr =
    typeof data.arr === 'number'
      ? `$${Number(data.arr).toLocaleString('es-CO')}`
      : '—';

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Monitoreo</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Indicadores clave de la plataforma en tiempo real · actualiza cada 30s
        </p>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Building2}
          label="Total Tenants"
          value={data.total_tenants ?? '—'}
          sub={`${data.new_tenants_this_month ?? 0} nuevos este mes`}
        />
        <StatCard
          icon={UserCheck}
          label="Tenants Activos"
          value={data.active_tenants ?? '—'}
          color="text-green-600"
        />
        <StatCard
          icon={Clock}
          label="En Período de Prueba"
          value={data.trial_tenants ?? '—'}
          sub={`Conversión: ${conversionPct}`}
          color="text-amber-600"
        />
        <StatCard
          icon={Ban}
          label="Suspendidos"
          value={data.suspended_tenants ?? '—'}
          color="text-destructive"
        />
        <StatCard
          icon={DollarSign}
          label="MRR"
          value={mrr}
          sub="Ingreso mensual recurrente"
          color="text-green-600"
        />
        <StatCard
          icon={TrendingUp}
          label="ARR"
          value={arr}
          sub="Ingreso anual recurrente"
        />
        <StatCard
          icon={Activity}
          label="Conversión Trial → Pago"
          value={conversionPct}
          sub="Últimos 30 días"
        />
        <StatCard
          icon={AlertCircle}
          label="Add-ons Activos"
          value={data.addon_requests_pending ?? 0}
          sub="En todos los tenants"
        />
      </div>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Actividad Reciente</CardTitle>
        </CardHeader>
        <CardContent>
          {data.recent_activity && data.recent_activity.length > 0 ? (
            <div className="divide-y">
              {data.recent_activity.map((item) => (
                <div key={item.id} className="flex items-center justify-between py-3 text-sm">
                  <div className="flex items-center gap-3">
                    <div className="h-2 w-2 rounded-full bg-primary shrink-0" />
                    <div>
                      <span className="font-medium">{item.tenant}</span>
                      <span className="text-muted-foreground ml-2">— {item.action}</span>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-xs shrink-0">
                    {new Date(item.created_at).toLocaleDateString('es-CO', {
                      day: '2-digit',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No hay actividad reciente registrada.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
