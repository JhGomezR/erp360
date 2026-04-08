<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Actualiza el add-on de Facturación Electrónica:
 * - module_key: 'e_billing' → 'fe_dian' (coincide con AddonRequiredMiddleware)
 * - Ajusta nombre y precio si fue sembrado con el seeder anterior
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::table('addons')
            ->where('slug', 'facturacion-electronica')
            ->update([
                'name'        => 'Facturación Electrónica DIAN',
                'module_key'  => 'fe_dian',
                'description' => 'Emite facturas electrónicas, notas crédito/débito y documentos soporte ante la DIAN (FE-V2 UBL 2.1). Requiere certificado digital.',
                'price'       => 25000,
                'updated_at'  => now(),
            ]);
    }

    public function down(): void
    {
        DB::table('addons')
            ->where('slug', 'facturacion-electronica')
            ->update([
                'name'       => 'Facturación Electrónica',
                'module_key' => 'e_billing',
                'price'      => 15000,
                'updated_at' => now(),
            ]);
    }
};
