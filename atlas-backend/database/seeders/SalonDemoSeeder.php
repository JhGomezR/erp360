<?php

namespace Database\Seeders;

/**
 * Demo: Salón Belleza y Estilo (salon)
 * Email : admin@salon-demo.com
 * Pass  : Atlas@2025!
 * URL   : atlaserp.com.co/salon-demo
 */
class SalonDemoSeeder extends DemoTenantBaseSeeder
{
    protected function config(): array
    {
        return [
            'business_name' => 'Salón Belleza y Estilo',
            'slug'          => 'salon-demo',
            'email'         => 'admin@salon-demo.com',
            'owner_name'    => 'Valentina Castro',
            'business_type' => 'salon',
            'plan_slug'     => 'basico-store',
            'sale_prefix'   => 'SLN',
        ];
    }

    protected function seedData(int $adminId, int $warehouseId, string $prefix): void
    {
        $cats = $this->insertCategories([
            'cortes'       => 'Cortes y Peinados',
            'color'        => 'Coloración y Tintes',
            'tratamientos' => 'Tratamientos Capilares',
            'unas'         => 'Manicure y Pedicure',
            'productos'    => 'Productos de Venta',
        ]);

        $p = [
            $this->insertProduct(['category_id' => $cats['cortes'],       'name' => 'Corte de Cabello Dama',            'sku' => 'COR-DAM',     'cost_price' => 8000,  'sale_price' => 35000,  'stock' => 999, 'min_stock' => 0, 'track_inventory' => false]),
            $this->insertProduct(['category_id' => $cats['cortes'],       'name' => 'Corte de Cabello Caballero',       'sku' => 'COR-CAB',     'cost_price' => 5000,  'sale_price' => 22000,  'stock' => 999, 'min_stock' => 0, 'track_inventory' => false]),
            $this->insertProduct(['category_id' => $cats['cortes'],       'name' => 'Peinado Formal (Recogido)',        'sku' => 'PEI-FOR',     'cost_price' => 10000, 'sale_price' => 55000,  'stock' => 999, 'min_stock' => 0, 'track_inventory' => false]),
            $this->insertProduct(['category_id' => $cats['color'],        'name' => 'Coloración Completa',              'sku' => 'COL-COM',     'cost_price' => 35000, 'sale_price' => 120000, 'stock' => 999, 'min_stock' => 0, 'track_inventory' => false]),
            $this->insertProduct(['category_id' => $cats['color'],        'name' => 'Mechas / Balayage',                'sku' => 'COL-BAL',     'cost_price' => 50000, 'sale_price' => 180000, 'stock' => 999, 'min_stock' => 0, 'track_inventory' => false]),
            $this->insertProduct(['category_id' => $cats['color'],        'name' => 'Retoque de Raíz',                 'sku' => 'COL-RAI',     'cost_price' => 18000, 'sale_price' => 65000,  'stock' => 999, 'min_stock' => 0, 'track_inventory' => false]),
            $this->insertProduct(['category_id' => $cats['tratamientos'], 'name' => 'Keratina Brasileña',               'sku' => 'TRT-KER',     'cost_price' => 80000, 'sale_price' => 250000, 'stock' => 999, 'min_stock' => 0, 'track_inventory' => false]),
            $this->insertProduct(['category_id' => $cats['tratamientos'], 'name' => 'Hidratación Profunda',             'sku' => 'TRT-HID',     'cost_price' => 20000, 'sale_price' => 75000,  'stock' => 999, 'min_stock' => 0, 'track_inventory' => false]),
            $this->insertProduct(['category_id' => $cats['unas'],         'name' => 'Manicure Tradicional',             'sku' => 'UNA-MAN',     'cost_price' => 5000,  'sale_price' => 25000,  'stock' => 999, 'min_stock' => 0, 'track_inventory' => false]),
            $this->insertProduct(['category_id' => $cats['unas'],         'name' => 'Semipermanente (Manos)',           'sku' => 'UNA-SEMI',    'cost_price' => 12000, 'sale_price' => 55000,  'stock' => 999, 'min_stock' => 0, 'track_inventory' => false]),
            $this->insertProduct(['category_id' => $cats['productos'],    'name' => 'Shampoo Profesional Alfaparf 300ml','sku'=> 'PRO-SHA-ALP', 'cost_price' => 38000, 'sale_price' => 72000,  'stock' => 20,  'min_stock' => 4]),
            $this->insertProduct(['category_id' => $cats['productos'],    'name' => 'Mascarilla Nutrición Intensa',     'sku' => 'PRO-MAS-NUT', 'cost_price' => 22000, 'sale_price' => 45000,  'stock' => 15,  'min_stock' => 3]),
        ];

        $c = $this->insertCustomers([
            ['name' => 'Natalia Gómez',     'document' => '1019345678', 'phone' => '3101234567', 'email' => 'nagomez@gmail.com',    'notes' => 'Cita fija cada 4 semanas'],
            ['name' => 'Mónica Salazar',    'document' => '52456789',   'phone' => '3209876543', 'email' => 'msalazar@hotmail.com', 'notes' => 'Prefiere tinte rubio dorado'],
            ['name' => 'Camila Betancourt', 'document' => '1024567890', 'phone' => '3157654321'],
            ['name' => 'Sara Medina',       'document' => '53234567',   'phone' => '3012345678', 'email' => 'smedina@gmail.com'],
            ['name' => 'Isabela Reyes',     'document' => '1022345678', 'phone' => '3187651234', 'notes' => 'Clienta VIP — keratina mensual'],
        ]);

        $this->insertSales([
            ['customer_id' => $c[0], 'days' => 18, 'method' => 'card', 'items' => [
                ['product_id' => $p[0], 'name' => 'Corte de Cabello Dama',        'qty' => 1, 'price' => 35000],
                ['product_id' => $p[7], 'name' => 'Hidratación Profunda',          'qty' => 1, 'price' => 75000],
            ]],
            ['customer_id' => $c[4], 'days' => 12, 'method' => 'transfer', 'items' => [
                ['product_id' => $p[6],  'name' => 'Keratina Brasileña',           'qty' => 1, 'price' => 250000],
                ['product_id' => $p[10], 'name' => 'Shampoo Profesional Alfaparf', 'qty' => 1, 'price' => 72000],
            ]],
            ['customer_id' => $c[1], 'days' => 8,  'method' => 'cash', 'items' => [
                ['product_id' => $p[3], 'name' => 'Coloración Completa',           'qty' => 1, 'price' => 120000],
                ['product_id' => $p[0], 'name' => 'Corte de Cabello Dama',         'qty' => 1, 'price' => 35000],
            ]],
            ['customer_id' => $c[2], 'days' => 5,  'method' => 'card', 'items' => [
                ['product_id' => $p[8], 'name' => 'Manicure Tradicional',          'qty' => 1, 'price' => 25000],
                ['product_id' => $p[9], 'name' => 'Semipermanente Manos',          'qty' => 1, 'price' => 55000],
            ]],
            ['customer_id' => $c[3], 'days' => 2,  'method' => 'cash', 'items' => [
                ['product_id' => $p[4], 'name' => 'Mechas / Balayage',             'qty' => 1, 'price' => 180000],
                ['product_id' => $p[2], 'name' => 'Peinado Formal Recogido',       'qty' => 1, 'price' => 55000],
            ]],
            ['customer_id' => $c[0], 'days' => 0,  'method' => 'card', 'items' => [
                ['product_id' => $p[5],  'name' => 'Retoque de Raíz',              'qty' => 1, 'price' => 65000],
                ['product_id' => $p[11], 'name' => 'Mascarilla Nutrición Intensa', 'qty' => 1, 'price' => 45000],
            ]],
        ], $adminId, $prefix);
    }
}
