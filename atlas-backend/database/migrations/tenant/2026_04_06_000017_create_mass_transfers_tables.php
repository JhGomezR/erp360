<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // ── Lote de transferencias masivas / remesas ───────────────────────────
        Schema::create('transfer_batches', function (Blueprint $table) {
            $table->id();
            $table->string('batch_ref', 40)->unique();  // TRF-XXXXXX
            $table->string('description', 200)->nullable();
            $table->string('type', 30)->default('payroll');
            // payroll | supplier | refund | other

            $table->string('bank_name', 100)->nullable();
            $table->string('debit_account', 60)->nullable();   // cuenta débito origen
            $table->date('scheduled_date');

            $table->string('status', 20)->default('draft');
            // draft → approved → sent → settled | failed

            $table->decimal('total_amount', 16, 2)->default(0);
            $table->integer('items_count')->default(0);
            $table->integer('items_sent')->default(0);
            $table->integer('items_failed')->default(0);

            $table->string('bank_file_format', 30)->nullable(); // bancolombia|davivienda|csv
            $table->string('bank_file_path', 500)->nullable();

            $table->text('notes')->nullable();
            $table->unsignedBigInteger('created_by')->nullable();
            $table->unsignedBigInteger('approved_by')->nullable();
            $table->timestamp('approved_at')->nullable();
            $table->timestamp('sent_at')->nullable();
            $table->timestamps();
            $table->softDeletes();
        });

        // ── Líneas individuales del lote ──────────────────────────────────────
        Schema::create('transfer_batch_items', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('transfer_batch_id');
            $table->string('beneficiary_name', 150);
            $table->string('beneficiary_document', 30)->nullable();
            $table->string('bank_name', 100)->nullable();
            $table->string('account_number', 60);
            $table->string('account_type', 20)->default('savings'); // savings | checking
            $table->decimal('amount', 14, 2);
            $table->string('concept', 200)->nullable();
            $table->string('reference', 80)->nullable();

            $table->string('status', 20)->default('pending');
            // pending | sent | settled | failed

            $table->string('error_message', 300)->nullable();
            $table->timestamps();

            $table->foreign('transfer_batch_id')
                  ->references('id')->on('transfer_batches')->onDelete('cascade');
            $table->index('transfer_batch_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('transfer_batch_items');
        Schema::dropIfExists('transfer_batches');
    }
};
