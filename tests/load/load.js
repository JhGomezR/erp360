/**
 * PRUEBA DE CARGA (Load Test)
 * Tipo: Rendimiento, Carga normal esperada
 *
 * Objetivo: Simular carga esperada en producción (50 usuarios concurrentes).
 * Verifica que el sistema mantiene SLAs bajo uso normal.
 *
 * Fases:
 * - Ramp up: 0 → 50 usuarios en 2 min
 * - Steady state: 50 usuarios durante 5 min
 * - Ramp down: 50 → 0 usuarios en 1 min
 *
 * Ejecutar: k6 run tests/load/load.js --env BASE_URL=https://atlaserp.com.co
 */
import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

const errorRate        = new Rate('errors');
const authSuccessRate  = new Rate('auth_success');
const plansFetchTime   = new Trend('plans_fetch_ms');
const loginTime        = new Trend('login_ms');
const totalRequests    = new Counter('total_requests');

export const options = {
  stages: [
    { duration: '2m',  target: 50  },  // Ramp up a 50 VUs
    { duration: '5m',  target: 50  },  // Mantener 50 VUs
    { duration: '1m',  target: 0   },  // Ramp down
  ],
  thresholds: {
    http_req_failed:   ['rate<0.05'],    // < 5% de errores
    http_req_duration: ['p(95)<1000', 'p(99)<2000'],  // 95% < 1s, 99% < 2s
    errors:            ['rate<0.05'],
    auth_success:      ['rate>0.95'],    // > 95% de logins exitosos
  },
};

const BASE_URL = __ENV.BASE_URL || 'https://atlaserp.com.co';

// Usuarios de prueba — usar credenciales demo
const TEST_USERS = [
  { email: 'admin@tienda-demo.com',  password: 'Atlas@2025!' },
  { email: 'admin@rest-demo.com',    password: 'Atlas@2025!' },
  { email: 'admin@drug-demo.com',    password: 'Atlas@2025!' },
];

function getRandomUser() {
  return TEST_USERS[Math.floor(Math.random() * TEST_USERS.length)];
}

export default function () {
  const user = getRandomUser();

  group('Landing page pública', () => {
    // Planes
    const plans = http.get(`${BASE_URL}/api/plans?active_only=true`);
    plansFetchTime.add(plans.timings.duration);
    totalRequests.add(1);
    check(plans, {
      'planes 200': (r) => r.status === 200,
      'planes tiene datos': (r) => {
        try { return JSON.parse(r.body).length > 0; } catch { return false; }
      },
    });
    errorRate.add(plans.status !== 200);

    // Tipos de negocio
    const types = http.get(`${BASE_URL}/api/business-types`);
    totalRequests.add(1);
    check(types, { 'tipos 200': (r) => r.status === 200 });
  });

  sleep(Math.random() * 2 + 1);  // Pausa realista 1-3s

  group('Autenticación central', () => {
    const loginPayload = JSON.stringify({
      email:    user.email,
      password: user.password,
    });

    const loginResp = http.post(`${BASE_URL}/api/auth/login`, loginPayload, {
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    });
    loginTime.add(loginResp.timings.duration);
    totalRequests.add(1);

    const loginOk = check(loginResp, {
      'login 200': (r) => r.status === 200,
      'login tiene token': (r) => {
        try { return !!JSON.parse(r.body).token; } catch { return false; }
      },
      'login < 2s': (r) => r.timings.duration < 2000,
    });
    authSuccessRate.add(loginOk);
    errorRate.add(!loginOk);

    if (loginOk) {
      const body  = JSON.parse(loginResp.body);
      const token = body.token;

      sleep(1);

      // Perfil autenticado
      const me = http.get(`${BASE_URL}/api/auth/me`, {
        headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
      });
      totalRequests.add(1);
      check(me, { 'me 200': (r) => r.status === 200 });

      sleep(Math.random() * 2);

      // Logout
      http.post(`${BASE_URL}/api/auth/logout`, null, {
        headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
      });
      totalRequests.add(1);
    }
  });

  sleep(Math.random() * 3 + 2);  // Pausa entre sesiones
}
