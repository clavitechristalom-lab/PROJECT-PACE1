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
        Schema::table('branch_profiles', function (Blueprint $table) {
            $table->dropColumn('manager_name');
            $table->unsignedBigInteger('manager_id')->nullable()->after('location');
            // Assuming manager_id references user_id or employee_id. We'll leave it without foreign constraint to avoid errors if users don't exist, or we can add it. Let's add it to user_id since Store Admin is a user role.
            // $table->foreign('manager_id')->references('user_id')->on('users')->nullOnDelete();
        });

        Schema::table('employees', function (Blueprint $table) {
            $table->dropColumn('branch');
            $table->unsignedBigInteger('branch_id')->nullable()->after('department');
            $table->foreign('branch_id')->references('id')->on('branch_profiles')->nullOnDelete();
        });

        Schema::table('customers', function (Blueprint $table) {
            $table->dropColumn('branch');
            $table->unsignedBigInteger('branch_id')->nullable()->after('status');
            $table->foreign('branch_id')->references('id')->on('branch_profiles')->nullOnDelete();
        });

        Schema::table('sale_transactions', function (Blueprint $table) {
            $table->unsignedBigInteger('branch_id')->nullable()->after('processed_by');
            $table->foreign('branch_id')->references('id')->on('branch_profiles')->nullOnDelete();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('sale_transactions', function (Blueprint $table) {
            $table->dropForeign(['branch_id']);
            $table->dropColumn('branch_id');
        });

        Schema::table('customers', function (Blueprint $table) {
            $table->dropForeign(['branch_id']);
            $table->dropColumn('branch_id');
            $table->string('branch')->nullable();
        });

        Schema::table('employees', function (Blueprint $table) {
            $table->dropForeign(['branch_id']);
            $table->dropColumn('branch_id');
            $table->string('branch')->nullable();
        });

        Schema::table('branch_profiles', function (Blueprint $table) {
            $table->dropColumn('manager_id');
            $table->string('manager_name')->nullable();
        });
    }
};
