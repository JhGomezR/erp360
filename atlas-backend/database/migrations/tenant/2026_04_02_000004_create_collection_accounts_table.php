<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Entidades pagadoras (EPS, aseguradoras, fondos de empleados, etc.)
        Schema::create('collection_account_entities', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->enum('type', ['eps', 'insurance', 'fund', 'other'])->default('other');
            $table->string('nit', 30)->nullable();
            $table->string('contact_name', 120)->nullable();
            $table->string('contact_email', 150)->nullable();
            $table->string('contact_phone', 30)->nullable();
            $table->string('address', 255)->nullable();
            $table->boolean('is_active')->default(true);
            $table->text('notes')->nullable();
            $table->timestamps();
        });

        // Cuentas de cobro emitidas
        Schema::create('collection_accounts', function (Blueprint $table) {
            $table->id();
            $table->string('account_number', 30)->unique();       // COB-000001
            $table->unsignedBigInteger('entity_id');
            $table->date('period_from');
            $table->date('period_to');
            $table->date('due_date');
            $table->enum('status', ['draft', 'sent', 'paid', 'overdue', 'cancelled'])->default('draft');
            $table->decimal('subtotal', 14, 2)->default(0);
            $table->decimal('tax', 14, 2)->default(0);
            $table->decimal('total', 14, 2)->default(0);
            $table->decimal('amount_paid', 14, 2)->default(0);
            $table->date('paid_at')->nullable();
            $table->text('concept');                               // descripción de los servicios
            $table->text('notes')->nullable();
            $table->unsignedBigInteger('user_id')->nullable();
            $table->timestamps();

            $table->index('entity_id');
            $table->index('status');
            $table->index('due_date');
        });

        // Ítems de la cuenta de cobro (servicios/productos facturados)
        Schema::create('collection_account_items', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('account_id');
            $table->string('description', 255);
            $table->decimal('quantity', 12, 3)->default(1);
            $table->string('unit', 30)->nullable();
            $table->decimal('unit_price', 14, 2);
            $table->decimal('tax_rate', 5, 2)->default(0);
            $table->decimal('tax_amount', 14, 2)->default(0);
            $table->decimal('subtotal', 14, 2);
            $table->timestamps();

            $table->foreign('account_id')->references('id')->on('collection_accounts')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('collection_account_items');
        Schema::dropIfExists('collection_accounts');
        Schema::dropIfExists('collection_account_entities');
    }
};
