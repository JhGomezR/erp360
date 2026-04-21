/**
 * PRUEBA DE SEGURIDAD BAJO CARGA — Brute Force & Rate Limiting
 * Tipo: Seguridad, Penetración bajo carga
 *
 * Objetivo: Verificar que el rate limiting funciona bajo carga real.
 * Simula un ataque de fuerza bruta distribuido.
 *
 * Ejecutar: k6 run tests/load/security_load.js --env BASE_URL=https://atlaserp.com.co
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Counter } from 'k6/metrics';

const blockedRate    = new Rate('requests_blocked');
const attackAttempts = new Counter('attack_attempts');

export const options = {
  scenarios: {
    brute_force_attack: {
      executor: 'constant-arrival-rate',
      rate: 30,             // 30 requests por segundo (ataque)
      timeUnit: '1s',
      duration: '2m',
      preAllocatedVUs: 50,
    },
  },
  thresholds: {
    // El sistema DEBE bloquear la mayoría de intentos de brute force
    'requests_blocked': ['rate>0.5'],  // > 50% deben ser bloqueados (429)
  },
};

const BASE_URL = __ENV.BASE_URL || 'https://atlaserp.com.co';

export default function () {
  const response = http.post(
    `${BASE_URL}/api/auth/login`,
    JSON.stringify({
      email:    `hacker${Math.random()}@evil.com`,
      password: `wrong${Math.random()}`,
    }),
    { headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' } }
  );

  attackAttempts.add(1);

  // Queremos ver 429 (rate limited) o 401 (credenciales inválidas)
  // NUNCA 200 (no debería autenticar payloads aleatorios)
  const blocked = response.status === 429;
  blockedRate.add(blocked);

  check(response, {
    'no autentica sin credenciales': (r) => r.status !== 200,
    'rate limited o rechazado': (r) => [401, 422, 429].includes(r.status),
  });

  // Sin sleep — simular ataque continuo
}
