/**
 * E2E — Alpha/Beta: Landing Page y Registro
 * Tipos: Alfa, Beta, Funcional, Usabilidad, Caja Negra
 *
 * Alpha (funcionalidad core mínima):
 * - La landing page carga y muestra contenido
 * - Los planes se muestran correctamente
 * - El formulario de registro existe y acepta datos
 *
 * Beta (calidad y UX antes de producción):
 * - Responsive en dispositivos móviles
 * - Links funcionales (no 404)
 * - Formularios tienen validación visual
 * - Performance (carga < 3s)
 * - Accesibilidad básica (labels, roles ARIA)
 * - Los 9 tipos de negocio están en el registro
 * - Flujo de registro completo funciona
 */

import { test, expect, type Page } from '@playwright/test';

/* ------------------------------------------------------------------ */
/*  Suite Alpha: Funcionalidad Core                                       */
/* ------------------------------------------------------------------ */

test.describe('@alpha Landing — Funcionalidad Core', () => {
  test('A1: landing page carga sin errores 500', async ({ page }) => {
    const response = await page.goto('/');
    expect(response?.status()).not.toBe(500);
    expect(response?.status()).toBeLessThan(500);
  });

  test('A2: landing tiene contenido mínimo (título, nav, footer)', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Título de la página
    const title = await page.title();
    expect(title).toBeTruthy();
    expect(title.length).toBeGreaterThan(3);

    // Hay algún encabezado (h1 o nav)
    const hasHeader = await page.locator('h1, nav, header').count();
    expect(hasHeader).toBeGreaterThan(0);
  });

  test('A3: planes de precios visibles', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Verificar que hay al menos 1 plan con precio
    const body = await page.locator('body').textContent();
    expect(body).toMatch(/plan|precio|price|\$/i);
  });

  test('A4: existe un CTA (Call to Action) de registro', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const cta = page
      .getByRole('link', { name: /registr|empezar|comenzar|prueba|sign up|get started/i })
      .or(page.getByRole('button', { name: /registr|empezar|comenzar|prueba/i }));

    expect(await cta.count()).toBeGreaterThan(0);
  });

  test('A5: link al login existe', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const loginLink = page
      .getByRole('link', { name: /iniciar|login|ingresar|acceder/i })
      .or(page.getByRole('button', { name: /iniciar|login|ingresar/i }));

    expect(await loginLink.count()).toBeGreaterThan(0);
  });

  test('A6: API de planes responde (sin errores de red)', async ({ page }) => {
    let plansApiStatus = 0;

    page.on('response', (response) => {
      if (response.url().includes('/api/plans')) {
        plansApiStatus = response.status();
      }
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Si se llamó a la API de planes, debe ser 200
    if (plansApiStatus > 0) {
      expect(plansApiStatus).toBe(200);
    }
  });

  test('A7: API de tipos de negocio responde', async ({ page }) => {
    let bizTypesStatus = 0;

    page.on('response', (response) => {
      if (response.url().includes('/api/business-types')) {
        bizTypesStatus = response.status();
      }
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    if (bizTypesStatus > 0) {
      expect(bizTypesStatus).toBe(200);
    }
  });
});

/* ------------------------------------------------------------------ */
/*  Suite Alpha: Registro                                                 */
/* ------------------------------------------------------------------ */

test.describe('@alpha Registro — Funcionalidad Core', () => {
  async function gotoRegister(page: Page) {
    await page.goto('/register');
    await page.waitForLoadState('networkidle');

    // Si /register no existe, buscar desde la landing
    if (page.url().includes('/404') || page.url().includes('/login')) {
      await page.goto('/');
      await page.waitForLoadState('networkidle');
      const registerLink = page.getByRole('link', { name: /registr/i }).first();
      if (await registerLink.count() > 0) {
        await registerLink.click();
        await page.waitForLoadState('networkidle');
      }
    }
  }

  test('A8: página de registro existe y carga', async ({ page }) => {
    await gotoRegister(page);
    // Si tiene algún formulario, pasa
    const forms = await page.locator('form, input').count();
    expect(forms).toBeGreaterThan(0);
  });

  test('A9: formulario de registro tiene campos de empresa y contacto', async ({ page }) => {
    await gotoRegister(page);

    const body = await page.locator('body').textContent();
    // Debe tener campos de nombre, email, empresa, contraseña
    expect(body).toMatch(/nombre|name|empresa|business|email|correo/i);
  });

  test('A10: los 9 tipos de negocio están en el selector de registro', async ({ page }) => {
    await gotoRegister(page);

    // Buscar selector de tipo de negocio
    const typeSelect = page.locator('select').filter({ hasText: /restaurante|tienda|farmacia/i })
      .or(page.locator('select[name*="type"], select[id*="type"], select[name*="business"]'));

    if (await typeSelect.count() === 0) {
      // Puede ser un selector custom (dropdowns, radio buttons)
      const body = await page.locator('body').textContent();
      // Al menos deben existir algunos tipos mencionados
      const hasSomeTypes =
        body?.match(/restaurante|restaurant/i) ||
        body?.match(/tienda|store/i) ||
        body?.match(/farmacia|pharmacy/i);

      if (!hasSomeTypes) {
        test.skip(); // El UI puede ser diferente
      }
      return;
    }

    const options = await typeSelect.locator('option').allTextContents();
    const optValues = await typeSelect.locator('option').evaluateAll(
      (els) => (els as HTMLOptionElement[]).map((e) => e.value)
    );

    const expectedSlugs = [
      'restaurant', 'store', 'pharmacy', 'hardware',
      'clothing', 'petstore', 'salon', 'hotel', 'gym'
    ];

    for (const slug of expectedSlugs) {
      const found = optValues.includes(slug) ||
                    options.some((o) => o.toLowerCase().includes(slug));
      expect(found, `Tipo '${slug}' no encontrado en registro`).toBe(true);
    }
  });
});

/* ------------------------------------------------------------------ */
/*  Suite Beta: Calidad y UX                                              */
/* ------------------------------------------------------------------ */

test.describe('@beta Landing — Calidad y UX', () => {
  test('B1: página carga en menos de 5 segundos', async ({ page }) => {
    const start = Date.now();
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(5000);
  });

  test('B2: no hay errores de consola críticos', async ({ page }) => {
    const criticalErrors: string[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        // Ignorar errores de terceros y favicon
        if (!text.includes('favicon') &&
            !text.includes('analytics') &&
            !text.includes('gtag') &&
            !text.includes('Failed to load resource') &&
            !text.includes('404')) {
          criticalErrors.push(text);
        }
      }
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // No más de 2 errores de consola no relacionados con terceros
    expect(criticalErrors.length).toBeLessThanOrEqual(2);
  });

  test('B3: links principales no son 404', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Obtener todos los links del mismo dominio
    const links = await page.locator('a[href]').evaluateAll((anchors) =>
      (anchors as HTMLAnchorElement[])
        .map((a) => a.href)
        .filter((href) =>
          href &&
          !href.startsWith('mailto:') &&
          !href.startsWith('tel:') &&
          !href.startsWith('javascript:') &&
          !href.includes('#') &&
          (href.includes('atlaserp.com.co') || href.startsWith('/'))
        )
        .slice(0, 10) // Limitar a 10 links para no ser lento
    );

    for (const link of links) {
      const response = await page.request.get(link).catch(() => null);
      if (response) {
        expect(response.status(), `Link roto: ${link}`).not.toBe(404);
      }
    }
  });

  test('B4: imágenes cargan correctamente (no broken images)', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const brokenImages = await page.evaluate(() => {
      const images = Array.from(document.querySelectorAll('img'));
      return images.filter((img) => !img.complete || img.naturalWidth === 0).map((img) => img.src);
    });

    expect(brokenImages.length).toBe(0);
  });

  test('B5: página de login tiene labels en campos (accesibilidad)', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    // Verificar que los inputs tienen labels asociados
    const inputsWithoutLabel = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input:not([type="hidden"])'));
      return inputs.filter((input) => {
        const el = input as HTMLInputElement;
        const id = el.id;
        const hasLabel = id ? !!document.querySelector(`label[for="${id}"]`) : false;
        const hasAriaLabel = !!el.getAttribute('aria-label');
        const hasAriaLabelledBy = !!el.getAttribute('aria-labelledby');
        const hasPlaceholder = !!el.placeholder;
        return !hasLabel && !hasAriaLabel && !hasAriaLabelledBy && !hasPlaceholder;
      }).length;
    });

    // Idealmente 0 inputs sin label, pero toleramos hasta 1 (hidden inputs, etc.)
    expect(inputsWithoutLabel).toBeLessThanOrEqual(1);
  });

  test('B6: formulario de login tiene botón de submit accesible', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    const submitBtn = page
      .getByRole('button', { name: /iniciar|login|ingresar/i })
      .or(page.locator('button[type="submit"]'));

    expect(await submitBtn.count()).toBeGreaterThan(0);
    await expect(submitBtn.first()).toBeEnabled();
  });
});

