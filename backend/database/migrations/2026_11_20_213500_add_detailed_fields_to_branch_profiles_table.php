<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('branch_profiles')) {
            Schema::table('branch_profiles', function (Blueprint $table) {
                if (!Schema::hasColumn('branch_profiles', 'branch_code')) {
                    $table->string('branch_code', 50)->nullable()->after('name');
                }
                if (!Schema::hasColumn('branch_profiles', 'branch_type')) {
                    $table->string('branch_type', 100)->nullable()->after('branch_code');
                }
                if (!Schema::hasColumn('branch_profiles', 'address')) {
                    $table->string('address', 255)->nullable()->after('location');
                }
                if (!Schema::hasColumn('branch_profiles', 'city')) {
                    $table->string('city', 120)->nullable()->after('address');
                }
                if (!Schema::hasColumn('branch_profiles', 'province')) {
                    $table->string('province', 120)->nullable()->after('city');
                }
                if (!Schema::hasColumn('branch_profiles', 'email')) {
                    $table->string('email', 160)->nullable()->after('contact_number');
                }
                if (!Schema::hasColumn('branch_profiles', 'operating_hours')) {
                    $table->string('operating_hours', 160)->nullable()->after('email');
                }
                if (!Schema::hasColumn('branch_profiles', 'opening_date')) {
                    $table->string('opening_date', 40)->nullable()->after('operating_hours');
                }
                if (!Schema::hasColumn('branch_profiles', 'description')) {
                    $table->text('description')->nullable()->after('opening_date');
                }
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('branch_profiles')) {
            Schema::table('branch_profiles', function (Blueprint $table) {
                $cols = [
                    'branch_code', 'branch_type', 'address', 'city',
                    'province', 'email', 'operating_hours', 'opening_date', 'description',
                ];
                foreach ($cols as $col) {
                    if (Schema::hasColumn('branch_profiles', $col)) {
                        $table->dropColumn($col);
                    }
                }
            });
        }
    }
};

