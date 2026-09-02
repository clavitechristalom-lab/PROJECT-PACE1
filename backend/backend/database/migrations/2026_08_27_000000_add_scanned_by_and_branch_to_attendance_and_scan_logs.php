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
        Schema::table('attendance_scan_logs', function (Blueprint $table) {
            if (!Schema::hasColumn('attendance_scan_logs', 'scanned_by')) {
                $table->unsignedBigInteger('scanned_by')->nullable()->after('employee_id');
                $table->foreign('scanned_by')->references('user_id')->on('users')->onDelete('set null');
            }
            if (!Schema::hasColumn('attendance_scan_logs', 'branch')) {
                $table->string('branch')->nullable()->after('scanned_by');
            }
        });

        Schema::table('attendance', function (Blueprint $table) {
            if (!Schema::hasColumn('attendance', 'scanned_by')) {
                $table->unsignedBigInteger('scanned_by')->nullable()->after('employee_id');
                $table->foreign('scanned_by')->references('user_id')->on('users')->onDelete('set null');
            }
            if (!Schema::hasColumn('attendance', 'verified_by_name')) {
                $table->string('verified_by_name')->nullable()->after('verification_method');
            }
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('attendance', function (Blueprint $table) {
            if (Schema::hasColumn('attendance', 'scanned_by')) {
                $table->dropForeign(['scanned_by']);
                $table->dropColumn('scanned_by');
            }
            if (Schema::hasColumn('attendance', 'verified_by_name')) {
                $table->dropColumn('verified_by_name');
            }
        });

        Schema::table('attendance_scan_logs', function (Blueprint $table) {
            if (Schema::hasColumn('attendance_scan_logs', 'scanned_by')) {
                $table->dropForeign(['scanned_by']);
                $table->dropColumn('scanned_by');
            }
            if (Schema::hasColumn('attendance_scan_logs', 'branch')) {
                $table->dropColumn('branch');
            }
        });
    }
};
