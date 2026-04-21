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
 * Clase base para los seeders de tenants de demostración.
 * Cada subclase define su configuración y datos específicos.
 */
abstract class DemoTenantBaseSeeder extends Seeder
{
    protected const PASSWORD = 'Atlas@2025!';

    // ── Cada subclase implementa estos dos métodos ────────────────────────────

    /** Retorna la configuración del tenant demo. */
    abstract protected function config(): array;

    /** Siembra los datos específicos del tipo de negocio dentro del schema. */
    abstract protected function seedData(int $adminId, int $warehouseId, string $prefix): void;

    // ── Entrada pública ───────────────────────────────────────────────────────

    public function run(): void
    {
        $demo = $this->config();

        if (Tenant::where('slug', $demo['slug'])->exists()) {
            $this->command?->line("  ⏭  [{$demo['slug']}] ya existe — omitido.");
            return;
        }

        $plan         = Plan::where('slug', $demo['plan_slug'])->first();
        $businessType = BusinessType::where('slug', $demo['business_type'])->first();

        if (! $plan) {
            $this->command?->warn("  ⚠  Plan '{$demo['plan_slug']}' no encontrado.");
            return;
        }
        if (! $businessType) {
            $this->command?->warn("  ⚠  Tipo '{$demo['business_type']}' no encontrado.");
            return;
        }

        try {
            // Crear o reutilizar el usuario propietario en la BD central
            $owner = User::firstOrCreate(
                ['email' => $demo['email']],
                [
                    'name'     => $demo['owner_name'],
                    'password' => Hash::make(self::PASSWORD),
                ]
            );

            // Crear el tenant con el slug controlado.
            // La pipeline TenantCreated (CreateDatabase→MigrateDatabase→SeedDatabase) es
            // async (cola). En el seeder necesitamos que el schema exista ANTES de llamar
            // TenantContext::run(), así que ejecutamos los pasos de forma síncrona.
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

            // Forzar setup síncrono del schema — la cola puede procesar el mismo
            // evento después pero updateOrCreate/idempotencia lo maneja sin duplicar.
            \Stancl\Tenancy\Jobs\CreateDatabase::dispatchSync($tenant);
            \Stancl\Tenancy\Jobs\MigrateDatabase::dispatchSync($tenant);
            \Stancl\Tenancy\Jobs\SeedDatabase::dispatchSync($tenant);

            // Sembrar módulos, settings y roles (síncrono para el seeder)
            \App\Jobs\SeedTenantSetupJob::dispatchSync($tenant->id, $businessType->id, false);

            // Sembrar datos demo dentro del schema del tenant
            TenantContext::run($tenant, function () use ($demo) {
                // Garantizar usuario admin con contraseña conocida
                $adminId = DB::table('tenant_users')
                    ->where('email', $demo['email'])
                    ->value('id');

                if (! $adminId) {
                    // TenantSeeder no corrió aún — crear el admin manualmente
                    $adminId = $this->createAdminUser($demo['email'], $demo['owner_name']);
                } else {
                    DB::table('tenant_users')
                        ->where('id', $adminId)
                        ->update(['password' => Hash::make(self::PASSWORD)]);
                }

                // Bodega principal
                $warehouseId = DB::table('warehouses')->insertGetId([
                    'name'       => 'Bodega Principal',
                    'address'    => 'Sede Principal',
                    'is_default' => true,
                    'is_active'  => true,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);

                $this->seedData($adminId, $warehouseId, $this->config()['sale_prefix']);
            });

            $this->command?->info("  ✓  [{$demo['slug']}] — {$demo['business_name']}");
        } catch (\Throwable $e) {
            $this->command?->error("  ✗  Error en [{$demo['slug']}]: " . $e->getMessage());
        }
    }

    // ── Helpers compartidos ───────────────────────────────────────────────────

    private function createAdminUser(string $email, string $name): int
    {
        $userId = DB::table('tenant_users')->insertGetId([
            'name'       => $name,
            'email'      => $email,
            'password'   => Hash::make(self::PASSWORD),
            'is_active'  => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $adminRole = DB::table('roles')->where('name', 'admin')->value('id');
        if ($adminRole) {
            DB::table('model_has_roles')->insertOrIgnore([
                'role_id'    => $adminRole,
                'model_type' => 'App\\Tenant\\Users\\Models\\TenantUser',
                'model_id'   => $userId,
            ]);
        }

        return $userId;
    }

    protected function insertCategories(array $cats): array
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

    protected function insertProduct(array $p): int
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

    protected function insertCustomers(array $customers): array
    {
        $ids = [];
        foreach ($customers as $c) {
            $ids[] = DB::table('customers')->insertGetId(array_merge([
                'is_active'  => true,
                'created_at' => now(),
                'updated_at' => now(),
            ], $c));
        }
        return $ids;
    }

    protected function insertSales(array $sales, int $adminId, string $prefix): void
    {
        foreach ($sales as $i => $s) {
            $num   = str_pad($i + 1, 4, '0', STR_PAD_LEFT);
            $date  = now()->subDays($s['days']);
            $total = array_sum(array_map(fn ($it) => $it['qty'] * $it['price'], $s['items']));

            $saleId = DB::table('sales')->insertGetId([
                'sale_number'    => "{$prefix}-{$num}",
                'user_id'        => $adminId ?: null,
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
}
