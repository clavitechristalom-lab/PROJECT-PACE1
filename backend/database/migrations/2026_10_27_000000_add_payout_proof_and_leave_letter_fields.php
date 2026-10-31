<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // 1. Employee Payout Preferences (Account Names for E-Wallet and Online Bank)
        if (Schema::hasTable('employees')) {
            Schema::table('employees', function (Blueprint $table) {
                if (!Schema::hasColumn('employees', 'ewallet_account_name')) {
                    $table->string('ewallet_account_name')->nullable()->after('ewallet_provider');
                }
                if (!Schema::hasColumn('employees', 'bank_account_name')) {
                    $table->string('bank_account_name')->nullable()->after('bank_name');
                }
            });
        }

        // 2. Payroll Payout Method & Proof of Payment
        if (Schema::hasTable('payroll')) {
            Schema::table('payroll', function (Blueprint $table) {
                if (!Schema::hasColumn('payroll', 'payout_method')) {
                    $table->string('payout_method')->nullable()->after('status');
                }
                if (!Schema::hasColumn('payroll', 'proof_of_payment')) {
                    $table->string('proof_of_payment')->nullable()->after('payout_method');
                }
            });
        }

        // 3. Support Messages / Message Reports (Excuse & Leave Letters)
        if (Schema::hasTable('support_messages')) {
            try {
                $driver = DB::getDriverName();
                if ($driver === 'mysql') {
                    DB::statement('ALTER TABLE support_messages MODIFY customer_id BIGINT UNSIGNED NULL');
                }
            } catch (\Throwable $e) {
                // Safe fallback if already nullable
            }

            Schema::table('support_messages', function (Blueprint $table) {
                if (!Schema::hasColumn('support_messages', 'employee_id')) {
                    $table->unsignedBigInteger('employee_id')->nullable()->after('customer_id')->index();
                }
                if (!Schema::hasColumn('support_messages', 'branch_id')) {
                    $table->unsignedBigInteger('branch_id')->nullable()->after('employee_id')->index();
                }
                if (!Schema::hasColumn('support_messages', 'message_type')) {
                    $table->string('message_type', 50)->default('customer_support')->after('branch_id')->index();
                }
                if (!Schema::hasColumn('support_messages', 'category')) {
                    $table->string('category', 100)->nullable()->after('message_type')->index();
                }
                if (!Schema::hasColumn('support_messages', 'from_date')) {
                    $table->date('from_date')->nullable()->after('category');
                }
                if (!Schema::hasColumn('support_messages', 'to_date')) {
                    $table->date('to_date')->nullable()->after('from_date');
                }
                if (!Schema::hasColumn('support_messages', 'total_days')) {
                    $table->unsignedInteger('total_days')->default(1)->after('to_date');
                }
                if (!Schema::hasColumn('support_messages', 'reason')) {
                    $table->text('reason')->nullable()->after('to_date');
                }
                if (!Schema::hasColumn('support_messages', 'attachment_path')) {
                    $table->string('attachment_path')->nullable()->after('message');
                }
                if (!Schema::hasColumn('support_messages', 'is_read')) {
                    $table->boolean('is_read')->default(false)->after('status')->index();
                }
                if (!Schema::hasColumn('support_messages', 'reviewed_by')) {
                    $table->unsignedBigInteger('reviewed_by')->nullable()->after('responded_at');
                }
                if (!Schema::hasColumn('support_messages', 'reviewed_at')) {
                    $table->timestamp('reviewed_at')->nullable()->after('reviewed_by');
                }
                if (!Schema::hasColumn('support_messages', 'admin_remarks')) {
                    $table->text('admin_remarks')->nullable()->after('reviewed_at');
                }
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('employees')) {
            Schema::table('employees', function (Blueprint $table) {
                $cols = [];
                if (Schema::hasColumn('employees', 'ewallet_account_name')) $cols[] = 'ewallet_account_name';
                if (Schema::hasColumn('employees', 'bank_account_name')) $cols[] = 'bank_account_name';
                if (!empty($cols)) $table->dropColumn($cols);
            });
        }

        if (Schema::hasTable('payroll')) {
            Schema::table('payroll', function (Blueprint $table) {
                $cols = [];
                if (Schema::hasColumn('payroll', 'payout_method')) $cols[] = 'payout_method';
                if (Schema::hasColumn('payroll', 'proof_of_payment')) $cols[] = 'proof_of_payment';
                if (!empty($cols)) $table->dropColumn($cols);
            });
        }

        if (Schema::hasTable('support_messages')) {
            Schema::table('support_messages', function (Blueprint $table) {
                $cols = [
                    'employee_id', 'branch_id', 'message_type', 'category',
                    'from_date', 'to_date', 'reason', 'attachment_path',
                    'is_read', 'reviewed_by', 'reviewed_at', 'admin_remarks'
                ];
                $toDrop = [];
                foreach ($cols as $col) {
                    if (Schema::hasColumn('support_messages', $col)) {
                        $toDrop[] = $col;
                    }
                }
                if (!empty($toDrop)) {
                    $table->dropColumn($toDrop);
                }
            });
        }
    }
};
