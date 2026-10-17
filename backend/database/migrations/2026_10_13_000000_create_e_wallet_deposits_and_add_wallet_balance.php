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
        if (!Schema::hasColumn('customers', 'wallet_balance')) {
            Schema::table('customers', function (Blueprint $table) {
                $table->decimal('wallet_balance', 12, 2)->default(0.00)->after('status');
            });
        }

        if (!Schema::hasTable('e_wallet_deposits')) {
            Schema::create('e_wallet_deposits', function (Blueprint $table) {
                $table->id('deposit_id');
                $table->string('transaction_reference')->unique();
                $table->unsignedBigInteger('customer_id')->nullable();
                $table->unsignedBigInteger('user_id')->nullable();
                $table->unsignedBigInteger('installment_id')->nullable();
                $table->unsignedBigInteger('schedule_id')->nullable();
                $table->string('payment_method')->default('GCash'); // GCash, Maya, etc.
                $table->string('payment_type')->default('deposit'); // deposit, installment_payment
                $table->decimal('amount', 12, 2);
                $table->decimal('fee', 12, 2)->default(0.00);
                $table->string('currency', 10)->default('PHP');
                $table->string('status', 30)->default('pending'); // pending, paid, failed, expired
                $table->text('checkout_url')->nullable();
                $table->string('checkout_session_id')->nullable();
                $table->text('qr_code_data')->nullable();
                $table->timestamp('paid_at')->nullable();
                $table->json('gateway_response')->nullable();
                $table->json('webhook_payload')->nullable();
                $table->unsignedBigInteger('payment_id')->nullable();
                $table->timestamps();

                $table->index(['customer_id', 'status']);
                $table->index('transaction_reference');
                $table->index('status');
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('e_wallet_deposits');
        if (Schema::hasColumn('customers', 'wallet_balance')) {
            Schema::table('customers', function (Blueprint $table) {
                $table->dropColumn('wallet_balance');
            });
        }
    }
};
