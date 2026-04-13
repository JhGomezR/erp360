<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('legal_documents', function (Blueprint $table) {
            $table->id();

            // Tipo de documento — whitelist controlada en la capa de aplicación
            $table->string('type', 30);           // terms | privacy | refund | cookies | contract

            $table->string('title', 255);
            $table->longText('content');          // Markdown; el frontend renderiza con rehype-sanitize
            $table->string('version', 20);        // Ej: "1.0.0" o "2026-04"
            $table->string('language', 5)->default('es'); // ISO 639-1

            // Estado del documento
            $table->string('status', 20)->default('draft'); // draft | published
            $table->timestamp('effective_date')->nullable(); // cuándo entra en vigor
            $table->timestamp('published_at')->nullable();   // cuándo se publicó

            // Auditoría
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();

            $table->timestamps();
            $table->softDeletes();

            // Índice compuesto para la consulta pública más frecuente:
            // "dame el documento publicado de tipo X en idioma Y"
            $table->index(['type', 'language', 'status'], 'legal_type_lang_status_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('legal_documents');
    }
};
