<?php

namespace App\Events;

use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class SalesTransactionCreated implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public array $payload;
    public ?int $branchId;
    public ?int $customerId;

    public function __construct(array $payload, ?int $branchId = null, ?int $customerId = null)
    {
        $this->payload = $payload;
        $this->branchId = $branchId;
        $this->customerId = $customerId;
    }

    public function broadcastOn(): array
    {
        $channels = [new PrivateChannel('admin.global')];
        if ($this->branchId) {
            $channels[] = new PrivateChannel("branch.{$this->branchId}");
        }
        if ($this->customerId) {
            $channels[] = new PrivateChannel("customer.{$this->customerId}");
        }
        return $channels;
    }

    public function broadcastAs(): string
    {
        return 'sales.created';
    }

    public function broadcastWith(): array
    {
        return array_merge([
            'event' => 'SalesTransactionCreated',
            'modules' => ['sales', 'products', 'customers', 'transactions', 'dashboard', 'reports'],
            'branch_id' => $this->branchId,
            'customer_id' => $this->customerId,
            'timestamp' => now()->toIso8601String(),
        ], $this->payload);
    }
}
