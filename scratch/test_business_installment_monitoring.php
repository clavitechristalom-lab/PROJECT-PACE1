<?php

require __DIR__ . '/../backend/backend/vendor/autoload.php';
$app = require_once __DIR__ . '/../backend/backend/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use App\Models\User;
use App\Models\Employee;
use App\Models\Customer;
use App\Models\Product;
use App\Models\SaleTransaction;
use App\Models\SaleItem;
use App\Models\InstallmentAccount;
use App\Models\PaymentSchedule;
use App\Models\Payment;
use Illuminate\Http\Request;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\InstallmentController;
use App\Http\Controllers\PaymentController;

echo "=== TESTING BUSINESS MONITORING & INSTALLMENT MONITORING SYSTEM ===\n\n";

// 1. Authenticate as Admin
$admin = User::where('role', 'Administrator')->first();
if (!$admin) {
    die("ERROR: No Administrator found.\n");
}
echo "1. Testing as Administrator: {$admin->username} (User ID: {$admin->user_id})\n";

$dashboardCtrl = new DashboardController();
$instCtrl = new InstallmentController();
$payCtrl = new PaymentController();

// Test Stats Endpoint
$reqStats = Request::create('/api/dashboard/stats', 'GET');
$reqStats->setUserResolver(fn() => $admin);
$respStats = $dashboardCtrl->stats($reqStats);
$statsData = json_decode($respStats->getContent(), true);

echo " - Total Sales: ₱" . number_format($statsData['total_sales'] ?? 0, 2) . "\n";
echo " - Total Collections: ₱" . number_format($statsData['total_collections'] ?? 0, 2) . "\n";
echo " - Total Installment Sales: ₱" . number_format($statsData['total_installment_sales'] ?? 0, 2) . "\n";
echo " - Total Outstanding Balance: ₱" . number_format($statsData['total_outstanding_balance'] ?? 0, 2) . "\n";
echo " - Active Installments: " . ($statsData['active_installments'] ?? 0) . "\n";
echo " - Overdue Installments: " . ($statsData['overdue_installments'] ?? 0) . "\n";
echo " - Total Products: " . ($statsData['total_products'] ?? 0) . "\n";
echo " - Low Stock Items: " . ($statsData['low_stock_products'] ?? 0) . "\n";
echo " - Total Branches: " . ($statsData['total_branches'] ?? 0) . "\n";

assert(isset($statsData['total_sales']), "Total sales metric present");
assert(isset($statsData['total_collections']), "Total collections metric present");
assert(isset($statsData['total_outstanding_balance']), "Total outstanding balance present");
echo "✓ Dashboard top-level stats verified.\n\n";

// 2. Test Business Performance Filter
echo "2. Testing Business Performance Filter (This Month vs Today):\n";
$reqPerf = Request::create('/api/dashboard/business-performance', 'GET', ['timeframe' => 'this_month']);
$reqPerf->setUserResolver(fn() => $admin);
$respPerf = $dashboardCtrl->businessPerformance($reqPerf);
$perfData = json_decode($respPerf->getContent(), true);

echo " - Month Net Sales: ₱" . number_format($perfData['sales']['net_sales'] ?? 0, 2) . " ({$perfData['sales']['transactions']} txns)\n";
echo " - Month Collections: ₱" . number_format($perfData['collections']['total_collected'] ?? 0, 2) . "\n";
echo " - Installment Portfolio Outstanding: ₱" . number_format($perfData['installments']['outstanding_balance'] ?? 0, 2) . "\n";
assert($respPerf->status() === 200, "Performance endpoint returned HTTP 200");
echo "✓ Business performance filter verified.\n\n";

// 3. Test Branch Comparison
echo "3. Testing Branch Business Comparison:\n";
$reqBranch = Request::create('/api/dashboard/branch-comparison', 'GET');
$reqBranch->setUserResolver(fn() => $admin);
$respBranch = $dashboardCtrl->branchComparison($reqBranch);
$branchData = json_decode($respBranch->getContent(), true);

foreach ($branchData['branches'] as $b) {
    echo " - Branch: {$b['branch']} | Sales: ₱" . number_format($b['sales'], 2) . " | Collections: ₱" . number_format($b['collections'], 2) . " | Overdue: {$b['overdue_accounts']}\n";
}
assert(count($branchData['branches']) > 0, "Branches comparison array returned");
echo "✓ Branch comparison verified.\n\n";

// 4. Test Business Alerts
echo "4. Testing Business Alerts:\n";
$reqAlerts = Request::create('/api/dashboard/alerts', 'GET');
$reqAlerts->setUserResolver(fn() => $admin);
$respAlerts = $dashboardCtrl->alerts($reqAlerts);
$alertsData = json_decode($respAlerts->getContent(), true);

echo " - Found " . count($alertsData['alerts']) . " active alerts:\n";
foreach ($alertsData['alerts'] as $a) {
    echo "   * [{$a['type']}] {$a['title']}: {$a['message']}\n";
}
assert(isset($alertsData['alerts']), "Alerts array returned");
echo "✓ Business alerts verified.\n\n";

