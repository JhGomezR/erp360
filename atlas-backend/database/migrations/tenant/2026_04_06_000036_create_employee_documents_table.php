<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('employee_documents', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('employee_id');
            $table->enum('category', [
                'contract',       // Contratos laborales
                'id_document',    // Cédula / pasaporte
                'diploma',        // Títulos / diplomas
                'certificate',    // Certificados de competencia
                'medical',        // Exámenes médicos
                'disciplinary',   // Llamados de atención / sanciones
                'social_security',// Afiliaciones ARL, EPS, AFP
                'other',          // Otros
            ])->default('other');
            $table->string('title', 200);              // Nombre descriptivo
            $table->text('file_data');                  // base64 del archivo
            $table->string('mime_type', 80)->default('application/pdf');
            $table->unsignedInteger('file_size_kb')->default(0);
            $table->string('file_name', 200)->nullable();
            $table->integer('version')->default(1);     // número de versión
            $table->unsignedBigInteger('previous_version_id')->nullable(); // enlace a versión anterior
            $table->date('issue_date')->nullable();     // fecha del documento
            $table->date('expiry_date')->nullable();    // vencimiento (alertas)
            $table->enum('status', ['active', 'expired', 'replaced', 'archived'])->default('active');
            $table->text('notes')->nullable();
            $table->unsignedBigInteger('uploaded_by')->nullable();
            $table->timestamps();

            $table->index(['employee_id', 'category']);
            $table->index(['expiry_date', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('employee_documents');
    }
};
