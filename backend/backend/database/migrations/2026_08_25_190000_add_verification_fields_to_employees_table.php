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
            if (!Schema::hasColumn('employees', 'information_verified')) {
                $table->boolean('information_verified')->default(false)->after('status');
            }
            if (!Schema::hasColumn('employees', 'information_verified_at')) {
                $table->timestamp('information_verified_at')->nullable()->after('information_verified');
            }
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('employees', function (Blueprint $table) {
            if (Schema::hasColumn('employees', 'information_verified')) {
                $table->dropColumn('information_verified');
            }
            if (Schema::hasColumn('employees', 'information_verified_at')) {
                $table->dropColumn('information_verified_at');
            }
        });
    }
};
