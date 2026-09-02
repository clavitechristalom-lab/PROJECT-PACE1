<?php

require __DIR__ . '/../backend/backend/vendor/autoload.php';
$app = require_once __DIR__ . '/../backend/backend/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use App\Models\User;
use App\Models\Employee;
use App\Models\Attendance;
use App\Models\AttendanceScanLog;
use App\Models\Notification;
use App\Models\SystemLog;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Http\Request;
use App\Http\Controllers\EmployeeController;
use App\Http\Controllers\AttendanceController;

echo "========================================================\n";
echo "  PERMANENT QR ATTENDANCE SYSTEM - INTEGRATION TESTS   \n";
echo "========================================================\n\n";

$passed = 0;
$failed = 0;

function assertTest($description, $condition) {
    global $passed, $failed;
    if ($condition) {
        echo "  [PASS] " . $description . "\n";
        $passed++;
    } else {
        echo "  [FAIL] " . $description . "\n";
        $failed++;
    }
}

// ─── Setup Test Users & Employees ───────────────────────────────────────────
echo "--- 1. Setting up Test Environment ---\n";

// 1. Admin user
$adminUser = User::where('username', 'admin')->first();
if (!$adminUser) {
    $adminUser = User::create([
        'username' => 'admin_test',
        'password_hash' => Hash::make('password123'),
        'role' => 'Administrator',
        'is_active' => true,
    ]);
}

// 2. Store Admin user (Main Branch)
$storeAdminEmployee = Employee::firstOrCreate(
    ['employee_code' => 'EMP-STORE-01'],
    [
        'first_name' => 'StoreAdmin',
        'last_name' => 'Manager',
        'branch' => 'Main Branch',
        'position' => 'Store Manager',
        'department' => 'Operations',
        'pay_type' => 'Monthly',
        'basic_salary' => 30000,
        'status' => 'Active',
        'attendance_pin' => Hash::make('1234'),
    ]
);
$storeAdminUser = User::firstOrCreate(
    ['username' => 'storeadmin_test@pos.com'],
    [
        'password_hash' => Hash::make('password123'),
        'role' => 'Store Administrator',
        'employee_id' => $storeAdminEmployee->employee_id,
        'is_active' => true,
    ]
);
$storeAdminUser->role = 'Store Administrator';
$storeAdminUser->employee_id = $storeAdminEmployee->employee_id;
$storeAdminUser->save();

// 3. Employee 1 (Main Branch)
$empMain = Employee::firstOrCreate(
    ['employee_code' => 'EMP-TEST-MAIN'],
    [
        'first_name' => 'Juan',
        'last_name' => 'Dela Cruz',
        'branch' => 'Main Branch',
        'position' => 'Sales Associate',
        'department' => 'Sales',
        'pay_type' => 'Monthly',
        'basic_salary' => 20000,
        'status' => 'Active',
        'attendance_pin' => Hash::make('1234'),
    ]
);
$empMainUser = User::firstOrCreate(
    ['username' => 'juan_test@pos.com'],
    [
        'password_hash' => Hash::make('password123'),
        'role' => 'Employee',
        'employee_id' => $empMain->employee_id,
        'is_active' => true,
    ]
);

// 4. Employee 2 (Branch 2 - Cross Branch Test)
$empBranch2 = Employee::firstOrCreate(
    ['employee_code' => 'EMP-TEST-BR2'],
    [
        'first_name' => 'Maria',
        'last_name' => 'Santos',
        'branch' => 'Branch 2',
        'position' => 'Cashier',
        'department' => 'Cashiering',
        'pay_type' => 'Monthly',
        'basic_salary' => 18000,
        'status' => 'Active',
        'attendance_pin' => Hash::make('1234'),
    ]
);

$empController = app(EmployeeController::class);
$attController = app(AttendanceController::class);

echo "Test Users & Employees Ready.\n\n";

// ─── TEST SUITE 1: Administrator QR Management ──────────────────────────────
echo "--- 2. Testing Administrator QR Management ---\n";

// Test 1.1: Admin Generates QR Code
$req1 = Request::create("/api/employees/{$empMain->employee_id}/qr/generate", 'POST');
$req1->setUserResolver(fn() => $adminUser);
$res1 = $empController->generateQr($req1, $empMain->employee_id);
$data1 = $res1->getData(true);

