<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('purchase_requisitions', function (Blueprint $table) {
            $table->id();
            $table->string('requisition_number', 30)->unique();
            $table->string('title', 200);
            $table->text('description')->nullable();
            $table->unsignedBigInteger('requested_by');
            $table->unsignedBigInteger('approved_by')->nullable();
            $table->unsignedBigInteger('purchase_order_id')->nullable();     // linked OC once converted
            $table->string('department', 100)->nullable();
            $table->string('priority', 20)->default('normal');               // low | normal | high | urgent
            $table->string('status', 30)->default('draft');                  // draft | pending_approval | approved | rejected | converted | cancelled
            $table->date('needed_by')->nullable();
            $table->text('rejection_reason')->nullable();
            $table->text('notes')->nullable();
            $table->decimal('estimated_total', 14, 2)->default(0);
            $table->timestamps();
            $table->softDeletes();

            $table->index(['status', 'requested_by']);
            $table->index('created_at');
        });

        Schema::create('purchase_requisition_items', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('purchase_requisition_id');
            $table->unsignedBigInteger('product_id')->nullable();
            $table->string('product_name', 200);
            $table->string('product_sku', 100)->nullable();
            $table->decimal('quantity', 12, 4);
            $table->string('unit', 50)->nullable();
            $table->decimal('estimated_unit_cost', 14, 2)->default(0);
            $table->decimal('estimated_subtotal', 14, 2)->default(0);
            $table->text('notes')->nullable();
            $table->string('supplier_suggestion', 200)->nullable();
            $table->timestamps();

            $table->foreign('purchase_requisition_id')
                  ->references('id')->on('purchase_requisitions')
                  ->onDelete('cascade');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('purchase_requisition_items');
        Schema::dropIfExists('purchase_requisitions');
    }
};
