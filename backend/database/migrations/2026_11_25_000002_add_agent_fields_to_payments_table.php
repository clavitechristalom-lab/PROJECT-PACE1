<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('payments', function (Blueprint $table) {
            if (!Schema::hasColumn('payments', 'has_agent')) {
                $table->boolean('has_agent')->default(false)->after('received_by');
            }
            if (!Schema::hasColumn('payments', 'agent_id')) {
                $table->unsignedBigInteger('agent_id')->nullable()->after('has_agent');
                $table->foreign('agent_id')
                    ->references('employee_id')
                    ->on('employees')
                    ->nullOnDelete();
            }
            if (!Schema::hasColumn('payments', 'appliances_agent_contribution')) {
                $table->decimal('appliances_agent_contribution', 12, 2)->default(0)->after('agent_id');
            }
            if (!Schema::hasColumn('payments', 'furniture_agent_contribution')) {
                $table->decimal('furniture_agent_contribution', 12, 2)->default(0)->after('appliances_agent_contribution');
            }
            if (!Schema::hasColumn('payments', 'total_agent_contribution')) {
                $table->decimal('total_agent_contribution', 12, 2)->default(0)->after('furniture_agent_contribution');
            }
        });
    }

    public function down(): void
    {
        Schema::table('payments', function (Blueprint $table) {
            if (Schema::hasColumn('payments', 'agent_id')) {
                $table->dropForeign(['agent_id']);
            }
            $cols = array_filter([
                'has_agent',
                'agent_id',
                'appliances_agent_contribution',
                'furniture_agent_contribution',
                'total_agent_contribution',
            ], fn ($c) => Schema::hasColumn('payments', $c));
            if (!empty($cols)) {
                $table->dropColumn($cols);
            }
        });
    }
};
