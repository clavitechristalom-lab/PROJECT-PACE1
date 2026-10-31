<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('employee_letters')) {
            Schema::table('employee_letters', function (Blueprint $table) {
                if (!Schema::hasColumn('employee_letters', 'is_archived')) {
                    $table->boolean('is_archived')->default(false)->after('status')->index();
                }
                if (!Schema::hasColumn('employee_letters', 'archived_at')) {
                    $table->timestamp('archived_at')->nullable()->after('is_archived');
                }
                if (!Schema::hasColumn('employee_letters', 'archived_by')) {
                    $table->unsignedBigInteger('archived_by')->nullable()->after('archived_at');
                }
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('employee_letters')) {
            Schema::table('employee_letters', function (Blueprint $table) {
                $cols = [];
                if (Schema::hasColumn('employee_letters', 'is_archived')) $cols[] = 'is_archived';
                if (Schema::hasColumn('employee_letters', 'archived_at')) $cols[] = 'archived_at';
                if (Schema::hasColumn('employee_letters', 'archived_by')) $cols[] = 'archived_by';
                if (!empty($cols)) {
                    $table->dropColumn($cols);
                }
            });
        }
    }
};

