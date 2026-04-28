/**
 * Credenciales para E2E.
 *
 * Sobreescribibles vía env vars (GitHub Secrets en CI). Si no se proveen, se
 * usan los defaults que funcionan contra una BD seedeada con DatabaseSeeder
 * en entorno local/dev.
 *
 * Para CI contra producción, definir en Settings → Secrets → Actions:
 *   E2E_SUPER_EMAIL              (default: super@atlas.dev)
 *   E2E_SUPER_PASSWORD           (default: SuperAtlas@2025!)
 *   E2E_TENANT_DEMO_SLUG         (default: tienda-demo)
 *   E2E_TENANT_DEMO_EMAIL        (default: admin@tienda-demo.com)
 *   E2E_TENANT_DEMO_PASSWORD     (default: Atlas@2025!)
 *   E2E_TENANT_REST_SLUG         (default: rest-demo)
 *   E2E_TENANT_REST_EMAIL        (default: admin@rest-demo.com)
 *   E2E_TENANT_REST_PASSWORD     (default: Atlas@2025!)
 *   E2E_TENANT_PHARMACY_SLUG     (default: drug-demo)
 *   E2E_TENANT_PHARMACY_EMAIL    (default: admin@drug-demo.com)
 *   E2E_TENANT_PHARMACY_PASSWORD (default: Atlas@2025!)
 */

const env = (typeof process !== 'undefined' && process.env) ? process.env : {};

// Defaults verificados contra producción (atlaserp.com.co) el 2026-04-27.
// Si producción cambia, actualizar aquí o sobreescribir vía secrets E2E_*.
export const SUPER_ADMIN = {
  email:    env.E2E_SUPER_EMAIL    ?? 'super@atlas.dev',
  password: env.E2E_SUPER_PASSWORD ?? 'Atlas@Super2024!',
};

export const TENANT_DEMO = {
  slug:     env.E2E_TENANT_DEMO_SLUG     ?? 'tienda-demo',
  email:    env.E2E_TENANT_DEMO_EMAIL    ?? 'admin@tienda-demo.com',
  password: env.E2E_TENANT_DEMO_PASSWORD ?? 'Atlas@2025!',
};

export const TENANT_REST = {
  slug:     env.E2E_TENANT_REST_SLUG     ?? 'restaurante-demo',
  email:    env.E2E_TENANT_REST_EMAIL    ?? 'admin@rest-demo.com',
  password: env.E2E_TENANT_REST_PASSWORD ?? 'Atlas@2025!',
};

export const TENANT_PHARMACY = {
  slug:     env.E2E_TENANT_PHARMACY_SLUG     ?? 'drogueria-demo',
  email:    env.E2E_TENANT_PHARMACY_EMAIL    ?? 'admin@drug-demo.com',
  password: env.E2E_TENANT_PHARMACY_PASSWORD ?? 'Atlas@2025!',
};
