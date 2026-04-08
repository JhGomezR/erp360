<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('supplier_contracts', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('supplier_id')->index();
            $table->string('contract_number', 60)->unique();
            $table->string('name', 160);
            $table->enum('type', [
                'supply',        // suministro general
                'formulary',     // formulario de medicamentos (farmacias)
                'maintenance',   // mantenimiento/taller
                'exclusive',     // distribución exclusiva
                'framework',     // marco/paraguas
                'other',
            ])->default('supply');
            $table->date('start_date');
            $table->date('end_date')->nullable();
            $table->boolean('auto_renew')->default(false);
            $table->integer('renewal_days_notice')->nullable(); // alert before expiry
            $table->decimal('total_value', 18, 2)->nullable();
            $table->string('currency', 3)->default('COP');
            $table->string('payment_terms', 120)->nullable(); // "Net 30", "Contado", etc.
            $table->text('scope')->nullable();       // descripción general del alcance
            $table->text('exclusions')->nullable();
            $table->enum('status', ['draft','active','suspended','expired','terminated'])->default('draft');
            $table->text('notes')->nullable();
            $table->timestamps();
            $table->softDeletes();
        });

        // Ítems/productos cubiertos por el contrato (e.g. lista de medicamentos del formulario)
        Schema::create('supplier_contract_items', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('supplier_contract_id')->index();
            $table->unsignedBigInteger('product_id')->nullable()->index(); // link a producto del catálogo
            $table->string('product_code', 80)->nullable();   // código externo del proveedor
            $table->string('product_name', 220);
            $table->string('unit', 40)->nullable();
            $table->decimal('agreed_price', 18, 2)->nullable();
            $table->decimal('max_quantity', 14, 4)->nullable(); // cantidad máxima pactada por período
            $table->boolean('is_covered')->default(true);     // false = excluido explícitamente
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->foreign('supplier_contract_id')
                  ->references('id')->on('supplier_contracts')
                  ->onDelete('cascade');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('supplier_contract_items');
        Schema::dropIfExists('supplier_contracts');
    }
};
