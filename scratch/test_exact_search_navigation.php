<?php

require_once __DIR__ . '/../backend/backend/vendor/autoload.php';

$app = require_once __DIR__ . '/../backend/backend/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use App\Models\User;
use App\Models\Employee;
use App\Models\Customer;
use App\Models\Product;
use App\Models\SaleTransaction;
use App\Models\InstallmentAccount;
use App\Models\Payment;
use App\Models\Attendance;
use App\Models\Payroll;
use App\Models\PayrollPeriod;
use App\Http\Controllers\SearchController;
use Illuminate\Http\Request;

echo "========================================================\n";
echo "TEST: REAL DATABASE GLOBAL SEARCH & EXACT NAVIGATION\n";
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

// 1. Setup real test database records across all modules
$emp = Employee::updateOrCreate(
    ['employee_code' => 'EMP-GLOBAL-01'],
    [
        'first_name' => 'Alexander',
        'last_name' => 'Hamilton',
        'position' => 'Treasury Officer',
        'department' => 'Finance',
        'branch' => 'Main Branch',
        'basic_salary' => 35000,
        'status' => 'Active',
        'phone' => '09171234567',
        'email' => 'alexander@business.com',
    ]
);

$cust = Customer::updateOrCreate(
    ['customer_code' => 'CUST-GLOBAL-01'],
    [
        'first_name' => 'Benjamin',
        'last_name' => 'Franklin',
        'phone' => '09181234567',
        'email' => 'benjamin@client.com',
        'address' => 'Philadelphia Ave, Manila',
        'status' => 'Active',
    ]
);

$prod = Product::updateOrCreate(
    ['product_code' => 'PROD-GLOBAL-01'],
    [
        'product_name' => 'Inverter Refrigerator 12cu',
        'category' => 'Appliances',
        'brand' => 'Panasonic',
        'unit_price' => 28500,
        'stock_quantity' => 15,
        'status' => 'Active',
    ]
);

$sale = SaleTransaction::updateOrCreate(
    ['invoice_no' => 'INV-GLOBAL-999'],
    [
        'customer_id' => $cust->customer_id,
        'total_amount' => 28500,
        'sale_date' => date('Y-m-d'),
        'payment_method' => 'Cash',
        'status' => 'Completed',
        'processed_by' => 1,
    ]
);

$inst = InstallmentAccount::updateOrCreate(
    ['account_no' => 'ACC-GLOBAL-777'],
    [
        'customer_id' => $cust->customer_id,
        'total_payable' => 32000,
        'down_payment' => 5000,
        'installment_amount' => 4500,
        'number_of_installments' => 6,
        'frequency' => 'Monthly',
        'start_date' => date('Y-m-d'),
        'due_date' => date('Y-m-d', strtotime('+30 days')),
        'status' => 'Active',
    ]
);

$pay = Payment::updateOrCreate(
    ['receipt_no' => 'OR-GLOBAL-555'],
    [
        'installment_id' => $inst->installment_id,
        'amount' => 4500,
        'payment_method' => 'GCash',
        'reference_no' => 'GCASH-REF-8888',
        'payment_date' => date('Y-m-d'),
    ]
);

$att = Attendance::updateOrCreate(
    ['employee_id' => $emp->employee_id, 'attendance_date' => date('Y-m-d')],
    [
        'time_in' => '08:00:00',
        'time_out' => '17:00:00',
        'total_hours' => 8.0,
        'status' => 'Present',
        'verification_method' => 'QR+PIN',
    ]
);

$adminUser = User::where('role', 'Administrator')->first();
$searchController = new SearchController();

// 2. Test searching employee by name
echo "1. Testing Employee Search & Exact Route:\n";
$reqEmp = Request::create('/api/search?q=Alexander', 'GET');
$reqEmp->setUserResolver(fn() => $adminUser);
$resEmp = $searchController->search($reqEmp);
$dataEmp = $resEmp->getData(true);
testAssert($resEmp->getStatusCode() === 200, "Employee search returned 200 OK");
$foundEmp = collect($dataEmp['results'])->firstWhere('type', 'employee');
testAssert(!empty($foundEmp), "Found employee 'Alexander'");
testAssert($foundEmp['route'] === "/employees?id={$emp->employee_id}", "Route leads directly to exact record: {$foundEmp['route']}");

