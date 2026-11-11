<?php

namespace App\Services;

use App\Models\PaymentSchedule;
use App\Models\InstallmentAccount;
use App\Models\Product;
use App\Models\Notification;
use App\Models\Attendance;
use App\Models\Employee;
use App\Models\SystemLog;
use Carbon\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

class AutomationService
{
    /**
     * Delete expired entries from Laravel's file cache store.
     *
     * The list/dashboard endpoints use short-lived (1-2s) cache keys that include the data fingerprint,
     * so every data change creates a new set of cache files. The file driver only removes an expired file
     * when that exact key is read again, which never happens for old fingerprints, so the cache directory
     * grew without bound (15k+ files), slowing every cache read/write on Windows.
     */
    public static function pruneExpiredFileCache(int $maxFiles = 50000): int
    {
        try {
            if (config('cache.default') !== 'file') {
                return 0;
            }
            $dir = config('cache.stores.file.path');
            if (!$dir || !is_dir($dir)) {
                return 0;
            }

            $now = time();
            $deleted = 0;
            $scanned = 0;
            $iterator = new \RecursiveIteratorIterator(
                new \RecursiveDirectoryIterator($dir, \FilesystemIterator::SKIP_DOTS),
                \RecursiveIteratorIterator::CHILD_FIRST
            );

            foreach ($iterator as $file) {
                if ($scanned++ >= $maxFiles) {
                    break;
                }
                $path = $file->getPathname();
                if ($file->isDir()) {
                    @rmdir($path); // only succeeds when the directory is empty
                    continue;
                }
                if ($file->getFilename() === '.gitignore') {
                    continue;
                }
                // File cache format: the first 10 bytes are the UNIX expiry timestamp.
                $handle = @fopen($path, 'rb');
                if ($handle === false) {
                    continue;
                }
                $expiry = (int) fread($handle, 10);
                fclose($handle);
                if ($expiry > 0 && $expiry < $now && @unlink($path)) {
                    $deleted++;
                }
            }

            return $deleted;
        } catch (\Throwable $e) {
            return 0;
        }
    }

    /**
     * Run scheduled system automations individually per module (or all when module is null/all),
     * each independently throttled so unrelated features don't run together.
     */
    public static function runAllAutomations(bool $force = false, ?string $module = null): array
    {
        $now = time();
        $mod = $module ? strtolower(trim($module)) : 'all';

        // Map aliases cleanly to specific feature automations
        $target = match ($mod) {
            'installments', 'payment_schedules', 'payments', 'overdue' => 'installments',
            'products', 'inventory' => 'products',
            'attendance', 'employees' => 'attendance',
            'payroll' => 'payroll',
            default => 'all',
        };

        // Backwards-compatible fast skip if full sweep was explicitly throttled
        if ($target === 'all') {
            $lastRun = Cache::get('automation_last_run', 0);
            if (!$force && ($now - $lastRun) < 600) {
                return [
                    'skipped' => true,
                    'message' => 'Automations executed recently (throttled to 600s).',
                    'last_run' => date('Y-m-d H:i:s', $lastRun),
                ];
            }
            Cache::put('automation_last_run', $now, 3600);
        } else {
            $lockKey = "automation_last_run_{$target}";
            $lastModRun = Cache::get($lockKey, 0);
            if (!$force && ($now - $lastModRun) < 600) {
                return [
                    'skipped' => true,
                    'module' => $target,
                    'message' => "Automation for {$target} executed recently (throttled to 600s).",
                    'last_run' => date('Y-m-d H:i:s', $lastModRun),
                ];
            }
            Cache::put($lockKey, $now, 3600);
        }

        // Housekeeping: purge expired file-cache entries after the response is sent (non-blocking for the user).
        if (function_exists('app') && app()->bound('events')) {
            app()->terminating(static function () {
                self::pruneExpiredFileCache();
            });
        }

        $results = [
            'executed_at' => date('Y-m-d H:i:s', $now),
            'module' => $target,
        ];

        if ($target === 'all' || $target === 'installments') {
            $results['overdue_installments'] = self::checkOverdueInstallments();
            Cache::put('automation_last_run_installments', $now, 3600);
        }
        if ($target === 'all' || $target === 'products') {
            $results['inventory_thresholds'] = self::checkInventoryThresholds();
            Cache::put('automation_last_run_products', $now, 3600);
        }
        if ($target === 'all' || $target === 'attendance') {
            $results['attendance_automations'] = self::checkAttendanceAutomations();
            Cache::put('automation_last_run_attendance', $now, 3600);
        }
        if ($target === 'all' || $target === 'payroll') {
            $results['weekly_payday_cutoff'] = \App\Http\Controllers\PayrollController::autoFinalizeWeeklyPaydayCutoff();
            Cache::put('automation_last_run_payroll', $now, 3600);
        }

        return $results;
    }

