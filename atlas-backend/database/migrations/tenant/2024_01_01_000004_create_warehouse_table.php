<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('warehouses', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->text('address')->nullable();
            $table->boolean('is_default')->default(false);
            $table->boolean('is_active')->default(true);
            $table->timestamps();
            $table->softDeletes();
        });

        Schema::create('zones', function (Blueprint $table) {
            $table->id();
            $table->foreignId('warehouse_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->text('description')->nullable();
            $table->timestamps();
        });

        Schema::create('shelves', function (Blueprint $table) {
            $table->id();
            $table->foreignId('zone_id')->constrained()->cascadeOnDelete();
            $table->string('code');
            $table->text('description')->nullable();
            $table->timestamps();
        });

        Schema::create('shelf_levels', function (Blueprint $table) {
            $table->id();
            $table->foreignId('shelf_id')->constrained()->cascadeOnDelete();
            $table->integer('level');
            $table->text('description')->nullable();
            $table->timestamps();

            $table->unique(['shelf_id', 'level']);
        });

        Schema::create('pallets', function (Blueprint $table) {
            $table->id();
            $table->string('code')->unique();
            $table->foreignId('shelf_level_id')->nullable()->constrained()->nullOnDelete();
            $table->string('status')->default('available');   // available | in_use | maintenance
            $table->text('notes')->nullable();
            $table->timestamps();
        });

        Schema::create('pallet_products', function (Blueprint $table) {
            $table->id();
            $table->foreignId('pallet_id')->constrained()->cascadeOnDelete();
            $table->unsignedBigInteger('product_id');
            $table->decimal('quantity', 14, 4)->default(0);
            $table->string('lot_number')->nullable();
            $table->date('expiry_date')->nullable();
            $table->timestamps();

            $table->unique(['pallet_id', 'product_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('pallet_products');
        Schema::dropIfExists('pallets');
        Schema::dropIfExists('shelf_levels');
        Schema::dropIfExists('shelves');
        Schema::dropIfExists('zones');
        Schema::dropIfExists('warehouses');
    }
};
