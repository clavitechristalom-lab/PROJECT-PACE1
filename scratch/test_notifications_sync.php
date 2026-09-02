<?php

require_once __DIR__ . '/../backend/backend/vendor/autoload.php';

$app = require_once __DIR__ . '/../backend/backend/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use App\Models\User;
use App\Http\Controllers\NotificationController;
use Illuminate\Http\Request;

echo "=================================================================\n";
echo "TEST: NOTIFICATIONS SYNC & NOTIFICATION BAR API\n";
echo "=================================================================\n\n";

$pass = 0;
$fail = 0;
function testAssert($cond, $label) {
    global $pass, $fail;
    if ($cond) {
        echo "  [PASS] {$label}\n";
        $pass++;
    } else {
        echo "  [FAIL] {$label}\n";
        $fail++;
    }
}

$admin = User::where('role', 'Administrator')->first();
$controller = new NotificationController();

// 1. Test Latest Notifications
$reqLatest = Request::create('/api/notifications/latest', 'GET', ['limit' => 15]);
$reqLatest->setUserResolver(fn() => $admin);
$resLatest = $controller->latest($reqLatest);
testAssert($resLatest->getStatusCode() === 200, "GET /api/notifications/latest returns HTTP 200");
$dataLatest = $resLatest->getData(true);
testAssert(isset($dataLatest['notifications']), "Response contains notifications list");
testAssert(count($dataLatest['notifications']) > 0, "Notification list has items (Count: " . count($dataLatest['notifications']) . ")");

echo "\n--- Notification Sample in Bar ---\n";
foreach (array_slice($dataLatest['notifications'], 0, 3) as $n) {
    echo "• [{$n['module']}] {$n['title']} (Priority: {$n['priority']})\n";
    echo "  Message: {$n['message']}\n";
    echo "  Action URL: {$n['action_url']}\n";
}

// 2. Test Unread Count
$reqCount = Request::create('/api/notifications/unread-count', 'GET');
$reqCount->setUserResolver(fn() => $admin);
$resCount = $controller->unreadCount($reqCount);
testAssert($resCount->getStatusCode() === 200, "GET /api/notifications/unread-count returns HTTP 200");
$dataCount = $resCount->getData(true);
testAssert(isset($dataCount['unread_count']), "Response contains unread_count ({$dataCount['unread_count']})");

echo "\n=================================================================\n";
echo "SUMMARY: Passed {$pass} tests, Failed {$fail} tests.\n";
echo "=================================================================\n";