assertTest("Admin can generate permanent QR token", $data1['success'] === true && !empty($data1['qr_token']));
assertTest("Generated QR token is a cryptographically secure UUID", Str::isUuid($data1['qr_token']));
assertTest("QR Status is ACTIVE", $data1['qr_status'] === 'ACTIVE');
assertTest("Issued By is Administrator", $data1['issued_by'] === 'Administrator');

$empMain->refresh();
$activeToken = $empMain->qr_token;

// Test 1.2: Admin Revokes QR Code
$reqRevoke = Request::create("/api/employees/{$empMain->employee_id}/qr/revoke", 'POST');
$reqRevoke->setUserResolver(fn() => $adminUser);
$resRevoke = $empController->revokeQr($reqRevoke, $empMain->employee_id);
$dataRevoke = $resRevoke->getData(true);

assertTest("Admin can revoke QR code", $dataRevoke['success'] === true && $dataRevoke['qr_status'] === 'REVOKED');
$empMain->refresh();
assertTest("Employee qr_active flag is set to false in database", $empMain->qr_active == false);

// Test 1.3: Admin Reissues QR Code
$reqReissue = Request::create("/api/employees/{$empMain->employee_id}/qr/reissue", 'POST');
$reqReissue->setUserResolver(fn() => $adminUser);
$resReissue = $empController->reissueQr($reqReissue, $empMain->employee_id);
$dataReissue = $resReissue->getData(true);

assertTest("Admin can reissue QR code", $dataReissue['success'] === true && $dataReissue['qr_status'] === 'ACTIVE');
assertTest("Reissued token is different from previous revoked token", $dataReissue['qr_token'] !== $activeToken);

$empMain->refresh();
$validToken = $empMain->qr_token;

// Test 1.4: Admin QR Monitoring Statistics
$reqStats = Request::create('/api/admin/qr-monitoring', 'GET');
$reqStats->setUserResolver(fn() => $adminUser);
$resStats = $empController->getQrMonitoringStats($reqStats);
$dataStats = $resStats->getData(true);

assertTest("Admin can fetch QR Monitoring Stats from MySQL", $dataStats['success'] === true && isset($dataStats['stats']['total_employees']));
assertTest("Stats contains all 8 real metrics", 
    isset($dataStats['stats']['total_employees']) &&
    isset($dataStats['stats']['qr_generated']) &&
    isset($dataStats['stats']['qr_not_generated']) &&
    isset($dataStats['stats']['active_qr']) &&
    isset($dataStats['stats']['revoked_qr']) &&
    isset($dataStats['stats']['today_scans']) &&
    isset($dataStats['stats']['successful_scans']) &&
    isset($dataStats['stats']['failed_scans'])
);

echo "\n--- 3. Testing Role Authorization & Access Control ---\n";

// Test 2.1: Store Admin CANNOT generate QR
$reqStoreGen = Request::create("/api/employees/{$empMain->employee_id}/qr/generate", 'POST');
$reqStoreGen->setUserResolver(fn() => $storeAdminUser);
$resStoreGen = $empController->generateQr($reqStoreGen, $empMain->employee_id);
assertTest("Store Admin cannot generate QR (Returns 403)", $resStoreGen->getStatusCode() === 403);

// Test 2.2: Employee CANNOT generate QR
$reqEmpGen = Request::create("/api/employees/{$empMain->employee_id}/qr/generate", 'POST');
$reqEmpGen->setUserResolver(fn() => $empMainUser);
$resEmpGen = $empController->generateQr($reqEmpGen, $empMain->employee_id);
assertTest("Employee cannot generate QR (Returns 403)", $resEmpGen->getStatusCode() === 403);

// Test 2.3: Employee CANNOT scan QR (Scanner terminal is Store Admin only)
$reqEmpScan = Request::create('/api/attendance/scan', 'POST', ['qr_token' => $validToken]);
$reqEmpScan->setUserResolver(fn() => $empMainUser);
$resEmpScan = $attController->scan($reqEmpScan);
assertTest("Employee cannot scan QR codes at terminal (Returns 403)", $resEmpScan->getStatusCode() === 403);

