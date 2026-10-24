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
     * Run all scheduled system automations with throttling (max once per minute).
     */
    public static function runAllAutomations(bool $force = false): array
    {
        $lastRun = Cache::get('automation_last_run', 0);
        $now = time();

        if (!$force && ($now - $lastRun) < 600) {
            return [
                'skipped' => true,
                'message' => 'Automations executed recently (throttled to 600s).',
                'last_run' => date('Y-m-d H:i:s', $lastRun),
            ];
        }

        Cache::put('automation_last_run', $now, 3600);

        $results = [
            'overdue_installments' => self::checkOverdueInstallments(),
            'inventory_thresholds' => self::checkInventoryThresholds(),
            'attendance_automations' => self::checkAttendanceAutomations(),
            'executed_at' => date('Y-m-d H:i:s', $now),
        ];

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
            $cutoffTime = $schedule['schedule_cutoff'] ?? '08:05';
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
