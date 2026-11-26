<?php

namespace App\Services;

use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Support\Facades\Log;

class RealtimeBroadcaster
{
    public static function dispatch(ShouldBroadcast $event): void
    {
        try {
            event($event);
        } catch (\Throwable $e) {
            Log::warning('Realtime broadcast skipped: ' . $e->getMessage(), [
                'event' => get_class($event),
            ]);
        }
    }
}
