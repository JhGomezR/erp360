<?php

namespace Database\Seeders;

/**
 * Demo: Droguería San Rafael (pharmacy)
 * Email : admin@drug-demo.com
 * Pass  : Atlas@2025!
 * URL   : atlaserp.com.co/drogueria-demo
 */
class PharmacyDemoSeeder extends DemoTenantBaseSeeder
{
    protected function config(): array
    {
        return [
            'business_name' => 'Droguería San Rafael',
            'slug'          => 'drogueria-demo',
            'email'         => 'admin@drug-demo.com',
            'owner_name'    => 'Ana María López',
            'business_type' => 'pharmacy',
            'plan_slug'     => 'profesional-store',
            'sale_prefix'   => 'FAR',
        ];
    }

    protected function seedData(int $adminId, int $warehouseId, string $prefix): void
    {
        $cats = $this->insertCategories([
            'eps'          => 'Medicamentos EPS',
            'otc'          => 'Venta Libre (OTC)',
            'controlados'  => 'Medicamentos Controlados',
            'suplementos'  => 'Vitaminas y Suplementos',
            'cosmeticos'   => 'Cosméticos y Cuidado',
            'dispositivos' => 'Dispositivos Médicos',
        ]);

        $p = [
            $this->insertProduct(['category_id' => $cats['eps'],         'name' => 'Amoxicilina 500mg Cap x30',       'sku' => 'AMX-500-30',  'barcode' => '7702018001001', 'cost_price' => 9200,  'sale_price' => 18500,  'stock' => 120, 'min_stock' => 20]),
            $this->insertProduct(['category_id' => $cats['eps'],         'name' => 'Metformina 850mg Tab x50',        'sku' => 'MET-850-50',  'barcode' => '7702018001002', 'cost_price' => 11000, 'sale_price' => 25000,  'stock' => 85,  'min_stock' => 15]),
            $this->insertProduct(['category_id' => $cats['eps'],         'name' => 'Losartan 50mg Tab x30',           'sku' => 'LOS-050-30',  'barcode' => '7702018001003', 'cost_price' => 10500, 'sale_price' => 22000,  'stock' => 64,  'min_stock' => 10]),
            $this->insertProduct(['category_id' => $cats['eps'],         'name' => 'Omeprazol 20mg Cap x28',          'sku' => 'OME-020-28',  'barcode' => '7702018001004', 'cost_price' => 8900,  'sale_price' => 19800,  'stock' => 97,  'min_stock' => 20]),
            $this->insertProduct(['category_id' => $cats['otc'],         'name' => 'Dolex Forte Tab x24',             'sku' => 'DOL-FTE-24',  'barcode' => '7702001002001', 'cost_price' => 6000,  'sale_price' => 12500,  'stock' => 200, 'min_stock' => 30]),
            $this->insertProduct(['category_id' => $cats['otc'],         'name' => 'Ibuprofeno 400mg Tab x20',        'sku' => 'IBU-400-20',  'barcode' => '7702001002002', 'cost_price' => 4500,  'sale_price' => 9800,   'stock' => 180, 'min_stock' => 30]),
            $this->insertProduct(['category_id' => $cats['otc'],         'name' => 'Loratadina 10mg Tab x10',         'sku' => 'LOR-010-10',  'barcode' => '7702001002003', 'cost_price' => 3200,  'sale_price' => 7500,   'stock' => 90,  'min_stock' => 25]),
            $this->insertProduct(['category_id' => $cats['otc'],         'name' => 'Antigripal MK Tab x20',           'sku' => 'AGR-MK-20',   'barcode' => '7702001002004', 'cost_price' => 5100,  'sale_price' => 11200,  'stock' => 145, 'min_stock' => 25]),
            $this->insertProduct(['category_id' => $cats['suplementos'], 'name' => 'Centrum Adults Tab x60',          'sku' => 'CTR-ADL-60',  'barcode' => '7702001003001', 'cost_price' => 42000, 'sale_price' => 89000,  'stock' => 40,  'min_stock' => 8]),
            $this->insertProduct(['category_id' => $cats['suplementos'], 'name' => 'Omega 3 1000mg Cap x90',          'sku' => 'OMG3-1K-90',  'barcode' => '7702001003002', 'cost_price' => 35000, 'sale_price' => 75000,  'stock' => 28,  'min_stock' => 5]),
            $this->insertProduct(['category_id' => $cats['cosmeticos'],  'name' => 'Eucerin Loción 500ml',            'sku' => 'EUC-LOC-500', 'barcode' => '4005900000001', 'cost_price' => 38000, 'sale_price' => 72000,  'stock' => 15,  'min_stock' => 5]),
            $this->insertProduct(['category_id' => $cats['dispositivos'],'name' => 'Tensiómetro Digital de Brazo',   'sku' => 'TENS-DIG-01', 'barcode' => '8717677120001', 'cost_price' => 95000, 'sale_price' => 185000, 'stock' => 8,   'min_stock' => 2]),
            $this->insertProduct(['category_id' => $cats['dispositivos'],'name' => 'Termómetro Infrarrojo',          'sku' => 'TERM-IR-01',  'barcode' => '8717677120002', 'cost_price' => 65000, 'sale_price' => 125000, 'stock' => 12,  'min_stock' => 2]),
        ];

        $c = $this->insertCustomers([
            ['name' => 'María Fernanda Ospina', 'document' => '52345678',   'phone' => '3101234567', 'email' => 'mfospina@gmail.com'],
            ['name' => 'Carlos Andrés Rincón',  'document' => '79456123',   'phone' => '3209876543', 'email' => 'carincon@hotmail.com'],
            ['name' => 'Laura Sofía Herrera',   'document' => '1020456789', 'phone' => '3157654321'],
            ['name' => 'Diego Mauricio Torres', 'document' => '80234567',   'phone' => '3012345678'],
            ['name' => 'Ana Lucía Vargas',      'document' => '43123456',   'phone' => '3187654321', 'email' => 'alvargas@gmail.com'],
        ]);

        $this->insertSales([
            ['customer_id' => $c[0], 'days' => 15, 'method' => 'cash', 'items' => [
                ['product_id' => $p[4], 'name' => 'Dolex Forte Tab x24',      'qty' => 1, 'price' => 12500],
                ['product_id' => $p[5], 'name' => 'Ibuprofeno 400mg Tab x20', 'qty' => 1, 'price' => 9800],
                ['product_id' => $p[6], 'name' => 'Loratadina 10mg Tab x10',  'qty' => 1, 'price' => 7500],
            ]],
            ['customer_id' => $c[1], 'days' => 10, 'method' => 'card', 'items' => [
                ['product_id' => $p[8], 'name' => 'Centrum Adults Tab x60',   'qty' => 1, 'price' => 89000],
                ['product_id' => $p[9], 'name' => 'Omega 3 1000mg Cap x90',   'qty' => 1, 'price' => 75000],
            ]],
            ['customer_id' => $c[2], 'days' => 6,  'method' => 'cash', 'items' => [
                ['product_id' => $p[0], 'name' => 'Amoxicilina 500mg x30',    'qty' => 1, 'price' => 18500],
                ['product_id' => $p[3], 'name' => 'Omeprazol 20mg Cap x28',   'qty' => 1, 'price' => 19800],
            ]],
            ['customer_id' => $c[3], 'days' => 3,  'method' => 'transfer', 'items' => [
                ['product_id' => $p[11],'name' => 'Tensiómetro Digital',       'qty' => 1, 'price' => 185000],
                ['product_id' => $p[12],'name' => 'Termómetro Infrarrojo',     'qty' => 1, 'price' => 125000],
            ]],
            ['customer_id' => $c[4], 'days' => 1,  'method' => 'card', 'items' => [
                ['product_id' => $p[10],'name' => 'Eucerin Loción 500ml',      'qty' => 1, 'price' => 72000],
                ['product_id' => $p[7], 'name' => 'Antigripal MK Tab x20',    'qty' => 2, 'price' => 11200],
            ]],
            ['customer_id' => null,  'days' => 0,  'method' => 'cash', 'items' => [
                ['product_id' => $p[4], 'name' => 'Dolex Forte Tab x24',      'qty' => 2, 'price' => 12500],
                ['product_id' => $p[1], 'name' => 'Metformina 850mg Tab x50', 'qty' => 1, 'price' => 25000],
            ]],
        ], $adminId, $prefix);
    }
}
