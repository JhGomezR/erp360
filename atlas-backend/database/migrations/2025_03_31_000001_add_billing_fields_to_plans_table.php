<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('plans', function (Blueprint $table) {
            $table->unsignedBigInteger('price_annual')->default(0)->after('price');
            $table->tinyInteger('annual_discount_pct')->default(0)->after('price_annual');
            $table->smallInteger('sort_order')->default(0)->after('annual_discount_pct');
            $table->string('color', 30)->default('slate')->after('sort_order');
            $table->string('badge_text', 60)->nullable()->after('color');
            $table->jsonb('features')->default('[]')->after('badge_text');
        });
    }

    public function down(): void
    {
        Schema::table('plans', function (Blueprint $table) {
            $table->dropColumn(['price_annual', 'annual_discount_pct', 'sort_order', 'color', 'badge_text', 'features']);
        });
    }
};
