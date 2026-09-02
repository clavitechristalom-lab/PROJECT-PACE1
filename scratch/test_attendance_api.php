<?php

require_once __DIR__ . '/../backend/backend/vendor/autoload.php';

$app = require_once __DIR__ . '/../backend/backend/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use App\Models\User;
use App\Http\Controllers\AttendanceController;
use Illuminate\Http\Request;

echo "=================================================================\n";
echo "TEST: ATTENDANCE API GET DAILY & SUMMARY ENDPOINTS\n";
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

$adminUser = User::where('role', 'Administrator')->first();
$attController = new AttendanceController();

// 1. Test Attendance Index
$reqIndex = Request::create('/api/attendance', 'GET');
$reqIndex->setUserResolver(fn() => $adminUser);
$resIndex = $attController->index($reqIndex);
testAssert($resIndex->getStatusCode() === 200, "GET /api/attendance returns HTTP 200");
$dataIndex = $resIndex->getData(true);
testAssert(isset($dataIndex['attendance']), "Response contains 'attendance' array");

// 2. Test Attendance Summary
$reqSummary = Request::create('/api/attendance/summary', 'GET');
$reqSummary->setUserResolver(fn() => $adminUser);
$resSummary = $attController->summary($reqSummary);
testAssert($resSummary->getStatusCode() === 200, "GET /api/attendance/summary returns HTTP 200");
$dataSummary = $resSummary->getData(true);
testAssert(isset($dataSummary['present']) && isset($dataSummary['summary']), "Summary contains 'present', 'late', 'absent' counts");

echo "\n=================================================================\n";
echo "SUMMARY: Passed {$pass} tests, Failed {$fail} tests.\n";
echo "=================================================================\n";
