<?php

namespace Database\Seeders;

use Illuminate\Support\Facades\DB;

/**
 * Demo: Restaurante El Rincón Criollo (restaurant)
 * Email : admin@rest-demo.com
 * Pass  : Atlas@2025!
 * URL   : atlaserp.com.co/restaurante-demo
 */
class RestaurantDemoSeeder extends DemoTenantBaseSeeder
{
    protected function config(): array
    {
        return [
            'business_name' => 'Restaurante El Rincón Criollo',
            'slug'          => 'restaurante-demo',
            'email'         => 'admin@rest-demo.com',
            'owner_name'    => 'Carlos Mejía',
            'business_type' => 'restaurant',
            'plan_slug'     => 'profesional-restaurant',
            'sale_prefix'   => 'RST',
        ];
    }

    protected function seedData(int $adminId, int $warehouseId, string $prefix): void
    {
        // Mesas: Salón Principal (6), Terraza (6), Bar (4)
        foreach (['Salón Principal' => 6, 'Terraza' => 6, 'Bar' => 4] as $zone => $count) {
            for ($i = 1; $i <= $count; $i++) {
                DB::table('tables')->insert([
                    'name'       => "Mesa {$i}",
                    'capacity'   => $zone === 'Bar' ? 2 : 4,
                    'zone'       => $zone,
                    'status'     => 'available',
                    'is_active'  => true,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }
        }

        $cats = $this->insertCategories([
            'entradas' => 'Entradas y Ensaladas',
            'platos'   => 'Platos Principales',
            'sopas'    => 'Sopas y Caldos',
            'bebidas'  => 'Bebidas',
            'postres'  => 'Postres',
            'combos'   => 'Combos y Menús',
        ]);

        $p = [
            $this->insertProduct(['category_id' => $cats['entradas'], 'name' => 'Empanadas x3',               'sku' => 'ENT-EMP-3',   'cost_price' => 3500,  'sale_price' => 8000,  'stock' => 50, 'track_inventory' => false]),
            $this->insertProduct(['category_id' => $cats['entradas'], 'name' => 'Patacones con Hogao',         'sku' => 'ENT-PAT-HOG', 'cost_price' => 2800,  'sale_price' => 9500,  'stock' => 40, 'track_inventory' => false]),
            $this->insertProduct(['category_id' => $cats['platos'],   'name' => 'Bandeja Paisa',               'sku' => 'PLA-BAN-PAI', 'cost_price' => 18000, 'sale_price' => 38000, 'stock' => 30, 'track_inventory' => false]),
            $this->insertProduct(['category_id' => $cats['platos'],   'name' => 'Pollo a la Plancha + Arroz',  'sku' => 'PLA-POL-PLA', 'cost_price' => 12000, 'sale_price' => 28000, 'stock' => 40, 'track_inventory' => false]),
            $this->insertProduct(['category_id' => $cats['platos'],   'name' => 'Churrasco 300g',              'sku' => 'PLA-CHU-300', 'cost_price' => 25000, 'sale_price' => 55000, 'stock' => 20, 'track_inventory' => false]),
            $this->insertProduct(['category_id' => $cats['platos'],   'name' => 'Cazuela de Mariscos',         'sku' => 'PLA-CAZ-MAR', 'cost_price' => 22000, 'sale_price' => 48000, 'stock' => 15, 'track_inventory' => false]),
            $this->insertProduct(['category_id' => $cats['sopas'],    'name' => 'Sancocho de Gallina',         'sku' => 'SOP-SAN-GAL', 'cost_price' => 9000,  'sale_price' => 22000, 'stock' => 20, 'track_inventory' => false]),
            $this->insertProduct(['category_id' => $cats['sopas'],    'name' => 'Ajiaco Santafereño',          'sku' => 'SOP-AJI-SAN', 'cost_price' => 10000, 'sale_price' => 25000, 'stock' => 20, 'track_inventory' => false]),
            $this->insertProduct(['category_id' => $cats['bebidas'],  'name' => 'Jugo Natural 400ml',          'sku' => 'BEB-JUG-400', 'cost_price' => 1500,  'sale_price' => 8000,  'stock' => 60, 'track_inventory' => false]),
            $this->insertProduct(['category_id' => $cats['bebidas'],  'name' => 'Cerveza Águila 330ml',        'sku' => 'BEB-CER-330', 'cost_price' => 2500,  'sale_price' => 7000,  'stock' => 96, 'track_inventory' => false]),
            $this->insertProduct(['category_id' => $cats['postres'],  'name' => 'Tres Leches',                 'sku' => 'POS-TRL',     'cost_price' => 3500,  'sale_price' => 12000, 'stock' => 15, 'track_inventory' => false]),
            $this->insertProduct(['category_id' => $cats['combos'],   'name' => 'Menú del Día (sopa+seco+jugo)','sku'=> 'COM-MEN-DIA', 'cost_price' => 12000, 'sale_price' => 25000, 'stock' => 50, 'track_inventory' => false]),
        ];

        $c = $this->insertCustomers([
            ['name' => 'Empresa Bogotá SAS',  'document' => '901234567', 'document_type' => 'nit', 'phone' => '6014567890', 'email' => 'bogotasas@empresa.com'],
            ['name' => 'Juan David Morales',  'document' => '80456789',  'phone' => '3101234567',  'email' => 'jdmorales@gmail.com'],
            ['name' => 'Patricia Suárez',     'document' => '52123456',  'phone' => '3209876543',  'email' => 'psuarez@outlook.com'],
            ['name' => 'Ricardo Montoya',     'document' => '19789012',  'phone' => '3157654321'],
            ['name' => 'Alejandra Ríos',      'document' => '1019234567','phone' => '3012345678',  'email' => 'arios@gmail.com'],
        ]);

        $this->insertSales([
            ['customer_id' => $c[0], 'days' => 12, 'method' => 'transfer', 'items' => [
                ['product_id' => $p[2],  'name' => 'Bandeja Paisa',       'qty' => 4, 'price' => 38000],
                ['product_id' => $p[8],  'name' => 'Jugo Natural 400ml',  'qty' => 4, 'price' => 8000],
                ['product_id' => $p[10], 'name' => 'Tres Leches',         'qty' => 4, 'price' => 12000],
            ]],
            ['customer_id' => $c[1], 'days' => 8,  'method' => 'card', 'items' => [
                ['product_id' => $p[3], 'name' => 'Pollo a la Plancha',   'qty' => 2, 'price' => 28000],
                ['product_id' => $p[9], 'name' => 'Cerveza Águila 330ml', 'qty' => 4, 'price' => 7000],
            ]],
            ['customer_id' => null,  'days' => 5,  'method' => 'cash', 'items' => [
                ['product_id' => $p[11],'name' => 'Menú del Día',         'qty' => 6, 'price' => 25000],
                ['product_id' => $p[8], 'name' => 'Jugo Natural 400ml',   'qty' => 6, 'price' => 8000],
            ]],
            ['customer_id' => $c[2], 'days' => 3,  'method' => 'card', 'items' => [
                ['product_id' => $p[4], 'name' => 'Churrasco 300g',       'qty' => 2, 'price' => 55000],
                ['product_id' => $p[0], 'name' => 'Empanadas x3',         'qty' => 2, 'price' => 8000],
                ['product_id' => $p[9], 'name' => 'Cerveza Águila 330ml', 'qty' => 4, 'price' => 7000],
            ]],
            ['customer_id' => $c[3], 'days' => 1,  'method' => 'cash', 'items' => [
                ['product_id' => $p[6], 'name' => 'Sancocho de Gallina',  'qty' => 2, 'price' => 22000],
                ['product_id' => $p[1], 'name' => 'Patacones con Hogao',  'qty' => 2, 'price' => 9500],
                ['product_id' => $p[8], 'name' => 'Jugo Natural 400ml',   'qty' => 2, 'price' => 8000],
            ]],
            ['customer_id' => $c[4], 'days' => 0,  'method' => 'card', 'items' => [
                ['product_id' => $p[5],  'name' => 'Cazuela de Mariscos', 'qty' => 2, 'price' => 48000],
                ['product_id' => $p[7],  'name' => 'Ajiaco Santafereño',  'qty' => 1, 'price' => 25000],
                ['product_id' => $p[10], 'name' => 'Tres Leches',         'qty' => 3, 'price' => 12000],
            ]],
        ], $adminId, $prefix);
    }
}
