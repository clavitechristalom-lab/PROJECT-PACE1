<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations: Remove legacy residents table and sync emails across Project PACE users, employees, and customers.
     */
    public function up(): void
    {
        Schema::dropIfExists('residents');

        // Sync Customer emails into Users table for Gmail OTP delivery
        if (Schema::hasTable('users') && Schema::hasTable('customers')) {
            $customerUsers = DB::table('users')
                ->join('customers', 'users.customer_id', '=', 'customers.customer_id')
                ->whereNull('users.email')
                ->whereNotNull('customers.email')
                ->select('users.user_id', 'customers.email')
                ->get();

            foreach ($customerUsers as $cu) {
                if (filter_var($cu->email, FILTER_VALIDATE_EMAIL)) {
                    DB::table('users')
                        ->where('user_id', $cu->user_id)
                        ->update(['email' => strtolower(trim($cu->email))]);
                }
            }
        }

        // Sync Employee emails into Users table for Gmail OTP delivery
        if (Schema::hasTable('users') && Schema::hasTable('employees')) {
            $employeeUsers = DB::table('users')
                ->join('employees', 'users.employee_id', '=', 'employees.employee_id')
                ->whereNull('users.email')
                ->whereNotNull('employees.email')
                ->select('users.user_id', 'employees.email')
                ->get();

            foreach ($employeeUsers as $eu) {
                if (filter_var($eu->email, FILTER_VALIDATE_EMAIL)) {
                    DB::table('users')
                        ->where('user_id', $eu->user_id)
                        ->update(['email' => strtolower(trim($eu->email))]);
                }
            }
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('residents');
    }
};
