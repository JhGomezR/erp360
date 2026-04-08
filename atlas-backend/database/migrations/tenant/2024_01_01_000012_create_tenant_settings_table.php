<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('tenant_settings', function (Blueprint $table) {
            $table->id();
            $table->string('group')->default('general'); // general | fiscal | pos | branding | notifications
            $table->string('key')->unique();
            $table->text('value')->nullable();
            // type para que el frontend sepa cómo renderizar el campo
            $table->string('type')->default('string'); // string | boolean | integer | json | color | select
            $table->text('options')->nullable();        // JSON: opciones para tipo 'select'
            $table->boolean('is_public')->default(false); // si puede leerse sin auth
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('tenant_settings');
    }
};
