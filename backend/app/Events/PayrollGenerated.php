<?php

namespace App\Events;

use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class PayrollGenerated implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public array $payload;
    public array $branchIds;
    public array $employeeUserIds;

    public function __construct(array $payload, array $branchIds = [], array $employeeUserIds = [])
    {
        $this->payload = $payload;
        $this->branchIds = array_values(array_unique(array_filter(array_map('intval', $branchIds))));
        $this->employeeUserIds = array_values(array_unique(array_filter(array_map('intval', $employeeUserIds))));
    }

    public function broadcastOn(): array
    {
        $channels = [new PrivateChannel('admin.global')];
        foreach ($this->branchIds as $bid) {
            $channels[] = new PrivateChannel("branch.{$bid}");
        }
        foreach ($this->employeeUserIds as $uid) {
            $channels[] = new PrivateChannel("employee.{$uid}");
        }
        return $channels;
    }

    public function broadcastAs(): string
    {
        return 'payroll.generated';
    }

    public function broadcastWith(): array
    {
        return array_merge([
            'event' => 'PayrollGenerated',
            'modules' => ['payroll', 'dashboard', 'reports', 'notifications'],
            'branch_ids' => $this->branchIds,
            'timestamp' => now()->toIso8601String(),
        ], $this->payload);
    }
}
