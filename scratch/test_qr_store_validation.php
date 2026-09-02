<?php

require_once __DIR__ . '/../backend/backend/vendor/autoload.php';

$app = require_once __DIR__ . '/../backend/backend/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use App\Models\User;
use App\Models\Employee;
use App\Models\Attendance;
use App\Http\Controllers\AttendanceController;
use App\Http\Controllers\EmployeeController;
use Illuminate\Http\Request;

echo "========================================================\n";
echo "TEST: SECURE QR TOKEN & STORE VALIDATION RULES\n";
echo "========================================================\n\n";

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

// 1. Setup two test employees in different branches
$emp1 = Employee::updateOrCreate(
    ['employee_code' => 'EMP-STORE-001'],
    [
        'first_name' => 'Juan',
        'last_name' => 'Dela Cruz',
        'position' => 'Store Specialist',
        'department' => 'Sales',
        'branch' => 'Main Branch',
        'pay_type' => 'Daily',
        'basic_salary' => 600,
        'daily_rate' => 600,
        'hourly_rate' => 75,
        'status' => 'Active',
        'qr_active' => true,
        'qr_token' => 'QR-TOKEN-JUAN-001',
        'attendance_pin' => bcrypt('1234'),
    ]
);

$emp2 = Employee::updateOrCreate(
    ['employee_code' => 'EMP-STORE-002'],
    [
        'first_name' => 'Maria',
        'last_name' => 'Santos',
        'position' => 'Cashier',
        'department' => 'Operations',
        'branch' => 'Cagayan de Oro',
        'pay_type' => 'Daily',
        'basic_salary' => 550,
        'daily_rate' => 550,
        'hourly_rate' => 68.75,
        'status' => 'Active',
        'qr_active' => true,
        'qr_token' => 'QR-TOKEN-MARIA-002',
        'attendance_pin' => bcrypt('1234'),
    ]
);

$attController = new AttendanceController();
$empController = new EmployeeController();

// 2. Test Store Matching Validation
echo "1. Testing Store/Branch Validation on QR Scan:\n";

// Scan Juan at Main Branch (matching) -> Should succeed
$req1 = Request::create('/api/attendance/verify-qr', 'POST', [
    'qr_token' => $emp1->qr_token,
    'scanner_branch' => 'Main Branch',
]);
$res1 = $attController->verifyQr($req1);
testAssert($res1->getStatusCode() === 200, "Juan scanning at Main Branch (matching) allowed (HTTP 200)");
$data1 = $res1->getData(true);
testAssert($data1['success'] === true && $data1['employee']['employee_code'] === 'EMP-STORE-001', "Juan employee payload identified successfully");

// Scan Maria at Main Branch (mismatched store: Maria is Cagayan de Oro) -> Should reject
$req2 = Request::create('/api/attendance/verify-qr', 'POST', [
    'qr_token' => $emp2->qr_token,
    'scanner_branch' => 'Main Branch',
]);
$res2 = $attController->verifyQr($req2);
testAssert($res2->getStatusCode() === 403, "Maria scanning at Main Branch (mismatch) rejected (HTTP 403)");
$data2 = $res2->getData(true);
testAssert($data2['message'] === 'Employee does not belong to this store.', "Returned explicit error: 'Employee does not belong to this store.'");

// Scan with invalid/compromised QR token -> Should reject
$req3 = Request::create('/api/attendance/verify-qr', 'POST', [
    'qr_token' => 'INVALID-TOKEN-999999',
    'scanner_branch' => 'Main Branch',
]);
$res3 = $attController->verifyQr($req3);
testAssert($res3->getStatusCode() === 404, "Invalid QR token rejected (HTTP 404)");

// 3. Test PIN Verification and Punch Recording
echo "\n2. Testing 2-Factor Attendance Record (PIN + QR):\n";

// Clear today's attendance for test
Attendance::where('employee_id', $emp1->employee_id)->where('attendance_date', date('Y-m-d'))->delete();

// Wrong PIN -> Should reject with 422
$reqPinWrong = Request::create('/api/attendance/verify-pin', 'POST', [
    'qr_token' => $emp1->qr_token,
    'pin' => '9999',
    'scanner_branch' => 'Main Branch',
]);
$resPinWrong = $attController->verifyPinAndRecord($reqPinWrong);
testAssert($resPinWrong->getStatusCode() === 422, "Incorrect PIN attempt rejected with HTTP 422");

// Correct PIN -> Should record TIME IN
$reqPinCorrect = Request::create('/api/attendance/verify-pin', 'POST', [
    'qr_token' => $emp1->qr_token,
    'pin' => '1234',
    'scanner_branch' => 'Main Branch',
]);
$resPinCorrect = $attController->verifyPinAndRecord($reqPinCorrect);
testAssert($resPinCorrect->getStatusCode() === 200, "Correct PIN records attendance with HTTP 200");
$punchData = $resPinCorrect->getData(true);
testAssert($punchData['action'] === 'TIME_IN', "First scan recorded as TIME_IN");
testAssert($punchData['employee']['branch'] === 'Main Branch', "Response employee includes store branch");

// 4. Test QR Regeneration (Security Token Rotation)
echo "\n3. Testing QR Token Regeneration & Invalidation:\n";
$oldToken = $emp1->qr_token;
$regenRes = $empController->regenerateQr($emp1->employee_id);
testAssert($regenRes->getStatusCode() === 200, "QR regeneration succeeded with HTTP 200");
$emp1->refresh();
testAssert($emp1->qr_token !== $oldToken, "New unique QR token generated on database");

// Old token should now be rejected
$reqOldToken = Request::create('/api/attendance/verify-qr', 'POST', [
    'qr_token' => $oldToken,
    'scanner_branch' => 'Main Branch',
]);
$resOldToken = $attController->verifyQr($reqOldToken);
testAssert($resOldToken->getStatusCode() === 404, "Previous QR token is now completely invalidated (HTTP 404)");

echo "\n========================================================\n";
echo "SUMMARY: Passed {$pass} tests, Failed {$fail} tests.\n";
echo "========================================================\n";
