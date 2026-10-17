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
        if (Schema::hasTable('e_wallet_deposits')) {
            Schema::table('e_wallet_deposits', function (Blueprint $table) {
                if (!Schema::hasColumn('e_wallet_deposits', 'customer_reference')) {
                    $table->string('customer_reference')->nullable()->after('transaction_reference');
                }
                if (!Schema::hasColumn('e_wallet_deposits', 'proof_of_payment')) {
                    $table->string('proof_of_payment')->nullable()->after('paid_at');
                }
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (Schema::hasTable('e_wallet_deposits')) {
            Schema::table('e_wallet_deposits', function (Blueprint $table) {
                if (Schema::hasColumn('e_wallet_deposits', 'customer_reference')) {
                    $table->dropColumn('customer_reference');
                }
                if (Schema::hasColumn('e_wallet_deposits', 'proof_of_payment')) {
                    $table->dropColumn('proof_of_payment');
                }
            });
        }
    }
};
