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
            if (!Schema::hasIndex('installment_accounts', 'inst_updated_at_idx')) {
                $table->index('updated_at', 'inst_updated_at_idx');
            }
        });

        // 7. sale_transactions (sub-50ms sales queries and fingerprinting)
        Schema::table('sale_transactions', function (Blueprint $table) {
            if (!Schema::hasIndex('sale_transactions', 'st_date_branch_idx')) {
                $table->index(['sale_date', 'branch_id'], 'st_date_branch_idx');
            }
            if (!Schema::hasIndex('sale_transactions', 'st_proc_date_idx')) {
                $table->index(['processed_by', 'sale_date'], 'st_proc_date_idx');
            }
            if (!Schema::hasIndex('sale_transactions', 'st_updated_at_idx')) {
                $table->index('updated_at', 'st_updated_at_idx');
            }
        });

        // 8. notifications (instant unread badge counts and polling)
        Schema::table('notifications', function (Blueprint $table) {
            if (!Schema::hasIndex('notifications', 'notif_user_read_idx')) {
                $table->index(['user_id', 'is_read'], 'notif_user_read_idx');
            }
            if (!Schema::hasIndex('notifications', 'notif_user_priority_idx')) {
                $table->index(['user_id', 'priority'], 'notif_user_priority_idx');
            }
        });

        // 9. users (instant verification and role filtering)
        Schema::table('users', function (Blueprint $table) {
            if (!Schema::hasIndex('users', 'usr_role_verif_idx')) {
                $table->index(['role', 'account_verified'], 'usr_role_verif_idx');
            }
            if (!Schema::hasIndex('users', 'usr_updated_at_idx')) {
                $table->index('updated_at', 'usr_updated_at_idx');
            }
        });

        // 10. employees (branch & status filtering)
        Schema::table('employees', function (Blueprint $table) {
            if (!Schema::hasIndex('employees', 'emp_branch_status_idx')) {
                $table->index(['branch_id', 'status'], 'emp_branch_status_idx');
            }
            if (!Schema::hasIndex('employees', 'emp_updated_at_idx')) {
                $table->index('updated_at', 'emp_updated_at_idx');
            }
        });

        // 11. products (branch filtering and fingerprinting)
        Schema::table('products', function (Blueprint $table) {
            if (!Schema::hasIndex('products', 'prod_branch_status_idx')) {
                $table->index(['branch_id', 'status'], 'prod_branch_status_idx');
            }
            if (!Schema::hasIndex('products', 'prod_updated_at_idx')) {
                $table->index('updated_at', 'prod_updated_at_idx');
            }
        });

        // 12. payments (payment_date and updated_at)
        Schema::table('payments', function (Blueprint $table) {
            if (!Schema::hasIndex('payments', 'pay_date_status_idx')) {
                $table->index(['payment_date', 'status'], 'pay_date_status_idx');
            }
            if (!Schema::hasIndex('payments', 'pay_recv_date_idx')) {
                $table->index(['received_by', 'payment_date'], 'pay_recv_date_idx');
            }
            if (Schema::hasColumn('payments', 'created_at') && !Schema::hasIndex('payments', 'pay_created_at_idx')) {
                $table->index('created_at', 'pay_created_at_idx');
            }
        });

        // 13. attendance (date & status and updated_at)
        Schema::table('attendance', function (Blueprint $table) {
            if (!Schema::hasIndex('attendance', 'att_date_status_idx')) {
                $table->index(['attendance_date', 'status'], 'att_date_status_idx');
            }
            if (!Schema::hasIndex('attendance', 'att_updated_at_idx')) {
                $table->index('updated_at', 'att_updated_at_idx');
            }
        });

        // 14. qr_requests & support_messages & branch_profiles
        Schema::table('qr_requests', function (Blueprint $table) {
            if (!Schema::hasIndex('qr_requests', 'qr_status_emp_idx')) {
                $table->index(['status', 'employee_id'], 'qr_status_emp_idx');
            }
        });
        Schema::table('support_messages', function (Blueprint $table) {
            if (!Schema::hasIndex('support_messages', 'sp_status_cust_idx')) {
                $table->index(['status', 'customer_id'], 'sp_status_cust_idx');
            }
            if (!Schema::hasIndex('support_messages', 'sp_updated_at_idx')) {
                $table->index('updated_at', 'sp_updated_at_idx');
            }
        });
        Schema::table('branch_profiles', function (Blueprint $table) {
            if (!Schema::hasIndex('branch_profiles', 'br_updated_at_idx')) {
                $table->index('updated_at', 'br_updated_at_idx');
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
