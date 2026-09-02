<?php

require __DIR__ . '/../backend/backend/vendor/autoload.php';
$app = require_once __DIR__ . '/../backend/backend/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use App\Models\User;
use App\Models\Customer;
use App\Models\Product;
use App\Models\InstallmentAccount;
use App\Models\PaymentSchedule;
use App\Models\Payment;
use Illuminate\Http\Request;
use App\Http\Controllers\InstallmentController;
use App\Http\Controllers\PaymentController;

echo "=== TESTING CUSTOMER INSTALLMENT ACCOUNT FEATURE ===\n\n";

$admin = User::where('role', 'Administrator')->first();
if (!$admin) {
    die("ERROR: No Administrator user found.\n");
}
echo "1. Authenticated as Administrator: {$admin->username}\n";

$instCtrl = new InstallmentController();
$payCtrl = new PaymentController();

// 1. Create a New Customer Installment Account (POST /api/installments)
echo "\n2. Testing POST /api/installments (Add Customer Account):\n";
$prod = Product::first();
$reqCreate = Request::create('/api/installments', 'POST', [
    'first_name' => 'Ferdinand',
    'last_name' => 'Marcos',
    'phone' => '09178889900',
    'email' => 'ferdinand@test.ph',
    'address' => 'Poblacion, Cagayan de Oro',
    'product_id' => $prod ? $prod->product_id : null,
    'product_name' => $prod ? $prod->product_name : 'Smart Inverter Refrigerator',
    'principal_amount' => 30000.00,
    'down_payment' => 5000.00,
    'interest_rate' => 10.0,
    'interest_amount' => 2500.00,
    'total_payable' => 32500.00,
    'installment_amount' => 4583.33,
    'number_of_installments' => 6,
    'frequency' => 'Monthly',
    'start_date' => date('Y-m-d'),
    'due_date' => date('Y-m-d', strtotime('+30 days')),
    'status' => 'Active',
    'notes' => 'Customer verified with 2 valid IDs',
]);
$reqCreate->setUserResolver(fn() => $admin);
$respCreate = $instCtrl->store($reqCreate);
$createData = json_decode($respCreate->getContent(), true);

echo " - Message: " . ($createData['message'] ?? 'OK') . "\n";
echo " - Account No: " . ($createData['account']['account_no'] ?? 'N/A') . "\n";
echo " - Customer: " . ($createData['account']['customer_name'] ?? 'N/A') . "\n";
echo " - Total Payable: ₱" . number_format($createData['account']['total_payable'] ?? 0, 2) . "\n";
echo " - Down Payment: ₱" . number_format($createData['account']['down_payment'] ?? 0, 2) . "\n";
echo " - Outstanding Balance: ₱" . number_format($createData['account']['balance'] ?? 0, 2) . "\n";
echo " - Status: " . ($createData['account']['status'] ?? 'N/A') . "\n";

assert($respCreate->status() === 201, "Account creation returned HTTP 201");
assert(!empty($createData['account']['account_no']), "Account number generated");
$newAccountId = $createData['account']['installment_id'];
echo "✓ Account created successfully.\n";

// 2. Test GET /api/installments
echo "\n3. Testing GET /api/installments (List Accounts):\n";
$reqList = Request::create('/api/installments', 'GET');
$reqList->setUserResolver(fn() => $admin);
$respList = $instCtrl->index($reqList);
$listData = json_decode($respList->getContent(), true);

echo " - Total Accounts Returned: " . count($listData['installments']) . "\n";
$foundNew = false;
foreach ($listData['installments'] as $acc) {
    if ($acc['installment_id'] === $newAccountId) {
        $foundNew = true;
        echo " - Found newly created account {$acc['account_no']} in list with balance ₱" . number_format($acc['balance'], 2) . "\n";
        break;
    }
}
assert($foundNew, "Newly created account exists in GET /api/installments");
echo "✓ List endpoint verified.\n";

// 3. Test GET /api/installments/{id}
echo "\n4. Testing GET /api/installments/{id} (View Details):\n";
$reqShow = Request::create("/api/installments/{$newAccountId}", 'GET');
$reqShow->setUserResolver(fn() => $admin);
$respShow = $instCtrl->show($reqShow, $newAccountId);
$showData = json_decode($respShow->getContent(), true);

echo " - Account No: {$showData['account']['account_no']}\n";
echo " - Schedules Count: " . count($showData['schedules']) . " installments\n";
echo " - Payments Count: " . count($showData['payments']) . " (Down payment recorded)\n";
assert(count($showData['schedules']) === 6, "6 schedule installments generated");
echo "✓ Show endpoint verified.\n";

// 4. Test PUT /api/installments/{id} (Update Account)
echo "\n5. Testing PUT /api/installments/{id} (Edit Account):\n";
$reqUpdate = Request::create("/api/installments/{$newAccountId}", 'PUT', [
    'phone' => '09179998811',
    'status' => 'Active',
    'notes' => 'Updated contact information and confirmed delivery',
]);
$reqUpdate->setUserResolver(fn() => $admin);
$respUpdate = $instCtrl->update($reqUpdate, $newAccountId);
$updateData = json_decode($respUpdate->getContent(), true);

echo " - Update Message: " . ($updateData['message'] ?? 'OK') . "\n";
echo " - Updated Phone: " . ($updateData['account']['customer_phone'] ?? 'N/A') . "\n";
assert($updateData['account']['customer_phone'] === '09179998811', "Phone updated");
echo "✓ Update endpoint verified.\n";

// 5. Test POST /api/payments (Record Payment)
echo "\n6. Testing POST /api/payments (Record Payment):\n";
$reqPay = Request::create('/api/payments', 'POST', [
    'installment_id' => $newAccountId,
    'amount' => 4583.33,
    'payment_method' => 'GCash',
    'reference_no' => 'GCASH-TEST-' . time(),
    'notes' => '1st installment payment',
]);
$reqPay->setUserResolver(fn() => $admin);
$respPay = $payCtrl->store($reqPay);
$payData = json_decode($respPay->getContent(), true);

echo " - Payment Message: " . ($payData['message'] ?? 'OK') . "\n";
echo " - Receipt No: " . ($payData['payment']['receipt_no'] ?? 'N/A') . "\n";
echo " - New Total Paid: ₱" . number_format($payData['account']['paid'] ?? 0, 2) . "\n";
echo " - Remaining Balance: ₱" . number_format($payData['account']['balance'] ?? 0, 2) . "\n";
assert($respPay->status() === 201, "Payment recorded");
echo "✓ Payment recording verified.\n";

// 6. Test DELETE /api/installments/{id}
echo "\n7. Testing DELETE /api/installments/{id} (Delete Account):\n";
$reqDel = Request::create("/api/installments/{$newAccountId}", 'DELETE');
$reqDel->setUserResolver(fn() => $admin);
$respDel = $instCtrl->destroy($reqDel, $newAccountId);
$delData = json_decode($respDel->getContent(), true);

echo " - Delete Message: " . ($delData['message'] ?? 'OK') . "\n";
assert($respDel->status() === 200, "Account deleted");
$checkDeleted = InstallmentAccount::find($newAccountId);
assert($checkDeleted === null, "Account record is removed from database");
echo "✓ Delete endpoint verified.\n";

echo "\n==================================================\n";
echo "ALL CUSTOMER INSTALLMENT ACCOUNT TESTS PASSED!\n";
echo "==================================================\n";
