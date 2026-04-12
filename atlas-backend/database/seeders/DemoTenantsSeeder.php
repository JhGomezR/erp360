<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

/**
 * Orquesta la creación de todos los tenants de demostración.
 *
 * Ejecución completa:    php artisan db:seed --class=DemoTenantsSeeder
 * Un tipo específico:    php artisan db:seed --class=StoreDemoSeeder
 *                        php artisan db:seed --class=RestaurantDemoSeeder
 *                        php artisan db:seed --class=PharmacyDemoSeeder
 *                        php artisan db:seed --class=WorkshopDemoSeeder
 *                        php artisan db:seed --class=SalonDemoSeeder
 *
 * ┌──────────────────────────────┬─────────────────────────┬──────────────────┐
 * │  Tipo de Negocio             │  Email Admin            │  Password        │
 * ├──────────────────────────────┼─────────────────────────┼──────────────────┤
 * │  Tienda La Esperanza         │  admin@tienda-demo.com  │  Atlas@2025!     │
 * │  Restaurante El Rincón       │  admin@rest-demo.com    │  Atlas@2025!     │
 * │  Droguería San Rafael        │  admin@drug-demo.com    │  Atlas@2025!     │
 * │  Taller Mecánico Auto Fix    │  admin@taller-demo.com  │  Atlas@2025!     │
 * │  Salón Belleza y Estilo      │  admin@salon-demo.com   │  Atlas@2025!     │
 * └──────────────────────────────┴─────────────────────────┴──────────────────┘
 */
class DemoTenantsSeeder extends Seeder
{
    public function run(): void
    {
        $this->command?->newLine();
        $this->command?->line('  ── Creando tenants de demostración ──────────────────────');

        $this->call([
            StoreDemoSeeder::class,
            RestaurantDemoSeeder::class,
            PharmacyDemoSeeder::class,
            WorkshopDemoSeeder::class,
            SalonDemoSeeder::class,
        ]);

        $this->command?->newLine();
        $this->command?->line('  ┌──────────────────────────────────────────────────────────────────┐');
        $this->command?->line('  │             CREDENCIALES DEMO — Password: Atlas@2025!           │');
        $this->command?->line('  ├──────────────────────────────┬─────────────────────────┐        │');
        $this->command?->line('  │  Tienda La Esperanza         │  admin@tienda-demo.com  │        │');
        $this->command?->line('  │  Restaurante El Rincón       │  admin@rest-demo.com    │        │');
        $this->command?->line('  │  Droguería San Rafael        │  admin@drug-demo.com    │        │');
        $this->command?->line('  │  Taller Mecánico Auto Fix    │  admin@taller-demo.com  │        │');
        $this->command?->line('  │  Salón Belleza y Estilo      │  admin@salon-demo.com   │        │');
        $this->command?->line('  └──────────────────────────────┴─────────────────────────┘        │');
        $this->command?->newLine();
    }
}
