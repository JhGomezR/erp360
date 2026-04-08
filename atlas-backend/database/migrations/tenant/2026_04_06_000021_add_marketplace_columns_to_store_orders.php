<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('store_orders', function (Blueprint $table) {
            $table->string('external_ref', 100)->nullable()->after('order_number');
            $table->string('source', 30)->default('store')->after('external_ref');
            // store | shopify | woocommerce | mercadolibre | vtex | manual

            $table->index('external_ref');
            $table->index('source');
        });
    }

    public function down(): void
    {
        Schema::table('store_orders', function (Blueprint $table) {
            $table->dropColumn(['external_ref', 'source']);
        });
    }
};
