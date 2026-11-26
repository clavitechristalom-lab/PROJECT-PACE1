<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Fix qr_requests table integrity, restore missing foreign keys,
     * add branch_id FK to branch_profiles, and reconcile employee QR status columns.
     */
    public function up(): void
    {
        if (!Schema::hasTable('qr_requests')) {
            Schema::create('qr_requests', function (Blueprint $table) {
                $table->bigIncrements('request_id');
                $table->string('request_code')->unique();
                $table->unsignedBigInteger('user_id')->index();
                $table->unsignedBigInteger('employee_id')->index();
                $table->string('role')->default('Employee');
                $table->unsignedBigInteger('branch_id')->nullable()->index();
                $table->string('branch')->nullable();
                $table->string('department')->nullable();
                $table->string('position')->nullable();
                $table->string('status')->default('PENDING')->index();
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
            });
        }

        // 1. Add branch_id column to qr_requests if missing
        Schema::table('qr_requests', function (Blueprint $table) {
            if (!Schema::hasColumn('qr_requests', 'branch_id')) {
                $table->unsignedBigInteger('branch_id')->nullable()->after('role');
                $table->index('branch_id', 'qr_requests_branch_id_index');
            }
        });

        // 2. Clean any orphaned references before enforcing foreign keys
        DB::statement("
            DELETE qr FROM qr_requests qr
            LEFT JOIN users u ON qr.user_id = u.user_id
            WHERE u.user_id IS NULL
        ");
        DB::statement("
            DELETE qr FROM qr_requests qr
            LEFT JOIN employees e ON qr.employee_id = e.employee_id
            WHERE e.employee_id IS NULL
        ");
        foreach (['reviewed_by', 'approved_by', 'rejected_by'] as $col) {
            DB::statement("
                UPDATE qr_requests qr
                LEFT JOIN users u ON qr.{$col} = u.user_id
                SET qr.{$col} = NULL
                WHERE qr.{$col} IS NOT NULL AND u.user_id IS NULL
            ");
        }
        DB::statement("
            UPDATE qr_requests qr
            LEFT JOIN branch_profiles bp ON qr.branch_id = bp.id
            SET qr.branch_id = NULL
            WHERE qr.branch_id IS NOT NULL AND bp.id IS NULL
        ");

        // 3. Backfill branch_id on existing qr_requests rows from linked employee or branch name
        DB::statement("
            UPDATE qr_requests qr
            INNER JOIN employees e ON qr.employee_id = e.employee_id
            SET qr.branch_id = e.branch_id
            WHERE qr.branch_id IS NULL AND e.branch_id IS NOT NULL
        ");
        DB::statement("
            UPDATE qr_requests qr
            INNER JOIN branch_profiles bp ON LOWER(TRIM(qr.branch)) = LOWER(TRIM(bp.name))
            SET qr.branch_id = bp.id
            WHERE qr.branch_id IS NULL AND qr.branch IS NOT NULL
        ");

        // 4. Ensure all 6 foreign keys exist on qr_requests
        $foreignKeys = [
            ['user_id',     'users',           'user_id',     'cascade',  'qr_requests_user_id_foreign'],
            ['employee_id', 'employees',       'employee_id', 'cascade',  'qr_requests_employee_id_foreign'],
            ['branch_id',   'branch_profiles', 'id',          'set null', 'qr_requests_branch_id_foreign'],
            ['reviewed_by', 'users',           'user_id',     'set null', 'qr_requests_reviewed_by_foreign'],
            ['approved_by', 'users',           'user_id',     'set null', 'qr_requests_approved_by_foreign'],
            ['rejected_by', 'users',           'user_id',     'set null', 'qr_requests_rejected_by_foreign'],
        ];

        foreach ($foreignKeys as [$col, $refTable, $refCol, $onDelete, $fkName]) {
            if (!$this->hasForeignKey('qr_requests', $col)) {
                Schema::table('qr_requests', function (Blueprint $table) use ($col, $refTable, $refCol, $onDelete, $fkName) {
                    $fk = $table->foreign($col, $fkName)->references($refCol)->on($refTable);
                    if ($onDelete === 'cascade') {
                        $fk->cascadeOnDelete();
                    } else {
                        $fk->nullOnDelete();
                    }
                });
            }
        }

        // 5. Fix inconsistent employee QR flags (qr_active = 1 when qr_token is NULL)
        if (Schema::hasTable('employees')) {
            DB::table('employees')
                ->where(function ($q) {
                    $q->whereNull('qr_token')->orWhere('qr_token', '');
                })
                ->where('qr_active', 1)
                ->update(['qr_active' => 0]);

            // Sync account_status & qr_request_status on employees who already have issued QR tokens
            $issuedEmployees = DB::table('employees as e')
                ->join('users as u', 'u.employee_id', '=', 'e.employee_id')
                ->leftJoin('branch_profiles as bp', 'bp.id', '=', 'e.branch_id')
                ->whereNotNull('e.qr_token')
                ->where('e.qr_token', '!=', '')
                ->select([
                    'e.employee_id',
                    'e.branch_id',
                    'e.branch',
                    'bp.name as branch_profile_name',
                    'e.department',
                    'e.position',
                    'e.qr_generated_at',
                    'e.qr_active',
                    'e.account_verified',
                    'u.user_id',
                    'u.role',
                    'u.account_verified_by',
                ])
                ->get();

            $defaultAdminId = DB::table('users')->where('role', 'Administrator')->orderBy('user_id')->value('user_id');

            foreach ($issuedEmployees as $emp) {
                $approverId = $emp->account_verified_by ?: $defaultAdminId;
                $branchName = $emp->branch_profile_name ?: $emp->branch;
                $issuedAt = $emp->qr_generated_at ?: now();

                // Update employee QR status columns if present
                $empUpdates = [];
                if (Schema::hasColumn('employees', 'account_status')) {
                    $empUpdates['account_status'] = $emp->account_verified ? 'VERIFIED' : 'UNVERIFIED';
                }
                if (Schema::hasColumn('employees', 'qr_request_status')) {
                    $empUpdates['qr_request_status'] = 'APPROVED';
                }
                if (Schema::hasColumn('employees', 'qr_issued_by') && $approverId) {
                    $empUpdates['qr_issued_by'] = $approverId;
                }
                if (!empty($empUpdates)) {
                    DB::table('employees')->where('employee_id', $emp->employee_id)->update($empUpdates);
                }

                // Backfill missing APPROVED qr_requests record for employees with issued QR tokens
                $exists = DB::table('qr_requests')
                    ->where('employee_id', $emp->employee_id)
                    ->where('user_id', $emp->user_id)
                    ->exists();

                if (!$exists) {
                    $num = DB::table('qr_requests')->count() + 1;
                    $reqCode = 'REQ-' . str_pad((string)$num, 4, '0', STR_PAD_LEFT);
                    while (DB::table('qr_requests')->where('request_code', $reqCode)->exists()) {
                        $num++;
                        $reqCode = 'REQ-' . str_pad((string)$num, 4, '0', STR_PAD_LEFT);
                    }

                    DB::table('qr_requests')->insert([
                        'request_code' => $reqCode,
                        'user_id' => $emp->user_id,
                        'employee_id' => $emp->employee_id,
                        'role' => $emp->role ?: 'Employee',
                        'branch_id' => $emp->branch_id,
                        'branch' => $branchName,
                        'department' => $emp->department ?: 'Operations',
                        'position' => $emp->position ?: ($emp->role ?: 'Employee'),
                        'status' => 'APPROVED',
                        'checklist' => json_encode([
                            'identity_verified' => true,
                            'employee_info_verified' => true,
                            'position_verified' => true,
                            'department_verified' => true,
                            'branch_verified' => true,
                            'account_active' => true,
                            'attendance_authorized' => true,
                        ]),
                        'reviewed_by' => $approverId,
                        'reviewed_at' => $issuedAt,
                        'approved_by' => $approverId,
                        'approved_at' => $issuedAt,
                        'rejected_by' => null,
                        'rejected_at' => null,
                        'rejection_reason' => null,
                        'ip_address' => '127.0.0.1',
                        'user_agent' => 'System Reconciliation',
                        'created_at' => $issuedAt,
                        'updated_at' => $issuedAt,
                    ]);
                }
            }
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('qr_requests') && Schema::hasColumn('qr_requests', 'branch_id')) {
            try {
                Schema::table('qr_requests', function (Blueprint $table) {
                    $table->dropForeign('qr_requests_branch_id_foreign');
                });
            } catch (\Throwable $e) {}
            Schema::table('qr_requests', function (Blueprint $table) {
                $table->dropColumn('branch_id');
            });
        }
    }

    private function hasForeignKey(string $table, string $column): bool
    {
        $rows = DB::select(
            "SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = ?
               AND COLUMN_NAME = ?
               AND REFERENCED_TABLE_NAME IS NOT NULL",
            [$table, $column]
        );
        return count($rows) > 0;
    }
};
