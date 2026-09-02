<?php

require_once __DIR__ . '/../backend/backend/vendor/autoload.php';

$app = require_once __DIR__ . '/../backend/backend/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use App\Models\User;
use App\Models\Employee;
use App\Models\Attendance;
use App\Models\Payroll;
use App\Models\PayrollPeriod;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

echo "========================================================\n";
echo "INTEGRATION TEST: CONNECTED MODULES (EMP -> ATT -> PAY -> REP)\n";
echo "========================================================\n\n";

$passCount = 0;
$failCount = 0;

function assertCondition($cond, $label) {
    global $passCount, $failCount;
    if ($cond) {
        echo "  [PASS] {$label}\n";
        $passCount++;
    } else {
        echo "  [FAIL] {$label}\n";
        $failCount++;
    }
}

// 1. Setup Test Users: Admin, Store Admin, Employee
$adminUser = User::where('role', 'Administrator')->first();
$storeAdminUser = User::where('role', 'like', '%Store%')->first();
if (!$storeAdminUser) {
    $storeEmp = Employee::where('position', 'like', '%Store%')->orWhere('position', 'like', '%Admin%')->first() ?: Employee::skip(1)->first();
    $storeAdminUser = User::create([
        'username' => 'storeadmin_test',
        'password_hash' => bcrypt('password'),
        'role' => 'Store Administrator',
        'employee_id' => $storeEmp ? $storeEmp->employee_id : null,
        'account_verified' => true,
    ]);
}

$employeeUser = User::where('role', 'Employee')->whereNotNull('employee_id')->first();
if (!$employeeUser) {
    $emp = Employee::first();
    $employeeUser = User::create([
        'username' => 'test_emp_user_' . time(),
        'password_hash' => bcrypt('password'),
        'role' => 'Employee',
        'employee_id' => $emp ? $emp->employee_id : 1,
        'account_verified' => true,
    ]);
}

echo "1. Users identified:\n";
echo "   - Admin: ID {$adminUser->user_id} ({$adminUser->username})\n";
echo "   - Store Admin: ID {$storeAdminUser->user_id} ({$storeAdminUser->username})\n";
echo "   - Employee: ID {$employeeUser->user_id} (EMP #{$employeeUser->employee_id})\n\n";

// 2. Test Attendance -> Payroll Generation Flow
echo "2. Testing Attendance -> Payroll Generation Flow:\n";
$period = PayrollPeriod::firstOrCreate(
    ['period_name' => 'Test Period August 2026'],
    [
        'start_date' => '2026-08-01',
        'end_date' => '2026-08-15',
        'pay_date' => '2026-08-15',
        'status' => 'Open',
        'created_by' => $adminUser->user_id,
    ]
);

$targetEmp = Employee::find($employeeUser->employee_id);
if ($targetEmp) {
    // Insert test attendance with overtime
    Attendance::where('employee_id', $targetEmp->employee_id)
        ->whereBetween('attendance_date', ['2026-08-01', '2026-08-05'])
        ->delete();

    // Create 3 days of attendance with OT
    Attendance::create([
        'employee_id' => $targetEmp->employee_id,
        'attendance_date' => '2026-08-01',
        'time_in' => '08:00:00',
        'time_out' => '19:00:00',
        'total_hours' => 11.0,
        'overtime_hours' => 3.0,
        'status' => 'Present',
        'verification_method' => 'QR + PIN',
    ]);
    Attendance::create([
        'employee_id' => $targetEmp->employee_id,
        'attendance_date' => '2026-08-02',
        'time_in' => '08:00:00',
        'time_out' => '18:00:00',
        'total_hours' => 10.0,
        'overtime_hours' => 2.0,
        'status' => 'Present',
        'verification_method' => 'QR + PIN',
    ]);

    // Clear existing payroll for period to test generation
    Payroll::where('period_id', $period->period_id)->where('employee_id', $targetEmp->employee_id)->delete();

    // Dispatch generate payroll
    $request = Request::create('/api/payroll/generate', 'POST', [
        'period_id' => $period->period_id,
    ]);
    $request->setUserResolver(fn() => $adminUser);

    $controller = app()->make(App\Http\Controllers\PayrollController::class);
    $response = $controller->generate($request);
    $data = $response->getData(true);

    assertCondition($response->getStatusCode() === 200, "Payroll generation succeeded with HTTP 200");

    // Verify generated payroll
    $generatedPayroll = Payroll::where('period_id', $period->period_id)->where('employee_id', $targetEmp->employee_id)->first();
    assertCondition($generatedPayroll !== null, "Payroll record created in database for employee #{$targetEmp->employee_id}");
    if ($generatedPayroll) {
        assertCondition((float)$generatedPayroll->overtime_hours === 5.0, "Overtime hours aggregated correctly from attendance (5.0 hrs = 3.0h + 2.0h)");
        assertCondition((float)$generatedPayroll->overtime_pay > 0, "Overtime pay computed dynamically based on hourly rate (₱{$generatedPayroll->overtime_pay})");
        assertCondition((float)$generatedPayroll->gross_pay > (float)$generatedPayroll->basic_salary, "Gross pay includes allowances and overtime pay");
        assertCondition((float)$generatedPayroll->net_pay > 0, "Net pay calculated after deductions (₱{$generatedPayroll->net_pay})");
    }
}

