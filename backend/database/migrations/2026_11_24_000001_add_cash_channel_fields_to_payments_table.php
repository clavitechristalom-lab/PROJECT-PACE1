<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('payments', function (Blueprint $table) {
            if (!Schema::hasColumn('payments', 'cash_channel')) {
                $table->enum('cash_channel', ['store', 'collector'])->nullable()->after('payment_type');
                $table->index(['cash_channel', 'status'], 'payments_cash_channel_status_idx');
            }
            if (!Schema::hasColumn('payments', 'collector_id')) {
                $table->unsignedBigInteger('collector_id')->nullable()->after('cash_channel');
                $table->index(['collector_id', 'status'], 'payments_collector_status_idx');
                $table->foreign('collector_id', 'payments_collector_id_fk')
                    ->references('user_id')
                    ->on('users')
                    ->nullOnDelete();
            }
            if (!Schema::hasColumn('payments', 'receipt_reference')) {
                $table->string('receipt_reference', 255)->nullable()->after('reference_no');
            }
            if (!Schema::hasColumn('payments', 'collector_confirmed_at')) {
                $table->timestamp('collector_confirmed_at')->nullable()->after('status');
            }
            if (!Schema::hasColumn('payments', 'confirmed_by')) {
                $table->unsignedBigInteger('confirmed_by')->nullable()->after('collector_confirmed_at');
                $table->foreign('confirmed_by', 'payments_confirmed_by_fk')
                    ->references('user_id')
                    ->on('users')
                    ->nullOnDelete();
            }
            if (!Schema::hasColumn('payments', 'confirmed_at')) {
                $table->timestamp('confirmed_at')->nullable()->after('confirmed_by');
            }
        });
    }

    public function down(): void
    {
        Schema::table('payments', function (Blueprint $table) {
            if (Schema::hasColumn('payments', 'confirmed_by')) {
                $table->dropForeign('payments_confirmed_by_fk');
            }
            if (Schema::hasColumn('payments', 'collector_id')) {
                $table->dropForeign('payments_collector_id_fk');
            }
            $columns = array_filter([
                Schema::hasColumn('payments', 'cash_channel') ? 'cash_channel' : null,
                Schema::hasColumn('payments', 'collector_id') ? 'collector_id' : null,
                Schema::hasColumn('payments', 'receipt_reference') ? 'receipt_reference' : null,
                Schema::hasColumn('payments', 'collector_confirmed_at') ? 'collector_confirmed_at' : null,
                Schema::hasColumn('payments', 'confirmed_by') ? 'confirmed_by' : null,
                Schema::hasColumn('payments', 'confirmed_at') ? 'confirmed_at' : null,
            ]);
            if (!empty($columns)) {
                $table->dropColumn($columns);
            }
        });
    }
};
