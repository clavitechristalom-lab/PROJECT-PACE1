<?php

namespace App\Events;

use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class AttendanceLogged implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public array $payload;
    public ?int $branchId;
    public array $employeeUserIds;

    public function __construct(array $payload, ?int $branchId = null, array $employeeUserIds = [])
    {
        $this->payload = $payload;
        $this->branchId = $branchId;
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
        return $channels;
    }

    public function broadcastAs(): string
    {
        return 'attendance.logged';
    }

    public function broadcastWith(): array
    {
        return array_merge([
            'event' => 'AttendanceLogged',
            'modules' => ['attendance', 'employees', 'qr_monitoring', 'dashboard', 'reports'],
            'branch_id' => $this->branchId,
            'timestamp' => now()->toIso8601String(),
        ], $this->payload);
    }
}
