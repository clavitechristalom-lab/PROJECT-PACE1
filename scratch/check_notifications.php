<?php

require_once __DIR__ . '/../backend/backend/vendor/autoload.php';

$app = require_once __DIR__ . '/../backend/backend/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use App\Models\Notification;
use App\Models\User;

echo "Total Notifications in DB: " . Notification::count() . "\n";
$users = User::all();
foreach ($users as $u) {
    $count = Notification::where('user_id', $u->user_id)->count();
    $unread = Notification::where('user_id', $u->user_id)->where('is_read', false)->count();
    echo "User [ID: {$u->user_id}, Name: {$u->name}, Role: {$u->role}]: {$count} total, {$unread} unread\n";
}

$sampleNotifs = Notification::orderByDesc('notification_id')->limit(5)->get();
foreach ($sampleNotifs as $sn) {
    echo "\n- [ID: {$sn->notification_id}] [{$sn->module}] {$sn->title} (User: {$sn->user_id})\n";
    echo "  Message: {$sn->message}\n";
    echo "  Action URL: {$sn->action_url}\n";
}
