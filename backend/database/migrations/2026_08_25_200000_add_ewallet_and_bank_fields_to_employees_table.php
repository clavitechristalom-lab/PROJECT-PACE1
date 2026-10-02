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
        Schema::table('employees', function (Blueprint $table) {
            if (!Schema::hasColumn('employees', 'ewallet_provider')) {
                $table->string('ewallet_provider')->nullable()->after('pay_type');
            }
            if (!Schema::hasColumn('employees', 'ewallet_account_no')) {
                $table->string('ewallet_account_no')->nullable()->after('ewallet_provider');
            }
            if (!Schema::hasColumn('employees', 'bank_name')) {
                $table->string('bank_name')->nullable()->after('ewallet_account_no');
            }
            if (!Schema::hasColumn('employees', 'bank_account_no')) {
                $table->string('bank_account_no')->nullable()->after('bank_name');
            }
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('employees', function (Blueprint $table) {
            $table->dropColumn([
                'ewallet_provider',
                'ewallet_account_no',
                'bank_name',
                'bank_account_no',
            ]);
        });
    }
};
