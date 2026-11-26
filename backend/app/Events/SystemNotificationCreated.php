<?php

namespace App\Events;

use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class SystemNotificationCreated implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public array $payload;
    public ?int $targetUserId;
    public ?int $targetCustomerId;
    public ?int $branchId;
    public bool $adminGlobal;

    public function __construct(
        array $payload,
        ?int $targetUserId = null,
        ?int $targetCustomerId = null,
        ?int $branchId = null,
        bool $adminGlobal = false
    ) {
        $this->payload = $payload;
        $this->targetUserId = $targetUserId;
        $this->targetCustomerId = $targetCustomerId;
        $this->branchId = $branchId;
        $this->adminGlobal = $adminGlobal;
    }

    public function broadcastOn(): array
    {
        $channels = [];
        if ($this->adminGlobal) {
            $channels[] = new PrivateChannel('admin.global');
        }
        if ($this->branchId) {
            $channels[] = new PrivateChannel("branch.{$this->branchId}");
        }
        if ($this->targetUserId) {
            $channels[] = new PrivateChannel("employee.{$this->targetUserId}");
        }
        if ($this->targetCustomerId) {
            $channels[] = new PrivateChannel("customer.{$this->targetCustomerId}");
        }
        return $channels;
    }

    public function broadcastAs(): string
    {
        return 'notification.created';
    }

    public function broadcastWith(): array
    {
        return array_merge([
            'event' => 'SystemNotificationCreated',
            'modules' => ['notifications'],
            'timestamp' => now()->toIso8601String(),
        ], $this->payload);
    }
}
