<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('google_id')->nullable()->unique()->after('email');
            $table->string('avatar_url')->nullable()->after('google_id');
            $table->boolean('onboarding_pending')->default(false)->after('avatar_url');
            $table->string('onboarding_token', 64)->nullable()->unique()->after('onboarding_pending');
            $table->timestamp('onboarding_token_expires_at')->nullable()->after('onboarding_token');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn(['google_id', 'avatar_url', 'onboarding_pending', 'onboarding_token', 'onboarding_token_expires_at']);
        });
    }
};
