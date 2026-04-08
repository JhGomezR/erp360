<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Schema;

/**
 * La tabla payment_transactions colisiona con la tabla homónima del schema
 * de cada tenant (ecommerce). Se renombra a billing_transactions para que
 * las consultas desde el contexto tenant no la shadow-een.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::rename('payment_transactions', 'billing_transactions');
    }

    public function down(): void
    {
        Schema::rename('billing_transactions', 'payment_transactions');
    }
};
