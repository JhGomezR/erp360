<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->boolean('auto_reorder')->default(false)->after('reorder_point');
            $table->integer('reorder_qty')->nullable()->after('auto_reorder');
            $table->unsignedBigInteger('preferred_supplier_id')->nullable()->after('reorder_qty');
        });
    }

    public function down(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->dropColumn(['auto_reorder', 'reorder_qty', 'preferred_supplier_id']);
        });
    }
};
