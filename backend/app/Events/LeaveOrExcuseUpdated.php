<?php

namespace App\Events;

use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class LeaveOrExcuseUpdated implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public array $payload;
    public ?int $branchId;
    public ?int $employeeUserId;

    public function __construct(array $payload, ?int $branchId = null, ?int $employeeUserId = null)
    {
        $this->payload = $payload;
        $this->branchId = $branchId;
        $this->employeeUserId = $employeeUserId;
    }

    public function broadcastOn(): array
    {
        $channels = [new PrivateChannel('admin.global')];
        if ($this->branchId) {
            $channels[] = new PrivateChannel("branch.{$this->branchId}");
        }
        if ($this->employeeUserId) {
            $channels[] = new PrivateChannel("employee.{$this->employeeUserId}");
        }
        return $channels;
    }

    public function broadcastAs(): string
    {
        return 'leave.updated';
    }

    public function broadcastWith(): array
    {
        return array_merge([
            'event' => 'LeaveOrExcuseUpdated',
            'modules' => ['employee_letters', 'attendance', 'employees', 'notifications', 'dashboard'],
            'branch_id' => $this->branchId,
            'employee_user_id' => $this->employeeUserId,
            'timestamp' => now()->toIso8601String(),
        ], $this->payload);
    }
}
