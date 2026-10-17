<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        if (!Schema::hasTable('password_reset_otp')) {
            Schema::create('password_reset_otp', function (Blueprint $table) {
                $table->id();
                $table->string('email', 191)->index();
                $table->string('otp_code', 10)->index();
                $table->boolean('used')->default(false)->index();
                $table->dateTime('expiry_time')->index();
                $table->timestamps();
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('password_reset_otp');
    }
};
