<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('installment_accounts')) {
            return;
        }

        Schema::table('installment_accounts', function (Blueprint $table) {
            if (!Schema::hasColumn('installment_accounts', 'remaining_balance')) {
                $table->decimal('remaining_balance', 12, 2)->nullable()->after('total_payable');
            }
            if (!Schema::hasColumn('installment_accounts', 'completed_at')) {
                $table->timestamp('completed_at')->nullable()->after('status');
            }
            if (!Schema::hasColumn('installment_accounts', 'next_due_date')) {
                $table->date('next_due_date')->nullable()->after('completed_at');
            }
            if (!Schema::hasColumn('installment_accounts', 'customer_standing')) {
                $table->string('customer_standing', 64)->nullable()->after('next_due_date');
            }
            if (!Schema::hasColumn('installment_accounts', 'agent_contribution_status')) {
                $table->string('agent_contribution_status', 32)->nullable()->after('total_agent_contribution');
            }
            if (!Schema::hasColumn('installment_accounts', 'completed_verified_by')) {
                $table->unsignedBigInteger('completed_verified_by')->nullable()->after('customer_standing');
            }
        });

        DB::table('installment_accounts')
            ->whereIn('status', ['Completed', 'Complete Payment', 'Fully Paid'])
            ->update([
                'status' => 'Fully Paid',
                'remaining_balance' => 0.00,
                'next_due_date' => null,
                'completed_at' => DB::raw('COALESCE(completed_at, updated_at, NOW())'),
                'customer_standing' => 'Cleared / Good Standing',
                'agent_contribution_status' => DB::raw("CASE WHEN has_agent = 1 THEN 'Settled' ELSE agent_contribution_status END"),
            ]);
    }

    public function down(): void
    {
        if (!Schema::hasTable('installment_accounts')) {
            return;
        }

        Schema::table('installment_accounts', function (Blueprint $table) {
            $dropCols = array_filter([
                Schema::hasColumn('installment_accounts', 'remaining_balance') ? 'remaining_balance' : null,
                Schema::hasColumn('installment_accounts', 'completed_at') ? 'completed_at' : null,
                Schema::hasColumn('installment_accounts', 'next_due_date') ? 'next_due_date' : null,
                Schema::hasColumn('installment_accounts', 'customer_standing') ? 'customer_standing' : null,
                Schema::hasColumn('installment_accounts', 'agent_contribution_status') ? 'agent_contribution_status' : null,
                Schema::hasColumn('installment_accounts', 'completed_verified_by') ? 'completed_verified_by' : null,
            ]);
            if (!empty($dropCols)) {
                $table->dropColumn($dropCols);
            }
        });
    }
};
