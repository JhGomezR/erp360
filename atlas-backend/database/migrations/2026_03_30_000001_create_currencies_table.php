<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('currencies', function (Blueprint $table) {
            $table->string('code', 3)->primary(); // ISO 4217: COP, USD, EUR
            $table->string('name', 60);
            $table->string('symbol', 5);
            $table->unsignedTinyInteger('decimal_places')->default(2);
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Schema::create('exchange_rates', function (Blueprint $table) {
            $table->id();
            $table->string('base_code', 3);    // from currency
            $table->string('target_code', 3);  // to currency
            $table->decimal('rate', 16, 8);    // 1 base = rate target
            $table->date('effective_date');
            $table->string('source', 50)->default('manual');
            $table->timestamps();
            $table->unique(['base_code', 'target_code', 'effective_date']);
        });

        // Seed base currencies
        DB::table('currencies')->insert([
            ['code' => 'COP', 'name' => 'Peso Colombiano',  'symbol' => '$',   'decimal_places' => 0, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()],
            ['code' => 'USD', 'name' => 'Dólar Americano',  'symbol' => 'US$', 'decimal_places' => 2, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()],
            ['code' => 'EUR', 'name' => 'Euro',              'symbol' => '€',   'decimal_places' => 2, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()],
        ]);
    }

    public function down(): void
    {
        Schema::dropIfExists('exchange_rates');
        Schema::dropIfExists('currencies');
    }
};
