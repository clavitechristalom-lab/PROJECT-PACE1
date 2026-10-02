<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('employees', function (Blueprint $table) {
            if (!Schema::hasColumn('employees', 'account_verified')) {
                $table->boolean('account_verified')->default(false)->after('information_verified_at');
            }
            if (!Schema::hasColumn('employees', 'account_verified_at')) {
                $table->timestamp('account_verified_at')->nullable()->after('account_verified');
            }
        });

        // Backfill account_verified from information_verified
        DB::table('employees')->where('information_verified', true)->update([
            'account_verified' => true,
            'account_verified_at' => DB::raw('information_verified_at'),
        ]);
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('employees', function (Blueprint $table) {
            if (Schema::hasColumn('employees', 'account_verified')) {
                $table->dropColumn('account_verified');
            }
            if (Schema::hasColumn('employees', 'account_verified_at')) {
                $table->dropColumn('account_verified_at');
            }
        });
    }
};
