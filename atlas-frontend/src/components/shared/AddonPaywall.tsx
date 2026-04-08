'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { Lock, Zap, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { billingApi } from '@/lib/api/tenant.api';
import { notify } from '@/lib/notify';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AddonConfig {
  moduleKey: string;
  name: string;
  description: string;
  price: string;          // e.g. "$30.000"
  features: string[];
}

interface AddonPaywallProps {
  config: AddonConfig;
  slug: string;
  children: React.ReactNode;
}

// ─── Registry of add-on UI configs ───────────────────────────────────────────

export const ADDON_CONFIGS: Record<string, Omit<AddonConfig, 'moduleKey'>> = {
  hrm: {
    name: 'RRHH y Nómina',
    description: 'Gestión completa de empleados, contratos, nómina electrónica DIAN, liquidaciones y vacaciones.',
    price: '$30.000',
    features: [
      'Empleados y contratos laborales',
      'Nómina electrónica DIAN',
      'Liquidaciones y prestaciones',
      'Vacaciones y ausencias',
      'Archivo PILA para seguridad social',
      'Exportación de nómina en Excel',
    ],
  },
  ecommerce: {
    name: 'Tienda en Línea',
    description: 'Publica tu catálogo en línea, recibe pedidos y gestiona envíos desde Atlas ERP.',
    price: '$25.000',
    features: [
      'Catálogo de productos público',
      'Carrito de compras y checkout',
      'Integración de pagos en línea',
      'Gestión de envíos y fulfillment',
      'Panel de pedidos online',
      'Sincronización automática de inventario',
    ],
  },
  workshop: {
    name: 'Taller y Órdenes de Trabajo',
    description: 'Gestión de órdenes de trabajo para talleres: diagnóstico, repuestos, mano de obra y facturación.',
    price: '$25.000',
    features: [
      'Órdenes de trabajo con diagnóstico',
      'Control de repuestos y mano de obra',
      'Historial de reparaciones por equipo',
      'Estimados y aprobación de cliente',
      'Facturación integrada desde la OT',
      'Seguimiento de estado en tiempo real',
    ],
  },
  kitchen: {
    name: 'Cocina y KDS',
    description: 'Sistema de visualización de cocina para restaurantes con comandas en tiempo real.',
    price: '$20.000',
    features: [
      'Display de cocina (KDS) en tiempo real',
      'Priorización automática de pedidos',
      'Control de tiempos de preparación',
      'Integración con POS y mesas',
      'Alertas de pedidos urgentes',
      'Estadísticas de rendimiento de cocina',
    ],
  },
  pharmacy: {
    name: 'Farmacia y Dispensación',
    description: 'Control especializado para droguerías: lotes, vencimientos, medicamentos controlados y formulario.',
    price: '$35.000',
    features: [
      'Control de lotes y fechas de vencimiento',
      'Medicamentos controlados con trazabilidad',
      'Formulario médico y dispensación',
      'Alertas de stock mínimo crítico',
      'Integración con POS farmacéutico',
      'Reportes de consumo y rotación',
    ],
  },
  manufacturing: {
    name: 'Manufactura y MRP',
    description: 'Planificación de producción, listas de materiales, órdenes de producción y control de piso.',
    price: '$45.000',
    features: [
      'Lista de materiales (BOM) multinivel',
      'Órdenes de producción',
      'Cálculo de requerimientos (MRP)',
      'Control de piso y avance',
      'Trazabilidad de lotes de producción',
      'Costos de fabricación en tiempo real',
    ],
  },
  tables: {
    name: 'Mesas y Salón',
    description: 'Gestión visual de mesas para restaurantes con pedidos por mesa y división de cuentas.',
    price: '$15.000',
    features: [
      'Plano visual del salón',
      'Asignación de mesas a meseros',
      'Pedidos por mesa desde POS',
      'División de cuentas entre comensales',
      'Fusión y transferencia de mesas',
      'Estado de mesas en tiempo real',
    ],
  },
  b2b: {
    name: 'Portal B2B y Distribuidores',
    description: 'Portal web para clientes mayoristas con pedidos en línea, cartera y precios escalonados.',
    price: '$35.000',
    features: [
      'Portal de pedidos para distribuidores',
      'Precios escalonados por volumen',
      'Consulta de cartera y estado de cuenta',
      'Aprobación de crédito y cupo',
      'Historial de pedidos y facturas',
      'Catálogo privado por cliente',
    ],
  },
  fleet: {
    name: 'Flota y Vehículos',
    description: 'Control de flota vehicular con mantenimientos, combustible, conductores y tarifas de flete.',
    price: '$30.000',
    features: [
      'Registro y hoja de vida de vehículos',
      'Mantenimiento preventivo y correctivo',
      'Control de consumo de combustible',
      'Gestión de conductores y licencias',
      'Tarifas de flete y calculadora',
      'Programación de rutas y viajes',
    ],
  },
  projects: {
    name: 'Proyectos y Gestión',
    description: 'Gestión de proyectos con fases, tareas, recursos, presupuesto y facturación por hito.',
    price: '$20.000',
    features: [
      'Proyectos con fases y tareas',
      'Asignación de recursos y tiempos',
      'Presupuesto vs. ejecutado',
      'Hitos de facturación',
      'Registro de horas trabajadas',
      'Dashboard de avance por proyecto',
    ],
  },
  quality: {
    name: 'Calidad e ISO',
    description: 'Control de calidad con checklists, no conformidades, acciones correctivas e indicadores.',
    price: '$25.000',
    features: [
      'Planes y checklists de calidad',
      'Registro de no conformidades',
      'Acciones correctivas y preventivas',
      'Indicadores de calidad (KPIs)',
      'Auditorías internas',
      'Soporte para certificaciones ISO',
    ],
  },
  crm: {
    name: 'CRM Avanzado',
    description: 'CRM completo con pipeline de ventas, seguimiento de oportunidades y analítica de embudo.',
    price: '$25.000',
    features: [
      'Pipeline visual de oportunidades',
      'Seguimiento de actividades y llamadas',
      'Cotizaciones desde el CRM',
      'Integración con WhatsApp',
      'Reportes de embudo de ventas',
      'Segmentación de clientes',
    ],
  },
  supply_chain: {
    name: 'Supply Chain y Logística',
    description: 'Gestión de cadena de suministro con proveedores, compras automatizadas y trazabilidad.',
    price: '$20.000',
    features: [
      'Gestión avanzada de proveedores',
      'Órdenes de compra automatizadas',
      'Recepción y control en bodega',
      'Trazabilidad de productos y lotes',
      'Análisis de lead times',
      'Alertas de reabastecimiento',
    ],
  },
  maintenance: {
    name: 'Mantenimiento Preventivo/Correctivo',
    description: 'Gestión de mantenimiento industrial con planes, órdenes de trabajo y KPIs de disponibilidad.',
    price: '$20.000',
    features: [
      'Planes de mantenimiento preventivo',
      'Órdenes de trabajo correctivas',
      'Historial por activo o equipo',
      'Checklists técnicos digitales',
      'KPIs de disponibilidad (MTTR/MTBF)',
      'Alertas de mantenimiento vencido',
    ],
  },
  finance: {
    name: 'Finanzas y Cartera',
    description: 'Módulo financiero avanzado con aging de cartera, cuentas por pagar y transferencias bancarias.',
    price: '$20.000',
    features: [
      'Análisis de cartera por antigüedad (aging)',
      'Gestión de cuentas por pagar',
      'Transferencias bancarias masivas',
      'Recordatorios de cobro automáticos',
      'Dashboard financiero consolidado',
      'Exportación de remesas bancarias',
    ],
  },
  budgets: {
    name: 'Presupuestos',
    description: 'Elaboración y control de presupuestos por área o proyecto con alertas de desviación.',
    price: '$15.000',
    features: [
      'Presupuestos por área o proyecto',
      'Seguimiento presupuesto vs. ejecutado',
      'Alertas de desviación',
      'Aprobación por niveles',
      'Vigencias y revisiones presupuestales',
      'Reportes de ejecución presupuestal',
    ],
  },
  fixed_assets: {
    name: 'Activos Fijos',
    description: 'Registro y depreciación de activos fijos con conciliación contable automática.',
    price: '$15.000',
    features: [
      'Registro de activos fijos',
      'Depreciación automática (múltiples métodos)',
      'Revaluación y ajuste de activos',
      'Bajas y traspasos de activos',
      'Conciliación con contabilidad',
      'Reportes de valor en libros',
    ],
  },
};

