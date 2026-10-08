<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Database restructure & integrity pass.
 *
 *  1. Removes unused placeholder tables.
 *  2. Adds every missing foreign key (orphaned values are cleaned first).
 *  3. Preserves the audit trail (system_logs no longer cascade-delete with users).
 *  4. Adds business-rule unique constraints.
 *  5. Adds indexes on columns used for filtering / sorting.
 *
 * Safe to run on an existing database: each step checks the current state first.
 */
return new class extends Migration
{
    /** [table, column, foreign_table, foreign_column, on_delete] */
    private array $foreignKeys = [
        ['attendance',           'scanned_by',          'users',           'user_id',     'set null'],
        ['attendance_scan_logs', 'scanned_by',          'users',           'user_id',     'set null'],
        ['backup_logs',          'created_by',          'users',           'user_id',     'set null'],
        ['branch_profiles',      'manager_id',          'users',           'user_id',     'set null'],
        ['qr_requests',          'user_id',             'users',           'user_id',     'cascade'],
        ['qr_requests',          'employee_id',         'employees',       'employee_id', 'set null'],
        ['qr_requests',          'reviewed_by',         'users',           'user_id',     'set null'],
        ['qr_requests',          'approved_by',         'users',           'user_id',     'set null'],
        ['qr_requests',          'rejected_by',         'users',           'user_id',     'set null'],
        ['reports',              'branch_id',           'branch_profiles', 'id',          'cascade'],
        ['reports',              'created_by',          'users',           'user_id',     'cascade'],
        ['reports',              'reviewed_by',         'users',           'user_id',     'set null'],
        ['support_messages',     'responded_by',        'users',           'user_id',     'set null'],
        ['users',                'account_verified_by', 'users',           'user_id',     'set null'],
    ];

    /** [table, [columns], name] */
    private array $uniques = [
        ['attendance',  ['employee_id', 'attendance_date'], 'attendance_employee_date_unique'],
        ['payroll',     ['period_id', 'employee_id'],       'payroll_period_employee_unique'],
        ['qr_requests', ['request_code'],                   'qr_requests_request_code_unique'],
    ];

    /** [table, [columns]] */
    private array $indexes = [
        ['attendance',           ['attendance_date']],
        ['attendance',           ['status']],
        ['attendance_scan_logs', ['scan_time']],
        ['attendance_scan_logs', ['status']],
        ['attendance_scan_logs', ['branch']],
        ['backup_logs',          ['status']],
        ['branch_profiles',      ['status']],
        ['customers',            ['status']],
        ['customers',            ['last_name', 'first_name']],
        ['employees',            ['status']],
        ['employees',            ['last_name', 'first_name']],
        ['installment_accounts', ['status']],
        ['payment_schedule',     ['due_date']],
        ['payment_schedule',     ['status']],
        ['payments',             ['payment_date']],
        ['payments',             ['status']],
        ['payroll',              ['status']],
        ['payroll_periods',      ['status']],
        ['payroll_periods',      ['start_date', 'end_date']],
        ['products',             ['category']],
        ['products',             ['status']],
        ['qr_requests',          ['status']],
        ['reports',              ['status']],
        ['sale_transactions',    ['sale_date']],
        ['sale_transactions',    ['status']],
        ['support_messages',     ['status']],
        ['system_logs',          ['module']],
        ['system_logs',          ['created_at']],
    ];

    public function up(): void
    {
        // 1. Unused placeholder tables (no columns, no code references)
        Schema::dropIfExists('installment_payroll_attendance_views');
        Schema::dropIfExists('support_chats');

        // 2. Missing foreign keys
        foreach ($this->foreignKeys as [$table, $column, $refTable, $refColumn, $onDelete]) {
            if (!Schema::hasTable($table) || !Schema::hasColumn($table, $column) || $this->hasForeignKey($table, $column)) {
                continue;
            }
            $this->cleanOrphans($table, $column, $refTable, $refColumn);
            Schema::table($table, function (Blueprint $t) use ($column, $refTable, $refColumn, $onDelete) {
                $fk = $t->foreign($column)->references($refColumn)->on($refTable);
                $onDelete === 'cascade' ? $fk->cascadeOnDelete() : $fk->nullOnDelete();
            });
        }

        // 3. Keep audit trail when a user is deleted (cascade -> set null)
        if ($this->foreignKeyAction('system_logs', 'user_id') === 'cascade') {
            Schema::table('system_logs', function (Blueprint $t) {
                $t->dropForeign(['user_id']);
                $t->foreign('user_id')->references('user_id')->on('users')->nullOnDelete();
            });
        }

        // 4. Business-rule unique constraints
        foreach ($this->uniques as [$table, $columns, $name]) {
            if ($this->hasIndex($table, $columns, true)) continue;
            $this->removeDuplicates($table, $columns);
            Schema::table($table, fn (Blueprint $t) => $t->unique($columns, $name));
        }

        // 5. Filtering / sorting indexes
        foreach ($this->indexes as [$table, $columns]) {
            if (!Schema::hasTable($table) || $this->hasIndex($table, $columns)) continue;
            Schema::table($table, fn (Blueprint $t) => $t->index($columns));
        }
    }

    public function down(): void
    {
        foreach (array_reverse($this->indexes) as [$table, $columns]) {
            $name = $table . '_' . implode('_', $columns) . '_index';
            if ($this->indexNameExists($table, $name)) {
                Schema::table($table, fn (Blueprint $t) => $t->dropIndex($name));
            }
        }
        foreach (array_reverse($this->uniques) as [$table, , $name]) {
            if ($this->indexNameExists($table, $name)) {
                Schema::table($table, fn (Blueprint $t) => $t->dropUnique($name));
            }
        }
        if ($this->foreignKeyAction('system_logs', 'user_id') === 'set null') {
            Schema::table('system_logs', function (Blueprint $t) {
                $t->dropForeign(['user_id']);
                $t->foreign('user_id')->references('user_id')->on('users')->cascadeOnDelete();
            });
        }
        foreach (array_reverse($this->foreignKeys) as [$table, $column]) {
            if ($this->hasForeignKey($table, $column)) {
                Schema::table($table, fn (Blueprint $t) => $t->dropForeign([$column]));
            }
        }
        if (!Schema::hasTable('support_chats')) {
            Schema::create('support_chats', function (Blueprint $t) {
                $t->id();
                $t->timestamps();
            });
        }
        if (!Schema::hasTable('installment_payroll_attendance_views')) {
            Schema::create('installment_payroll_attendance_views', function (Blueprint $t) {
                $t->id();
                $t->timestamps();
            });
        }
    }

    // ─── Helpers ────────────────────────────────────────────────────────────

    private function hasForeignKey(string $table, string $column): bool
    {
        return $this->foreignKeyAction($table, $column) !== null;
    }

    private function foreignKeyAction(string $table, string $column): ?string
    {
        if (!Schema::hasTable($table)) return null;
        foreach (Schema::getForeignKeys($table) as $fk) {
            if ($fk['columns'] === [$column]) return strtolower($fk['on_delete'] ?? '');
        }
        return null;
    }

    private function hasIndex(string $table, array $columns, bool $uniqueOnly = false): bool
    {
        foreach (Schema::getIndexes($table) as $ix) {
            if ($ix['columns'] === $columns && (!$uniqueOnly || $ix['unique'] || $ix['primary'])) return true;
        }
        return false;
    }

    private function indexNameExists(string $table, string $name): bool
    {
        if (!Schema::hasTable($table)) return false;
        foreach (Schema::getIndexes($table) as $ix) {
            if ($ix['name'] === $name) return true;
        }
        return false;
    }

    /** Null-out (or delete, for NOT NULL columns) values that point to missing rows. */
    private function cleanOrphans(string $table, string $column, string $refTable, string $refColumn): void
    {
        if ($table === $refTable) {
            return; // Skip self-referencing tables to avoid MySQL error 1093
        }

        $validIds = DB::table($refTable)->pluck($refColumn)->all();
        $orphans = DB::table($table)
            ->whereNotNull($column)
            ->whereNotIn($column, $validIds ?: [0]);

        $nullable = collect(Schema::getColumns($table))->firstWhere('name', $column)['nullable'] ?? true;
        $nullable ? $orphans->update([$column => null]) : $orphans->delete();
    }

    /** Keep the newest row for each duplicate key group. */
    private function removeDuplicates(string $table, array $columns): void
    {
        $pk = collect(Schema::getIndexes($table))->firstWhere('primary', true)['columns'][0];
        $dupes = DB::table($table)
            ->select($columns)
            ->selectRaw("MAX(`$pk`) as keep_id")
            ->groupBy($columns)
            ->havingRaw('COUNT(*) > 1')
            ->get();

        foreach ($dupes as $d) {
            $q = DB::table($table)->where($pk, '!=', $d->keep_id);
            foreach ($columns as $c) $q->where($c, $d->$c);
            $q->delete();
        }
    }
};