// 3. Test searching customer
echo "\n2. Testing Customer Search & Exact Route:\n";
$reqCust = Request::create('/api/search?q=Benjamin', 'GET');
$reqCust->setUserResolver(fn() => $adminUser);
$resCust = $searchController->search($reqCust);
$dataCust = $resCust->getData(true);
$foundCust = collect($dataCust['results'])->firstWhere('type', 'customer');
testAssert(!empty($foundCust), "Found customer 'Benjamin'");
testAssert($foundCust['route'] === "/customers?id={$cust->customer_id}", "Route leads directly to exact record: {$foundCust['route']}");

// 4. Test searching product
echo "\n3. Testing Product Search & Exact Route:\n";
$reqProd = Request::create('/api/search?q=Refrigerator', 'GET');
$reqProd->setUserResolver(fn() => $adminUser);
$resProd = $searchController->search($reqProd);
$dataProd = $resProd->getData(true);
$foundProd = collect($dataProd['results'])->firstWhere('type', 'product');
testAssert(!empty($foundProd), "Found product 'Refrigerator'");
testAssert($foundProd['route'] === "/products?id={$prod->product_id}", "Route leads directly to exact record: {$foundProd['route']}");

// 5. Test searching invoice / sale transaction
echo "\n4. Testing Sale Transaction Search & Exact Route:\n";
$reqSale = Request::create('/api/search?q=INV-GLOBAL-999', 'GET');
$reqSale->setUserResolver(fn() => $adminUser);
$resSale = $searchController->search($reqSale);
$dataSale = $resSale->getData(true);
$foundSale = collect($dataSale['results'])->firstWhere('type', 'sale');
testAssert(!empty($foundSale), "Found sale invoice 'INV-GLOBAL-999'");
testAssert($foundSale['route'] === "/transactions?id={$sale->sale_id}", "Route leads directly to exact record: {$foundSale['route']}");

// 6. Test searching installment account
echo "\n5. Testing Installment Account Search & Exact Route:\n";
$reqInst = Request::create('/api/search?q=ACC-GLOBAL-777', 'GET');
$reqInst->setUserResolver(fn() => $adminUser);
$resInst = $searchController->search($reqInst);
$dataInst = $resInst->getData(true);
$foundInst = collect($dataInst['results'])->firstWhere('type', 'installment');
testAssert(!empty($foundInst), "Found installment account 'ACC-GLOBAL-777'");
testAssert($foundInst['route'] === "/installments?id={$inst->installment_id}", "Route leads directly to exact record: {$foundInst['route']}");

// 7. Test searching payment receipt
echo "\n6. Testing Payment Receipt Search & Exact Route:\n";
$reqPay = Request::create('/api/search?q=OR-GLOBAL-555', 'GET');
$reqPay->setUserResolver(fn() => $adminUser);
$resPay = $searchController->search($reqPay);
$dataPay = $resPay->getData(true);
$foundPay = collect($dataPay['results'])->firstWhere('type', 'payment');
testAssert(!empty($foundPay), "Found payment receipt 'OR-GLOBAL-555'");
testAssert($foundPay['route'] === "/payments?id={$pay->payment_id}", "Route leads directly to exact record: {$foundPay['route']}");

// 8. Test searching module navigation
echo "\n7. Testing System Module Navigation:\n";
$reqMod = Request::create('/api/search?q=attendance', 'GET');
$reqMod->setUserResolver(fn() => $adminUser);
$resMod = $searchController->search($reqMod);
$dataMod = $resMod->getData(true);
$foundNav = collect($dataMod['results'])->firstWhere('type', 'navigation');
testAssert(!empty($foundNav), "Found navigation module for 'attendance'");
testAssert($foundNav['route'] === "/attendance", "Navigation route points to /attendance");

echo "\n========================================================\n";
echo "SUMMARY: Passed {$pass} tests, Failed {$fail} tests.\n";
echo "========================================================\n";
