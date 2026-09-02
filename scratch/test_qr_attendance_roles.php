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
use Illuminate\Support\Facades\Hash;
use Illuminate\Http\Request;

echo "=== TESTING QR ATTENDANCE SYSTEM WITH STRICT ROLE-BASED ACCESS ===\n\n";

$passCount = 0;
$totalTests = 8;

// 1. Setup / Identify Admin, Store Admin, and Employee
$adminUser = User::where('role', 'Administrator')->first();
$storeAdminUser = User::where('role', 'Store Administrator')->orWhere('role', 'Store Admin')->first();
$employeeUser = User::where('role', 'Employee')->first();

if (!$adminUser || !$storeAdminUser || !$employeeUser) {
    echo "FAILED SETUP: Users not found.\n";
    exit(1);
}

echo "Admin User: {$adminUser->username} (ID: {$adminUser->user_id})\n";
echo "Store Admin User: {$storeAdminUser->username} (ID: {$storeAdminUser->user_id})\n";
echo "Employee User: {$employeeUser->username} (ID: {$employeeUser->user_id})\n\n";

// Ensure Store Admin has an Employee record with branch
if (!$storeAdminUser->employee) {
    $saEmp = Employee::create([
        'employee_code' => 'EMP-SA01',
        'first_name' => 'Store',
        'last_name' => 'Admin',
        'position' => 'Store Administrator',
        'department' => 'Operations',
        'branch' => 'Main Branch',
        'pay_type' => 'Monthly',
        'basic_salary' => 35000,
        'status' => 'Active',
    ]);
    $storeAdminUser->employee_id = $saEmp->employee_id;
    $storeAdminUser->save();
} else {
    $storeAdminUser->employee->branch = 'Main Branch';
    $storeAdminUser->employee->status = 'Active';
    $storeAdminUser->employee->save();
}

// Find or create test employee in 'Main Branch'
$testEmp1 = Employee::where('branch', 'Main Branch')->where('position', '!=', 'Store Administrator')->first();
if (!$testEmp1) {
    $testEmp1 = Employee::create([
        'employee_code' => 'EMP-TEST01',
        'first_name' => 'John',
        'last_name' => 'Doe',
        'position' => 'Sales Associate',
        'department' => 'Sales',
        'branch' => 'Main Branch',
        'pay_type' => 'Monthly',
        'basic_salary' => 25000,
        'status' => 'Active',
        'attendance_pin' => Hash::make('1234'),
    ]);
}
$testEmp1->attendance_pin = Hash::make('1234');
$testEmp1->save();

// Find or create test employee in 'Branch 2' (Different branch)
$testEmp2 = Employee::where('branch', '!=', 'Main Branch')->first();
if (!$testEmp2) {
    $testEmp2 = Employee::create([
        'employee_code' => 'EMP-TEST02',
        'first_name' => 'Maria',
        'last_name' => 'Santos',
        'position' => 'Cashier',
        'department' => 'Sales',
        'branch' => 'Branch 2',
        'pay_type' => 'Monthly',
        'basic_salary' => 22000,
        'status' => 'Active',
        'attendance_pin' => Hash::make('1234'),
    ]);
}

$empController = app(\App\Http\Controllers\EmployeeController::class);
$attController = app(\App\Http\Controllers\AttendanceController::class);

// TEST 1: Admin generates QR for Employee
echo "Test 1: Admin generates permanent QR for employee...\n";
$req1 = Request::create("/api/employees/{$testEmp1->employee_id}/qr/generate", 'POST');
$req1->setUserResolver(fn() => $adminUser);
$res1 = $empController->generateQr($req1, $testEmp1->employee_id);
$data1 = json_decode($res1->getContent(), true);

if ($res1->getStatusCode() === 200 && !empty($data1['qr_token']) && $data1['qr_status'] === 'ACTIVE') {
    echo "✓ PASSED: Admin generated active QR token: {$data1['qr_token']}\n\n";
    $passCount++;
} else {
    echo "✕ FAILED: " . json_encode($data1) . "\n\n";
}

// TEST 2: Store Admin or Employee trying to generate QR (Expect 403 Forbidden)
echo "Test 2: Store Admin attempting to generate QR (Should be 403 Forbidden)...\n";
$req2 = Request::create("/api/employees/{$testEmp1->employee_id}/qr/generate", 'POST');
$req2->setUserResolver(fn() => $storeAdminUser);
$res2 = $empController->generateQr($req2, $testEmp1->employee_id);
if ($res2->getStatusCode() === 403) {
    echo "✓ PASSED: Correctly returned 403 Forbidden for Store Admin.\n\n";
    $passCount++;
} else {
    echo "✕ FAILED: Expected 403, got status {$res2->getStatusCode()}\n\n";
}

// TEST 3: Admin revokes and reissues QR
echo "Test 3: Admin revokes and reissues QR...\n";
$req3a = Request::create("/api/employees/{$testEmp1->employee_id}/qr/revoke", 'POST');
$req3a->setUserResolver(fn() => $adminUser);
$res3a = $empController->revokeQr($req3a, $testEmp1->employee_id);
$data3a = json_decode($res3a->getContent(), true);