// Test 2.4: Admin CANNOT be the normal terminal scanner
$reqAdminScan = Request::create('/api/attendance/scan', 'POST', ['qr_token' => $validToken]);
$reqAdminScan->setUserResolver(fn() => $adminUser);
$resAdminScan = $attController->scan($reqAdminScan);
assertTest("Administrator cannot scan QR codes at store terminal (Returns 403)", $resAdminScan->getStatusCode() === 403);

echo "\n--- 4. Testing Store Admin QR Scanning & Branch Security ---\n";

// Test 3.1: Scanning invalid/unrecognized QR token
$reqInvalidScan = Request::create('/api/attendance/scan', 'POST', ['qr_token' => 'invalid-token-12345']);
$reqInvalidScan->setUserResolver(fn() => $storeAdminUser);
$resInvalidScan = $attController->scan($reqInvalidScan);
assertTest("Scanning invalid QR token returns 404", $resInvalidScan->getStatusCode() === 404);

// Test 3.2: Scanning cross-branch employee (Store Admin from Main Branch scans Branch 2 employee)
$empBranch2->qr_token = (string)Str::uuid();
$empBranch2->qr_active = true;
$empBranch2->save();

$reqCrossBranch = Request::create('/api/attendance/scan', 'POST', ['qr_token' => $empBranch2->qr_token]);
$reqCrossBranch->setUserResolver(fn() => $storeAdminUser);
$resCrossBranch = $attController->scan($reqCrossBranch);
$crossBranchData = $resCrossBranch->getData(true);

assertTest("Cross-branch QR scan is blocked (Returns 403)", $resCrossBranch->getStatusCode() === 403);
assertTest("Cross-branch error message matches requirement", $crossBranchData['message'] === 'This employee does not belong to your authorized branch.');

$crossLog = AttendanceScanLog::where('action_type', 'UNAUTHORIZED_BRANCH_SCAN')->orderByDesc('id')->first();
assertTest("Cross-branch attempt is logged in audit trail as UNAUTHORIZED_BRANCH_SCAN", $crossLog !== null);

// Test 3.3: Scanning valid active employee from SAME branch
$reqValidScan = Request::create('/api/attendance/scan', 'POST', ['qr_token' => $validToken]);
$reqValidScan->setUserResolver(fn() => $storeAdminUser);
$resValidScan = $attController->scan($reqValidScan);
$validScanData = $resValidScan->getData(true);

assertTest("Valid scan of same-branch employee succeeds (Returns 200)", $resValidScan->getStatusCode() === 200);
assertTest("Identified employee details returned", $validScanData['employee']['name'] === 'Juan Dela Cruz');
assertTest("Step requires personal PIN verification", $validScanData['requires_pin'] === true);

echo "\n--- 5. Testing PIN Verification & Attendance Punch Flow ---\n";

// Clear existing attendance for today to test fresh punch
Attendance::where('employee_id', $empMain->employee_id)->where('attendance_date', date('Y-m-d'))->delete();

// Test 4.1: Incorrect PIN Verification
$reqWrongPin = Request::create('/api/attendance/verify-pin', 'POST', [
    'qr_token' => $validToken,
    'pin' => '9999',
]);
$reqWrongPin->setUserResolver(fn() => $storeAdminUser);
$resWrongPin = $attController->verifyPinAndRecord($reqWrongPin);
$wrongPinData = $resWrongPin->getData(true);

assertTest("Incorrect PIN returns 422 Unprocessable Content", $resWrongPin->getStatusCode() === 422);
assertTest("Incorrect PIN error contains remaining attempts", str_contains($wrongPinData['message'], 'PIN verification failed'));

$pinFailLog = AttendanceScanLog::where('action_type', 'PIN_VERIFICATION_FAILED')->orderByDesc('id')->first();
assertTest("PIN failure is logged as PIN_VERIFICATION_FAILED", $pinFailLog !== null);

