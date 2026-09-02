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
        Schema::table('customers', function (Blueprint $table) {
            if (!Schema::hasColumn('customers', 'middle_name')) {
                $table->string('middle_name')->nullable()->after('first_name');
            }
            if (!Schema::hasColumn('customers', 'notes')) {
                $table->text('notes')->nullable()->after('status');
            }
        });

        Schema::table('system_logs', function (Blueprint $table) {
            if (!Schema::hasColumn('system_logs', 'user_id')) {
                $table->unsignedBigInteger('user_id')->nullable()->after('id');
            }
            if (!Schema::hasColumn('system_logs', 'action')) {
                $table->string('action')->nullable()->after('user_id');
            }
            if (!Schema::hasColumn('system_logs', 'module')) {
                $table->string('module')->nullable()->after('action');
            }
            if (!Schema::hasColumn('system_logs', 'description')) {
                $table->text('description')->nullable()->after('module');
            }
            if (!Schema::hasColumn('system_logs', 'ip_address')) {
                $table->string('ip_address', 45)->nullable()->after('description');
            }
            if (!Schema::hasColumn('system_logs', 'user_agent')) {
                $table->text('user_agent')->nullable()->after('ip_address');
            }
        });

        Schema::table('backup_logs', function (Blueprint $table) {
            if (!Schema::hasColumn('backup_logs', 'backup_name')) {
                $table->string('backup_name')->nullable()->after('id');
            }
            if (!Schema::hasColumn('backup_logs', 'file_path')) {
                $table->string('file_path')->nullable()->after('backup_name');
            }
            if (!Schema::hasColumn('backup_logs', 'backup_type')) {
                $table->string('backup_type')->default('Full')->after('file_path');
            }
            if (!Schema::hasColumn('backup_logs', 'file_size')) {
                $table->string('file_size')->nullable()->after('backup_type');
            }
            if (!Schema::hasColumn('backup_logs', 'status')) {
                $table->string('status')->default('Completed')->after('file_size');
            }
            if (!Schema::hasColumn('backup_logs', 'started_at')) {
                $table->dateTime('started_at')->nullable()->after('status');
            }
            if (!Schema::hasColumn('backup_logs', 'completed_at')) {
                $table->dateTime('completed_at')->nullable()->after('started_at');
            }
            if (!Schema::hasColumn('backup_logs', 'created_by')) {
                $table->unsignedBigInteger('created_by')->nullable()->after('completed_at');
            }
            if (!Schema::hasColumn('backup_logs', 'notes')) {
                $table->text('notes')->nullable()->after('created_by');
            }
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        //
    }
};
