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
        if (!Schema::hasTable('payslips')) {
            Schema::create('payslips', function (Blueprint $table) {
                $table->id();
                
                // Foreign key referencing employees (supports project's 'employee_id' or standard 'id')
                $employeeKey = Schema::hasColumn('employees', 'employee_id') ? 'employee_id' : 'id';
                $table->unsignedBigInteger('employee_id');
                $table->foreign('employee_id')
                      ->references($employeeKey)
                      ->on('employees')
                      ->onDelete('cascade');

                $table->date('pay_period_start');
                $table->date('pay_period_end');
                $table->decimal('basic_salary', 10, 2);
                $table->decimal('allowances', 10, 2)->default(0.00);
                $table->decimal('deductions', 10, 2)->default(0.00);
                $table->decimal('net_pay', 10, 2);
                $table->enum('status', ['draft', 'issued', 'paid'])->default('draft');
                $table->timestamps();

                // Performance Indexes
                $table->index(['employee_id', 'status']);
                $table->index(['pay_period_start', 'pay_period_end']);
            });
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

