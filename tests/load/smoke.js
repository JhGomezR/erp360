/**
 * PRUEBA DE HUMO (Smoke Test)
 * Tipo: Rendimiento, Carga mínima
 *
 * Objetivo: Verificar que el sistema funciona bajo carga mínima (1 usuario).
 * Úsalo antes de cualquier prueba de carga para confirmar que el sistema responde.
 *
 * Ejecutar: k6 run tests/load/smoke.js
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const errorRate  = new Rate('errors');
const loginTime  = new Trend('login_duration');
const plansTime  = new Trend('plans_duration');

export const options = {
  vus: 1,              // 1 usuario virtual
  duration: '30s',     // Durante 30 segundos
  thresholds: {
    http_req_failed:    ['rate<0.01'],     // < 1% de errores
    http_req_duration:  ['p(95)<800'],     // 95% de requests < 800ms (cold start tolerance)
    errors:             ['rate<0.01'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'https://atlaserp.com.co';

export default function () {
  // 1. Health check (la API expone /api/health, no /health)
  const health = http.get(`${BASE_URL}/api/health`);
  check(health, {
    'health OK': (r) => r.status === 200,
    'health < 200ms': (r) => r.timings.duration < 200,
  });

  // 2. Planes públicos
  const plans = http.get(`${BASE_URL}/api/plans?active_only=true`);
  plansTime.add(plans.timings.duration);
  check(plans, {
    'planes OK': (r) => r.status === 200,
    'planes es JSON': (r) => r.headers['Content-Type'].includes('application/json'),
    'planes < 300ms': (r) => r.timings.duration < 300,
  });
  errorRate.add(plans.status !== 200);

  // 3. Tipos de negocio
  const types = http.get(`${BASE_URL}/api/business-types`);
  check(types, {
    'business-types OK': (r) => r.status === 200,
    'business-types < 300ms': (r) => r.timings.duration < 300,
  });

  sleep(1);
}
