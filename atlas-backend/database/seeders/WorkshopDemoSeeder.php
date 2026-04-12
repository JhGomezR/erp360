<?php

namespace Database\Seeders;

/**
 * Demo: Taller Mecánico Auto Fix (workshop)
 * Email : admin@taller-demo.com
 * Pass  : Atlas@2025!
 * URL   : atlaserp.com.co/taller-demo
 */
class WorkshopDemoSeeder extends DemoTenantBaseSeeder
{
    protected function config(): array
    {
        return [
            'business_name' => 'Taller Mecánico Auto Fix',
            'slug'          => 'taller-demo',
            'email'         => 'admin@taller-demo.com',
            'owner_name'    => 'Rodrigo Vargas',
            'business_type' => 'workshop',
            'plan_slug'     => 'basico-store',
            'sale_prefix'   => 'TLR',
        ];
    }

    protected function seedData(int $adminId, int $warehouseId, string $prefix): void
    {
        $cats = $this->insertCategories([
            'aceites'   => 'Aceites y Lubricantes',
            'filtros'   => 'Filtros',
            'frenos'    => 'Sistema de Frenos',
            'electrico' => 'Sistema Eléctrico',
            'servicios' => 'Servicios de Taller',
        ]);

        $p = [
            $this->insertProduct(['category_id' => $cats['aceites'],   'name' => 'Aceite Mobil 10W-30 1L',         'sku' => 'ACE-MOB-1L',   'cost_price' => 18000,  'sale_price' => 32000,  'stock' => 48,  'min_stock' => 8]),
            $this->insertProduct(['category_id' => $cats['aceites'],   'name' => 'Aceite Castrol 20W-50 4L',       'sku' => 'ACE-CAS-4L',   'cost_price' => 65000,  'sale_price' => 115000, 'stock' => 20,  'min_stock' => 4]),
            $this->insertProduct(['category_id' => $cats['filtros'],   'name' => 'Filtro de Aceite Universal',     'sku' => 'FIL-ACE-UNI',  'cost_price' => 9000,   'sale_price' => 18000,  'stock' => 35,  'min_stock' => 8]),
            $this->insertProduct(['category_id' => $cats['filtros'],   'name' => 'Filtro de Aire Honda/Mazda',     'sku' => 'FIL-AIR-HND',  'cost_price' => 12000,  'sale_price' => 25000,  'stock' => 20,  'min_stock' => 5]),
            $this->insertProduct(['category_id' => $cats['frenos'],    'name' => 'Pastillas de Freno Delanteras',  'sku' => 'FRE-PAS-DEL',  'cost_price' => 28000,  'sale_price' => 55000,  'stock' => 16,  'min_stock' => 4]),
            $this->insertProduct(['category_id' => $cats['frenos'],    'name' => 'Líquido de Frenos DOT4 500ml',  'sku' => 'FRE-LIQ-500',  'cost_price' => 8500,   'sale_price' => 16500,  'stock' => 24,  'min_stock' => 6]),
            $this->insertProduct(['category_id' => $cats['electrico'], 'name' => 'Batería 12V 45Ah Calsonic',     'sku' => 'ELE-BAT-45A',  'cost_price' => 185000, 'sale_price' => 320000, 'stock' => 6,   'min_stock' => 2]),
            $this->insertProduct(['category_id' => $cats['electrico'], 'name' => 'Bujías NGK (juego x4)',         'sku' => 'ELE-BUJ-NGK4', 'cost_price' => 28000,  'sale_price' => 55000,  'stock' => 18,  'min_stock' => 4]),
            $this->insertProduct(['category_id' => $cats['servicios'], 'name' => 'Mano de Obra Cambio de Aceite', 'sku' => 'SRV-CAM-ACE',  'cost_price' => 0,      'sale_price' => 25000,  'stock' => 999, 'min_stock' => 0, 'track_inventory' => false]),
            $this->insertProduct(['category_id' => $cats['servicios'], 'name' => 'Mano de Obra Cambio de Frenos', 'sku' => 'SRV-CAM-FRE',  'cost_price' => 0,      'sale_price' => 45000,  'stock' => 999, 'min_stock' => 0, 'track_inventory' => false]),
            $this->insertProduct(['category_id' => $cats['servicios'], 'name' => 'Diagnóstico Electrónico OBD',   'sku' => 'SRV-DIAG-OBD', 'cost_price' => 0,      'sale_price' => 35000,  'stock' => 999, 'min_stock' => 0, 'track_inventory' => false]),
            $this->insertProduct(['category_id' => $cats['servicios'], 'name' => 'Lavado y Encerrado Completo',   'sku' => 'SRV-LAV-COM',  'cost_price' => 8000,   'sale_price' => 35000,  'stock' => 999, 'min_stock' => 0, 'track_inventory' => false]),
        ];

        $c = $this->insertCustomers([
            ['name' => 'Luis Fernando Cano',     'document' => '79123456',  'phone' => '3101234567', 'email' => 'lfcano@gmail.com',   'notes' => 'Toyota Hilux 2019 — placa ABC-123'],
            ['name' => 'Jorge Hernández',        'document' => '80234567',  'phone' => '3209876543',                                  'notes' => 'Chevrolet Sail 2021 — placa XYZ-456'],
            ['name' => 'Transportes SAS',        'document' => '900567890', 'phone' => '6014567890', 'document_type' => 'nit', 'email' => 'compras@transportes.com', 'notes' => 'Flota 8 vehículos'],
            ['name' => 'Andrés Felipe Ortiz',    'document' => '1020789012','phone' => '3157654321',                                  'notes' => 'Mazda 3 2020 — placa DEF-789'],
            ['name' => 'Claudia Moreno',         'document' => '52789012',  'phone' => '3012345678', 'email' => 'cmoreno@gmail.com',  'notes' => 'Renault Logan 2018 — placa GHI-012'],
        ]);

        $this->insertSales([
            ['customer_id' => $c[0], 'days' => 20, 'method' => 'card', 'items' => [
                ['product_id' => $p[1], 'name' => 'Aceite Castrol 20W-50 4L',      'qty' => 1, 'price' => 115000],
                ['product_id' => $p[2], 'name' => 'Filtro de Aceite Universal',    'qty' => 1, 'price' => 18000],
                ['product_id' => $p[8], 'name' => 'Mano de Obra Cambio de Aceite', 'qty' => 1, 'price' => 25000],
            ]],
            ['customer_id' => $c[2], 'days' => 14, 'method' => 'transfer', 'items' => [
                ['product_id' => $p[4], 'name' => 'Pastillas de Freno Delanteras', 'qty' => 4, 'price' => 55000],
                ['product_id' => $p[5], 'name' => 'Líquido de Frenos DOT4',        'qty' => 4, 'price' => 16500],
                ['product_id' => $p[9], 'name' => 'Mano de Obra Cambio de Frenos', 'qty' => 4, 'price' => 45000],
            ]],
            ['customer_id' => $c[1], 'days' => 8,  'method' => 'cash', 'items' => [
                ['product_id' => $p[10],'name' => 'Diagnóstico Electrónico OBD',   'qty' => 1, 'price' => 35000],
                ['product_id' => $p[7], 'name' => 'Bujías NGK juego x4',           'qty' => 1, 'price' => 55000],
            ]],
            ['customer_id' => $c[3], 'days' => 4,  'method' => 'cash', 'items' => [
                ['product_id' => $p[6], 'name' => 'Batería 12V 45Ah',              'qty' => 1, 'price' => 320000],
                ['product_id' => $p[10],'name' => 'Diagnóstico Electrónico OBD',   'qty' => 1, 'price' => 35000],
            ]],
            ['customer_id' => $c[4], 'days' => 1,  'method' => 'card', 'items' => [
                ['product_id' => $p[0], 'name' => 'Aceite Mobil 10W-30 1L',        'qty' => 4, 'price' => 32000],
                ['product_id' => $p[3], 'name' => 'Filtro de Aire Honda/Mazda',    'qty' => 1, 'price' => 25000],
                ['product_id' => $p[8], 'name' => 'Mano de Obra Cambio de Aceite', 'qty' => 1, 'price' => 25000],
            ]],
        ], $adminId, $prefix);
    }
}
