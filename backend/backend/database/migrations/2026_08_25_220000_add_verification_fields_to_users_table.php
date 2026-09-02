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
        Schema::table('users', function (Blueprint $table) {
            if (!Schema::hasColumn('users', 'account_verified')) {
                $table->boolean('account_verified')->default(false)->after('is_active');
            }
            if (!Schema::hasColumn('users', 'account_verified_at')) {
                $table->timestamp('account_verified_at')->nullable()->after('account_verified');
            }
            if (!Schema::hasColumn('users', 'account_verified_by')) {
                $table->unsignedBigInteger('account_verified_by')->nullable()->after('account_verified_at');
            }
        });

        // Set primary admin as verified by default
        $admin = DB::table('users')->where('role', 'Administrator')->first();
        if ($admin) {
            DB::table('users')->where('user_id', $admin->user_id)->update([
                'account_verified' => true,
                'account_verified_at' => now(),
                'account_verified_by' => $admin->user_id,
            ]);
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            if (Schema::hasColumn('users', 'account_verified_by')) {
                $table->dropColumn('account_verified_by');
            }
            if (Schema::hasColumn('users', 'account_verified_at')) {
                $table->dropColumn('account_verified_at');
            }
            if (Schema::hasColumn('users', 'account_verified')) {
                $table->dropColumn('account_verified');
            }
        });
    }
};
