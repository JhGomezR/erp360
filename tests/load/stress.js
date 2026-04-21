/**
 * PRUEBA DE ESTRÉS (Stress Test)
 * Tipo: Estrés, Límite del sistema
 *
 * Objetivo: Encontrar el punto de quiebre del sistema.
 * Incrementa usuarios hasta que el sistema falla o degrada.
 * Verifica que el sistema se recupera después del pico.
 *
 * Fases: Escalada agresiva hasta 500 VUs luego ramp down.
 *
 * Ejecutar: k6 run tests/load/stress.js --env BASE_URL=https://atlaserp.com.co
 * ⚠️  EJECUTAR SOLO EN HORARIO DE BAJO TRÁFICO
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const errorRate     = new Rate('errors');
const responseTime  = new Trend('response_time');

export const options = {
  stages: [
    { duration: '2m',  target: 100  },   // Carga normal
    { duration: '5m',  target: 100  },   // Estabilizar
    { duration: '2m',  target: 200  },   // Presión media
    { duration: '5m',  target: 200  },   // Estabilizar
    { duration: '2m',  target: 300  },   // Estrés alto
    { duration: '5m',  target: 300  },   // Estabilizar
    { duration: '2m',  target: 400  },   // Estrés muy alto
    { duration: '5m',  target: 400  },   // ¿Rompe aquí?
    { duration: '5m',  target: 0    },   // Recuperación
  ],
  thresholds: {
    http_req_failed:   ['rate<0.10'],    // Tolerar hasta 10% de errores en estrés
    http_req_duration: ['p(95)<3000'],   // 95% < 3s bajo estrés
    errors:            ['rate<0.10'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'https://atlaserp.com.co';

export default function () {
  // Solo endpoints sin estado — para estrés puro de servidor
  const res = http.get(`${BASE_URL}/api/plans?active_only=true`);
  responseTime.add(res.timings.duration);

  const ok = check(res, {
    'status 200': (r) => r.status === 200,
    'responde': (r) => r.timings.duration < 5000,
  });
  errorRate.add(!ok);

  sleep(0.5);
}

export function handleSummary(data) {
  return {
    'tests/load/results/stress-summary.json': JSON.stringify(data, null, 2),
  };
}
