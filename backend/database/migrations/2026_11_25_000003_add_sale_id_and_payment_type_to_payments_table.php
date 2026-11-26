<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('payments', function (Blueprint $table) {
            if (!Schema::hasColumn('payments', 'sale_id')) {
                $table->unsignedBigInteger('sale_id')->nullable()->after('installment_id');
                $table->foreign('sale_id')
                    ->references('sale_id')
                    ->on('sale_transactions')
                    ->nullOnDelete();
            }
            if (!Schema::hasColumn('payments', 'payment_type')) {
                $table->string('payment_type', 32)->default('installment')->after('payment_method');
            }
        });
    }

    public function down(): void
    {
        Schema::table('payments', function (Blueprint $table) {
            if (Schema::hasColumn('payments', 'sale_id')) {
                $table->dropForeign(['sale_id']);
                $table->dropColumn('sale_id');
            }
            if (Schema::hasColumn('payments', 'payment_type')) {
                $table->dropColumn('payment_type');
            }
        });
    }
};
