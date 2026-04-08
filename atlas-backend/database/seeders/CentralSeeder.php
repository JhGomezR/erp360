<?php

namespace Database\Seeders;

use App\Central\Plans\Models\Addon;
use App\Central\Plans\Models\Plan;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class CentralSeeder extends Seeder
{
    public function run(): void
    {
        // ─── Planes ───────────────────────────────────────────────────────────
        $planStore = Plan::create([
            'name'        => 'Tiendas y Supermercados',
            'slug'        => 'tiendas',
            'description' => 'Ideal para negocios de venta al por menor y autoservicio.',
            'price'       => 50000,
            'type'        => 'store',
            'modules'     => ['pos', 'inventory', 'warehouse', 'users', 'reports', 'purchases'],
        ]);

        $planRestaurant = Plan::create([
            'name'        => 'Restaurantes y Bares',
            'slug'        => 'restaurantes',
            'description' => 'Perfecto para heladerías, restaurantes y negocios con servicio a la mesa.',
            'price'       => 50000,
            'type'        => 'restaurant',
            'modules'     => ['pos', 'inventory', 'tables', 'warehouse', 'users', 'reports', 'purchases'],
        ]);

        // ─── Add-ons ──────────────────────────────────────────────────────────
        $addonMultiSucursal = Addon::create([
            'name'        => 'Multi-Sucursal',
            'slug'        => 'multi-sucursal',
            'description' => 'Gestiona todas tus sucursales desde una única plataforma centralizada.',
            'module_key'  => 'multi_branch',
            'price'       => 20000,
        ]);

        $addonAI = Addon::create([
            'name'        => 'Análisis con IA',
            'slug'        => 'analisis-ia',
            'description' => 'Identifica oportunidades de venta y optimiza tu inventario con inteligencia artificial.',
            'module_key'  => 'ai',
            'price'       => 15000,
        ]);

        $addonBilling = Addon::create([
            'name'        => 'Facturación Electrónica DIAN',
            'slug'        => 'facturacion-electronica',
            'description' => 'Emite facturas electrónicas, notas crédito/débito y documentos soporte ante la DIAN (FE-V2 UBL 2.1). Requiere certificado digital.',
            'module_key'  => 'fe_dian',
            'price'       => 25000,
        ]);

        $addonHRM = Addon::create([
            'name'        => 'RRHH y Nómina',
            'slug'        => 'rrhh-nomina',
            'description' => 'Gestiona empleados, contratos, nómina electrónica DIAN, vacaciones y liquidaciones laborales.',
            'module_key'  => 'hrm',
            'price'       => 30000,
        ]);

        // 'accounting' es módulo BASE (gratuito) — no se vende como add-on.

        $addonLoyalty = Addon::create([
            'name'        => 'Fidelización y Puntos',
            'slug'        => 'fidelizacion',
            'description' => 'Programa de puntos y recompensas para fidelizar clientes. Configura reglas, canjeos y campañas.',
            'module_key'  => 'loyalty',
            'price'       => 15000,
        ]);

        $addonEcommerce = Addon::create([
            'name'        => 'Tienda en Línea',
            'slug'        => 'tienda-en-linea',
            'description' => 'Publica tu catálogo en línea, recibe pedidos y gestiona envíos desde Atlas ERP.',
            'module_key'  => 'ecommerce',
            'price'       => 25000,
        ]);

        $addonAppointments = Addon::create([
            'name'        => 'Citas y Agenda',
            'slug'        => 'citas-agenda',
            'description' => 'Agenda de citas para servicios: peluquerías, veterinarias, consultorios y más. Recordatorios automáticos.',
            'module_key'  => 'appointments',
            'price'       => 15000,
        ]);

        $addonDelivery = Addon::create([
            'name'        => 'Domicilios y Entregas',
            'slug'        => 'domicilios',
            'description' => 'Gestión de pedidos a domicilio, asignación de repartidores y seguimiento en tiempo real.',
            'module_key'  => 'delivery',
            'price'       => 20000,
        ]);

        // Asociar add-ons a planes (todos los planes ofrecen todos los add-ons)
        $allAddonIds = [
            $addonMultiSucursal->id, $addonAI->id, $addonBilling->id,
            $addonHRM->id, $addonLoyalty->id,
            $addonEcommerce->id, $addonAppointments->id, $addonDelivery->id,
        ];
        $planStore->addons()->attach($allAddonIds);
        $planRestaurant->addons()->attach($allAddonIds);

        // ─── Super Admin ──────────────────────────────────────────────────────
        $superAdmin = User::create([
            'name'     => 'Super Admin',
            'email'    => 'superadmin@atlas.com',
            'password' => Hash::make('Atlas@2024!'),
        ]);

        // Asignar rol super (se crea después de spatie migration)
        if (class_exists(\Spatie\Permission\Models\Role::class)) {
            $role = \Spatie\Permission\Models\Role::firstOrCreate(['name' => 'super', 'guard_name' => 'api']);
            $superAdmin->assignRole($role);
        }

        $this->command->info('✓ Planes, Add-ons y Super Admin creados.');
    }
}
