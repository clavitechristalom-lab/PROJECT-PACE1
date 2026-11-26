<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('payments', function (Blueprint $table) {
            if (!Schema::hasColumn('payments', 'cash_tendered')) {
                $table->decimal('cash_tendered', 12, 2)->nullable()->after('amount');
            }
            if (!Schema::hasColumn('payments', 'change_due')) {
                $table->decimal('change_due', 12, 2)->nullable()->after('cash_tendered');
            }
            if (!Schema::hasColumn('payments', 'collector_remarks')) {
                $table->text('collector_remarks')->nullable()->after('notes');
            }
        });
    }

    public function down(): void
    {
        Schema::table('payments', function (Blueprint $table) {
            $columns = array_filter([
                Schema::hasColumn('payments', 'cash_tendered') ? 'cash_tendered' : null,
                Schema::hasColumn('payments', 'change_due') ? 'change_due' : null,
                Schema::hasColumn('payments', 'collector_remarks') ? 'collector_remarks' : null,
            ]);
            if (!empty($columns)) {
                $table->dropColumn($columns);
            }
        });
    }
};
