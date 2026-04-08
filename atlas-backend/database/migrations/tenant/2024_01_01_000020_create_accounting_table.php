<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // ─── Plan de cuentas (PUC Colombia) ──────────────────────────────────
        Schema::create('chart_of_accounts', function (Blueprint $table) {
            $table->id();
            $table->string('code', 20)->unique();         // 1105, 41, 4135...
            $table->string('name');
            $table->enum('type', [
                'asset',       // Activo
                'liability',   // Pasivo
                'equity',      // Patrimonio
                'revenue',     // Ingreso
                'expense',     // Gasto
                'cost',        // Costo
            ]);
            $table->enum('nature', ['debit', 'credit']);  // naturaleza normal
            $table->unsignedBigInteger('parent_id')->nullable();
            $table->tinyInteger('level');                 // 1=clase, 2=grupo, 3=cuenta, 4=subcuenta
            $table->boolean('is_active')->default(true);
            $table->boolean('accepts_entries')->default(false); // solo cuentas de nivel 3-4
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->index(['parent_id', 'code']);
            $table->index('type');
        });

        // ─── Asientos contables (Journal Entries) ────────────────────────────
        Schema::create('journal_entries', function (Blueprint $table) {
            $table->id();
            $table->string('entry_number')->unique();     // JE-000001
            $table->date('entry_date');
            $table->string('description');
            $table->enum('status', ['draft', 'posted', 'voided'])->default('draft');
            $table->enum('source', [
                'manual',
                'sale',
                'sale_return',
                'purchase',
                'purchase_return',
                'payment',
                'adjustment',
            ])->default('manual');
            $table->unsignedBigInteger('source_id')->nullable();  // FK a la venta/compra/etc.
            $table->unsignedBigInteger('created_by');
            $table->unsignedBigInteger('posted_by')->nullable();
            $table->timestamp('posted_at')->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->index(['entry_date', 'status']);
            $table->index(['source', 'source_id']);
        });

        // ─── Líneas del asiento (debe / haber) ───────────────────────────────
        Schema::create('journal_entry_lines', function (Blueprint $table) {
            $table->id();
            $table->foreignId('journal_entry_id')
                  ->constrained('journal_entries')
                  ->cascadeOnDelete();
            $table->unsignedBigInteger('account_id');    // FK a chart_of_accounts
            $table->string('account_code', 20);          // snapshot del código
            $table->string('account_name');              // snapshot del nombre
            $table->decimal('debit', 16, 2)->default(0);
            $table->decimal('credit', 16, 2)->default(0);
            $table->string('description')->nullable();
            $table->timestamps();

            $table->index(['journal_entry_id', 'account_id']);
        });

        // ─── Configuración DIAN (por tenant) ─────────────────────────────────
        Schema::create('dian_config', function (Blueprint $table) {
            $table->id();
            $table->string('nit', 20);                        // NIT sin dígito verificación
            $table->string('nit_dv', 2)->nullable();          // dígito verificación
            $table->string('razon_social');
            $table->string('tipo_persona')->default('juridica'); // natural|juridica
            $table->string('regimen')->default('comun');       // comun|simplificado
            $table->string('actividad_economica', 10)->nullable(); // CIIU
            $table->string('responsabilidades_fiscales')->nullable(); // O-13;O-15...
            $table->string('direccion')->nullable();
            $table->string('ciudad')->nullable();
            $table->string('departamento')->nullable();
            $table->string('pais')->default('Colombia');
            $table->string('telefono')->nullable();
            $table->string('email_dian')->nullable();          // para notificaciones DIAN
            // Ambiente DIAN
            $table->enum('ambiente', ['habilitacion', 'produccion'])->default('habilitacion');
            $table->string('soft_id')->nullable();             // ID del software habilitado
            $table->string('soft_pin')->nullable();            // PIN de habilitación
            $table->text('cert_path')->nullable();             // ruta al .p12
            $table->string('cert_password')->nullable();       // contraseña del certificado
            // Numeración
            $table->string('resolucion_number')->nullable();   // resolución DIAN
            $table->date('resolucion_from')->nullable();
            $table->date('resolucion_to')->nullable();
            $table->bigInteger('consecutive_from')->nullable();
            $table->bigInteger('consecutive_to')->nullable();
            $table->bigInteger('consecutive_current')->default(0);
            $table->string('prefix')->nullable();              // SETP, FV, etc.
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('dian_config');
        Schema::dropIfExists('journal_entry_lines');
        Schema::dropIfExists('journal_entries');
        Schema::dropIfExists('chart_of_accounts');
    }
};
