<?php

namespace App\Console\Commands;

use App\Central\Tenants\Models\Tenant;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

class SeedPharmacyDemo extends Command
{
    protected $signature   = 'atlas:seed-pharmacy-demo {--slug=farmacia-atlas}';
    protected $description = 'Seed demo data for pharmacy tenant';

    public function handle(): int
    {
        $slug   = $this->option('slug');
        $tenant = Tenant::where('slug', $slug)->first();

        if (! $tenant) {
            $this->error("Tenant '{$slug}' not found.");
            return 1;
        }

        $schema = $tenant->schema_name;
        $this->info("Switching to schema: {$schema}");

        // Activate tenant (central schema)
        $tenant->update(['status' => 'active', 'trial_ends_at' => now()->addYears(1)]);
        $this->info('Tenant activated.');

        // Switch to tenant schema
        DB::statement("SET search_path TO \"{$schema}\", public");

        // ── 1. Admin user (tenant_users) ───────────────────────────────────────
        DB::table('tenant_users')->where('email', 'admin@farmaciaatlas.com')->delete();
        $userId = DB::table('tenant_users')->insertGetId([
            'name'      => 'Admin Farmacia',
            'email'     => 'admin@farmaciaatlas.com',
            'password'  => Hash::make('Farmacia@2024!'),
            'is_active' => true,
            'created_at'=> now(),
            'updated_at'=> now(),
        ]);
        if (DB::getSchemaBuilder()->hasTable('roles')) {
            $roleId = DB::table('roles')->where('name', 'super')->value('id');
            if (! $roleId) {
                $roleId = DB::table('roles')->insertGetId([
                    'name' => 'super', 'guard_name' => 'tenant',
                    'created_at' => now(), 'updated_at' => now(),
                ]);
            }
            DB::table('model_has_roles')->insertOrIgnore([
                'role_id'    => $roleId,
                'model_type' => 'App\Tenant\Users\Models\TenantUser',
                'model_id'   => $userId,
            ]);
        }
        $this->info("Admin user seeded: admin@farmaciaatlas.com / Farmacia@2024!");

        // ── 2. Categories ──────────────────────────────────────────────────────
        DB::table('categories')->truncate();
        $catDefs = [
            ['name' => 'Medicamentos EPS',  'slug' => 'medicamentos-eps',  'description' => 'Medicamentos cubiertos por EPS'],
            ['name' => 'OTC / Venta libre', 'slug' => 'otc-venta-libre',   'description' => 'Medicamentos sin receta'],
            ['name' => 'Controlados',       'slug' => 'controlados',       'description' => 'Medicamentos de control especial INVIMA'],
            ['name' => 'Suplementos',       'slug' => 'suplementos',       'description' => 'Vitaminas y suplementos nutritivos'],
            ['name' => 'Cosmeticos',        'slug' => 'cosmeticos',        'description' => 'Productos de belleza y cuidado personal'],
            ['name' => 'Dispositivos',      'slug' => 'dispositivos',      'description' => 'Dispositivos medicos y ortopedicos'],
            ['name' => 'Bebe y Maternidad', 'slug' => 'bebe-maternidad',   'description' => 'Productos para bebe y mama'],
        ];
        foreach ($catDefs as &$c) {
            $c['is_active'] = true;
            $c['created_at'] = $c['updated_at'] = now();
        }
        DB::table('categories')->insert($catDefs);
        $catIds = DB::table('categories')->pluck('id', 'slug');
        $this->info('Categories seeded.');

        // ── 3. Suppliers ───────────────────────────────────────────────────────
        DB::table('suppliers')->truncate();
        $suppId1 = DB::table('suppliers')->insertGetId([
            'name' => 'Bayer Colombia S.A.', 'nit' => '860000100-3', 'email' => 'compras@bayer.com.co',
            'phone' => '6017456789', 'address' => 'Cra 9 #99-02 Of.501', 'city' => 'Bogota',
            'contact_name' => 'Juan Ramos', 'credit_limit' => 5000000, 'payment_terms' => 30,
            'is_active' => true, 'created_at' => now(), 'updated_at' => now(),
        ]);
        $suppId2 = DB::table('suppliers')->insertGetId([
            'name' => 'Tecnoquimicas S.A.', 'nit' => '890300000-5', 'email' => 'pedidos@tq.com.co',
            'phone' => '6024450000', 'address' => 'Cll 23 #7-39', 'city' => 'Cali',
            'contact_name' => 'Maria Lopez', 'credit_limit' => 8000000, 'payment_terms' => 45,
            'is_active' => true, 'created_at' => now(), 'updated_at' => now(),
        ]);
        $suppId3 = DB::table('suppliers')->insertGetId([
            'name' => 'Genfar S.A.', 'nit' => '860500200-1', 'email' => 'ventas@genfar.com',
            'phone' => '6017891234', 'address' => 'Av. El Dorado #69-76', 'city' => 'Bogota',
            'contact_name' => 'Andres Gil', 'credit_limit' => 10000000, 'payment_terms' => 30,
            'is_active' => true, 'created_at' => now(), 'updated_at' => now(),
        ]);
        $this->info('Suppliers seeded.');

        // ── 4. Products ────────────────────────────────────────────────────────
        DB::table('product_batches')->truncate();
        DB::table('kardex_entries')->truncate();
        DB::table('products')->truncate();
        $productDefs = [
            // EPS
            ['name' => 'Amoxicilina 500mg Cap x30',     'sku' => 'AMX-500-30',   'barcode' => '7702018001234', 'cat' => 'medicamentos-eps', 'sale_price' => 18500, 'cost_price' => 9200,  'stock' => 120, 'min' => 20, 'supp' => $suppId3, 'ctrl' => false, 'rx' => true],
            ['name' => 'Metformina 850mg Tab x50',      'sku' => 'MET-850-50',   'barcode' => '7702018001235', 'cat' => 'medicamentos-eps', 'sale_price' => 25000, 'cost_price' => 11000, 'stock' => 85,  'min' => 15, 'supp' => $suppId1, 'ctrl' => false, 'rx' => true],
            ['name' => 'Losartan 50mg Tab x30',         'sku' => 'LOS-50-30',    'barcode' => '7702018001236', 'cat' => 'medicamentos-eps', 'sale_price' => 22000, 'cost_price' => 10500, 'stock' => 64,  'min' => 10, 'supp' => $suppId2, 'ctrl' => false, 'rx' => true],
            ['name' => 'Atorvastatina 20mg Tab x30',    'sku' => 'ATO-20-30',    'barcode' => '7702018001237', 'cat' => 'medicamentos-eps', 'sale_price' => 35000, 'cost_price' => 17000, 'stock' => 42,  'min' => 10, 'supp' => $suppId1, 'ctrl' => false, 'rx' => true],
            ['name' => 'Omeprazol 20mg Cap x28',        'sku' => 'OME-20-28',    'barcode' => '7702018001238', 'cat' => 'medicamentos-eps', 'sale_price' => 19800, 'cost_price' => 8900,  'stock' => 97,  'min' => 20, 'supp' => $suppId3, 'ctrl' => false, 'rx' => false],
            // OTC
            ['name' => 'Dolex Forte Tab x24',           'sku' => 'DOL-FORTE-24', 'barcode' => '7702001002345', 'cat' => 'otc-venta-libre',  'sale_price' => 12500, 'cost_price' => 6000,  'stock' => 200, 'min' => 30, 'supp' => $suppId2, 'ctrl' => false, 'rx' => false],
            ['name' => 'Ibuprofeno 400mg Tab x20',      'sku' => 'IBU-400-20',   'barcode' => '7702001002346', 'cat' => 'otc-venta-libre',  'sale_price' => 9800,  'cost_price' => 4500,  'stock' => 180, 'min' => 30, 'supp' => $suppId3, 'ctrl' => false, 'rx' => false],
            ['name' => 'Loratadina 10mg Tab x10',       'sku' => 'LOR-10-10',    'barcode' => '7702001002347', 'cat' => 'otc-venta-libre',  'sale_price' => 7500,  'cost_price' => 3200,  'stock' => 8,   'min' => 25, 'supp' => $suppId2, 'ctrl' => false, 'rx' => false],
            ['name' => 'Sal de Frutas Eno 150g',        'sku' => 'ENO-150',      'barcode' => '7702001002348', 'cat' => 'otc-venta-libre',  'sale_price' => 15000, 'cost_price' => 7200,  'stock' => 55,  'min' => 15, 'supp' => $suppId1, 'ctrl' => false, 'rx' => false],
            ['name' => 'Antigripal MK Tab x20',         'sku' => 'AGMK-20',      'barcode' => '7702001002349', 'cat' => 'otc-venta-libre',  'sale_price' => 11200, 'cost_price' => 5100,  'stock' => 145, 'min' => 25, 'supp' => $suppId3, 'ctrl' => false, 'rx' => false],
            // Controlados
            ['name' => 'Tramadol 50mg Cap x20',         'sku' => 'TRA-50-20',    'barcode' => '7702001009001', 'cat' => 'controlados',      'sale_price' => 45000, 'cost_price' => 21000, 'stock' => 30,  'min' => 10, 'supp' => $suppId1, 'ctrl' => true,  'rx' => true,  'sched' => 'III', 'ingr' => 'Tramadol HCl'],
            ['name' => 'Clonazepam 0.5mg Tab x30',      'sku' => 'CLO-05-30',    'barcode' => '7702001009002', 'cat' => 'controlados',      'sale_price' => 38000, 'cost_price' => 18000, 'stock' => 22,  'min' => 10, 'supp' => $suppId2, 'ctrl' => true,  'rx' => true,  'sched' => 'IV',  'ingr' => 'Clonazepam'],
            // Suplementos
            ['name' => 'Centrum Adults Tab x60',        'sku' => 'CTR-60',       'barcode' => '7702001003456', 'cat' => 'suplementos',      'sale_price' => 89000, 'cost_price' => 42000, 'stock' => 40,  'min' => 8,  'supp' => $suppId1, 'ctrl' => false, 'rx' => false],
            ['name' => 'Omega 3 1000mg Cap x90',        'sku' => 'OMG3-1000-90', 'barcode' => '7702001003457', 'cat' => 'suplementos',      'sale_price' => 75000, 'cost_price' => 35000, 'stock' => 28,  'min' => 5,  'supp' => $suppId3, 'ctrl' => false, 'rx' => false],
            // Cosmeticos
            ['name' => 'Eucerin Locion 500ml',          'sku' => 'EUC-LOC-500',  'barcode' => '4005900000123', 'cat' => 'cosmeticos',       'sale_price' => 72000, 'cost_price' => 38000, 'stock' => 15,  'min' => 5,  'supp' => $suppId1, 'ctrl' => false, 'rx' => false],
            ['name' => 'Neutrogena Gel Limpiador 150ml','sku' => 'NEU-GEL-150',  'barcode' => '4005900000124', 'cat' => 'cosmeticos',       'sale_price' => 48000, 'cost_price' => 24000, 'stock' => 3,   'min' => 8,  'supp' => $suppId2, 'ctrl' => false, 'rx' => false],
            // Dispositivos
            ['name' => 'Tensiometro Digital de Brazo',  'sku' => 'TENS-DIG-01',  'barcode' => '8717677120123', 'cat' => 'dispositivos',     'sale_price' => 185000,'cost_price' => 95000, 'stock' => 8,   'min' => 2,  'supp' => $suppId2, 'ctrl' => false, 'rx' => false],
            ['name' => 'Termometro Infrarrojos',        'sku' => 'TERM-IR-01',   'barcode' => '8717677120124', 'cat' => 'dispositivos',     'sale_price' => 125000,'cost_price' => 65000, 'stock' => 12,  'min' => 2,  'supp' => $suppId1, 'ctrl' => false, 'rx' => false],
            // Bebe
            ['name' => 'Paracetamol Gotas 100mg/mL 30mL','sku' => 'PARA-GOT-30','barcode' => '7702001005678', 'cat' => 'bebe-maternidad',  'sale_price' => 16500, 'cost_price' => 7800,  'stock' => 65,  'min' => 15, 'supp' => $suppId3, 'ctrl' => false, 'rx' => false],
            ['name' => 'Cetirizina Sol 1mg/mL 60mL',   'sku' => 'CET-SOL-60',   'barcode' => '7702001005679', 'cat' => 'bebe-maternidad',  'sale_price' => 21000, 'cost_price' => 10500, 'stock' => 48,  'min' => 10, 'supp' => $suppId2, 'ctrl' => false, 'rx' => false],
        ];

        $prodIds = [];
        $ctrlDrugIds = [];
        foreach ($productDefs as $def) {
            $prodId = DB::table('products')->insertGetId([
                'name'                   => $def['name'],
                'sku'                    => $def['sku'],
                'barcode'                => $def['barcode'],
                'category_id'            => $catIds[$def['cat']],
                'sale_price'             => $def['sale_price'],
                'cost_price'             => $def['cost_price'],
                'average_cost'           => $def['cost_price'],
                'stock'                  => $def['stock'],
                'min_stock'              => $def['min'],
                'unit'                   => 'und',
                'is_active'              => true,
                'track_inventory'        => true,
                'allow_negative_stock'   => false,
                'requires_prescription'  => $def['rx'],
                'controlled_substance'   => $def['ctrl'],
                'preferred_supplier_id'  => $def['supp'],
                'created_at'             => now(),
                'updated_at'             => now(),
            ]);
            $prodIds[$def['sku']] = $prodId;

            // Kardex entry
            DB::table('kardex_entries')->insert([
                'product_id'     => $prodId,
                'type'           => 'in',
                'quantity'       => $def['stock'],
                'unit_cost'      => $def['cost_price'],
                'balance_stock'  => $def['stock'],
                'reference_type' => 'initial',
                'notes'          => 'Inventario inicial demo',
                'user_id'        => $userId,
                'created_at'     => now(),
            ]);

            // Product batch
            DB::table('product_batches')->insert([
                'product_id'        => $prodId,
                'batch_number'      => 'L-' . strtoupper(substr(md5($prodId . 'x'), 0, 8)),
                'quantity_received' => $def['stock'],
                'quantity_remaining'=> $def['stock'],
                'expiry_date'       => now()->addMonths(rand(4, 36)),
                'unit_cost'         => $def['cost_price'],
                'is_active'         => true,
                'created_at'        => now(),
                'updated_at'        => now(),
            ]);

            // Controlled drug record
            if ($def['ctrl']) {
                $ctrlId = DB::table('controlled_drugs')->insertGetId([
                    'product_id'             => $prodId,
                    'name'                   => $def['name'],
                    'active_ingredient'      => $def['ingr'],
                    'concentration'          => explode(' ', $def['name'])[1] ?? '',
                    'presentation'           => 'oral',
                    'schedule'               => $def['sched'],
                    'minimum_stock'          => 5,
                    'requires_prescription'  => true,
                    'is_active'              => true,
                    'notes'                  => 'Control especial INVIMA - nivel ' . $def['sched'],
                    'created_at'             => now(),
                    'updated_at'             => now(),
                ]);
                $ctrlDrugIds[$def['sku']] = $ctrlId;
            }
        }
        $this->info(count($productDefs) . ' products seeded with stock, kardex and batches.');

        // ── 5. Customers ───────────────────────────────────────────────────────
        DB::table('customers')->truncate();
        $custDefs = [
            ['name' => 'Maria Fernanda Ospina', 'document' => '52345678',   'document_type' => 'cc', 'phone' => '3101234567', 'email' => 'mfospina@gmail.com'],
            ['name' => 'Carlos Andres Rincon',  'document' => '79456123',   'document_type' => 'cc', 'phone' => '3209876543', 'email' => 'carincon@hotmail.com'],
            ['name' => 'Laura Sofia Herrera',   'document' => '1020456789', 'document_type' => 'cc', 'phone' => '3157654321', 'email' => 'lsherrera@gmail.com'],
            ['name' => 'Diego Mauricio Torres', 'document' => '80234567',   'document_type' => 'cc', 'phone' => '3012345678', 'email' => 'dmtorres@yahoo.com'],
            ['name' => 'Ana Lucia Vargas',      'document' => '43123456',   'document_type' => 'cc', 'phone' => '3187654321', 'email' => 'alvargas@gmail.com'],
        ];
        $custIds = [];
        foreach ($custDefs as $c) {
            $custIds[] = DB::table('customers')->insertGetId(array_merge($c, [
                'is_active' => true, 'created_at' => now(), 'updated_at' => now(),
            ]));
        }
        $this->info('5 customers seeded.');

        // ── 6. Prescriptions ──────────────────────────────────────────────────
        DB::table('prescriptions')->truncate();
        DB::table('prescription_items')->truncate();
        $rxDefs = [
            ['cust' => 0, 'doctor' => 'Dr. Ricardo Montoya',  'lic' => 'RM-12345', 'inst' => 'Clinica El Bosque', 'status' => 'dispensed', 'days' => 10, 'diag' => 'Infeccion respiratoria alta',    'items' => [['sku' => 'AMX-500-30', 'qty' => 1], ['sku' => 'OME-20-28', 'qty' => 1]]],
            ['cust' => 1, 'doctor' => 'Dra. Patricia Suarez', 'lic' => 'PS-67890', 'inst' => 'Hospital Santa Fe',  'status' => 'pending',   'days' => 3,  'diag' => 'Diabetes tipo 2',                'items' => [['sku' => 'MET-850-50', 'qty' => 2]]],
            ['cust' => 2, 'doctor' => 'Dr. Hernan Diaz',      'lic' => 'HD-54321', 'inst' => 'Clinica Marly',      'status' => 'pending',   'days' => 1,  'diag' => 'Hipertension + Dislipidemia',    'items' => [['sku' => 'LOS-50-30', 'qty' => 1], ['sku' => 'ATO-20-30', 'qty' => 1]]],
            ['cust' => 3, 'doctor' => 'Dr. Ricardo Montoya',  'lic' => 'RM-12345', 'inst' => 'Clinica El Bosque', 'status' => 'dispensed', 'days' => 20, 'diag' => 'Dolor cronico moderado',         'items' => [['sku' => 'TRA-50-20', 'qty' => 1]]],
        ];
        $rxIds = [];
        foreach ($rxDefs as $i => $rx) {
            $issuedAt  = now()->subDays($rx['days']);
            $expiresAt = now()->addDays(30 - $rx['days']);
            $rxId = DB::table('prescriptions')->insertGetId([
                'prescription_number'   => 'RX-' . str_pad($i + 1, 4, '0', STR_PAD_LEFT),
                'customer_id'           => $custIds[$rx['cust']],
                'patient_name'          => $custDefs[$rx['cust']]['name'],
                'patient_document'      => $custDefs[$rx['cust']]['document'],
                'patient_document_type' => $custDefs[$rx['cust']]['document_type'],
                'patient_phone'         => $custDefs[$rx['cust']]['phone'],
                'doctor_name'           => $rx['doctor'],
                'doctor_license'        => $rx['lic'],
                'institution'           => $rx['inst'],
                'issued_at'             => $issuedAt,
                'expires_at'            => $expiresAt,
                'diagnosis'             => $rx['diag'],
                'status'                => $rx['status'],
                'dispensed_by'          => $rx['status'] === 'dispensed' ? $userId : null,
                'dispensed_at'          => $rx['status'] === 'dispensed' ? now()->subDays(1) : null,
                'created_at'            => $issuedAt,
                'updated_at'            => now(),
            ]);
            $rxIds[$i] = $rxId;
            foreach ($rx['items'] as $item) {
                $pid = $prodIds[$item['sku']] ?? null;
                if (! $pid) continue;
                $prod = DB::table('products')->where('id', $pid)->first();
                DB::table('prescription_items')->insert([
                    'prescription_id'      => $rxId,
                    'product_id'           => $pid,
                    'drug_name'            => $prod->name,
                    'quantity'             => $item['qty'],
                    'quantity_dispensed'   => $rx['status'] === 'dispensed' ? $item['qty'] : 0,
                    'is_controlled'        => $prod->controlled_substance ?? false,
                    'status'               => $rx['status'] === 'dispensed' ? 'dispensed' : 'pending',
                    'created_at'           => now(),
                    'updated_at'           => now(),
                ]);
            }
        }
        $this->info('4 prescriptions seeded.');

        // ── 7. Drug dispensing log ─────────────────────────────────────────────
        DB::table('drug_dispensing_log')->truncate();
        // Get prescription item id for Tramadol RX
        $rxItemTra = DB::table('prescription_items')
            ->where('prescription_id', $rxIds[3] ?? 0)
            ->where('product_id', $prodIds['TRA-50-20'] ?? 0)
            ->value('id');
        if (isset($ctrlDrugIds['TRA-50-20']) && $rxItemTra) {
            DB::table('drug_dispensing_log')->insert([
                'controlled_drug_id'   => $ctrlDrugIds['TRA-50-20'],
                'prescription_id'      => $rxIds[3],
                'prescription_item_id' => $rxItemTra,
                'quantity'             => 1,
                'patient_name'         => $custDefs[3]['name'],
                'patient_document'     => $custDefs[3]['document'],
                'doctor_name'          => 'Dr. Ricardo Montoya',
                'doctor_license'       => 'RM-12345',
                'dispensed_by'         => $userId,
                'notes'                => 'Dispensacion controlada - identificacion verificada',
                'created_at'           => now()->subDays(5),
                'updated_at'           => now()->subDays(5),
            ]);
        }
        $this->info('Drug dispensing logs seeded.');

        // ── 8. Warehouse ──────────────────────────────────────────────────────
        DB::table('warehouses')->truncate();
        DB::table('warehouses')->insert([
            'name'       => 'Bodega Principal Farmacia',
            'address'    => 'Local 5 CC Colina, Bogota',
            'is_default' => true,
            'is_active'  => true,
            'type'       => 'warehouse',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        $this->info('Warehouse seeded.');

        // ── 9. Demo sales ─────────────────────────────────────────────────────
        DB::table('sales')->truncate();
        DB::table('sale_items')->truncate();
        DB::table('sale_payments')->truncate();
        $salesData = [
            ['cust' => 0, 'total' => 31000, 'items' => [['sku' => 'DOL-FORTE-24', 'qty' => 1, 'p' => 12500], ['sku' => 'IBU-400-20', 'qty' => 1, 'p' => 9800], ['sku' => 'LOR-10-10', 'qty' => 1, 'p' => 7500]], 'days' => 2],
            ['cust' => 1, 'total' => 89000, 'items' => [['sku' => 'CTR-60', 'qty' => 1, 'p' => 89000]], 'days' => 1],
            ['cust' => -1,'total' => 26200, 'items' => [['sku' => 'AGMK-20', 'qty' => 1, 'p' => 11200], ['sku' => 'ENO-150', 'qty' => 1, 'p' => 15000]], 'days' => 0],
            ['cust' => 2, 'total' => 72000, 'items' => [['sku' => 'EUC-LOC-500', 'qty' => 1, 'p' => 72000]], 'days' => 3],
            ['cust' => 4, 'total' => 37500, 'items' => [['sku' => 'PARA-GOT-30', 'qty' => 1, 'p' => 16500], ['sku' => 'CET-SOL-60', 'qty' => 1, 'p' => 21000]], 'days' => 0],
        ];
        $num = 1;
        foreach ($salesData as $s) {
            $custId = $s['cust'] >= 0 ? $custIds[$s['cust']] : null;
            $saleId = DB::table('sales')->insertGetId([
                'sale_number'    => 'FAR-' . str_pad($num++, 4, '0', STR_PAD_LEFT),
                'customer_id'    => $custId,
                'payment_method' => 'cash',
                'subtotal'       => $s['total'],
                'discount'       => 0,
                'tax'            => 0,
                'total'          => $s['total'],
                'amount_paid'    => $s['total'],
                'change_given'   => 0,
                'status'         => 'completed',
                'user_id'        => $userId,
                'created_at'     => now()->subDays($s['days']),
                'updated_at'     => now(),
            ]);
            foreach ($s['items'] as $it) {
                DB::table('sale_items')->insert([
                    'sale_id'      => $saleId,
                    'product_id'   => $prodIds[$it['sku']],
                    'product_name' => DB::table('products')->where('id', $prodIds[$it['sku']])->value('name'),
                    'quantity'     => $it['qty'],
                    'unit_price'   => $it['p'],
                    'discount'     => 0,
                    'tax_rate'     => 0,
                    'tax_amount'   => 0,
                    'subtotal'     => $it['p'] * $it['qty'],
                ]);
            }
            DB::table('sale_payments')->insert([
                'sale_id'        => $saleId,
                'customer_id'    => $custId,
                'amount'         => $s['total'],
                'payment_method' => 'cash',
                'received_by'    => $userId,
                'created_at'     => now()->subDays($s['days']),
                'updated_at'     => now(),
            ]);
        }
        $this->info('5 demo sales seeded.');

        // ── 10. Enable tenant modules ──────────────────────────────────────────
        $modules = ['pharmacy', 'pos', 'inventory', 'crm', 'reports', 'suppliers', 'purchases'];
        foreach ($modules as $mod) {
            DB::table('tenant_modules')->updateOrInsert(
                ['module_key' => $mod],
                ['status' => 'active', 'updated_at' => now(), 'created_at' => now()]
            );
        }
        $this->info('Modules activated: ' . implode(', ', $modules));

        // Restore central schema
        DB::statement('SET search_path TO public');

        $this->newLine();
        $this->line('========================================');
        $this->line('  FARMACIA ATLAS - DATOS DEMO LISTOS    ');
        $this->line('========================================');
        $this->newLine();
        $this->line('  URL       : http://localhost:3000/farmacia-atlas');
        $this->line('  Email     : admin@farmaciaatlas.com');
        $this->line('  Password  : Farmacia@2024!');
        $this->line('  Slug      : farmacia-atlas');
        $this->line('  Schema    : farmacia_atlas_axcys');
        $this->newLine();
        $this->line('  Productos : 20 (EPS, OTC, controlados, suplementos, dispositivos)');
        $this->line('  Clientes  : 5');
        $this->line('  Recetas   : 4 (2 activas, 2 dispensadas)');
        $this->line('  Controlados: 2 (Tramadol III, Clonazepam IV)');
        $this->line('  Ventas    : 5 de ejemplo');
        $this->newLine();

        return 0;
    }
}