$req3b = Request::create("/api/employees/{$testEmp1->employee_id}/qr/reissue", 'POST');
$req3b->setUserResolver(fn() => $adminUser);
$res3b = $empController->reissueQr($req3b, $testEmp1->employee_id);
$data3b = json_decode($res3b->getContent(), true);

if ($res3a->getStatusCode() === 200 && $data3a['qr_status'] === 'REVOKED' &&
    $res3b->getStatusCode() === 200 && $data3b['qr_status'] === 'ACTIVE') {
    echo "✓ PASSED: Revoke & Reissue functioned as expected.\n\n";
    $passCount++;
} else {
    echo "✕ FAILED: " . json_encode($data3b) . "\n\n";
}

$freshToken = $data3b['qr_token'];

// TEST 4: Store Admin scans Employee QR (Valid branch)
echo "Test 4: Store Admin scans Employee QR at Main Branch...\n";
$req4 = Request::create('/api/attendance/scan', 'POST', [
    'qr_token' => $freshToken,
]);
$req4->setUserResolver(fn() => $storeAdminUser);
$res4 = $attController->scan($req4);
$data4 = json_decode($res4->getContent(), true);

if ($res4->getStatusCode() === 200 && $data4['success'] && $data4['employee']['name'] === "{$testEmp1->first_name} {$testEmp1->last_name}") {
    echo "✓ PASSED: Employee identified: {$data4['employee']['name']} (Requires PIN: {$data4['requires_pin']})\n\n";
    $passCount++;
} else {
    echo "✕ FAILED: " . json_encode($data4) . "\n\n";
}

// TEST 5: Employee attempts to call QR scanner endpoint (Expect 403 Forbidden)
echo "Test 5: Employee user attempts to scan QR (Should be 403 Forbidden)...\n";
$req5 = Request::create('/api/attendance/scan', 'POST', [
    'qr_token' => $freshToken,
]);
$req5->setUserResolver(fn() => $employeeUser);
$res5 = $attController->scan($req5);
if ($res5->getStatusCode() === 403) {
    echo "✓ PASSED: Correctly returned 403 Forbidden for Employee.\n\n";
    $passCount++;
} else {
    echo "✕ FAILED: Expected 403, got status {$res5->getStatusCode()}\n\n";
}

// TEST 6: Store Admin scans employee from a DIFFERENT branch (Expect 403 Branch mismatch)
echo "Test 6: Store Admin scans employee from different branch (Branch 2 vs Main Branch)...\n";
// Generate QR for emp 2
$req6a = Request::create("/api/employees/{$testEmp2->employee_id}/qr/generate", 'POST');
$req6a->setUserResolver(fn() => $adminUser);
$res6a = $empController->generateQr($req6a, $testEmp2->employee_id);
$token2 = json_decode($res6a->getContent(), true)['qr_token'];

$req6b = Request::create('/api/attendance/scan', 'POST', [
    'qr_token' => $token2,
]);
$req6b->setUserResolver(fn() => $storeAdminUser);
$res6b = $attController->scan($req6b);
$data6b = json_decode($res6b->getContent(), true);

if ($res6b->getStatusCode() === 403 && str_contains($data6b['message'], 'branch')) {
    echo "✓ PASSED: Cross-branch scan blocked with message: {$data6b['message']}\n\n";
    $passCount++;
} else {
    echo "✕ FAILED: Expected branch mismatch 403, got {$res6b->getStatusCode()}\n\n";
}

// TEST 7: PIN Verification & Attendance Recording (TIME IN)
echo "Test 7: Store Admin processes PIN verification and TIME IN...\n";
// Clear today's attendance for clean test
Attendance::where('employee_id', $testEmp1->employee_id)->where('attendance_date', date('Y-m-d'))->delete();

$req7 = Request::create('/api/attendance/verify-pin', 'POST', [
    'qr_token' => $freshToken,
    'pin' => '1234',
]);
$req7->setUserResolver(fn() => $storeAdminUser);
$res7 = $attController->verifyPinAndRecord($req7);
$data7 = json_decode($res7->getContent(), true);

if ($res7->getStatusCode() === 200 && $data7['action'] === 'TIME_IN') {
    echo "✓ PASSED: Time In recorded at {$data7['time']} (Verified by: {$data7['verified_by']})\n\n";
    $passCount++;
} else {
    echo "✕ FAILED: " . json_encode($data7) . "\n\n";
}

// TEST 8: Admin QR Monitoring Statistics
echo "Test 8: Admin accesses QR Monitoring statistics...\n";
$req8 = Request::create('/api/admin/qr-monitoring', 'GET');
$req8->setUserResolver(fn() => $adminUser);
$res8 = $empController->getQrMonitoringStats($req8);
$data8 = json_decode($res8->getContent(), true);

if ($res8->getStatusCode() === 200 && isset($data8['stats']['total_employees']) && isset($data8['stats']['today_scans'])) {
    echo "✓ PASSED: QR Monitoring Stats retrieved. Total Employees: {$data8['stats']['total_employees']}, Today Scans: {$data8['stats']['today_scans']}\n\n";
    $passCount++;
} else {
    echo "✕ FAILED: " . json_encode($data8) . "\n\n";
}

echo "==================================================\n";
echo "TEST RESULTS: {$passCount}/{$totalTests} PASSED\n";
echo "==================================================\n";
