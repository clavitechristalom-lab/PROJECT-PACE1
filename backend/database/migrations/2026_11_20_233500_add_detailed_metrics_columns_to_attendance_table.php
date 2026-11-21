<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('attendance')) {
            Schema::table('attendance', function (Blueprint $table) {
                if (!Schema::hasColumn('attendance', 'reason_code')) {
                    $table->string('reason_code', 30)->nullable()->after('leave_type');
                }
                if (!Schema::hasColumn('attendance', 'absence_status')) {
                    $table->string('absence_status', 30)->nullable()->after('reason_code');
                }
                if (!Schema::hasColumn('attendance', 'shift_type')) {
                    $table->string('shift_type', 15)->nullable()->after('absence_status');
                }
                if (!Schema::hasColumn('attendance', 'late_minutes')) {
                    $table->integer('late_minutes')->default(0)->after('shift_type');
                }
                if (!Schema::hasColumn('attendance', 'undertime_minutes')) {
                    $table->integer('undertime_minutes')->default(0)->after('late_minutes');
                }
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('attendance')) {
            Schema::table('attendance', function (Blueprint $table) {
                foreach (['reason_code', 'absence_status', 'shift_type', 'late_minutes', 'undertime_minutes'] as $col) {
                    if (Schema::hasColumn('attendance', $col)) {
                        $table->dropColumn($col);
                    }
                }
            });
        }
    }
};