// ─── Paywall UI ───────────────────────────────────────────────────────────────

function PaywallUI({ config, addonId }: { config: AddonConfig; addonId: number | null }) {
  const requestMutation = useMutation({
    mutationFn: () => {
      if (!addonId) return Promise.reject(new Error('Add-on no disponible.'));
      return billingApi.requestAddon(addonId);
    },
    onSuccess: () => notify.success('Solicitud enviada. El equipo de Atlas ERP la procesará pronto.'),
    onError: (err: any) => notify.error(err?.response?.data?.message ?? 'Error al enviar la solicitud.'),
  });

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center px-4">
      <div className="size-20 rounded-full bg-blue-50 dark:bg-blue-950/30 flex items-center justify-center">
        <Lock className="size-9 text-blue-500" />
      </div>
      <div className="space-y-2 max-w-md">
        <h2 className="text-2xl font-bold tracking-tight">{config.name}</h2>
        <p className="text-muted-foreground">
          Este módulo es un <span className="font-semibold text-foreground">add-on de pago</span>.{' '}
          {config.description}
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-lg text-left">
        {config.features.map((feature) => (
          <div key={feature} className="flex items-center gap-2 text-sm">
            <CheckCircle className="size-4 text-green-500 shrink-0" />
            <span>{feature}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-col items-center gap-3">
        <div className="text-3xl font-bold">
          {config.price}<span className="text-base font-normal text-muted-foreground">/mes</span>
        </div>
        <Button
          size="lg"
          className="gap-2 px-8"
          onClick={() => requestMutation.mutate()}
          disabled={!addonId || requestMutation.isPending || requestMutation.isSuccess}
        >
          <Zap className="size-4" />
          {requestMutation.isSuccess
            ? 'Solicitud enviada'
            : requestMutation.isPending
              ? 'Enviando solicitud…'
              : 'Solicitar add-on'}
        </Button>
        <p className="text-xs text-muted-foreground">
          Un asesor se comunicará contigo para activar el servicio.
        </p>
      </div>
    </div>
  );
}

// ─── Main gate component ──────────────────────────────────────────────────────

/**
 * Wraps any module page with an add-on gate.
 * Shows a paywall if the tenant doesn't own the add-on; renders children otherwise.
 *
 * Usage:
 *   <AddonGate moduleKey="fleet" slug={slug}>
 *     <FleetContent />
 *   </AddonGate>
 */
export function AddonGate({ moduleKey, slug, children }: {
  moduleKey: string;
  slug: string;
  children: React.ReactNode;
}) {
  const { data: billingData, isLoading } = useQuery({
    queryKey: ['billing-addons', slug],
    queryFn: () => billingApi.addons().then((r) => r.data),
  });

  const addon = (billingData as any)?.available?.find((a: any) => a.module_key === moduleKey);
  const hasAddon = addon?.is_owned;
  const config = ADDON_CONFIGS[moduleKey];

  if (isLoading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96" />
        <Skeleton className="h-48 w-full rounded-lg" />
      </div>
    );
  }

  if (!config) {
    // moduleKey not in registry — assume access granted (base module)
    return <>{children}</>;
  }

  if (!hasAddon) {
    return (
      <PaywallUI
        config={{ moduleKey, ...config }}
        addonId={addon?.id ?? null}
      />
    );
  }

  return <>{children}</>;
}
