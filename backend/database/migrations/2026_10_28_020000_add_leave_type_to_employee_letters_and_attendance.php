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
        // 1. Add leave_type to employee_letters
        if (Schema::hasTable('employee_letters')) {
            Schema::table('employee_letters', function (Blueprint $table) {
                if (!Schema::hasColumn('employee_letters', 'leave_type')) {
                    $table->string('leave_type', 50)->default('without_pay')->after('category')->index();
                }
            });
        }

        // 2. Add leave_type to attendance
        if (Schema::hasTable('attendance')) {
            Schema::table('attendance', function (Blueprint $table) {
                if (!Schema::hasColumn('attendance', 'leave_type')) {
                    $table->string('leave_type', 50)->nullable()->after('status')->index();
                }
            });
        }

        // 3. Add leave_type to support_messages if present
        if (Schema::hasTable('support_messages')) {
            Schema::table('support_messages', function (Blueprint $table) {
                if (!Schema::hasColumn('support_messages', 'leave_type')) {
                    $table->string('leave_type', 50)->nullable()->after('category')->index();
                }
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (Schema::hasTable('employee_letters')) {
            Schema::table('employee_letters', function (Blueprint $table) {
                if (Schema::hasColumn('employee_letters', 'leave_type')) {
                    $table->dropColumn('leave_type');
                }
            });
        }

        if (Schema::hasTable('attendance')) {
            Schema::table('attendance', function (Blueprint $table) {
                if (Schema::hasColumn('attendance', 'leave_type')) {
                    $table->dropColumn('leave_type');
                }
            });
        }

        if (Schema::hasTable('support_messages')) {
            Schema::table('support_messages', function (Blueprint $table) {
                if (Schema::hasColumn('support_messages', 'leave_type')) {
                    $table->dropColumn('leave_type');
                }
            });
        }
    }
};