// 3. Test Role-Based Security & Personal Endpoints
echo "\n3. Testing Role-Based Scoping & Employee Endpoints:\n";

// A. Employee Personal Attendance (/api/employee/me/attendance)
$empReq = Request::create('/api/employee/me/attendance', 'GET');
$empReq->setUserResolver(fn() => $employeeUser);
$attController = app()->make(App\Http\Controllers\AttendanceController::class);
$meAttRes = $attController->meAttendance($empReq);
$meAttData = $meAttRes->getData(true);
assertCondition($meAttRes->getStatusCode() === 200, "Employee personal attendance endpoint returned 200");
assertCondition(isset($meAttData['attendance']), "Employee personal attendance includes attendance array");
assertCondition(isset($meAttData['stats']['total_hours']), "Employee attendance summary includes real calculated total hours");

// B. Employee Personal Payroll (/api/employee/me/payroll)
$mePayRes = $controller->mePayroll($empReq);
$mePayData = $mePayRes->getData(true);
assertCondition($mePayRes->getStatusCode() === 200, "Employee personal payroll endpoint returned 200");
assertCondition(isset($mePayData['payroll']), "Employee personal payroll includes records array");

// C. Security Check: Employee accessing another employee's payslip
$otherEmp = Employee::where('employee_id', '!=', $employeeUser->employee_id)->first();
$otherPayroll = $otherEmp ? Payroll::where('employee_id', $otherEmp->employee_id)->first() : null;
if ($otherPayroll) {
    $secReq = Request::create("/api/payroll/{$otherPayroll->payroll_id}/payslip", 'GET');
    $secReq->setUserResolver(fn() => $employeeUser);
    $secRes = $controller->show($secReq, $otherPayroll->payroll_id);
    assertCondition($secRes->getStatusCode() === 403, "Employee blocked (403 Forbidden) from viewing another employee's payslip");
}

// 4. Test Reports Module
echo "\n4. Testing Real Database Reports:\n";
$repController = app()->make(App\Http\Controllers\ReportController::class);

// A. Employee Report
$repEmpReq = Request::create('/api/reports/employees', 'GET');
$repEmpReq->setUserResolver(fn() => $adminUser);
$repEmpRes = $repController->employees($repEmpReq);
$repEmpData = $repEmpRes->getData(true);
assertCondition($repEmpRes->getStatusCode() === 200, "Employee report returned 200 OK");
assertCondition(isset($repEmpData['total_employees']) && $repEmpData['total_employees'] > 0, "Total employees count is queried from database ({$repEmpData['total_employees']})");
assertCondition(!empty($repEmpData['by_department']), "Department distribution calculated from real records");

// B. Attendance Report
$repAttReq = Request::create('/api/reports/attendance', 'GET');
$repAttReq->setUserResolver(fn() => $adminUser);
$repAttRes = $repController->attendance($repAttReq);
$repAttData = $repAttRes->getData(true);
assertCondition($repAttRes->getStatusCode() === 200, "Attendance report returned 200 OK");
assertCondition(isset($repAttData['present_count']), "Attendance report includes present/late/absent counts");

// C. Payroll Report
$repPayReq = Request::create('/api/reports/payroll', 'GET');
$repPayReq->setUserResolver(fn() => $adminUser);
$repPayRes = $repController->payroll($repPayReq);
$repPayData = $repPayRes->getData(true);
assertCondition($repPayRes->getStatusCode() === 200, "Payroll report returned 200 OK");
assertCondition(isset($repPayData['total_gross']) && $repPayData['total_gross'] > 0, "Payroll report includes gross sum (₱{$repPayData['total_gross']})");

// 5. Test Dashboard Controller
echo "\n5. Testing Live Dashboard Counters:\n";
$dashController = app()->make(App\Http\Controllers\DashboardController::class);

$dashAdminReq = Request::create('/api/dashboard/stats', 'GET');
$dashAdminReq->setUserResolver(fn() => $adminUser);
$dashAdminRes = $dashController->stats($dashAdminReq);
$dashAdminData = $dashAdminRes->getData(true);
assertCondition($dashAdminRes->getStatusCode() === 200, "Admin dashboard stats returned 200 OK");
assertCondition(isset($dashAdminData['attendance_ratio']), "Admin dashboard includes live attendance ratio ({$dashAdminData['attendance_ratio']})");

$dashEmpReq = Request::create('/api/dashboard/stats', 'GET');
$dashEmpReq->setUserResolver(fn() => $employeeUser);
$dashEmpRes = $dashController->stats($dashEmpReq);
$dashEmpData = $dashEmpRes->getData(true);
assertCondition($dashEmpRes->getStatusCode() === 200, "Employee dashboard stats returned 200 OK");

echo "\n========================================================\n";
echo "SUMMARY: Passed {$passCount} tests, Failed {$failCount} tests.\n";
echo "========================================================\n";
