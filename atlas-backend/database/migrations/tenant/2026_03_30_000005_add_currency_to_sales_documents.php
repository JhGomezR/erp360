<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        foreach (['sales', 'quotes', 'sales_orders'] as $tableName) {
            if (Schema::hasTable($tableName) && ! Schema::hasColumn($tableName, 'currency_code')) {
                Schema::table($tableName, function (Blueprint $table) {
                    $table->string('currency_code', 3)->default('COP')->after('total');
                    $table->decimal('exchange_rate', 16, 8)->default(1)->after('currency_code');
                });
            }
        }
    }

    public function down(): void
    {
        foreach (['sales', 'quotes', 'sales_orders'] as $tableName) {
            if (Schema::hasTable($tableName) && Schema::hasColumn($tableName, 'currency_code')) {
                Schema::table($tableName, function (Blueprint $table) {
                    $table->dropColumn(['currency_code', 'exchange_rate']);
                });
            }
        }
    }
};
