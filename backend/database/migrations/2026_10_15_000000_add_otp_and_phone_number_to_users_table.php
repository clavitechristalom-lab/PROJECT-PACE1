<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            if (!Schema::hasColumn('users', 'phone_number')) {
                $table->string('phone_number', 50)->nullable()->index()->after('username');
            }
            if (!Schema::hasColumn('users', 'email')) {
                $table->string('email', 191)->nullable()->index()->after('phone_number');
            }
            if (!Schema::hasColumn('users', 'otp_code')) {
                $table->string('otp_code', 10)->nullable()->after('password_hash');
            }
            if (!Schema::hasColumn('users', 'otp_expires_at')) {
                $table->timestamp('otp_expires_at')->nullable()->after('otp_code');
            }
            if (!Schema::hasColumn('users', 'otp_created_at')) {
                $table->timestamp('otp_created_at')->nullable()->after('otp_expires_at');
            }
        });

        // Backfill phone_number and email for existing users from customer and employee records
        $users = DB::table('users')->get();
        foreach ($users as $user) {
            $phone = null;
            $email = null;

            if ($user->customer_id) {
                $cust = DB::table('customers')->where('customer_id', $user->customer_id)->first();
                if ($cust) {
                    $phone = $cust->phone;
                    $email = $cust->email;
                }
            } elseif ($user->employee_id) {
                $emp = DB::table('employees')->where('employee_id', $user->employee_id)->first();
                if ($emp) {
                    $phone = $emp->phone;
                    $email = $emp->email;
                }
            }

            if (!$email && filter_var($user->username, FILTER_VALIDATE_EMAIL)) {
                $email = $user->username;
            }

            DB::table('users')->where('user_id', $user->user_id)->update([
                'phone_number' => $phone,
                'email' => $email,
            ]);
        }
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            if (Schema::hasColumn('users', 'otp_created_at')) {
                $table->dropColumn('otp_created_at');
            }
            if (Schema::hasColumn('users', 'otp_expires_at')) {
                $table->dropColumn('otp_expires_at');
            }
            if (Schema::hasColumn('users', 'otp_code')) {
                $table->dropColumn('otp_code');
            }
            if (Schema::hasColumn('users', 'email')) {
                $table->dropColumn('email');
            }
            if (Schema::hasColumn('users', 'phone_number')) {
                $table->dropColumn('phone_number');
            }
        });
    }
};
