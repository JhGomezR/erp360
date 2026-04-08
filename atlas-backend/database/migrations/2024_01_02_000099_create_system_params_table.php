<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('system_params', function (Blueprint $table) {
            $table->id();
            $table->string('group', 50);          // payroll | media | notifications | accounting | general | hrm
            $table->string('key', 100)->unique();  // payroll.smlmv
            $table->text('value')->nullable();
            $table->enum('type', ['string', 'integer', 'decimal', 'boolean', 'json'])->default('string');
            $table->string('label');               // "Salario Mínimo Legal Vigente"
            $table->text('description')->nullable();
            $table->boolean('is_editable')->default(true); // algunos son solo lectura en UI
            $table->timestamps();

            $table->index('group');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('system_params');
    }
};
