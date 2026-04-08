<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Documentos de Nómina Electrónica DIAN por empleado y período
        Schema::create('payroll_electronic_docs', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('payroll_period_id');
            $table->unsignedBigInteger('payroll_item_id');
            $table->unsignedBigInteger('employee_id');

            // Identificadores DIAN
            $table->string('cune', 200)->nullable();         // código único de NE
            $table->string('consecutivo', 30)->nullable();   // consecutivo del documento
            $table->string('tipo_nota', 10)->default('NI');  // NI=NominaIndividual, NA=Ajuste
            $table->string('prefix', 10)->nullable();
            $table->string('numero', 30)->nullable();

            // Estado
            $table->string('status', 30)->default('draft');
            // draft | generated | sent | accepted | rejected

            $table->text('xml_content')->nullable();         // XML generado (UBL 2.1)
            $table->string('dian_response_code', 20)->nullable();
            $table->text('dian_response_message')->nullable();
            $table->timestamp('sent_at')->nullable();
            $table->timestamp('accepted_at')->nullable();

            // Resumen del documento
            $table->decimal('devengados_total', 14, 2)->default(0);
            $table->decimal('deducciones_total', 14, 2)->default(0);
            $table->decimal('total_comprobante', 14, 2)->default(0);

            $table->timestamps();

            $table->index(['payroll_period_id', 'status']);
            $table->unique(['payroll_period_id', 'employee_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('payroll_electronic_docs');
    }
};
