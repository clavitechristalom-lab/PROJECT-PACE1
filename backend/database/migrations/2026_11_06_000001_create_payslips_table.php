<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use App\Models\Payroll;
use App\Models\Payslip;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::dropIfExists('payslips');

        Schema::create('payslips', function (Blueprint $table) {
            $table->id();

            // Link to payroll table
            $table->unsignedBigInteger('payroll_id')->nullable()->unique();
            if (Schema::hasTable('payroll')) {
                $table->foreign('payroll_id')
                      ->references('payroll_id')
                      ->on('payroll')
                      ->onDelete('cascade');
            }

            // Foreign key referencing employees
            $employeeKey = Schema::hasColumn('employees', 'employee_id') ? 'employee_id' : 'id';
            $table->unsignedBigInteger('employee_id');
            $table->foreign('employee_id')
                  ->references($employeeKey)
                  ->on('employees')
                  ->onDelete('cascade');

            // ─── Exact Payslips Table Columns Matching UI ───
            $table->string('code', 50)->nullable();                           // 1. Code
            $table->string('employee_name')->nullable();                      // 2. Employee Name
            $table->string('branch')->nullable();                             // 3. Branch
            $table->string('payout_method', 100)->default('Cash');            // 4. Payout Method
            $table->decimal('weekly_base_pay', 12, 2)->default(0.00);         // 5. Weekly Base Pay
            $table->decimal('total_work_hours', 8, 2)->default(0.00);         // 6. Total Work Hours
            $table->decimal('total_absences', 8, 2)->default(0.00);           // 7. Total Absences (days)
            $table->integer('total_late')->default(0);                        // 8. Total Late (minutes)
            $table->decimal('total_undertime', 8, 2)->default(0.00);          // 9. Total Undertime (minutes)
            $table->decimal('total_deductions', 12, 2)->default(0.00);        // 10. Total Deductions
            $table->decimal('final_take_home_pay', 12, 2)->default(0.00);     // 11. Final Take-Home Pay
            $table->string('status', 30)->default('Draft');                   // 12. Status (Draft, Approved, Issued, Paid)
            $table->string('actions')->default('View | Slip');                // 13. Actions

            // ─── Supporting Breakdown & Period Columns ───
            $table->decimal('absence_deduction', 12, 2)->default(0.00);
            $table->decimal('late_deduction', 12, 2)->default(0.00);
            $table->decimal('undertime_deduction', 12, 2)->default(0.00);
            $table->date('pay_period_start')->nullable();
            $table->date('pay_period_end')->nullable();
            $table->decimal('basic_salary', 12, 2)->default(0.00);
            $table->decimal('allowances', 12, 2)->default(0.00);
            $table->decimal('deductions', 12, 2)->default(0.00);
            $table->decimal('net_pay', 12, 2)->default(0.00);
            $table->string('proof_of_payment')->nullable();
            $table->timestamps();

            // Performance Indexes
            $table->index(['employee_id', 'status']);
            $table->index('code');
            $table->index('branch');
            $table->index(['pay_period_start', 'pay_period_end']);
        });

        // Automatically populate payslips from existing payroll records
        if (Schema::hasTable('payroll') && class_exists(Payslip::class) && method_exists(Payslip::class, 'syncAllFromPayroll')) {
            try {
                Payslip::syncAllFromPayroll();
            } catch (\Throwable $e) {
                // Safe fallback during initial schema build
            }
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('payslips');
    }
};
