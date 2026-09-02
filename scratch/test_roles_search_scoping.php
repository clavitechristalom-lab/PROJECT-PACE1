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
use App\Http\Controllers\SearchController;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;

echo "=================================================================\n";
echo "TEST: THREE-TIER ROLE-BASED GLOBAL SEARCH SCOPING VERIFICATION\n";
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

// 1. Setup Test Employees in different branches
$empMain = Employee::updateOrCreate(
    ['employee_code' => 'EMP-MAIN-01'],
    [
        'first_name' => 'Michael',
        'last_name' => 'Corleone',
        'position' => 'Store Manager',
        'department' => 'Operations',
        'branch' => 'Main Branch',
        'basic_salary' => 45000,
        'status' => 'Active',
    ]
);

$empNorth = Employee::updateOrCreate(
    ['employee_code' => 'EMP-NORTH-01'],
    [
        'first_name' => 'Sonny',
        'last_name' => 'Corleone',
        'position' => 'Sales Officer',
        'department' => 'Sales',
        'branch' => 'North Branch',
        'basic_salary' => 30000,
        'status' => 'Active',
    ]
);

$empStaff = Employee::updateOrCreate(
    ['employee_code' => 'EMP-STAFF-01'],
    [
        'first_name' => 'Fredo',
        'last_name' => 'Corleone',
        'position' => 'Cashier',
        'department' => 'Sales',
        'branch' => 'Main Branch',
        'basic_salary' => 22000,
        'status' => 'Active',
    ]
);

// 2. Setup Test Users for the 3 roles
$adminUser = User::updateOrCreate(
    ['username' => 'admin_test'],
    [
        'password_hash' => Hash::make('password'),
        'role' => 'Administrator',
        'is_active' => true,
        'account_verified' => true,
    ]
);

$storeAdminUser = User::updateOrCreate(
    ['username' => 'storeadmin_test'],
    [
        'password_hash' => Hash::make('password'),
        'role' => 'Store Administrator',
        'employee_id' => $empMain->employee_id,
        'is_active' => true,
        'account_verified' => true,
    ]
);

$employeeUser = User::updateOrCreate(
    ['username' => 'employee_test'],
    [
        'password_hash' => Hash::make('password'),
        'role' => 'Employee',
        'employee_id' => $empStaff->employee_id,
        'is_active' => true,
        'account_verified' => true,
    ]
);

$searchController = new SearchController();

// ─────────────────────────────────────────────────────────────────
// A. ADMINISTRATOR ROLE SEARCH TESTS
// ─────────────────────────────────────────────────────────────────
echo "A. ADMINISTRATOR ROLE SEARCH (Global Access):\n";

// Admin searches for 'Corleone' -> Should find Michael (Main), Sonny (North), Fredo (Staff)
$reqAdmin = Request::create('/api/search?q=Corleone', 'GET');
$reqAdmin->setUserResolver(fn() => $adminUser);
$resAdmin = $searchController->search($reqAdmin)->getData(true);

$adminEmpResults = collect($resAdmin['results'])->where('type', 'employee')->pluck('title')->toArray();
testAssert(count($adminEmpResults) >= 3, "Admin sees all branch employees (found " . count($adminEmpResults) . ")");

// Admin searches for user accounts
$reqAdminUsers = Request::create('/api/search?q=test', 'GET');
$reqAdminUsers->setUserResolver(fn() => $adminUser);
$resAdminUsers = $searchController->search($reqAdminUsers)->getData(true);
$foundUsers = collect($resAdminUsers['results'])->where('type', 'user');
testAssert($foundUsers->count() > 0, "Admin can search user accounts (found " . $foundUsers->count() . ")");

// ─────────────────────────────────────────────────────────────────
// B. STORE ADMINISTRATOR ROLE SEARCH TESTS
// ─────────────────────────────────────────────────────────────────
echo "\nB. STORE ADMINISTRATOR ROLE SEARCH (Store Branch Scoped):\n";

// Store Admin (Main Branch) searches 'Corleone' -> Should see Michael and Fredo (Main Branch), but NOT Sonny (North Branch)
$reqStoreAdmin = Request::create('/api/search?q=Corleone', 'GET');
$reqStoreAdmin->setUserResolver(fn() => $storeAdminUser);
$resStoreAdmin = $searchController->search($reqStoreAdmin)->getData(true);

$storeAdminEmpResults = collect($resStoreAdmin['results'])->where('type', 'employee')->pluck('title')->toArray();
$hasSonny = collect($resStoreAdmin['results'])->where('type', 'employee')->contains('title', 'Sonny Corleone');
$hasFredo = collect($resStoreAdmin['results'])->where('type', 'employee')->contains('title', 'Fredo Corleone');

testAssert($hasFredo, "Store Admin can see own branch employee 'Fredo Corleone'");
testAssert(!$hasSonny, "Store Admin CANNOT see other branch employee 'Sonny Corleone'");

// Store Admin cannot search System Users or System Logs
$reqStoreAdminSec = Request::create('/api/search?q=admin', 'GET');
$reqStoreAdminSec->setUserResolver(fn() => $storeAdminUser);
$resStoreAdminSec = $searchController->search($reqStoreAdminSec)->getData(true);
$hasUsers = collect($resStoreAdminSec['results'])->contains('type', 'user');
$hasLogs = collect($resStoreAdminSec['results'])->contains('type', 'system_log');
testAssert(!$hasUsers, "Store Admin cannot access User Account search results");
testAssert(!$hasLogs, "Store Admin cannot access System Log search results");

// ─────────────────────────────────────────────────────────────────
// C. EMPLOYEE ROLE SEARCH TESTS
// ─────────────────────────────────────────────────────────────────
echo "\nC. EMPLOYEE ROLE SEARCH (Own Self Records Only):\n";

// Employee searches 'Corleone' -> Should NOT see any other employee records
$reqEmp = Request::create('/api/search?q=Corleone', 'GET');
$reqEmp->setUserResolver(fn() => $employeeUser);
$resEmp = $searchController->search($reqEmp)->getData(true);
$empResults = collect($resEmp['results'])->where('type', 'employee');
testAssert($empResults->count() === 0, "Employee cannot search or view other employee profiles");

// Employee searches 'dashboard' -> Navigation route points to /employee/dashboard
$reqEmpNav = Request::create('/api/search?q=dashboard', 'GET');
$reqEmpNav->setUserResolver(fn() => $employeeUser);
$resEmpNav = $searchController->search($reqEmpNav)->getData(true);
$foundEmpNav = collect($resEmpNav['results'])->firstWhere('type', 'navigation');
testAssert($foundEmpNav && $foundEmpNav['route'] === '/employee/dashboard', "Employee navigation points to /employee/dashboard");

echo "\n=================================================================\n";
echo "SUMMARY: Passed {$pass} tests, Failed {$fail} tests.\n";
echo "=================================================================\n";