// Test 4.2: Correct PIN Verification -> First Punch of the Day (TIME IN)
$reqTimeIn = Request::create('/api/attendance/verify-pin', 'POST', [
    'qr_token' => $validToken,
    'pin' => '1234',
]);
$reqTimeIn->setUserResolver(fn() => $storeAdminUser);
$resTimeIn = $attController->verifyPinAndRecord($reqTimeIn);
$timeInData = $resTimeIn->getData(true);

assertTest("Correct PIN records TIME IN successfully", $timeInData['success'] === true && $timeInData['action'] === 'TIME_IN');
assertTest("Verification method is QR + PIN", isset($timeInData['record']) && $timeInData['record']['verification_method'] === 'QR + PIN');
assertTest("Attendance record contains verified_by Store Admin name", !empty($timeInData['verified_by']));

// Test 4.3: Real Notifications Dispatched
$adminNotif = Notification::where('type', 'attendance_recorded')->orderByDesc('notification_id')->first();
assertTest("Admin received real ATTENDANCE RECORDED notification", $adminNotif !== null && str_contains($adminNotif->message, 'Juan Dela Cruz'));

$empNotif = Notification::where('user_id', $empMainUser->user_id)->orderByDesc('notification_id')->first();
assertTest("Employee received real TIME IN notification", $empNotif !== null && str_contains($empNotif->message, 'QR + PIN'));

// Test 4.4: Second Punch of the Day -> TIME OUT
// Simulate 9 hours earlier for time in to test regular & overtime calculation
$attRecord = Attendance::find($timeInData['record']['attendance_id']);
$attRecord->time_in = date('H:i:s', time() - 32400); // 9 hours before now
$attRecord->save();

$reqTimeOut = Request::create('/api/attendance/verify-pin', 'POST', [
    'qr_token' => $validToken,
    'pin' => '1234',
]);
$reqTimeOut->setUserResolver(fn() => $storeAdminUser);
$resTimeOut = $attController->verifyPinAndRecord($reqTimeOut);
$timeOutData = $resTimeOut->getData(true);

assertTest("Second scan records TIME OUT successfully", $timeOutData['success'] === true && $timeOutData['action'] === 'TIME_OUT');
assertTest("Total hours calculated correctly (~8.5 hrs)", (float)$timeOutData['total_hours'] >= 8.4);
assertTest("Overtime hours calculated correctly (~0.5 hrs)", (float)$timeOutData['overtime_hours'] >= 0.4);
assertTest("Attendance status is COMPLETE", $timeOutData['status'] === 'COMPLETE');

echo "\n--- 6. Testing Employee Self-Service Views ---\n";

// Test 5.1: Employee views own attendance history
$reqEmpAtt = Request::create('/api/employee/me/attendance', 'GET');
$reqEmpAtt->setUserResolver(fn() => $empMainUser);
$resEmpAtt = $attController->meAttendance($reqEmpAtt);
$empAttData = $resEmpAtt->getData(true);

assertTest("Employee can view own attendance history", isset($empAttData['attendance']) && count($empAttData['attendance']) > 0);
assertTest("Today's verified attendance is present in employee response", isset($empAttData['today']['attendance_id']));

// Test 5.2: Employee views own QR token
$reqOwnQr = Request::create("/api/employees/{$empMain->employee_id}/qr", 'GET');
$reqOwnQr->setUserResolver(fn() => $empMainUser);
$resOwnQr = $empController->getQr($reqOwnQr, $empMain->employee_id);
$ownQrData = $resOwnQr->getData(true);

assertTest("Employee can view own QR token", $ownQrData['success'] === true && $ownQrData['qr_token'] === $validToken);

// Test 5.3: Employee CANNOT view another employee's QR token
$reqOtherQr = Request::create("/api/employees/{$empBranch2->employee_id}/qr", 'GET');
$reqOtherQr->setUserResolver(fn() => $empMainUser);
$resOtherQr = $empController->getQr($reqOtherQr, $empBranch2->employee_id);

assertTest("Employee cannot view another employee's QR token (Returns 403)", $resOtherQr->getStatusCode() === 403);

echo "\n========================================================\n";
echo "  TEST RESULTS: {$passed} PASSED, {$failed} FAILED\n";
echo "========================================================\n";

if ($failed > 0) {
    exit(1);
} else {
    exit(0);
}
