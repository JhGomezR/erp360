<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('customer_segments', function (Blueprint $table) {
            $table->id();
            $table->string('name', 120);
            $table->text('description')->nullable();
            $table->enum('type', ['manual', 'dynamic'])->default('manual');
            $table->string('color', 20)->default('#6366f1'); // hex color for UI
            $table->json('criteria')->nullable();            // dynamic filter rules
            $table->unsignedInteger('customer_count')->default(0); // cached
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Schema::create('customer_segment_members', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('segment_id');
            $table->unsignedBigInteger('customer_id');
            $table->timestamp('added_at')->useCurrent();
            $table->unique(['segment_id', 'customer_id']);
            $table->index('segment_id');
            $table->index('customer_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('customer_segment_members');
        Schema::dropIfExists('customer_segments');
    }
};