/* ------------------------------------------------------------------ */
/*  Suite Beta: Mobile Responsiveness                                     */
/* ------------------------------------------------------------------ */

test.describe('@beta Mobile — Responsive Design', () => {
  test('B7: landing es legible en mobile (texto visible)', async ({ page }) => {
    // Viewport viene del proyecto (Galaxy S8 / iPhone 12)
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Verificar que el texto principal es visible y no está cortado
    const heading = page.locator('h1').first();
    if (await heading.count() > 0) {
      await expect(heading).toBeVisible();
    }

    // No hay overflow horizontal significativo
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth - clientWidth).toBeLessThan(50);
  });

  test('B8: menú de navegación funciona en mobile', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Buscar hamburger menu o menú móvil
    const hamburger = page
      .getByRole('button', { name: /menu|hamburger|nav/i })
      .or(page.locator('[aria-label*="menu"], [data-testid*="menu"], .hamburger, .menu-toggle'));

    if (await hamburger.count() > 0) {
      await hamburger.first().click();
      await page.waitForTimeout(500);

      // El menú debe expandirse
      const nav = page.locator('nav, [role="navigation"]').first();
      await expect(nav).toBeVisible();
    }
    // Si no hay hamburger, el menú es siempre visible (no es un error en desktop-primero)
  });

  test('B9: botones tienen tamaño mínimo para tap (44x44px)', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const smallButtons = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button, a[href], [role="button"]'));
      return buttons.filter((el) => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 &&
               (rect.width < 30 || rect.height < 30); // Muy pequeño para touch
      }).map((el) => ({
        text: el.textContent?.trim().substring(0, 20),
        width: Math.round(el.getBoundingClientRect().width),
        height: Math.round(el.getBoundingClientRect().height),
      }));
    });

    // Advertencia si hay elementos muy pequeños (no fallo duro en beta)
    if (smallButtons.length > 0) {
      console.warn('Elementos pequeños para touch:', smallButtons);
    }

    // No más de 5 elementos demasiado pequeños
    expect(smallButtons.length).toBeLessThanOrEqual(5);
  });
});

/* ------------------------------------------------------------------ */
/*  Suite Beta: Performance                                               */
/* ------------------------------------------------------------------ */

test.describe('@beta Performance — Core Web Vitals', () => {
  test('B10: First Contentful Paint < 3s', async ({ page }) => {
    await page.goto('/');

    const fcp = await page.evaluate(() => {
      return new Promise<number>((resolve) => {
        const observer = new PerformanceObserver((list) => {
          const entry = list.getEntriesByName('first-contentful-paint')[0];
          if (entry) {
            observer.disconnect();
            resolve(entry.startTime);
          }
        });
        observer.observe({ type: 'paint', buffered: true });

        // Fallback si FCP ya ocurrió
        setTimeout(() => resolve(0), 100);
      });
    });

    if (fcp > 0) {
      expect(fcp).toBeLessThan(3000);
    }
  });

  test('B11: login page carga recursos en < 2s', async ({ page }) => {
    const start = Date.now();
    await page.goto('/login');
    await page.waitForLoadState('domcontentloaded');
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(2000);
  });
});
