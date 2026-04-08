<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Registra el add-on "Fraccionamiento de productos" en el catálogo central.
 *
 * Este add-on permite a los tenants dividir un producto comprado en bulto
 * (ej: panal de huevos, caja de medicamentos) en fracciones vendibles
 * individualmente con su propio código de barras y precio.
 *
 * Precio sugerido: configurable desde atlas-mandragora/addons.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::table('addons')->updateOrInsert(
            ['slug' => 'fractions'],
            [
                'name'        => 'Fraccionamiento de productos',
                'slug'        => 'fractions',
                'description' => 'Divide productos comprados en bulto (cajas, panales, paquetes) en fracciones vendibles individualmente. Cada fracción tiene su propio nombre, código de barras y precio, y aparece de forma transparente en el POS sin configuración adicional del cajero.',
                'module_key'  => 'fractions',
                'price'       => 0,      // El administrador define el precio real desde el panel central
                'is_active'   => true,
                'created_at'  => now(),
                'updated_at'  => now(),
            ]
        );
    }

    public function down(): void
    {
        DB::table('addons')->where('slug', 'fractions')->delete();
    }
};
