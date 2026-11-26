<?php

namespace App\Events;

use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class CashPaymentWorkflowUpdated implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public array $payload;
    public ?int $branchId;
    public ?int $customerId;
    public array $employeeUserIds;

    public function __construct(
        array $payload,
        ?int $branchId = null,
        ?int $customerId = null,
        array $employeeUserIds = []
    ) {
        $this->payload = $payload;
        $this->branchId = $branchId;
        $this->customerId = $customerId;
        $this->employeeUserIds = array_values(array_unique(array_filter(array_map('intval', $employeeUserIds))));
    }

    public function broadcastOn(): array
    {
        $channels = [new PrivateChannel('admin.global')];
        if ($this->branchId) {
            $channels[] = new PrivateChannel("branch.{$this->branchId}");
        }
        foreach ($this->employeeUserIds as $uid) {
            $channels[] = new PrivateChannel("employee.{$uid}");
        }
        if ($this->customerId) {
            $channels[] = new PrivateChannel("customer.{$this->customerId}");
        }
        return $channels;
    }

    public function broadcastAs(): string
    {
        return 'payment.workflow.updated';
    }

    public function broadcastWith(): array
    {
        return array_merge([
            'event' => 'CashPaymentWorkflowUpdated',
            'modules' => ['payments', 'installments', 'customer_installments', 'payment_schedules', 'customers', 'transactions', 'dashboard', 'reports', 'notifications'],
            'branch_id' => $this->branchId,
            'customer_id' => $this->customerId,
            'timestamp' => now()->toIso8601String(),
        ], $this->payload);
    }
}
