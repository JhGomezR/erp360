<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('collection_reminder_logs', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('customer_id')->nullable();
            $table->string('customer_name', 200);
            $table->string('customer_email', 200)->nullable();
            $table->integer('invoice_count')->default(1);
            $table->decimal('total_balance', 14, 2)->default(0);
            $table->timestamp('sent_at');
            $table->string('channel', 30)->default('email'); // email|sms|whatsapp
            $table->string('status', 30)->default('sent');   // sent|failed|opened|responded
            $table->timestamps();
            $table->index(['customer_id', 'sent_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('collection_reminder_logs');
    }
};
