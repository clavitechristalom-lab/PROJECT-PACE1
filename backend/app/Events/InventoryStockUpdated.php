<?php

namespace App\Events;

use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class InventoryStockUpdated implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public array $payload;
    public array $branchIds;

    public function __construct(array $payload, array $branchIds = [])
    {
        $this->payload = $payload;
        $this->branchIds = array_values(array_unique(array_filter(array_map('intval', $branchIds))));
    }

    public function broadcastOn(): array
    {
        $channels = [new PrivateChannel('admin.global')];
        foreach ($this->branchIds as $bid) {
            $channels[] = new PrivateChannel("branch.{$bid}");
        }
        return $channels;
    }

    public function broadcastAs(): string
    {
        return 'inventory.updated';
    }

    public function broadcastWith(): array
    {
        return array_merge([
            'event' => 'InventoryStockUpdated',
            'modules' => ['products', 'categories', 'sales', 'dashboard', 'reports'],
            'branch_ids' => $this->branchIds,
            'timestamp' => now()->toIso8601String(),
        ], $this->payload);
    }
}
