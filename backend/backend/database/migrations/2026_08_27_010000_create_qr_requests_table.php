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
        // 1. Create qr_requests table
        if (!Schema::hasTable('qr_requests')) {
            Schema::create('qr_requests', function (Blueprint $table) {
                $table->bigIncrements('request_id');
                $table->string('request_code')->unique()->index();
                $table->unsignedBigInteger('user_id')->index();
                $table->unsignedBigInteger('employee_id')->index();
                $table->string('role')->default('Employee');
                $table->string('branch')->nullable();
                $table->string('department')->nullable();
                $table->string('position')->nullable();
                $table->string('status')->default('PENDING')->index(); // PENDING, UNDER_REVIEW, APPROVED, REJECTED
                $table->json('checklist')->nullable();
                $table->unsignedBigInteger('reviewed_by')->nullable();
                $table->dateTime('reviewed_at')->nullable();
                $table->unsignedBigInteger('approved_by')->nullable();
                $table->dateTime('approved_at')->nullable();
                $table->unsignedBigInteger('rejected_by')->nullable();
                $table->dateTime('rejected_at')->nullable();
                $table->text('rejection_reason')->nullable();
                $table->string('ip_address')->nullable();
                $table->text('user_agent')->nullable();
                $table->timestamps();

                $table->foreign('user_id')->references('user_id')->on('users')->onDelete('cascade');
                $table->foreign('employee_id')->references('employee_id')->on('employees')->onDelete('cascade');
                $table->foreign('reviewed_by')->references('user_id')->on('users')->onDelete('set null');
                $table->foreign('approved_by')->references('user_id')->on('users')->onDelete('set null');
                $table->foreign('rejected_by')->references('user_id')->on('users')->onDelete('set null');
            });
        }

        // 2. Add account_status, qr_request_status, qr_issued_by, qr_rejection_reason to employees table
        Schema::table('employees', function (Blueprint $table) {
            if (!Schema::hasColumn('employees', 'account_status')) {
                $table->string('account_status')->default('UNVERIFIED')->after('account_verified_at');
            }
            if (!Schema::hasColumn('employees', 'qr_request_status')) {
                $table->string('qr_request_status')->default('NOT_REQUESTED')->after('account_status');
            }
            if (!Schema::hasColumn('employees', 'qr_issued_by')) {
                $table->unsignedBigInteger('qr_issued_by')->nullable()->after('qr_generated_at');
                $table->foreign('qr_issued_by')->references('user_id')->on('users')->onDelete('set null');
            }
            if (!Schema::hasColumn('employees', 'qr_rejection_reason')) {
                $table->text('qr_rejection_reason')->nullable()->after('qr_issued_by');
            }
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('employees', function (Blueprint $table) {
            if (Schema::hasColumn('employees', 'qr_issued_by')) {
                $table->dropForeign(['qr_issued_by']);
                $table->dropColumn('qr_issued_by');
            }
            if (Schema::hasColumn('employees', 'qr_rejection_reason')) {
                $table->dropColumn('qr_rejection_reason');
            }
            if (Schema::hasColumn('employees', 'qr_request_status')) {
                $table->dropColumn('qr_request_status');
            }
            if (Schema::hasColumn('employees', 'account_status')) {
                $table->dropColumn('account_status');
            }
        });

        Schema::dropIfExists('qr_requests');
    }
};
