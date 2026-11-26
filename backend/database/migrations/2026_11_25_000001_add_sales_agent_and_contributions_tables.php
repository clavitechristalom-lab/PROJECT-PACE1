<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('sale_transactions', function (Blueprint $table) {
            if (!Schema::hasColumn('sale_transactions', 'has_agent')) {
                $table->boolean('has_agent')->default(false)->after('processed_by');
            }
            if (!Schema::hasColumn('sale_transactions', 'agent_id')) {
                $table->unsignedBigInteger('agent_id')->nullable()->after('has_agent');
                $table->foreign('agent_id')
                    ->references('employee_id')
                    ->on('employees')
                    ->nullOnDelete();
            }
            if (!Schema::hasColumn('sale_transactions', 'appliances_agent_contribution')) {
                $table->decimal('appliances_agent_contribution', 12, 2)->default(0)->after('agent_id');
            }
            if (!Schema::hasColumn('sale_transactions', 'furniture_agent_contribution')) {
                $table->decimal('furniture_agent_contribution', 12, 2)->default(0)->after('appliances_agent_contribution');
            }
            if (!Schema::hasColumn('sale_transactions', 'total_agent_contribution')) {
                $table->decimal('total_agent_contribution', 12, 2)->default(0)->after('furniture_agent_contribution');
            }
        });

        Schema::table('sale_items', function (Blueprint $table) {
            if (!Schema::hasColumn('sale_items', 'category_domain')) {
                $table->string('category_domain', 32)->nullable()->after('line_total');
            }
            if (!Schema::hasColumn('sale_items', 'agent_commission_rate')) {
                $table->decimal('agent_commission_rate', 5, 2)->default(0)->after('category_domain');
            }
            if (!Schema::hasColumn('sale_items', 'agent_contribution')) {
                $table->decimal('agent_contribution', 12, 2)->default(0)->after('agent_commission_rate');
            }
        });

        Schema::table('installment_accounts', function (Blueprint $table) {
            if (!Schema::hasColumn('installment_accounts', 'has_agent')) {
                $table->boolean('has_agent')->default(false)->after('sale_id');
            }
            if (!Schema::hasColumn('installment_accounts', 'agent_id')) {
                $table->unsignedBigInteger('agent_id')->nullable()->after('has_agent');
                $table->foreign('agent_id')
                    ->references('employee_id')
                    ->on('employees')
                    ->nullOnDelete();
            }
            if (!Schema::hasColumn('installment_accounts', 'appliances_agent_contribution')) {
                $table->decimal('appliances_agent_contribution', 12, 2)->default(0)->after('agent_id');
            }
            if (!Schema::hasColumn('installment_accounts', 'furniture_agent_contribution')) {
                $table->decimal('furniture_agent_contribution', 12, 2)->default(0)->after('appliances_agent_contribution');
            }
            if (!Schema::hasColumn('installment_accounts', 'total_agent_contribution')) {
                $table->decimal('total_agent_contribution', 12, 2)->default(0)->after('furniture_agent_contribution');
            }
        });
    }

    public function down(): void
    {
        Schema::table('installment_accounts', function (Blueprint $table) {
            if (Schema::hasColumn('installment_accounts', 'agent_id')) {
                $table->dropForeign(['agent_id']);
            }
            $cols = array_filter([
                'has_agent',
                'agent_id',
                'appliances_agent_contribution',
                'furniture_agent_contribution',
                'total_agent_contribution',
            ], fn ($c) => Schema::hasColumn('installment_accounts', $c));
            if (!empty($cols)) {
                $table->dropColumn($cols);
            }
        });

        Schema::table('sale_items', function (Blueprint $table) {
            $cols = array_filter([
                'category_domain',
                'agent_commission_rate',
                'agent_contribution',
            ], fn ($c) => Schema::hasColumn('sale_items', $c));
            if (!empty($cols)) {
                $table->dropColumn($cols);
            }
        });

        Schema::table('sale_transactions', function (Blueprint $table) {
            if (Schema::hasColumn('sale_transactions', 'agent_id')) {
                $table->dropForeign(['agent_id']);
            }
            $cols = array_filter([
                'has_agent',
                'agent_id',
                'appliances_agent_contribution',
                'furniture_agent_contribution',
                'total_agent_contribution',
            ], fn ($c) => Schema::hasColumn('sale_transactions', $c));
            if (!empty($cols)) {
                $table->dropColumn($cols);
            }
        });
    }
};
