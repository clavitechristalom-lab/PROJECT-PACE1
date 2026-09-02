<?php

require __DIR__ . '/../backend/backend/vendor/autoload.php';
$app = require_once __DIR__ . '/../backend/backend/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use App\Models\Customer;
use App\Models\Product;
use App\Models\SaleTransaction;
use App\Models\SaleItem;
use App\Models\InstallmentAccount;
use App\Models\PaymentSchedule;
use App\Models\Payment;
use App\Models\Employee;
use App\Models\User;

echo "Products: " . Product::count() . "\n";
echo "Customers: " . Customer::count() . "\n";
echo "Sales: " . SaleTransaction::count() . "\n";
echo "Installments: " . InstallmentAccount::count() . "\n";
echo "Schedules: " . PaymentSchedule::count() . "\n";
echo "Payments: " . Payment::count() . "\n";
echo "Employees: " . Employee::count() . "\n";
echo "Users: " . User::count() . "\n";
