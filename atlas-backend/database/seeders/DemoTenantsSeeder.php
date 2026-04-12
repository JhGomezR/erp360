<?php

namespace Database\Seeders;

use App\Central\Modules\Models\BusinessType;
use App\Central\Plans\Models\Plan;
use App\Central\Tenants\Models\Tenant;
use App\Models\User;
use App\Shared\Tenant\TenantContext;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

/**
 * Crea 5 tenants de demostración, uno por cada tipo de negocio principal.
 * Cada tenant incluye: categorías, productos con stock, clientes y ventas históricas.
 *
 * Ejecución independiente:  php artisan db:seed --class=DemoTenantsSeeder
 * Ejecución completa:       php artisan db:seed
 *
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │  CREDENCIALES DE ACCESO (todas con la misma contraseña)            │
 * ├──────────────────────────┬────────────────────────┬────────────────┤
 * │  Negocio                 │  Email                 │  Password      │
 * ├──────────────────────────┼────────────────────────┼────────────────┤
 * │  Tienda La Esperanza     │  admin@tienda-demo.com │  Atlas@2025!   │
 * │  Restaurante Rincón      │  admin@rest-demo.com   │  Atlas@2025!   │
 * │  Droguería San Rafael    │  admin@drug-demo.com   │  Atlas@2025!   │
 * │  Taller Auto Fix         │  admin@taller-demo.com │  Atlas@2025!   │
 * │  Salón Belleza y Estilo  │  admin@salon-demo.com  │  Atlas@2025!   │
 * └──────────────────────────┴────────────────────────┴────────────────┘
 */
class DemoTenantsSeeder extends Seeder
{
    private const PASSWORD = 'Atlas@2025!';

    /** @var array<string, array> */
    private array $demos = [
        [
            'business_name' => 'Tienda La Esperanza',
            'slug'          => 'tienda-demo',
            'email'         => 'admin@tienda-demo.com',
            'owner_name'    => 'Marcela Rodríguez',
            'business_type' => 'store',
            'plan_slug'     => 'profesional-store',
            'data_method'   => 'seedStore',
            'sale_prefix'   => 'VTA',
        ],
        [
            'business_name' => 'Restaurante El Rincón Criollo',
            'slug'          => 'restaurante-demo',
            'email'         => 'admin@rest-demo.com',
            'owner_name'    => 'Carlos Mejía',
            'business_type' => 'restaurant',
            'plan_slug'     => 'profesional-restaurant',
            'data_method'   => 'seedRestaurant',
            'sale_prefix'   => 'RST',
        ],
        [
            'business_name' => 'Droguería San Rafael',
            'slug'          => 'drogueria-demo',
            'email'         => 'admin@drug-demo.com',
            'owner_name'    => 'Ana María López',
            'business_type' => 'pharmacy',
            'plan_slug'     => 'profesional-store',
            'data_method'   => 'seedPharmacy',
            'sale_prefix'   => 'FAR',
        ],
        [
            'business_name' => 'Taller Mecánico Auto Fix',
            'slug'          => 'taller-demo',
            'email'         => 'admin@taller-demo.com',
            'owner_name'    => 'Rodrigo Vargas',
            'business_type' => 'workshop',
            'plan_slug'     => 'basico-store',
            'data_method'   => 'seedWorkshop',
            'sale_prefix'   => 'TLR',
        ],
        [
            'business_name' => 'Salón Belleza y Estilo',
            'slug'          => 'salon-demo',
            'email'         => 'admin@salon-demo.com',
            'owner_name'    => 'Valentina Castro',
            'business_type' => 'salon',
            'plan_slug'     => 'basico-store',
            'data_method'   => 'seedSalon',
            'sale_prefix'   => 'SLN',
        ],
    ];

    // ── Entrada principal ─────────────────────────────────────────────────────

    public function run(): void
    {
        $this->command?->newLine();
        $this->command?->line('  ── Creando tenants de demostración ──────────────────────');

        foreach ($this->demos as $demo) {
            $this->createDemoTenant($demo);
        }

        $this->printCredentialsSummary();
    }

    // ── Creación de tenant ────────────────────────────────────────────────────

