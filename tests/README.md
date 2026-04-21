# Atlas ERP — Suite Completa de Pruebas

## Arquitectura de Testing

```
tests/
├── e2e/                     # Playwright — E2E (Funcional, Regresión, Seguridad, Alfa/Beta)
│   ├── playwright.config.ts  # Chrome, Firefox, Galaxy S8, iPhone 12
│   ├── package.json
│   ├── auth/
│   │   └── login.spec.ts    # Login, logout, XSS, enumeración, localStorage
│   ├── tenant/
│   │   └── dashboard.spec.ts # Acceso tenant, aislamiento, exchange token, roles
│   ├── admin/
│   │   └── plans.spec.ts    # CRUD planes, tipos de negocio, control de acceso
│   ├── regression/
│   │   └── full-flow.spec.ts # Los 5 bugs de producción como tests de regresión
│   ├── security/
│   │   └── xss-e2e.spec.ts  # XSS, SQLi, Open Redirect, headers, Clickjacking
│   └── alpha-beta/
│       └── landing.spec.ts  # Alpha (core), Beta (UX, perf, mobile, a11y)
│
└── load/                    # k6 — Load, Stress, Spike, Security Load
    ├── smoke.js             # 1 VU, 30s — sanity check (en cada push)
    ├── load.js              # 50 VUs, flujo completo auth (nightly)
    ├── stress.js            # Hasta 400 VUs, busca punto de quiebre (nightly)
    ├── spike.js             # 0→500 VUs en 10s, tráfico viral (nightly)
    └── security_load.js     # Brute force 30 req/s, verifica rate limiting (nightly)
```

```
atlas-backend/tests/         # PHPUnit — Unit, Feature, Security, Performance
├── Unit/
│   ├── Central/Auth/LoginActionTest.php      # Caja Blanca: lógica de login
│   ├── Central/Plans/PlanValidationTest.php  # Caja Blanca: validación de planes
│   └── Shared/SecurityHelpersTest.php        # Caja Blanca: helpers de seguridad
├── Feature/
│   ├── Api/Central/AuthApiTest.php           # Integración: API de auth
│   ├── Api/Central/PlansApiTest.php          # Integración: API de planes
│   └── Middleware/RateLimitingTest.php       # Caja Gris: rate limiting
├── Security/
│   ├── XssInjectionTest.php                  # XSS almacenado y reflejado
│   ├── SqlInjectionTest.php                  # SQLi en todos los endpoints
│   ├── AuthorizationTest.php                 # IDOR, escalada de privilegios
│   └── InfoDisclosureTest.php               # Divulgación de información
└── Performance/
    └── ApiResponseTimeTest.php              # SLA: tiempos de respuesta
```

---

## Ejecución por Tipo

### PHPUnit (Backend)

```bash
cd atlas-backend

# Todos los tests
php artisan test

# Por suite
php artisan test --testsuite=Unit
php artisan test --testsuite=Feature
php artisan test --testsuite=Security
php artisan test --testsuite=Performance

# Con cobertura
php artisan test --coverage
```

### Playwright (E2E)

```bash
cd tests/e2e
npm install
npx playwright install

# Todos los tests
npx playwright test

# Por tipo (usando tags)
npx playwright test --grep @functional
npx playwright test --grep @regression
npx playwright test --grep @security
npx playwright test --grep "@alpha|@beta"

# Por browser
npx playwright test --project=chromium
npx playwright test --project=firefox
npx playwright test --project=mobile-android

# Por módulo
npx playwright test auth/
npx playwright test tenant/
npx playwright test admin/

# Ver reporte HTML
npx playwright show-report results/html
```

### k6 (Load Tests)

```bash
# Smoke — sanity check (30s, 1 VU)
k6 run tests/load/smoke.js --env BASE_URL=https://atlaserp.com.co

# Load — carga normal (8min, 50 VUs)
k6 run tests/load/load.js --env BASE_URL=https://atlaserp.com.co

# Stress — busca límite (26min, hasta 400 VUs)
# ⚠️ Solo en horario de bajo tráfico
k6 run tests/load/stress.js --env BASE_URL=https://atlaserp.com.co

# Spike — tráfico viral (7min, pico a 500 VUs)
k6 run tests/load/spike.js --env BASE_URL=https://atlaserp.com.co

# Security load — brute force (2min, 30 req/s)
k6 run tests/load/security_load.js --env BASE_URL=https://atlaserp.com.co
```

---

## CI/CD — Cuándo corre cada suite

| Suite | Push a master | PR | Nightly (02:00 UTC) |
|-------|:---:|:---:|:---:|
| PHPUnit Unit | ✅ | ✅ | ✅ |
| PHPUnit Feature | ✅ | ✅ | ✅ |
| PHPUnit Security | ✅ | ✅ | ✅ |
| PHPUnit Performance | ✅ | ✅ | ✅ |
| ESLint + Build | ✅ | ✅ | ✅ |
| Composer/NPM Audit | ✅ | ✅ | ✅ |
| k6 Smoke | ✅ | — | ✅ |
| k6 Load | — | — | ✅ |
| k6 Stress | — | — | ✅ |
| k6 Spike | — | — | ✅ |
| k6 Security Load | — | — | ✅ |
| Playwright Chromium | ✅* | — | ✅ |
| Playwright Firefox | ✅* | — | ✅ |
| Playwright Mobile | ✅* | — | ✅ |

*Solo en push a master (requiere producción operativa)

---

## Tipos de Prueba Cubiertos

| Tipo | Herramienta | Archivos |
|------|-------------|---------|
| Unitarias (Caja Blanca) | PHPUnit | `tests/Unit/**` |
| Integración (Caja Negra API) | PHPUnit | `tests/Feature/**` |
| Funcionales E2E | Playwright | `e2e/auth/`, `e2e/tenant/`, `e2e/admin/` |
| Caja Gris (Rate Limiting) | PHPUnit | `Feature/Middleware/RateLimitingTest` |
| XSS | PHPUnit + Playwright | `Security/XssInjectionTest` + `e2e/security/` |
| SQL Injection | PHPUnit + Playwright | `Security/SqlInjectionTest` + `e2e/security/` |
| Penetración / IDOR | PHPUnit | `Security/AuthorizationTest` |
| Divulgación de Info | PHPUnit + Playwright | `Security/InfoDisclosureTest` + `e2e/security/` |
| Rendimiento / SLA | PHPUnit | `Performance/ApiResponseTimeTest` |
| Carga Normal | k6 | `load/load.js` |
| Estrés | k6 | `load/stress.js` |
| Pico (Spike) | k6 | `load/spike.js` |
| Seguridad bajo carga | k6 | `load/security_load.js` |
| Regresión | Playwright | `e2e/regression/full-flow.spec.ts` |
| Alfa | Playwright | `e2e/alpha-beta/landing.spec.ts` (suite @alpha) |
| Beta | Playwright | `e2e/alpha-beta/landing.spec.ts` (suite @beta) |
| Estructural | PHPUnit (Unit) | `Unit/Shared/SecurityHelpersTest` |
| Multi-browser | Playwright | Chrome, Firefox, Galaxy S8, iPhone 12 |