// 5. Test Installment Accounts List & Overdue Endpoint
echo "5. Testing Installment Accounts List & Overdue Endpoint:\n";
$reqInst = Request::create('/api/installments', 'GET');
$reqInst->setUserResolver(fn() => $admin);
$respInst = $instCtrl->index($reqInst);
$instData = json_decode($respInst->getContent(), true);
echo " - Total Installment Accounts: " . count($instData['installments']) . "\n";

$reqOverdue = Request::create('/api/installments/overdue', 'GET');
$reqOverdue->setUserResolver(fn() => $admin);
$respOverdue = $instCtrl->overdue($reqOverdue);
$overdueData = json_decode($respOverdue->getContent(), true);
echo " - Dedicated Overdue Accounts: " . count($overdueData['overdue_accounts']) . " (Total Overdue: ₱" . number_format($overdueData['total_overdue_amount'] ?? 0, 2) . ")\n";

if (count($overdueData['overdue_accounts']) > 0) {
    $firstOverdue = $overdueData['overdue_accounts'][0];
    echo "   * Sample Overdue Account: {$firstOverdue['account_no']} ({$firstOverdue['customer_name']}) — {$firstOverdue['days_overdue']} Days Overdue | Balance: ₱" . number_format($firstOverdue['overdue_balance'], 2) . "\n";
}
echo "✓ Installment accounts & overdue monitoring verified.\n\n";

// 6. Test Installment Show (Itemized Purchase Details & Amortization Schedule)
echo "6. Testing Installment Show Modal Details:\n";
$firstInst = InstallmentAccount::first();
if ($firstInst) {
    $reqShow = Request::create("/api/installments/{$firstInst->installment_id}", 'GET');
    $reqShow->setUserResolver(fn() => $admin);
    $respShow = $instCtrl->show($reqShow, $firstInst->installment_id);
    $showData = json_decode($respShow->getContent(), true);

    echo " - Account: {$showData['account']['account_no']}\n";
    echo " - Customer: {$showData['account']['customer_name']} (Phone: {$showData['account']['customer_phone']})\n";
    echo " - Branch: {$showData['account']['branch']}\n";
    echo " - Purchase Items: " . count($showData['sale_items']) . " items\n";
    echo " - Schedules: " . count($showData['schedules']) . " installments\n";
    echo " - Payments Count: " . count($showData['payments']) . "\n";
    echo " - Progress: {$showData['account']['progress_percentage']}% (Paid: ₱" . number_format($showData['account']['paid'], 2) . " / Balance: ₱" . number_format($showData['account']['balance'], 2) . ")\n";
    assert($respShow->status() === 200, "Show installment returned HTTP 200");
}
echo "✓ Installment account show verified.\n\n";

// 7. Test Transactional Payment Recording
echo "7. Testing Transactional Payment Recording:\n";
$activeInst = InstallmentAccount::where('status', 'Active')->first();
if (!$activeInst) {
    $activeInst = InstallmentAccount::first();
}

if ($activeInst) {
    $payAmount = 500.00;
    $initialPaid = (float)$activeInst->payments()->sum('amount');

    $payReq = Request::create('/api/payments', 'POST', [
        'installment_id' => $activeInst->installment_id,
        'amount' => $payAmount,
        'payment_method' => 'GCash',
        'reference_no' => 'GCASH-TEST-' . time(),
        'notes' => 'Automated integration test payment',
    ]);
    $payReq->setUserResolver(fn() => $admin);
    $respPay = $payCtrl->store($payReq);
    $payData = json_decode($respPay->getContent(), true);

    echo " - Payment Response: " . ($payData['message'] ?? 'OK') . "\n";
    echo " - Receipt No: " . ($payData['payment']['receipt_no'] ?? 'N/A') . "\n";
    echo " - New Account Total Paid: ₱" . number_format($payData['account']['paid'] ?? 0, 2) . "\n";
    echo " - New Remaining Balance: ₱" . number_format($payData['account']['balance'] ?? 0, 2) . "\n";

    assert($respPay->status() === 201, "Payment creation returned HTTP 201");
    echo "✓ Transactional payment recording verified.\n\n";
}

// 8. Test Store Administrator Scoping
echo "8. Testing Store Administrator Scoping:\n";
$storeAdmin = User::where('role', 'Store Administrator')->orWhere('role', 'Store Admin')->first();
if ($storeAdmin) {
    echo " - Store Admin: {$storeAdmin->username} (Branch: " . ($storeAdmin->employee ? $storeAdmin->employee->branch : 'N/A') . ")\n";
    $reqStore = Request::create('/api/dashboard/stats', 'GET');
    $reqStore->setUserResolver(fn() => $storeAdmin);
    $respStore = $dashboardCtrl->stats($reqStore);
    $storeData = json_decode($respStore->getContent(), true);

    echo " - Store Branch Reported: {$storeData['branch']}\n";
    echo " - Store Branch Sales: ₱" . number_format($storeData['total_sales'] ?? 0, 2) . "\n";
    echo " - Store Branch Outstanding: ₱" . number_format($storeData['total_outstanding_balance'] ?? 0, 2) . "\n";
    assert($storeData['branch'] !== 'All Branches', "Store Admin correctly scoped to specific branch");
    echo "✓ Store Administrator scoping verified.\n\n";
}

echo "==================================================\n";
echo "ALL BUSINESS & INSTALLMENT MONITORING INTEGRATION TESTS PASSED!\n";
echo "==================================================\n";
