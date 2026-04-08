<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // ── Cuentas bancarias ─────────────────────────────────────────────────
        Schema::create('bank_accounts', function (Blueprint $table) {
            $table->id();
            $table->string('name', 150);                              // "Cuenta Corriente Bancolombia"
            $table->string('bank_name', 100);                        // "Bancolombia"
            $table->string('account_number', 50);                    // últimos dígitos o número completo
            $table->string('account_type', 30)->default('checking'); // checking | savings | credit
            $table->string('currency', 3)->default('COP');
            $table->decimal('current_balance', 15, 2)->default(0);
            $table->boolean('is_active')->default(true);
            $table->text('notes')->nullable();
            $table->timestamps();
            $table->softDeletes();
        });

        // ── Extractos bancarios (importados del banco) ────────────────────────
        Schema::create('bank_statements', function (Blueprint $table) {
            $table->id();
            $table->foreignId('bank_account_id')->constrained('bank_accounts');
            $table->string('reference', 100)->nullable();             // número de extracto
            $table->date('period_from');
            $table->date('period_to');
            $table->decimal('opening_balance', 15, 2)->default(0);
            $table->decimal('closing_balance', 15, 2)->default(0);
            $table->string('status', 20)->default('pending');        // pending | reconciled
            $table->unsignedBigInteger('created_by')->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->index(['bank_account_id', 'period_from']);
        });

        // ── Líneas del extracto (movimientos bancarios) ───────────────────────
        Schema::create('bank_statement_lines', function (Blueprint $table) {
            $table->id();
            $table->foreignId('bank_statement_id')->constrained('bank_statements')->cascadeOnDelete();
            $table->date('transaction_date');
            $table->string('description', 500);
            $table->string('reference', 100)->nullable();             // número cheque, referencia pago
            $table->decimal('amount', 15, 2);                        // positivo=crédito/ingreso, negativo=débito/egreso
            $table->string('type', 20)->default('credit');           // credit | debit
            $table->string('reconcile_status', 20)->default('unmatched'); // unmatched | matched | ignored
            $table->timestamps();

            $table->index(['bank_statement_id', 'reconcile_status']);
            $table->index('transaction_date');
        });

        // ── Conciliaciones ────────────────────────────────────────────────────
        Schema::create('bank_reconciliations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('bank_statement_id')->constrained('bank_statements');
            $table->string('status', 20)->default('in_progress');    // in_progress | completed
            $table->decimal('book_balance', 15, 2)->default(0);      // saldo libros al cierre
            $table->decimal('bank_balance', 15, 2)->default(0);      // saldo extracto
            $table->decimal('difference', 15, 2)->default(0);        // debe ser 0 al completar
            $table->text('notes')->nullable();
            $table->unsignedBigInteger('completed_by')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->unsignedBigInteger('created_by')->nullable();
            $table->timestamps();
        });

        // ── Cruce de movimientos (línea extracto ↔ movimiento contable) ───────
        Schema::create('bank_reconciliation_matches', function (Blueprint $table) {
            $table->id();
            $table->foreignId('reconciliation_id')->constrained('bank_reconciliations')->cascadeOnDelete();
            $table->foreignId('statement_line_id')->constrained('bank_statement_lines');
            $table->string('source_type', 50)->nullable();   // sale | purchase | expense | cash_movement | manual
            $table->unsignedBigInteger('source_id')->nullable();
            $table->string('source_description', 500)->nullable();
            $table->decimal('matched_amount', 15, 2);
            $table->string('match_type', 20)->default('manual'); // auto | manual
            $table->timestamps();

            $table->index(['reconciliation_id', 'statement_line_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('bank_reconciliation_matches');
        Schema::dropIfExists('bank_reconciliations');
        Schema::dropIfExists('bank_statement_lines');
        Schema::dropIfExists('bank_statements');
        Schema::dropIfExists('bank_accounts');
    }
};
