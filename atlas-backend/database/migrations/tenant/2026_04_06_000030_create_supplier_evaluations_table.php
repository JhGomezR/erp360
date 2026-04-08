<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('supplier_evaluations', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('supplier_id');
            $table->unsignedBigInteger('evaluated_by')->nullable();
            $table->date('evaluation_date');
            // Criteria (1-5 scale each)
            $table->decimal('score_quality',    3, 1)->default(0); // Calidad del producto/servicio
            $table->decimal('score_delivery',   3, 1)->default(0); // Cumplimiento en entregas
            $table->decimal('score_price',      3, 1)->default(0); // Competitividad de precios
            $table->decimal('score_service',    3, 1)->default(0); // Servicio postventa / atención
            $table->decimal('score_compliance', 3, 1)->default(0); // Cumplimiento legal / documentación
            $table->decimal('overall_score',    4, 2)->storedAs(
                '(score_quality + score_delivery + score_price + score_service + score_compliance) / 5.0'
            );
            $table->enum('homologation_status', ['pending', 'approved', 'conditional', 'rejected'])
                  ->default('pending');
            $table->text('comments')->nullable();
            $table->json('evidence_files')->nullable();
            $table->timestamps();

            $table->index('supplier_id');
        });

        // Add summary columns to suppliers table if not exists
        Schema::table('suppliers', function (Blueprint $table) {
            $table->decimal('average_score', 4, 2)->nullable()->after('status');
            $table->enum('homologation_status', ['pending', 'approved', 'conditional', 'rejected', 'not_evaluated'])
                  ->default('not_evaluated')->after('average_score');
            $table->date('last_evaluation_date')->nullable()->after('homologation_status');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('supplier_evaluations');
        Schema::table('suppliers', function (Blueprint $table) {
            $table->dropColumn(['average_score', 'homologation_status', 'last_evaluation_date']);
        });
    }
};
