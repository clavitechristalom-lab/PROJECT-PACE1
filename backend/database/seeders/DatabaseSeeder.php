<?php

namespace Database\Seeders;

use App\Models\User;
use App\Models\Employee;
use App\Models\Customer;
use App\Models\Product;
use App\Models\SaleTransaction;
use App\Models\SaleItem;
use App\Models\InstallmentAccount;
use App\Models\PaymentSchedule;
use App\Models\Payment;
use App\Models\PayrollPeriod;
use App\Models\Payroll;
use App\Models\PayrollDeduction;
use App\Models\Attendance;
use App\Models\AttendanceScanLog;
use App\Models\SystemLog;
use App\Models\BackupLog;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class DatabaseSeeder extends Seeder
{
    /**
     * Seed the application's database with a clean slate (Admin only, 0 demo data).
     */
    public function run(): void
    {
        if (DB::getDriverName() !== 'sqlite') {
            \Illuminate\Support\Facades\Schema::disableForeignKeyConstraints();
        }

        // Truncate all tables to zero
        AttendanceScanLog::truncate();
        Attendance::truncate();
        PayrollDeduction::truncate();
        Payroll::truncate();
        PayrollPeriod::truncate();
        Payment::truncate();
        PaymentSchedule::truncate();
        InstallmentAccount::truncate();
        SaleItem::truncate();
        SaleTransaction::truncate();
        Product::truncate();
        Customer::truncate();
        User::truncate();
        Employee::truncate();
        SystemLog::truncate();
        BackupLog::truncate();

        if (DB::getDriverName() !== 'sqlite') {
            \Illuminate\Support\Facades\Schema::enableForeignKeyConstraints();
        }

        // ─── 1. Primary System Administrator Employee ─────────────────────────────
        $adminEmployee = Employee::create([
            'employee_id' => 1,
            'employee_code' => 'SYS-001',
            'first_name' => 'System',
            'middle_name' => '',
            'last_name' => 'Administrator',
            'gender' => 'Other',
            'birth_date' => '2000-01-01',
            'date_of_birth' => '2000-01-01',
            'marital_status' => 'Single',
            'tin_number' => '',
            'sss_number' => '',
            'philhealth_number' => '',
            'pagibig_number' => '',
            'position' => 'System Administrator',
            'department' => 'IT',
            'branch' => 'Cagayan de Oro',
            'pay_type' => 'Monthly',
            'basic_salary' => 0.00,
            'daily_rate' => 0.00,
            'hourly_rate' => 0.00,
            'phone' => '00000000000',
            'email' => 'admin@example.com',
            'address' => 'System Headquarters',
            'hire_date' => date('Y-m-d'),
            'working_hours' => '8 AM to 5 PM',
            'qr_token' => (string)Str::uuid(),
            'qr_active' => true,
            'qr_generated_at' => now(),
            'attendance_pin' => Hash::make('1234'),
            'status' => 'Active',
            'notes' => 'Primary System Administrator Account',
        ]);

        // ─── 2. Primary System Administrator User Login ───────────────────────────
        User::create([
            'user_id' => 1,
            'employee_id' => $adminEmployee->employee_id,
            'username' => 'admin',
            'password_hash' => Hash::make('admin123'),
            'role' => 'Administrator',
            'is_active' => true,
            'last_login' => null,
        ]);
    }
}