    /**
     * 1. Automated Payment Due Date & Overdue Account Sync
     */
    public static function checkOverdueInstallments(): array
    {
        $today = date('Y-m-d');
        $threeDays = date('Y-m-d', strtotime('+3 days'));
        $overdueCount = 0;
        $upcomingCount = 0;

        try {
            $schedules = PaymentSchedule::with([
                'installmentAccount.customer',
                'installmentAccount.sale.processedBy.employee'
            ])
            ->whereIn('status', ['Pending', 'Partially Paid'])
            ->get();

            foreach ($schedules as $sched) {
                $inst = $sched->installmentAccount;
                if (!$inst || !$inst->customer_id) continue;

                $branchId = null;
                if ($inst->sale && $inst->sale->processedBy && $inst->sale->processedBy->employee) {
                    $branchId = $inst->sale->processedBy->employee->branch_id;
                }

                // A. Past due date -> Mark as OVERDUE
                if ($sched->due_date < $today && $sched->status !== 'Overdue') {
                    $sched->update(['status' => 'Overdue']);
                    $inst->update(['status' => 'Overdue']);
                    $overdueCount++;

                    $notifData = [
                        'type' => 'overdue_payment_alert',
                        'title' => 'Overdue Installment Account',
                        'message' => "Payment of ₱" . number_format($sched->balance_due ?? $sched->amount, 2) . " for Account {$inst->account_no} was due on {$sched->due_date}.",
                        'module' => 'Installments',
                        'related_id' => $inst->installment_id,
                        'related_type' => 'App\Models\InstallmentAccount',
                        'action_url' => "/installments?id={$inst->installment_id}",
                        'priority' => 'critical',
                    ];

                    NotificationService::sendToAdmins($notifData);
                    NotificationService::sendToStoreAdmins($notifData, $branchId);
                    NotificationService::sendToCustomer($inst->customer_id, $notifData);
                    continue;
                }

                // B. Approaching due (today or within 3 days) -> Send Reminder
                if ($sched->due_date === $today || $sched->due_date === $threeDays) {
                    $alreadySent = Notification::where('user_id', $inst->customer_id)
                        ->where('type', 'upcoming_payment_alert')
                        ->where('related_id', (string)$inst->installment_id)
                        ->whereDate('created_at', $today)
                        ->exists();

                    if (!$alreadySent) {
                        $timeWord = ($sched->due_date === $today) ? 'TODAY' : 'in 3 days';
                        $upcomingCount++;

                        $notifData = [
                            'type' => 'upcoming_payment_alert',
                            'title' => 'Installment Payment Due Soon',
                            'message' => "Reminder: Payment of ₱" . number_format($sched->balance_due ?? $sched->amount, 2) . " for Account {$inst->account_no} is due {$timeWord} ({$sched->due_date}).",
                            'module' => 'Installments',
                            'related_id' => $inst->installment_id,
                            'related_type' => 'App\Models\InstallmentAccount',
                            'action_url' => "/customer/dashboard",
                            'priority' => 'high',
                        ];

                        NotificationService::sendToCustomer($inst->customer_id, $notifData);
                    }
                }
            }
        } catch (\Throwable $e) {
            // Silently capture error
        }

        return ['marked_overdue' => $overdueCount, 'upcoming_reminded' => $upcomingCount];
    }

    /**
     * 2. Automated Inventory Threshold & Low Stock Alerts
     */
    public static function checkInventoryThresholds(): array
    {
        $today = date('Y-m-d');
        $lowStockProducts = 0;

        try {
            $products = Product::where('stock_quantity', '<=', 2)->get();

            foreach ($products as $prod) {
                $alreadyAlerted = Notification::where('type', 'low_stock_alert')
                    ->where('related_id', (string)$prod->product_id)
                    ->whereDate('created_at', $today)
                    ->exists();

                if (!$alreadyAlerted) {
                    $lowStockProducts++;
                    $qty = (int)$prod->stock_quantity;
                    $priority = $qty === 0 ? 'critical' : 'high';
                    $stateText = $qty === 0 ? 'OUT OF STOCK' : "Low stock ({$qty} units remaining)";

                    $notifData = [
                        'type' => 'low_stock_alert',
                        'title' => "Inventory Alert: {$prod->product_name}",
                        'message' => "SKU: {$prod->product_code} is {$stateText}. Reorder recommended.",
                        'module' => 'Inventory',
                        'related_id' => $prod->product_id,
                        'related_type' => 'App\Models\Product',
                        'action_url' => '/products',
                        'priority' => $priority,
                    ];

                    NotificationService::sendToAdmins($notifData);
                    NotificationService::sendToStoreAdmins($notifData);
                }
            }
        } catch (\Throwable $e) {
            // Silently capture error
        }

        return ['low_stock_detected' => $lowStockProducts];
    }

    /**
     * 3. Automated Attendance Status & Cutoff Logging
     */
    public static function checkAttendanceAutomations(): array
    {
        $today = date('Y-m-d');
        $updatedCount = 0;

        try {
            $schedule = AttendanceSchedule::get();
            $cutoffTime = $schedule['schedule_cutoff'] ?? '08:00';
            $currentTime = date('H:i');

            // If morning cutoff has passed, mark records for present employees as Late if scanned after cutoff
            if ($currentTime > $cutoffTime) {
                $records = Attendance::where('attendance_date', $today)
                    ->whereNotNull('time_in')
                    ->where('status', 'Present')
                    ->get();

                foreach ($records as $rec) {
                    if ($rec->time_in && substr($rec->time_in, 0, 5) > $cutoffTime) {
                        $rec->update(['status' => 'Late']);
                        $updatedCount++;
                    }
                }
            }
        } catch (\Throwable $e) {
            // Silently capture error
        }

        return ['attendance_evaluated' => $updatedCount];
    }
}
