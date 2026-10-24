<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations for sub-50ms query optimization.
     */
    public function up(): void
    {
        // 1. attendance_scan_logs (frequent 1-2s polling for employee pending verifications)
        Schema::table('attendance_scan_logs', function (Blueprint $table) {
            if (!Schema::hasIndex('attendance_scan_logs', 'att_scan_emp_status_idx')) {
                $table->index(['employee_id', 'status'], 'att_scan_emp_status_idx');
            }
        });

        // 2. payment_schedule (overdue detection and balance due checks)
        Schema::table('payment_schedule', function (Blueprint $table) {
            if (!Schema::hasIndex('payment_schedule', 'ps_status_due_idx')) {
                $table->index(['status', 'due_date'], 'ps_status_due_idx');
            }
            if (!Schema::hasIndex('payment_schedule', 'ps_inst_status_idx')) {
                $table->index(['installment_id', 'status'], 'ps_inst_status_idx');
            }
        });

        // 3. payments (frequent collection and installment calculations)
        Schema::table('payments', function (Blueprint $table) {
            if (!Schema::hasIndex('payments', 'pay_inst_status_date_idx')) {
                $table->index(['installment_id', 'status', 'payment_date'], 'pay_inst_status_date_idx');
            }
        });

        // 4. products (inventory threshold and category filtering)
        Schema::table('products', function (Blueprint $table) {
            if (!Schema::hasIndex('products', 'prod_status_cat_stock_idx')) {
                $table->index(['status', 'category', 'stock_quantity'], 'prod_status_cat_stock_idx');
            }
        });

        // 5. attendance (daily attendance and overtime calculations)
        Schema::table('attendance', function (Blueprint $table) {
            if (!Schema::hasIndex('attendance', 'att_emp_date_status_idx')) {
                $table->index(['employee_id', 'attendance_date', 'status'], 'att_emp_date_status_idx');
            }
        });

        // 6. installment_accounts (active & overdue installment filtering)
        Schema::table('installment_accounts', function (Blueprint $table) {
            if (!Schema::hasIndex('installment_accounts', 'inst_status_cust_idx')) {
                $table->index(['status', 'customer_id'], 'inst_status_cust_idx');
            }
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('attendance_scan_logs', function (Blueprint $table) {
            $table->dropIndex('att_scan_emp_status_idx');
        });
        Schema::table('payment_schedule', function (Blueprint $table) {
            $table->dropIndex('ps_status_due_idx');
            $table->dropIndex('ps_inst_status_idx');
        });
        Schema::table('payments', function (Blueprint $table) {
            $table->dropIndex('pay_inst_status_date_idx');
        });
        Schema::table('products', function (Blueprint $table) {
            $table->dropIndex('prod_status_cat_stock_idx');
        });
        Schema::table('attendance', function (Blueprint $table) {
            $table->dropIndex('att_emp_date_status_idx');
        });
        Schema::table('installment_accounts', function (Blueprint $table) {
            $table->dropIndex('inst_status_cust_idx');
        });
    }
};
