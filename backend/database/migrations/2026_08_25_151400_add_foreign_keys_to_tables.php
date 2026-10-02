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
        Schema::table('attendance', function (Blueprint $table) {
            $table->foreign('employee_id')->references('employee_id')->on('employees')->onDelete('cascade');
        });

        Schema::table('installment_accounts', function (Blueprint $table) {
            $table->foreign('customer_id')->references('customer_id')->on('customers')->onDelete('cascade');
            $table->foreign('sale_id')->references('sale_id')->on('sale_transactions')->onDelete('set null');
        });

        Schema::table('payments', function (Blueprint $table) {
            $table->foreign('installment_id')->references('installment_id')->on('installment_accounts')->onDelete('cascade');
            $table->foreign('schedule_id')->references('schedule_id')->on('payment_schedule')->onDelete('set null');
            $table->foreign('received_by')->references('user_id')->on('users')->onDelete('set null');
        });

        Schema::table('payment_schedule', function (Blueprint $table) {
            $table->foreign('installment_id')->references('installment_id')->on('installment_accounts')->onDelete('cascade');
        });

        Schema::table('payroll', function (Blueprint $table) {
            $table->foreign('period_id')->references('period_id')->on('payroll_periods')->onDelete('cascade');
            $table->foreign('employee_id')->references('employee_id')->on('employees')->onDelete('cascade');
            $table->foreign('generated_by')->references('user_id')->on('users')->onDelete('set null');
            $table->foreign('approved_by')->references('user_id')->on('users')->onDelete('set null');
        });

        Schema::table('payroll_deductions', function (Blueprint $table) {
            $table->foreign('payroll_id')->references('payroll_id')->on('payroll')->onDelete('cascade');
        });

        Schema::table('payroll_periods', function (Blueprint $table) {
            $table->foreign('created_by')->references('user_id')->on('users')->onDelete('set null');
        });

        Schema::table('sale_items', function (Blueprint $table) {
            $table->foreign('sale_id')->references('sale_id')->on('sale_transactions')->onDelete('cascade');
            $table->foreign('product_id')->references('product_id')->on('products')->onDelete('cascade');
        });

        Schema::table('sale_transactions', function (Blueprint $table) {
            $table->foreign('customer_id')->references('customer_id')->on('customers')->onDelete('set null');
            $table->foreign('processed_by')->references('user_id')->on('users')->onDelete('set null');
        });

        Schema::table('system_logs', function (Blueprint $table) {
            $table->foreign('user_id')->references('user_id')->on('users')->onDelete('cascade');
        });

        Schema::table('users', function (Blueprint $table) {
            $table->foreign('employee_id')->references('employee_id')->on('employees')->onDelete('set null');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('attendance', function (Blueprint $table) {
            $table->dropForeign(['employee_id']);
        });

        Schema::table('installment_accounts', function (Blueprint $table) {
            $table->dropForeign(['customer_id']);
            $table->dropForeign(['sale_id']);
        });

        Schema::table('payments', function (Blueprint $table) {
            $table->dropForeign(['installment_id']);
            $table->dropForeign(['schedule_id']);
            $table->dropForeign(['received_by']);
        });

        Schema::table('payment_schedule', function (Blueprint $table) {
            $table->dropForeign(['installment_id']);
        });

        Schema::table('payroll', function (Blueprint $table) {
            $table->dropForeign(['period_id']);
            $table->dropForeign(['employee_id']);
            $table->dropForeign(['generated_by']);
            $table->dropForeign(['approved_by']);
        });

        Schema::table('payroll_deductions', function (Blueprint $table) {
            $table->dropForeign(['payroll_id']);
        });

        Schema::table('payroll_periods', function (Blueprint $table) {
            $table->dropForeign(['created_by']);
        });

        Schema::table('sale_items', function (Blueprint $table) {
            $table->dropForeign(['sale_id']);
            $table->dropForeign(['product_id']);
        });

        Schema::table('sale_transactions', function (Blueprint $table) {
            $table->dropForeign(['customer_id']);
            $table->dropForeign(['processed_by']);
        });

        Schema::table('system_logs', function (Blueprint $table) {
            $table->dropForeign(['user_id']);
        });

        Schema::table('users', function (Blueprint $table) {
            $table->dropForeign(['employee_id']);
        });
    }
};
