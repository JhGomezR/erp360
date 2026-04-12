<?php

namespace Database\Seeders;

/**
 * Demo: Tienda La Esperanza (store)
 * Email : admin@tienda-demo.com
 * Pass  : Atlas@2025!
 * URL   : atlaserp.com.co/tienda-demo
 */
class StoreDemoSeeder extends DemoTenantBaseSeeder
{
    protected function config(): array
    {
        return [
            'business_name' => 'Tienda La Esperanza',
            'slug'          => 'tienda-demo',
            'email'         => 'admin@tienda-demo.com',
            'owner_name'    => 'Marcela Rodríguez',
            'business_type' => 'store',
            'plan_slug'     => 'profesional-store',
            'sale_prefix'   => 'VTA',
        ];
    }

    protected function seedData(int $adminId, int $warehouseId, string $prefix): void
    {
        $cats = $this->insertCategories([
            'abarrotes' => 'Abarrotes y Despensa',
            'lacteos'   => 'Lácteos y Huevos',
            'bebidas'   => 'Bebidas y Jugos',
            'aseo'      => 'Aseo del Hogar',
            'cuidado'   => 'Cuidado Personal',
            'snacks'    => 'Snacks y Confitería',
        ]);

        $p = [
            $this->insertProduct(['category_id' => $cats['abarrotes'], 'name' => 'Arroz Diana 500g',           'sku' => 'ARR-DIA-500', 'cost_price' => 2100, 'sale_price' => 2900,  'stock' => 120, 'min_stock' => 20]),
            $this->insertProduct(['category_id' => $cats['abarrotes'], 'name' => 'Aceite Palma Real 1L',       'sku' => 'ACE-PR-1L',   'cost_price' => 7500, 'sale_price' => 9900,  'stock' => 60,  'min_stock' => 10]),
            $this->insertProduct(['category_id' => $cats['abarrotes'], 'name' => 'Azúcar Incauca 1Kg',         'sku' => 'AZU-INC-1K',  'cost_price' => 3200, 'sale_price' => 4200,  'stock' => 80,  'min_stock' => 15]),
            $this->insertProduct(['category_id' => $cats['abarrotes'], 'name' => 'Pasta El Dorado 250g',       'sku' => 'PAS-ED-250',  'cost_price' => 1800, 'sale_price' => 2500,  'stock' => 95,  'min_stock' => 20]),
            $this->insertProduct(['category_id' => $cats['lacteos'],   'name' => 'Leche Entera Alquería 1L',   'sku' => 'LEC-ALQ-1L',  'cost_price' => 2800, 'sale_price' => 3500,  'stock' => 48,  'min_stock' => 12]),
            $this->insertProduct(['category_id' => $cats['lacteos'],   'name' => 'Huevos Rojo AA x12',         'sku' => 'HUE-ROJ-12',  'cost_price' => 8500, 'sale_price' => 11500, 'stock' => 30,  'min_stock' => 6]),
            $this->insertProduct(['category_id' => $cats['bebidas'],   'name' => 'Gaseosa Coca-Cola 2L',       'sku' => 'GAS-CC-2L',   'cost_price' => 5200, 'sale_price' => 6900,  'stock' => 72,  'min_stock' => 12]),
            $this->insertProduct(['category_id' => $cats['bebidas'],   'name' => 'Agua Cristal 600ml',         'sku' => 'AGU-CRS-600', 'cost_price' => 800,  'sale_price' => 1500,  'stock' => 144, 'min_stock' => 24]),
            $this->insertProduct(['category_id' => $cats['aseo'],      'name' => 'Detergente Ariel 450g',      'sku' => 'DET-AR-450',  'cost_price' => 6800, 'sale_price' => 9200,  'stock' => 40,  'min_stock' => 8]),
            $this->insertProduct(['category_id' => $cats['aseo'],      'name' => 'Jabón Rey Lavaplatos 300g',  'sku' => 'JAB-REY-300', 'cost_price' => 2500, 'sale_price' => 3500,  'stock' => 55,  'min_stock' => 10]),
            $this->insertProduct(['category_id' => $cats['cuidado'],   'name' => 'Shampoo Head&Shoulders 200ml','sku'=> 'SHA-HS-200',  'cost_price' => 8200, 'sale_price' => 11500, 'stock' => 25,  'min_stock' => 5]),
            $this->insertProduct(['category_id' => $cats['snacks'],    'name' => 'Papas Margarita Clásica 70g','sku' => 'PAP-MAR-70', 'cost_price' => 1900, 'sale_price' => 2800,  'stock' => 90,  'min_stock' => 15]),
        ];

        $c = $this->insertCustomers([
            ['name' => 'Laura Martínez',  'document' => '1020345678', 'phone' => '3101234567', 'email' => 'laura.m@gmail.com',     'city' => 'Bogotá'],
            ['name' => 'Pedro Jiménez',   'document' => '79234567',   'phone' => '3209876543', 'email' => 'pedrojimenez@gmail.com','city' => 'Bogotá'],
            ['name' => 'Sofía Herrera',   'document' => '1023456789', 'phone' => '3157654321', 'email' => 'sofiah@hotmail.com',    'city' => 'Bogotá'],
            ['name' => 'Familia Gómez',   'document' => '900123456',  'phone' => '3012345678', 'document_type' => 'nit'],
            ['name' => 'Daniela Torres',  'document' => '1025678901', 'phone' => '3187651234'],
        ]);

        $this->insertSales([
            ['customer_id' => $c[0], 'days' => 14, 'method' => 'card', 'items' => [
                ['product_id' => $p[0], 'name' => 'Arroz Diana 500g',         'qty' => 3,  'price' => 2900],
                ['product_id' => $p[4], 'name' => 'Leche Entera Alquería 1L', 'qty' => 2,  'price' => 3500],
                ['product_id' => $p[7], 'name' => 'Agua Cristal 600ml',       'qty' => 4,  'price' => 1500],
            ]],
            ['customer_id' => $c[1], 'days' => 10, 'method' => 'cash', 'items' => [
                ['product_id' => $p[6], 'name' => 'Gaseosa Coca-Cola 2L',     'qty' => 2,  'price' => 6900],
                ['product_id' => $p[5], 'name' => 'Huevos Rojo AA x12',       'qty' => 1,  'price' => 11500],
                ['product_id' => $p[11],'name' => 'Papas Margarita 70g',      'qty' => 3,  'price' => 2800],
            ]],
            ['customer_id' => null,  'days' => 7,  'method' => 'cash', 'items' => [
                ['product_id' => $p[1], 'name' => 'Aceite Palma Real 1L',     'qty' => 1,  'price' => 9900],
                ['product_id' => $p[2], 'name' => 'Azúcar Incauca 1Kg',       'qty' => 2,  'price' => 4200],
                ['product_id' => $p[3], 'name' => 'Pasta El Dorado 250g',     'qty' => 4,  'price' => 2500],
            ]],
            ['customer_id' => $c[2], 'days' => 4,  'method' => 'transfer', 'items' => [
                ['product_id' => $p[8], 'name' => 'Detergente Ariel 450g',    'qty' => 2,  'price' => 9200],
                ['product_id' => $p[9], 'name' => 'Jabón Rey Lavaplatos',     'qty' => 3,  'price' => 3500],
                ['product_id' => $p[10],'name' => 'Shampoo Head&Shoulders',   'qty' => 1,  'price' => 11500],
            ]],
            ['customer_id' => $c[3], 'days' => 1,  'method' => 'card', 'items' => [
                ['product_id' => $p[0], 'name' => 'Arroz Diana 500g',         'qty' => 10, 'price' => 2900],
                ['product_id' => $p[1], 'name' => 'Aceite Palma Real 1L',     'qty' => 5,  'price' => 9900],
                ['product_id' => $p[2], 'name' => 'Azúcar Incauca 1Kg',       'qty' => 5,  'price' => 4200],
            ]],
            ['customer_id' => $c[4], 'days' => 0,  'method' => 'cash', 'items' => [
                ['product_id' => $p[4], 'name' => 'Leche Entera Alquería 1L', 'qty' => 3,  'price' => 3500],
                ['product_id' => $p[5], 'name' => 'Huevos Rojo AA x12',       'qty' => 1,  'price' => 11500],
            ]],
        ], $adminId, $prefix);
    }
}
