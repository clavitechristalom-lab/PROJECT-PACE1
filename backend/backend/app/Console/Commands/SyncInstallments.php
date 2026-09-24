<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;

class SyncInstallments extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'installments:sync';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Automatically detect due and overdue installment payments and send notifications.';

    /**
     * Execute the console command.
     */
    public function handle()
    {
        $today = date('Y-m-d');
        $threeDaysFromNow = date('Y-m-d', strtotime('+3 days'));

        $this->info("Syncing installments for {$today}...");

        $schedules = \App\Models\PaymentSchedule::with(['installmentAccount.customer', 'installmentAccount.sale.processedBy.employee'])
            ->whereIn('status', ['Pending', 'Partially Paid'])
            ->get();

        $dueCount = 0;
        $overdueCount = 0;

        foreach ($schedules as $sched) {
            $inst = $sched->installmentAccount;
            if (!$inst || !$inst->customer_id) continue;
            
            $accBranch = 'Main Branch';
            if ($inst->sale && $inst->sale->processedBy && $inst->sale->processedBy->employee) {
                $accBranch = $inst->sale->processedBy->employee->branch_id ?: null;
            }

            // OVERDUE CHECK
            if ($sched->due_date < $today && $sched->status !== 'Overdue') {
                $sched->update(['status' => 'Overdue']);
                $inst->update(['status' => 'Overdue']);
                
                $overdueCount++;

                $notifData = [
                    'type' => 'overdue_payment_alert',
                    'title' => 'Overdue Installment Payment',
                    'message' => "Payment of ₱" . number_format($sched->balance_due, 2) . " for Account {$inst->account_no} was due on {$sched->due_date}.",
                    'module' => 'Installments',
                    'related_id' => $inst->installment_id,
                    'related_type' => 'App\Models\InstallmentAccount',
                    'action_url' => "/installments?id={$inst->installment_id}",
                    'priority' => 'critical',
                ];

                \App\Services\NotificationService::sendToAdmins($notifData);
                \App\Services\NotificationService::sendToStoreAdmins($notifData, $accBranch);
                \App\Services\NotificationService::sendToCustomer($inst->customer_id, $notifData);
                continue;
            }

            // APPROACHING DUE / DUE TODAY CHECK
            if ($sched->due_date === $threeDaysFromNow || $sched->due_date === $today) {
                // Prevent duplicate notifications for the same schedule on the same day
                $alreadyNotified = \App\Models\Notification::where('type', 'upcoming_payment_alert')
                    ->where('related_id', $inst->installment_id)
                    ->whereDate('created_at', $today)
                    ->exists();

                if (!$alreadyNotified) {
                    $dueCount++;
                    $timeWord = ($sched->due_date === $today) ? "TODAY" : "in 3 days";
                    
                    $notifData = [
                        'type' => 'upcoming_payment_alert',
                        'title' => 'Installment Payment Due Soon',
                        'message' => "Reminder: Payment of ₱" . number_format($sched->balance_due, 2) . " for Account {$inst->account_no} is due {$timeWord} ({$sched->due_date}).",
                        'module' => 'Installments',
                        'related_id' => $inst->installment_id,
                        'related_type' => 'App\Models\InstallmentAccount',
                        'action_url' => "/installments?id={$inst->installment_id}",
                        'priority' => 'high',
                    ];

                    \App\Services\NotificationService::sendToCustomer($inst->customer_id, $notifData);
                }
            }
        }

        $this->info("Completed. Marked {$overdueCount} as overdue, sent {$dueCount} upcoming reminders.");
    }
}