    private function createDemoTenant(array $demo): void
    {
        if (Tenant::where('slug', $demo['slug'])->exists()) {
            $this->command?->line("  ⏭  [{$demo['slug']}] ya existe — omitido.");
            return;
        }

        $plan         = Plan::where('slug', $demo['plan_slug'])->first();
        $businessType = BusinessType::where('slug', $demo['business_type'])->first();

        if (! $plan) {
            $this->command?->warn("  ⚠  Plan '{$demo['plan_slug']}' no encontrado para [{$demo['slug']}].");
            return;
        }
        if (! $businessType) {
            $this->command?->warn("  ⚠  Tipo '{$demo['business_type']}' no encontrado para [{$demo['slug']}].");
            return;
        }

        try {
            // Crear o reutilizar el usuario propietario en central
            // (nunca eliminamos: podría estar referenciado por un tenant anterior)
            $owner = User::firstOrCreate(
                ['email' => $demo['email']],
                [
                    'name'     => $demo['owner_name'],
                    'password' => Hash::make(self::PASSWORD),
                ]
            );

            // Crear el tenant directamente con el slug controlado.
            // Esto dispara: CreateDatabase → MigrateDatabase → SeedDatabase (TenantSeeder)
            $tenant = Tenant::create([
                'slug'             => $demo['slug'],
                'name'             => $demo['business_name'],
                'schema_name'      => Tenant::generateSchemaName($demo['slug']),
                'business_type'    => $businessType->slug,
                'business_type_id' => $businessType->id,
                'plan_id'          => $plan->id,
                'owner_id'         => $owner->id,
                'status'           => 'active',
                'email'            => $demo['email'],
                'trial_ends_at'    => now()->addYear(),
            ]);

            // Sembrar módulos, settings y roles en el schema del tenant
            \App\Jobs\SeedTenantSetupJob::dispatch(
                $tenant->id,
                $businessType->id,
                false,
            );

            // Sembrar datos en el schema del tenant
            TenantContext::run($tenant, function () use ($demo) {
                $adminId = DB::table('tenant_users')
                    ->where('email', $demo['email'])
                    ->value('id');

                // Garantizar contraseña conocida (TenantSeeder puede haber usado aleatoria)
                DB::table('tenant_users')
                    ->where('id', $adminId)
                    ->update(['password' => Hash::make(self::PASSWORD)]);

                // Bodega principal
                $warehouseId = DB::table('warehouses')->insertGetId([
                    'name'       => 'Bodega Principal',
                    'address'    => 'Sede Principal',
                    'is_default' => true,
                    'is_active'  => true,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);

                $method = $demo['data_method'];
                $this->$method($adminId, $warehouseId, $demo['sale_prefix']);
            });

            $this->command?->info("  ✓  [{$demo['slug']}] — {$demo['business_name']}");
        } catch (\Throwable $e) {
            $this->command?->error("  ✗  Error en [{$demo['slug']}]: " . $e->getMessage());
        }
    }

    // ── Helpers internos ──────────────────────────────────────────────────────

    private function insertCategories(array $cats): array
    {
        $ids = [];
        foreach ($cats as $slug => $name) {
            $ids[$slug] = DB::table('categories')->insertGetId([
                'name'       => $name,
                'slug'       => $slug,
                'is_active'  => true,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }
        return $ids;
    }

    private function insertProduct(array $p): int
    {
        $id = DB::table('products')->insertGetId(array_merge([
            'unit'                 => 'und',
            'min_stock'            => 5,
            'is_active'            => true,
            'track_inventory'      => true,
            'allow_negative_stock' => false,
            'created_at'           => now(),
            'updated_at'           => now(),
        ], $p));

        DB::table('kardex_entries')->insert([
            'product_id'     => $id,
            'type'           => 'in',
            'quantity'       => $p['stock'],
            'unit_cost'      => $p['cost_price'],
            'balance_stock'  => $p['stock'],
            'reference_type' => 'initial',
            'notes'          => 'Inventario inicial',
            'created_at'     => now(),
        ]);

        return $id;
    }

    private function insertCustomers(array $customers): array
    {
        $ids = [];
        foreach ($customers as $c) {
            $ids[] = DB::table('customers')->insertGetId(array_merge([
                'is_active'   => true,
                'created_at'  => now(),
                'updated_at'  => now(),
            ], $c));
        }
        return $ids;
    }

    /**
     * @param  array<array{customer_id: int|null, items: array, days: int, method: string}>  $sales
     */
    private function insertSales(array $sales, int $adminId, string $prefix): void
    {
        foreach ($sales as $i => $s) {
            $num    = str_pad($i + 1, 4, '0', STR_PAD_LEFT);
            $date   = now()->subDays($s['days']);
            $total  = array_sum(array_map(fn ($it) => $it['qty'] * $it['price'], $s['items']));

            $saleId = DB::table('sales')->insertGetId([
                'sale_number'    => "{$prefix}-{$num}",
                'user_id'        => $adminId,
                'customer_id'    => $s['customer_id'] ?? null,
                'payment_method' => $s['method'] ?? 'cash',
                'subtotal'       => $total,
                'discount'       => 0,
                'tax'            => 0,
                'total'          => $total,
                'amount_paid'    => $total,
                'change_given'   => 0,
                'status'         => 'completed',
                'created_at'     => $date,
                'updated_at'     => $date,
            ]);

            foreach ($s['items'] as $it) {
                DB::table('sale_items')->insert([
                    'sale_id'      => $saleId,
                    'product_id'   => $it['product_id'],
                    'product_name' => $it['name'],
                    'quantity'     => $it['qty'],
                    'unit_price'   => $it['price'],
                    'discount'     => 0,
                    'subtotal'     => $it['qty'] * $it['price'],
                ]);
            }
        }
    }

    // ── TIENDA GENERAL ────────────────────────────────────────────────────────

    private function seedStore(int $adminId, int $warehouseId, string $prefix): void
    {
        $cats = $this->insertCategories([
            'abarrotes'    => 'Abarrotes y Despensa',
            'lacteos'      => 'Lácteos y Huevos',
            'bebidas'      => 'Bebidas y Jugos',
            'aseo'         => 'Aseo del Hogar',
            'cuidado'      => 'Cuidado Personal',
            'snacks'       => 'Snacks y Confitería',
        ]);

        $prods = [
            $this->insertProduct(['category_id' => $cats['abarrotes'], 'name' => 'Arroz Diana 500g',          'sku' => 'ARR-DIA-500',  'cost_price' => 2100, 'sale_price' => 2900,  'stock' => 120, 'min_stock' => 20]),
            $this->insertProduct(['category_id' => $cats['abarrotes'], 'name' => 'Aceite Palma Real 1L',      'sku' => 'ACE-PR-1L',    'cost_price' => 7500, 'sale_price' => 9900,  'stock' => 60,  'min_stock' => 10]),
            $this->insertProduct(['category_id' => $cats['abarrotes'], 'name' => 'Azúcar Incauca 1Kg',        'sku' => 'AZU-INC-1K',   'cost_price' => 3200, 'sale_price' => 4200,  'stock' => 80,  'min_stock' => 15]),
            $this->insertProduct(['category_id' => $cats['abarrotes'], 'name' => 'Pasta El Dorado 250g',      'sku' => 'PAS-ED-250',   'cost_price' => 1800, 'sale_price' => 2500,  'stock' => 95,  'min_stock' => 20]),
            $this->insertProduct(['category_id' => $cats['lacteos'],   'name' => 'Leche Entera Alquería 1L',  'sku' => 'LEC-ALQ-1L',   'cost_price' => 2800, 'sale_price' => 3500,  'stock' => 48,  'min_stock' => 12]),
            $this->insertProduct(['category_id' => $cats['lacteos'],   'name' => 'Huevos Rojo AA x12',        'sku' => 'HUE-ROJ-12',   'cost_price' => 8500, 'sale_price' => 11500, 'stock' => 30,  'min_stock' => 6]),
            $this->insertProduct(['category_id' => $cats['bebidas'],   'name' => 'Gaseosa Coca-Cola 2L',      'sku' => 'GAS-CC-2L',    'cost_price' => 5200, 'sale_price' => 6900,  'stock' => 72,  'min_stock' => 12]),
            $this->insertProduct(['category_id' => $cats['bebidas'],   'name' => 'Agua Cristal 600ml',        'sku' => 'AGU-CRS-600',  'cost_price' => 800,  'sale_price' => 1500,  'stock' => 144, 'min_stock' => 24]),
            $this->insertProduct(['category_id' => $cats['aseo'],      'name' => 'Detergente Ariel 450g',     'sku' => 'DET-AR-450',   'cost_price' => 6800, 'sale_price' => 9200,  'stock' => 40,  'min_stock' => 8]),
            $this->insertProduct(['category_id' => $cats['aseo'],      'name' => 'Jabón Rey Lavaplatos 300g', 'sku' => 'JAB-REY-300',  'cost_price' => 2500, 'sale_price' => 3500,  'stock' => 55,  'min_stock' => 10]),
            $this->insertProduct(['category_id' => $cats['cuidado'],   'name' => 'Shampoo Head&Shoulders 200ml','sku' => 'SHA-HS-200', 'cost_price' => 8200, 'sale_price' => 11500, 'stock' => 25,  'min_stock' => 5]),
            $this->insertProduct(['category_id' => $cats['snacks'],    'name' => 'Papas Margarita Clásica 70g','sku' => 'PAP-MAR-70',  'cost_price' => 1900, 'sale_price' => 2800,  'stock' => 90,  'min_stock' => 15]),
        ];

        $custs = $this->insertCustomers([
            ['name' => 'Laura Martínez',    'document' => '1020345678', 'phone' => '3101234567', 'email' => 'laura.m@gmail.com',    'city' => 'Bogotá'],
            ['name' => 'Pedro Jiménez',     'document' => '79234567',   'phone' => '3209876543', 'email' => 'pedrojimenez@gmail.com','city' => 'Bogotá'],
            ['name' => 'Sofía Herrera',     'document' => '1023456789', 'phone' => '3157654321', 'email' => 'sofiah@hotmail.com',    'city' => 'Bogotá'],
            ['name' => 'Familia Gómez',     'document' => '900123456',  'phone' => '3012345678', 'document_type' => 'nit'],
            ['name' => 'Daniela Torres',    'document' => '1025678901', 'phone' => '3187651234'],
        ]);

        $this->insertSales([
            ['customer_id' => $custs[0], 'days' => 14, 'method' => 'card', 'items' => [
                ['product_id' => $prods[0], 'name' => 'Arroz Diana 500g',         'qty' => 3, 'price' => 2900],
                ['product_id' => $prods[4], 'name' => 'Leche Entera Alquería 1L', 'qty' => 2, 'price' => 3500],
                ['product_id' => $prods[7], 'name' => 'Agua Cristal 600ml',       'qty' => 4, 'price' => 1500],
            ]],
            ['customer_id' => $custs[1], 'days' => 10, 'method' => 'cash', 'items' => [
                ['product_id' => $prods[6], 'name' => 'Gaseosa Coca-Cola 2L',    'qty' => 2, 'price' => 6900],
                ['product_id' => $prods[5], 'name' => 'Huevos Rojo AA x12',      'qty' => 1, 'price' => 11500],
                ['product_id' => $prods[11],'name' => 'Papas Margarita 70g',     'qty' => 3, 'price' => 2800],
            ]],
            ['customer_id' => null,       'days' => 7,  'method' => 'cash', 'items' => [
                ['product_id' => $prods[1], 'name' => 'Aceite Palma Real 1L',    'qty' => 1, 'price' => 9900],
                ['product_id' => $prods[2], 'name' => 'Azúcar Incauca 1Kg',      'qty' => 2, 'price' => 4200],
                ['product_id' => $prods[3], 'name' => 'Pasta El Dorado 250g',    'qty' => 4, 'price' => 2500],
            ]],
            ['customer_id' => $custs[2], 'days' => 4,  'method' => 'transfer', 'items' => [
                ['product_id' => $prods[8], 'name' => 'Detergente Ariel 450g',   'qty' => 2, 'price' => 9200],
                ['product_id' => $prods[9], 'name' => 'Jabón Rey Lavaplatos',    'qty' => 3, 'price' => 3500],
                ['product_id' => $prods[10],'name' => 'Shampoo Head&Shoulders',  'qty' => 1, 'price' => 11500],
            ]],
            ['customer_id' => $custs[3], 'days' => 1,  'method' => 'card', 'items' => [
                ['product_id' => $prods[0], 'name' => 'Arroz Diana 500g',        'qty' => 10, 'price' => 2900],
                ['product_id' => $prods[1], 'name' => 'Aceite Palma Real 1L',    'qty' => 5,  'price' => 9900],
                ['product_id' => $prods[2], 'name' => 'Azúcar Incauca 1Kg',      'qty' => 5,  'price' => 4200],
            ]],
            ['customer_id' => $custs[4], 'days' => 0,  'method' => 'cash', 'items' => [
                ['product_id' => $prods[4], 'name' => 'Leche Entera Alquería 1L','qty' => 3, 'price' => 3500],
                ['product_id' => $prods[5], 'name' => 'Huevos Rojo AA x12',      'qty' => 1, 'price' => 11500],
            ]],
        ], $adminId, $prefix);
    }

    // ── RESTAURANTE ───────────────────────────────────────────────────────────

    private function seedRestaurant(int $adminId, int $warehouseId, string $prefix): void
    {
        // Mesas del salón
        $zones = ['Salón Principal', 'Terraza', 'Bar'];
        foreach ($zones as $zone) {
            $count = $zone === 'Bar' ? 4 : 6;
            for ($t = 1; $t <= $count; $t++) {
                DB::table('tables')->insert([
                    'name'       => "Mesa {$t}",
                    'capacity'   => ($zone === 'Bar') ? 2 : 4,
                    'zone'       => $zone,
                    'status'     => 'available',
                    'is_active'  => true,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }
        }

        $cats = $this->insertCategories([
            'entradas'  => 'Entradas y Ensaladas',
            'platos'    => 'Platos Principales',
            'sopas'     => 'Sopas y Caldos',
            'bebidas'   => 'Bebidas',
            'postres'   => 'Postres',
            'combos'    => 'Combos y Menús',
        ]);

        $prods = [
            $this->insertProduct(['category_id' => $cats['entradas'], 'name' => 'Empanadas x3',              'sku' => 'ENT-EMP-3',   'cost_price' => 3500, 'sale_price' => 8000,  'stock' => 50, 'track_inventory' => false]),
            $this->insertProduct(['category_id' => $cats['entradas'], 'name' => 'Patacones con Hogao',        'sku' => 'ENT-PAT-HOG', 'cost_price' => 2800, 'sale_price' => 9500,  'stock' => 40, 'track_inventory' => false]),
            $this->insertProduct(['category_id' => $cats['platos'],   'name' => 'Bandeja Paisa',              'sku' => 'PLA-BAN-PAI', 'cost_price' => 18000,'sale_price' => 38000, 'stock' => 30, 'track_inventory' => false]),
            $this->insertProduct(['category_id' => $cats['platos'],   'name' => 'Pollo a la Plancha + Arroz', 'sku' => 'PLA-POL-PLA', 'cost_price' => 12000,'sale_price' => 28000, 'stock' => 40, 'track_inventory' => false]),
            $this->insertProduct(['category_id' => $cats['platos'],   'name' => 'Churrasco 300g',             'sku' => 'PLA-CHU-300', 'cost_price' => 25000,'sale_price' => 55000, 'stock' => 20, 'track_inventory' => false]),
            $this->insertProduct(['category_id' => $cats['platos'],   'name' => 'Cazuela de Mariscos',        'sku' => 'PLA-CAZ-MAR', 'cost_price' => 22000,'sale_price' => 48000, 'stock' => 15, 'track_inventory' => false]),
            $this->insertProduct(['category_id' => $cats['sopas'],    'name' => 'Sancocho de Gallina',        'sku' => 'SOP-SAN-GAL', 'cost_price' => 9000, 'sale_price' => 22000, 'stock' => 20, 'track_inventory' => false]),
            $this->insertProduct(['category_id' => $cats['sopas'],    'name' => 'Ajiaco Santafereño',         'sku' => 'SOP-AJI-SAN', 'cost_price' => 10000,'sale_price' => 25000, 'stock' => 20, 'track_inventory' => false]),
            $this->insertProduct(['category_id' => $cats['bebidas'],  'name' => 'Jugo Natural 400ml',         'sku' => 'BEB-JUG-400', 'cost_price' => 1500, 'sale_price' => 8000,  'stock' => 60, 'track_inventory' => false]),
            $this->insertProduct(['category_id' => $cats['bebidas'],  'name' => 'Cerveza Águila 330ml',       'sku' => 'BEB-CER-330', 'cost_price' => 2500, 'sale_price' => 7000,  'stock' => 96, 'track_inventory' => false]),
            $this->insertProduct(['category_id' => $cats['postres'],  'name' => 'Tres Leches',                'sku' => 'POS-TRL',     'cost_price' => 3500, 'sale_price' => 12000, 'stock' => 15, 'track_inventory' => false]),
            $this->insertProduct(['category_id' => $cats['combos'],   'name' => 'Menú del Día (sopa+seco+jugo)','sku'=>'COM-MEN-DIA','cost_price' => 12000,'sale_price' => 25000, 'stock' => 50, 'track_inventory' => false]),
        ];

        $custs = $this->insertCustomers([
            ['name' => 'Empresa Bogotá SAS',   'document' => '901234567', 'document_type' => 'nit', 'phone' => '6014567890', 'email' => 'bogotasas@empresa.com'],
            ['name' => 'Juan David Morales',   'document' => '80456789',  'phone' => '3101234567', 'email' => 'jdmorales@gmail.com'],
            ['name' => 'Patricia Suárez',      'document' => '52123456',  'phone' => '3209876543', 'email' => 'psuarez@outlook.com'],
            ['name' => 'Ricardo Montoya',      'document' => '19789012',  'phone' => '3157654321'],
            ['name' => 'Alejandra Ríos',       'document' => '1019234567','phone' => '3012345678', 'email' => 'arios@gmail.com'],
        ]);

        $this->insertSales([
            ['customer_id' => $custs[0], 'days' => 12, 'method' => 'transfer', 'items' => [
                ['product_id' => $prods[2], 'name' => 'Bandeja Paisa',              'qty' => 4, 'price' => 38000],
                ['product_id' => $prods[8], 'name' => 'Jugo Natural 400ml',         'qty' => 4, 'price' => 8000],
                ['product_id' => $prods[10],'name' => 'Tres Leches',                'qty' => 4, 'price' => 12000],
            ]],
            ['customer_id' => $custs[1], 'days' => 8, 'method' => 'card', 'items' => [
                ['product_id' => $prods[3], 'name' => 'Pollo a la Plancha',         'qty' => 2, 'price' => 28000],
                ['product_id' => $prods[9], 'name' => 'Cerveza Águila 330ml',       'qty' => 4, 'price' => 7000],
            ]],
            ['customer_id' => null,      'days' => 5, 'method' => 'cash', 'items' => [
                ['product_id' => $prods[11],'name' => 'Menú del Día',               'qty' => 6, 'price' => 25000],
                ['product_id' => $prods[8], 'name' => 'Jugo Natural 400ml',         'qty' => 6, 'price' => 8000],
            ]],
            ['customer_id' => $custs[2], 'days' => 3, 'method' => 'card', 'items' => [
                ['product_id' => $prods[4], 'name' => 'Churrasco 300g',             'qty' => 2, 'price' => 55000],
                ['product_id' => $prods[0], 'name' => 'Empanadas x3',               'qty' => 2, 'price' => 8000],
                ['product_id' => $prods[9], 'name' => 'Cerveza Águila 330ml',       'qty' => 4, 'price' => 7000],
            ]],
            ['customer_id' => $custs[3], 'days' => 1, 'method' => 'cash', 'items' => [
                ['product_id' => $prods[6], 'name' => 'Sancocho de Gallina',        'qty' => 2, 'price' => 22000],
                ['product_id' => $prods[1], 'name' => 'Patacones con Hogao',        'qty' => 2, 'price' => 9500],
                ['product_id' => $prods[8], 'name' => 'Jugo Natural 400ml',         'qty' => 2, 'price' => 8000],
            ]],
            ['customer_id' => $custs[4], 'days' => 0, 'method' => 'card', 'items' => [
                ['product_id' => $prods[5], 'name' => 'Cazuela de Mariscos',        'qty' => 2, 'price' => 48000],
                ['product_id' => $prods[7], 'name' => 'Ajiaco Santafereño',         'qty' => 1, 'price' => 25000],
                ['product_id' => $prods[10],'name' => 'Tres Leches',                'qty' => 3, 'price' => 12000],
            ]],
        ], $adminId, $prefix);
    }

    // ── DROGUERÍA / FARMACIA ──────────────────────────────────────────────────

    private function seedPharmacy(int $adminId, int $warehouseId, string $prefix): void
    {
        $cats = $this->insertCategories([
            'eps'         => 'Medicamentos EPS',
            'otc'         => 'Venta Libre (OTC)',
            'controlados' => 'Medicamentos Controlados',
            'suplementos' => 'Vitaminas y Suplementos',
            'cosmeticos'  => 'Cosméticos y Cuidado',
            'dispositivos'=> 'Dispositivos Médicos',
        ]);

        $prods = [
            $this->insertProduct(['category_id' => $cats['eps'],      'name' => 'Amoxicilina 500mg Cap x30',      'sku' => 'AMX-500-30',  'barcode' => '7702018001001', 'cost_price' => 9200,  'sale_price' => 18500, 'stock' => 120, 'min_stock' => 20]),
            $this->insertProduct(['category_id' => $cats['eps'],      'name' => 'Metformina 850mg Tab x50',       'sku' => 'MET-850-50',  'barcode' => '7702018001002', 'cost_price' => 11000, 'sale_price' => 25000, 'stock' => 85,  'min_stock' => 15]),
            $this->insertProduct(['category_id' => $cats['eps'],      'name' => 'Losartan 50mg Tab x30',          'sku' => 'LOS-050-30',  'barcode' => '7702018001003', 'cost_price' => 10500, 'sale_price' => 22000, 'stock' => 64,  'min_stock' => 10]),
            $this->insertProduct(['category_id' => $cats['eps'],      'name' => 'Omeprazol 20mg Cap x28',         'sku' => 'OME-020-28',  'barcode' => '7702018001004', 'cost_price' => 8900,  'sale_price' => 19800, 'stock' => 97,  'min_stock' => 20]),
            $this->insertProduct(['category_id' => $cats['otc'],      'name' => 'Dolex Forte Tab x24',            'sku' => 'DOL-FTE-24',  'barcode' => '7702001002001', 'cost_price' => 6000,  'sale_price' => 12500, 'stock' => 200, 'min_stock' => 30]),
            $this->insertProduct(['category_id' => $cats['otc'],      'name' => 'Ibuprofeno 400mg Tab x20',       'sku' => 'IBU-400-20',  'barcode' => '7702001002002', 'cost_price' => 4500,  'sale_price' => 9800,  'stock' => 180, 'min_stock' => 30]),
            $this->insertProduct(['category_id' => $cats['otc'],      'name' => 'Loratadina 10mg Tab x10',        'sku' => 'LOR-010-10',  'barcode' => '7702001002003', 'cost_price' => 3200,  'sale_price' => 7500,  'stock' => 90,  'min_stock' => 25]),
            $this->insertProduct(['category_id' => $cats['otc'],      'name' => 'Antigripal MK Tab x20',          'sku' => 'AGR-MK-20',   'barcode' => '7702001002004', 'cost_price' => 5100,  'sale_price' => 11200, 'stock' => 145, 'min_stock' => 25]),
            $this->insertProduct(['category_id' => $cats['suplementos'],'name' => 'Centrum Adults Tab x60',       'sku' => 'CTR-ADL-60',  'barcode' => '7702001003001', 'cost_price' => 42000, 'sale_price' => 89000, 'stock' => 40,  'min_stock' => 8]),
            $this->insertProduct(['category_id' => $cats['suplementos'],'name' => 'Omega 3 1000mg Cap x90',       'sku' => 'OMG3-1K-90',  'barcode' => '7702001003002', 'cost_price' => 35000, 'sale_price' => 75000, 'stock' => 28,  'min_stock' => 5]),
            $this->insertProduct(['category_id' => $cats['cosmeticos'],'name' => 'Eucerin Loción 500ml',          'sku' => 'EUC-LOC-500', 'barcode' => '4005900000001', 'cost_price' => 38000, 'sale_price' => 72000, 'stock' => 15,  'min_stock' => 5]),
            $this->insertProduct(['category_id' => $cats['dispositivos'],'name' => 'Tensiómetro Digital de Brazo','sku' => 'TENS-DIG-01', 'barcode' => '8717677120001', 'cost_price' => 95000, 'sale_price' => 185000,'stock' => 8,   'min_stock' => 2]),
            $this->insertProduct(['category_id' => $cats['dispositivos'],'name' => 'Termómetro Infrarrojo',       'sku' => 'TERM-IR-01',  'barcode' => '8717677120002', 'cost_price' => 65000, 'sale_price' => 125000,'stock' => 12,  'min_stock' => 2]),
        ];

        $custs = $this->insertCustomers([
            ['name' => 'María Fernanda Ospina', 'document' => '52345678',   'phone' => '3101234567', 'email' => 'mfospina@gmail.com'],
            ['name' => 'Carlos Andrés Rincón',  'document' => '79456123',   'phone' => '3209876543', 'email' => 'carincon@hotmail.com'],
            ['name' => 'Laura Sofía Herrera',   'document' => '1020456789', 'phone' => '3157654321'],
            ['name' => 'Diego Mauricio Torres', 'document' => '80234567',   'phone' => '3012345678'],
            ['name' => 'Ana Lucía Vargas',      'document' => '43123456',   'phone' => '3187654321', 'email' => 'alvargas@gmail.com'],
        ]);

        $this->insertSales([
            ['customer_id' => $custs[0], 'days' => 15, 'method' => 'cash', 'items' => [
                ['product_id' => $prods[4], 'name' => 'Dolex Forte Tab x24',      'qty' => 1, 'price' => 12500],
                ['product_id' => $prods[5], 'name' => 'Ibuprofeno 400mg Tab x20', 'qty' => 1, 'price' => 9800],
                ['product_id' => $prods[6], 'name' => 'Loratadina 10mg Tab x10',  'qty' => 1, 'price' => 7500],
            ]],
            ['customer_id' => $custs[1], 'days' => 10, 'method' => 'card', 'items' => [
                ['product_id' => $prods[8], 'name' => 'Centrum Adults Tab x60',   'qty' => 1, 'price' => 89000],
                ['product_id' => $prods[9], 'name' => 'Omega 3 1000mg Cap x90',   'qty' => 1, 'price' => 75000],
            ]],
            ['customer_id' => $custs[2], 'days' => 6,  'method' => 'cash', 'items' => [
                ['product_id' => $prods[0], 'name' => 'Amoxicilina 500mg x30',    'qty' => 1, 'price' => 18500],
                ['product_id' => $prods[3], 'name' => 'Omeprazol 20mg Cap x28',   'qty' => 1, 'price' => 19800],
            ]],
            ['customer_id' => $custs[3], 'days' => 3,  'method' => 'transfer', 'items' => [
                ['product_id' => $prods[11],'name' => 'Tensiómetro Digital',       'qty' => 1, 'price' => 185000],
                ['product_id' => $prods[12],'name' => 'Termómetro Infrarrojo',     'qty' => 1, 'price' => 125000],
            ]],
            ['customer_id' => $custs[4], 'days' => 1,  'method' => 'card', 'items' => [
                ['product_id' => $prods[10],'name' => 'Eucerin Loción 500ml',      'qty' => 1, 'price' => 72000],
                ['product_id' => $prods[7], 'name' => 'Antigripal MK Tab x20',    'qty' => 2, 'price' => 11200],
            ]],
            ['customer_id' => null,       'days' => 0,  'method' => 'cash', 'items' => [
                ['product_id' => $prods[4], 'name' => 'Dolex Forte Tab x24',      'qty' => 2, 'price' => 12500],
                ['product_id' => $prods[1], 'name' => 'Metformina 850mg Tab x50', 'qty' => 1, 'price' => 25000],
            ]],
        ], $adminId, $prefix);
    }

    // ── TALLER MECÁNICO ───────────────────────────────────────────────────────

    private function seedWorkshop(int $adminId, int $warehouseId, string $prefix): void
    {
        $cats = $this->insertCategories([
            'aceites'    => 'Aceites y Lubricantes',
            'filtros'    => 'Filtros',
            'frenos'     => 'Sistema de Frenos',
            'electrico'  => 'Sistema Eléctrico',
            'servicios'  => 'Servicios de Taller',
        ]);

        $prods = [
            $this->insertProduct(['category_id' => $cats['aceites'],  'name' => 'Aceite Mobil 10W-30 1L',          'sku' => 'ACE-MOB-1L',   'cost_price' => 18000, 'sale_price' => 32000, 'stock' => 48, 'min_stock' => 8]),
            $this->insertProduct(['category_id' => $cats['aceites'],  'name' => 'Aceite Castrol 20W-50 4L',        'sku' => 'ACE-CAS-4L',   'cost_price' => 65000, 'sale_price' => 115000,'stock' => 20, 'min_stock' => 4]),
            $this->insertProduct(['category_id' => $cats['filtros'],  'name' => 'Filtro de Aceite Universal',      'sku' => 'FIL-ACE-UNI',  'cost_price' => 9000,  'sale_price' => 18000, 'stock' => 35, 'min_stock' => 8]),
            $this->insertProduct(['category_id' => $cats['filtros'],  'name' => 'Filtro de Aire Honda/Mazda',      'sku' => 'FIL-AIR-HND',  'cost_price' => 12000, 'sale_price' => 25000, 'stock' => 20, 'min_stock' => 5]),
            $this->insertProduct(['category_id' => $cats['frenos'],   'name' => 'Pastillas de Freno Delanteras',   'sku' => 'FRE-PAS-DEL',  'cost_price' => 28000, 'sale_price' => 55000, 'stock' => 16, 'min_stock' => 4]),
            $this->insertProduct(['category_id' => $cats['frenos'],   'name' => 'Líquido de Frenos DOT4 500ml',   'sku' => 'FRE-LIQ-500',  'cost_price' => 8500,  'sale_price' => 16500, 'stock' => 24, 'min_stock' => 6]),
            $this->insertProduct(['category_id' => $cats['electrico'],'name' => 'Batería 12V 45Ah Calsonic',      'sku' => 'ELE-BAT-45A',  'cost_price' => 185000,'sale_price' => 320000,'stock' => 6,  'min_stock' => 2]),
            $this->insertProduct(['category_id' => $cats['electrico'],'name' => 'Bujías NGK (juego x4)',          'sku' => 'ELE-BUJ-NGK4', 'cost_price' => 28000, 'sale_price' => 55000, 'stock' => 18, 'min_stock' => 4]),
            $this->insertProduct(['category_id' => $cats['servicios'],'name' => 'Mano de Obra Cambio de Aceite',  'sku' => 'SRV-CAM-ACE',  'cost_price' => 0,     'sale_price' => 25000, 'stock' => 999,'min_stock' => 0, 'track_inventory' => false]),
            $this->insertProduct(['category_id' => $cats['servicios'],'name' => 'Mano de Obra Cambio de Frenos',  'sku' => 'SRV-CAM-FRE',  'cost_price' => 0,     'sale_price' => 45000, 'stock' => 999,'min_stock' => 0, 'track_inventory' => false]),
            $this->insertProduct(['category_id' => $cats['servicios'],'name' => 'Diagnóstico Electrónico OBD',    'sku' => 'SRV-DIAG-OBD', 'cost_price' => 0,     'sale_price' => 35000, 'stock' => 999,'min_stock' => 0, 'track_inventory' => false]),
            $this->insertProduct(['category_id' => $cats['servicios'],'name' => 'Lavado y Encerrado Completo',    'sku' => 'SRV-LAV-COM',  'cost_price' => 8000,  'sale_price' => 35000, 'stock' => 999,'min_stock' => 0, 'track_inventory' => false]),
        ];

        $custs = $this->insertCustomers([
            ['name' => 'Luis Fernando Cano',    'document' => '79123456', 'phone' => '3101234567', 'email' => 'lfcano@gmail.com',     'notes' => 'Toyota Hilux 2019 — placa ABC-123'],
            ['name' => 'Jorge Hernández',       'document' => '80234567', 'phone' => '3209876543',                                     'notes' => 'Chevrolet Sail 2021 — placa XYZ-456'],
            ['name' => 'Empresa Transportes SAS','document'=>'900567890', 'phone' => '6014567890', 'document_type' => 'nit', 'email' => 'compras@transportes.com', 'notes' => 'Flota de 8 vehículos'],
            ['name' => 'Andrés Felipe Ortiz',   'document' => '1020789012','phone' => '3157654321',                                    'notes' => 'Mazda 3 2020 — placa DEF-789'],
            ['name' => 'Claudia Moreno',        'document' => '52789012', 'phone' => '3012345678', 'email' => 'cmoreno@gmail.com',     'notes' => 'Renault Logan 2018 — placa GHI-012'],
        ]);

        $this->insertSales([
            ['customer_id' => $custs[0], 'days' => 20, 'method' => 'card', 'items' => [
                ['product_id' => $prods[1], 'name' => 'Aceite Castrol 20W-50 4L',      'qty' => 1, 'price' => 115000],
                ['product_id' => $prods[2], 'name' => 'Filtro de Aceite Universal',    'qty' => 1, 'price' => 18000],
                ['product_id' => $prods[8], 'name' => 'Mano de Obra Cambio de Aceite', 'qty' => 1, 'price' => 25000],
            ]],
            ['customer_id' => $custs[2], 'days' => 14, 'method' => 'transfer', 'items' => [
                ['product_id' => $prods[4], 'name' => 'Pastillas de Freno Delanteras', 'qty' => 4, 'price' => 55000],
                ['product_id' => $prods[5], 'name' => 'Líquido de Frenos DOT4',        'qty' => 4, 'price' => 16500],
                ['product_id' => $prods[9], 'name' => 'Mano de Obra Cambio de Frenos', 'qty' => 4, 'price' => 45000],
            ]],
            ['customer_id' => $custs[1], 'days' => 8,  'method' => 'cash', 'items' => [
                ['product_id' => $prods[10],'name' => 'Diagnóstico Electrónico OBD',   'qty' => 1, 'price' => 35000],
                ['product_id' => $prods[7], 'name' => 'Bujías NGK juego x4',           'qty' => 1, 'price' => 55000],
            ]],
            ['customer_id' => $custs[3], 'days' => 4,  'method' => 'cash', 'items' => [
                ['product_id' => $prods[6], 'name' => 'Batería 12V 45Ah',              'qty' => 1, 'price' => 320000],
                ['product_id' => $prods[10],'name' => 'Diagnóstico Electrónico OBD',   'qty' => 1, 'price' => 35000],
            ]],
            ['customer_id' => $custs[4], 'days' => 1,  'method' => 'card', 'items' => [
                ['product_id' => $prods[0], 'name' => 'Aceite Mobil 10W-30 1L',        'qty' => 4, 'price' => 32000],
                ['product_id' => $prods[3], 'name' => 'Filtro de Aire Honda/Mazda',    'qty' => 1, 'price' => 25000],
                ['product_id' => $prods[8], 'name' => 'Mano de Obra Cambio de Aceite', 'qty' => 1, 'price' => 25000],
            ]],
        ], $adminId, $prefix);
    }

    // ── SALÓN DE BELLEZA ──────────────────────────────────────────────────────

    private function seedSalon(int $adminId, int $warehouseId, string $prefix): void
    {
        $cats = $this->insertCategories([
            'cortes'     => 'Cortes y Peinados',
            'color'      => 'Coloración y Tintes',
            'tratamientos'=> 'Tratamientos Capilares',
            'unas'       => 'Manicure y Pedicure',
            'productos'  => 'Productos de Venta',
        ]);

        $prods = [
            $this->insertProduct(['category_id' => $cats['cortes'],      'name' => 'Corte de Cabello Dama',          'sku' => 'COR-DAM',     'cost_price' => 8000,  'sale_price' => 35000, 'stock' => 999,'min_stock' => 0, 'track_inventory' => false]),
            $this->insertProduct(['category_id' => $cats['cortes'],      'name' => 'Corte de Cabello Caballero',     'sku' => 'COR-CAB',     'cost_price' => 5000,  'sale_price' => 22000, 'stock' => 999,'min_stock' => 0, 'track_inventory' => false]),
            $this->insertProduct(['category_id' => $cats['cortes'],      'name' => 'Peinado Formal (Recogido)',       'sku' => 'PEI-FOR',     'cost_price' => 10000, 'sale_price' => 55000, 'stock' => 999,'min_stock' => 0, 'track_inventory' => false]),
            $this->insertProduct(['category_id' => $cats['color'],       'name' => 'Coloración Completa',            'sku' => 'COL-COM',     'cost_price' => 35000, 'sale_price' => 120000,'stock' => 999,'min_stock' => 0, 'track_inventory' => false]),
            $this->insertProduct(['category_id' => $cats['color'],       'name' => 'Mechas / Balayage',              'sku' => 'COL-BAL',     'cost_price' => 50000, 'sale_price' => 180000,'stock' => 999,'min_stock' => 0, 'track_inventory' => false]),
            $this->insertProduct(['category_id' => $cats['color'],       'name' => 'Retoque de Raíz',                'sku' => 'COL-RAI',     'cost_price' => 18000, 'sale_price' => 65000, 'stock' => 999,'min_stock' => 0, 'track_inventory' => false]),
            $this->insertProduct(['category_id' => $cats['tratamientos'],'name' => 'Keratina Brasileña',             'sku' => 'TRT-KER',     'cost_price' => 80000, 'sale_price' => 250000,'stock' => 999,'min_stock' => 0, 'track_inventory' => false]),
            $this->insertProduct(['category_id' => $cats['tratamientos'],'name' => 'Hidratación Profunda',           'sku' => 'TRT-HID',     'cost_price' => 20000, 'sale_price' => 75000, 'stock' => 999,'min_stock' => 0, 'track_inventory' => false]),
            $this->insertProduct(['category_id' => $cats['unas'],        'name' => 'Manicure Tradicional',           'sku' => 'UNA-MAN',     'cost_price' => 5000,  'sale_price' => 25000, 'stock' => 999,'min_stock' => 0, 'track_inventory' => false]),
            $this->insertProduct(['category_id' => $cats['unas'],        'name' => 'Semipermanente (Manos)',         'sku' => 'UNA-SEMI',    'cost_price' => 12000, 'sale_price' => 55000, 'stock' => 999,'min_stock' => 0, 'track_inventory' => false]),
            $this->insertProduct(['category_id' => $cats['productos'],   'name' => 'Shampoo Profesional Alfaparf 300ml','sku'=>'PRO-SHA-ALP','cost_price' => 38000, 'sale_price' => 72000, 'stock' => 20, 'min_stock' => 4]),
            $this->insertProduct(['category_id' => $cats['productos'],   'name' => 'Mascarilla Nutrición Intensa',   'sku' => 'PRO-MAS-NUT', 'cost_price' => 22000, 'sale_price' => 45000, 'stock' => 15, 'min_stock' => 3]),
        ];

        $custs = $this->insertCustomers([
            ['name' => 'Natalia Gómez',      'document' => '1019345678', 'phone' => '3101234567', 'email' => 'nagomez@gmail.com',    'notes' => 'Cita fija cada 4 semanas'],
            ['name' => 'Mónica Salazar',     'document' => '52456789',   'phone' => '3209876543', 'email' => 'msalazar@hotmail.com', 'notes' => 'Prefiere tinte rubio dorado'],
            ['name' => 'Camila Betancourt',  'document' => '1024567890', 'phone' => '3157654321'],
            ['name' => 'Sara Medina',        'document' => '53234567',   'phone' => '3012345678', 'email' => 'smedina@gmail.com'],
            ['name' => 'Isabela Reyes',      'document' => '1022345678', 'phone' => '3187651234', 'notes' => 'Clienta VIP — keratina mensual'],
        ]);

        $this->insertSales([
            ['customer_id' => $custs[0], 'days' => 18, 'method' => 'card', 'items' => [
                ['product_id' => $prods[0], 'name' => 'Corte de Cabello Dama',       'qty' => 1, 'price' => 35000],
                ['product_id' => $prods[7], 'name' => 'Hidratación Profunda',         'qty' => 1, 'price' => 75000],
            ]],
            ['customer_id' => $custs[4], 'days' => 12, 'method' => 'transfer', 'items' => [
                ['product_id' => $prods[6], 'name' => 'Keratina Brasileña',           'qty' => 1, 'price' => 250000],
                ['product_id' => $prods[10],'name' => 'Shampoo Profesional Alfaparf', 'qty' => 1, 'price' => 72000],
            ]],
            ['customer_id' => $custs[1], 'days' => 8,  'method' => 'cash', 'items' => [
                ['product_id' => $prods[3], 'name' => 'Coloración Completa',          'qty' => 1, 'price' => 120000],
                ['product_id' => $prods[0], 'name' => 'Corte de Cabello Dama',        'qty' => 1, 'price' => 35000],
            ]],
            ['customer_id' => $custs[2], 'days' => 5,  'method' => 'card', 'items' => [
                ['product_id' => $prods[8], 'name' => 'Manicure Tradicional',         'qty' => 1, 'price' => 25000],
                ['product_id' => $prods[9], 'name' => 'Semipermanente Manos',         'qty' => 1, 'price' => 55000],
            ]],
            ['customer_id' => $custs[3], 'days' => 2,  'method' => 'cash', 'items' => [
                ['product_id' => $prods[4], 'name' => 'Mechas / Balayage',            'qty' => 1, 'price' => 180000],
                ['product_id' => $prods[2], 'name' => 'Peinado Formal Recogido',      'qty' => 1, 'price' => 55000],
            ]],
            ['customer_id' => $custs[0], 'days' => 0,  'method' => 'card', 'items' => [
                ['product_id' => $prods[5], 'name' => 'Retoque de Raíz',              'qty' => 1, 'price' => 65000],
                ['product_id' => $prods[11],'name' => 'Mascarilla Nutrición Intensa', 'qty' => 1, 'price' => 45000],
            ]],
        ], $adminId, $prefix);
    }

    // ── Resumen final ─────────────────────────────────────────────────────────

    private function printCredentialsSummary(): void
    {
        $this->command?->newLine();
        $this->command?->line('  ┌──────────────────────────────────────────────────────────────────────────┐');
        $this->command?->line('  │                  CREDENCIALES DE TENANTS DEMO                           │');
        $this->command?->line('  │            Contraseña para todos: Atlas@2025!                           │');
        $this->command?->line('  ├──────────────────────────────┬─────────────────────────┬───────────────┤');
        $this->command?->line('  │  Tipo de Negocio             │  Email Admin             │  Slug URL     │');
        $this->command?->line('  ├──────────────────────────────┼─────────────────────────┼───────────────┤');

        foreach ($this->demos as $d) {
            $type  = str_pad($d['business_name'], 30);
            $email = str_pad($d['email'], 25);
            $slug  = $d['slug'];
            $this->command?->line("  │  {$type}│  {$email}│  {$slug}");
        }

        $this->command?->line('  └──────────────────────────────┴─────────────────────────┴───────────────┘');
        $this->command?->newLine();
        $this->command?->line('  URL de acceso: https://atlaserp.com.co/{slug}/api/auth/login');
        $this->command?->newLine();
    }
}
