/**
 * PRUEBA DE PICO (Spike Test)
 * Tipo: Estrés, Pico repentino de tráfico
 *
 * Objetivo: Simular una llegada masiva repentina de usuarios (viral moment,
 *           lanzamiento, campaña de marketing). Verifica que el sistema
 *           no colapsa y se recupera rápido.
 *
 * Ejecutar: k6 run tests/load/spike.js --env BASE_URL=https://atlaserp.com.co
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const errorRate = new Rate('errors');

export const options = {
  stages: [
    { duration: '30s', target: 10  },   // Tráfico normal
    { duration: '10s', target: 500 },   // ¡PICO! — aumento brutal
    { duration: '3m',  target: 500 },   // Sostener el pico
    { duration: '10s', target: 10  },   // Caída rápida
    { duration: '3m',  target: 10  },   // ¿Se recupera?
    { duration: '30s', target: 0   },   // Fin
  ],
  thresholds: {
    http_req_failed:   ['rate<0.15'],   // Tolerar más errores en pico
    http_req_duration: ['p(95)<5000'],  // 5s en pico extremo
  },
};

const BASE_URL = __ENV.BASE_URL || 'https://atlaserp.com.co';

export default function () {
  const res = http.get(`${BASE_URL}/api/plans`);
  const ok  = check(res, { 'status OK': (r) => r.status < 500 });
  errorRate.add(!ok);
  sleep(1);
}
