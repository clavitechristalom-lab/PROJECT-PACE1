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
use App\Models\SystemLog;
use Illuminate\Support\Facades\DB;

echo "=== SEEDING REALISTIC BUSINESS & INSTALLMENT DATA ===\n\n";

DB::beginTransaction();

try {
    // 1. Employees & Branches
    $empAdmin = Employee::first();
    if (!$empAdmin) {
        $empAdmin = Employee::create([
            'employee_code' => 'EMP-001',
            'first_name' => 'System',
            'last_name' => 'Administrator',
            'position' => 'General Manager',
            'department' => 'Management',
            'branch' => 'Main Branch',
            'basic_salary' => 45000,
            'hourly_rate' => 255.68,
            'status' => 'Active',
        ]);
    } else {
        $empAdmin->update(['branch' => 'Main Branch']);
    }

    $empNorth = Employee::firstOrCreate(
        ['employee_code' => 'EMP-002'],
        [
            'first_name' => 'Maria',
            'last_name' => 'Santos',
            'position' => 'Store Manager',
            'department' => 'Sales',
            'branch' => 'North Branch',
            'basic_salary' => 28000,
            'hourly_rate' => 159.09,
            'status' => 'Active',
        ]
    );

    $empSouth = Employee::firstOrCreate(
        ['employee_code' => 'EMP-003'],
        [
            'first_name' => 'Roberto',
            'last_name' => 'Cruz',
            'position' => 'Store Manager',
            'department' => 'Sales',
            'branch' => 'South Branch',
            'basic_salary' => 28000,
            'hourly_rate' => 159.09,
            'status' => 'Active',
        ]
    );

    // Users for branch sales attribution
    $userAdmin = User::where('role', 'Administrator')->first();
    $userNorth = User::firstOrCreate(
        ['username' => 'storeadmin_north'],
        [
            'email' => 'north@pace.ph',
            'password_hash' => bcrypt('password123'),
            'role' => 'Store Administrator',
            'employee_id' => $empNorth->employee_id,
            'account_verified' => true,
        ]
    );
    $userSouth = User::firstOrCreate(
        ['username' => 'storeadmin_south'],
        [
            'email' => 'south@pace.ph',
            'password_hash' => bcrypt('password123'),
            'role' => 'Store Administrator',
            'employee_id' => $empSouth->employee_id,
            'account_verified' => true,
        ]
    );

    // 2. Products (Appliances & Furniture)
    $productsData = [
        ['product_code' => 'APP-REF-001', 'product_name' => 'Samsung Inverter Refrigerator 8.4 cu ft', 'category' => 'Appliances', 'brand' => 'Samsung', 'unit_price' => 24999.00, 'cost_price' => 18500.00, 'stock_quantity' => 12, 'reorder_level' => 5],
        ['product_code' => 'APP-AC-002', 'product_name' => 'Carrier Split Type Inverter AC 1.5HP', 'category' => 'Appliances', 'brand' => 'Carrier', 'unit_price' => 38500.00, 'cost_price' => 29000.00, 'stock_quantity' => 3, 'reorder_level' => 5], // Low Stock!
        ['product_code' => 'APP-TV-003', 'product_name' => 'LG 55-inch 4K UHD Smart TV', 'category' => 'Appliances', 'brand' => 'LG', 'unit_price' => 32000.00, 'cost_price' => 24000.00, 'stock_quantity' => 8, 'reorder_level' => 3],
        ['product_code' => 'APP-WM-004', 'product_name' => 'Panasonic Fully Auto Washing Machine 9kg', 'category' => 'Appliances', 'brand' => 'Panasonic', 'unit_price' => 18999.00, 'cost_price' => 14000.00, 'stock_quantity' => 0, 'reorder_level' => 4], // Out of Stock!
        ['product_code' => 'FUR-SOF-001', 'product_name' => 'Modern 3-Seater L-Shape Fabric Sofa', 'category' => 'Furniture', 'brand' => 'Pace Living', 'unit_price' => 21500.00, 'cost_price' => 13500.00, 'stock_quantity' => 6, 'reorder_level' => 2],
        ['product_code' => 'FUR-DIN-002', 'product_name' => '6-Seater Solid Wood Dining Set', 'category' => 'Furniture', 'brand' => 'Pace Living', 'unit_price' => 27500.00, 'cost_price' => 17000.00, 'stock_quantity' => 4, 'reorder_level' => 2],
        ['product_code' => 'FUR-BED-003', 'product_name' => 'Queen Size Ergonomic Bed Frame with Storage', 'category' => 'Furniture', 'brand' => 'Pace Living', 'unit_price' => 19500.00, 'cost_price' => 12000.00, 'stock_quantity' => 2, 'reorder_level' => 3], // Low Stock!
    ];

    $productModels = [];
    foreach ($productsData as $p) {
        $productModels[$p['product_code']] = Product::create($p);
    }
    echo "✓ Seeded " . count($productModels) . " products (including low stock & out of stock)\n";

    // 3. Customers
    $customersData = [
        ['customer_code' => 'CUST-001', 'first_name' => 'Juan', 'last_name' => 'Dela Cruz', 'phone' => '09171234567', 'email' => 'juan.delacruz@gmail.com', 'address' => 'Blk 12 Lot 5, Mabini St, Cagayan de Oro', 'status' => 'Active'],
        ['customer_code' => 'CUST-002', 'first_name' => 'Elena', 'last_name' => 'Reyes', 'phone' => '09289876543', 'email' => 'elena.reyes@yahoo.com', 'address' => '45 Rizal Avenue, Carmen, Cagayan de Oro', 'status' => 'Active'],
        ['customer_code' => 'CUST-003', 'first_name' => 'Mark', 'last_name' => 'Villanueva', 'phone' => '09395551234', 'email' => 'mark.villa@gmail.com', 'address' => '12 Burgos St, Lapasan, Cagayan de Oro', 'status' => 'Active'],
        ['customer_code' => 'CUST-004', 'first_name' => 'Ana', 'last_name' => 'Bautista', 'phone' => '09194448899', 'email' => 'ana.bautista@outlook.com', 'address' => '88 Vamenta Blvd, Carmen, Cagayan de Oro', 'status' => 'Active'],
        ['customer_code' => 'CUST-005', 'first_name' => 'Carlos', 'last_name' => 'Mendoza', 'phone' => '09187773322', 'email' => 'carlos.mendoza@gmail.com', 'address' => 'Km 3 National Highway, Kauswagan, CDO', 'status' => 'Active'],
    ];

    $customerModels = [];
    foreach ($customersData as $c) {
        $customerModels[$c['customer_code']] = Customer::create($c);
    }
    echo "✓ Seeded " . count($customerModels) . " customer profiles\n";

    // 4. Sales & Installment Accounts

    // Sale 1: Cash Sale at Main Branch
    $sale1 = SaleTransaction::create([
        'invoice_no' => 'INV-2026-0001',
        'customer_id' => $customerModels['CUST-001']->customer_id,
        'processed_by' => $userAdmin->user_id,
        'sale_date' => date('Y-m-d H:i:s', strtotime('-10 days')),
        'payment_method' => 'Cash',
        'subtotal' => 24999.00,
        'discount_amount' => 1000.00,
        'total_amount' => 23999.00,
        'amount_paid' => 23999.00,
        'balance_due' => 0.00,
        'status' => 'completed',
        'notes' => 'Cash in full',
    ]);
    SaleItem::create([
        'sale_id' => $sale1->sale_id,
        'product_id' => $productModels['APP-REF-001']->product_id,
        'quantity' => 1,
        'unit_price' => 24999.00,
        'discount_amount' => 1000.00,
        'line_total' => 23999.00,
    ]);

    // Sale 2: Active Installment at Main Branch (Elena Reyes - Carrier AC)
    $sale2 = SaleTransaction::create([
        'invoice_no' => 'INV-2026-0002',
        'customer_id' => $customerModels['CUST-002']->customer_id,
        'processed_by' => $userAdmin->user_id,
        'sale_date' => date('Y-m-d H:i:s', strtotime('-45 days')),
        'payment_method' => 'Installment',
        'subtotal' => 38500.00,
        'discount_amount' => 0.00,
        'total_amount' => 42350.00, // includes interest
        'amount_paid' => 14350.00, // Down payment 8,000 + 1st payment 6,350
        'balance_due' => 28000.00,
        'status' => 'partially_paid',
    ]);
    SaleItem::create([
        'sale_id' => $sale2->sale_id,
        'product_id' => $productModels['APP-AC-002']->product_id,
        'quantity' => 1,
        'unit_price' => 38500.00,
        'discount_amount' => 0.00,
        'line_total' => 38500.00,
    ]);

    $inst2 = InstallmentAccount::create([
        'account_no' => 'ACC-2026-00001',
        'customer_id' => $customerModels['CUST-002']->customer_id,
        'sale_id' => $sale2->sale_id,
        'start_date' => date('Y-m-d', strtotime('-45 days')),
        'principal_amount' => 38500.00,
        'down_payment' => 8000.00,
        'interest_rate' => 10.00,
        'interest_amount' => 3850.00,
        'total_payable' => 42350.00,
        'installment_amount' => 5725.00,
        'number_of_installments' => 6,
        'frequency' => 'Monthly',
        'status' => 'Active',
    ]);

    // Schedules for Inst 2 (6 months)
    for ($i = 1; $i <= 6; $i++) {
        $dueDate = date('Y-m-d', strtotime('-45 days +' . ($i * 30) . ' days'));
        $isPaid = ($i === 1);
        $sched = PaymentSchedule::create([
            'installment_id' => $inst2->installment_id,
            'installment_no' => $i,
            'due_date' => $dueDate,
            'amount_due' => 5725.00,
            'amount_paid' => $isPaid ? 5725.00 : 0.00,
            'balance_due' => $isPaid ? 0.00 : 5725.00,
            'status' => $isPaid ? 'Paid' : 'Pending',
            'paid_date' => $isPaid ? date('Y-m-d', strtotime('-15 days')) : null,
        ]);

        if ($isPaid) {
            Payment::create([
                'installment_id' => $inst2->installment_id,
                'schedule_id' => $sched->schedule_id,
                'receipt_no' => 'REC-2026-00001',
                'payment_date' => date('Y-m-d', strtotime('-15 days')),
                'amount' => 5725.00,
                'payment_method' => 'GCash',
                'reference_no' => 'GCASH-982319028',
                'received_by' => $userAdmin->user_id,
                'notes' => '1st Installment amortization paid via GCash',
            ]);
        }
    }

    // Sale 3: OVERDUE Installment at North Branch (Mark Villanueva - LG TV)
    $sale3 = SaleTransaction::create([
        'invoice_no' => 'INV-2026-0003',
        'customer_id' => $customerModels['CUST-003']->customer_id,
        'processed_by' => $userNorth->user_id,
        'sale_date' => date('Y-m-d H:i:s', strtotime('-75 days')),
        'payment_method' => 'Installment',
        'subtotal' => 32000.00,
        'discount_amount' => 0.00,
        'total_amount' => 35200.00,
        'amount_paid' => 6000.00, // Down payment only
        'balance_due' => 29200.00,
        'status' => 'partially_paid',
    ]);
    SaleItem::create([
        'sale_id' => $sale3->sale_id,
        'product_id' => $productModels['APP-TV-003']->product_id,
        'quantity' => 1,
        'unit_price' => 32000.00,
        'discount_amount' => 0.00,
        'line_total' => 32000.00,
    ]);

    $inst3 = InstallmentAccount::create([
        'account_no' => 'ACC-2026-00002',
        'customer_id' => $customerModels['CUST-003']->customer_id,
        'sale_id' => $sale3->sale_id,
        'start_date' => date('Y-m-d', strtotime('-75 days')),
        'principal_amount' => 32000.00,
        'down_payment' => 6000.00,
        'interest_rate' => 10.00,
        'interest_amount' => 3200.00,
        'total_payable' => 35200.00,
        'installment_amount' => 4866.67,
        'number_of_installments' => 6,
        'frequency' => 'Monthly',
        'status' => 'Overdue',
    ]);

    // Schedules for Inst 3 (1st and 2nd schedules are overdue!)
    for ($i = 1; $i <= 6; $i++) {
        $dueDate = date('Y-m-d', strtotime('-75 days +' . ($i * 30) . ' days'));
        $isOverdue = ($dueDate < date('Y-m-d'));
        PaymentSchedule::create([
            'installment_id' => $inst3->installment_id,
            'installment_no' => $i,
            'due_date' => $dueDate,
            'amount_due' => 4866.67,
            'amount_paid' => 0.00,
            'balance_due' => 4866.67,
            'status' => $isOverdue ? 'Overdue' : 'Pending',
        ]);
    }

    // Sale 4: COMPLETED Installment at South Branch (Ana Bautista - Sofa)
    $sale4 = SaleTransaction::create([
        'invoice_no' => 'INV-2026-0004',
        'customer_id' => $customerModels['CUST-004']->customer_id,
        'processed_by' => $userSouth->user_id,
        'sale_date' => date('Y-m-d H:i:s', strtotime('-120 days')),
        'payment_method' => 'Installment',
        'subtotal' => 21500.00,
        'discount_amount' => 0.00,
        'total_amount' => 23650.00,
        'amount_paid' => 23650.00,
        'balance_due' => 0.00,
        'status' => 'completed',
    ]);
    SaleItem::create([
        'sale_id' => $sale4->sale_id,
        'product_id' => $productModels['FUR-SOF-001']->product_id,
        'quantity' => 1,
        'unit_price' => 21500.00,
        'discount_amount' => 0.00,
        'line_total' => 21500.00,
    ]);

    $inst4 = InstallmentAccount::create([
        'account_no' => 'ACC-2026-00003',
        'customer_id' => $customerModels['CUST-004']->customer_id,
        'sale_id' => $sale4->sale_id,
        'start_date' => date('Y-m-d', strtotime('-120 days')),
        'principal_amount' => 21500.00,
        'down_payment' => 5000.00,
        'interest_rate' => 10.00,
        'interest_amount' => 2150.00,
        'total_payable' => 23650.00,
        'installment_amount' => 6216.67,
        'number_of_installments' => 3,
        'frequency' => 'Monthly',
        'status' => 'Completed',
    ]);

    for ($i = 1; $i <= 3; $i++) {
        $dueDate = date('Y-m-d', strtotime('-120 days +' . ($i * 30) . ' days'));
        $sched = PaymentSchedule::create([
            'installment_id' => $inst4->installment_id,
            'installment_no' => $i,
            'due_date' => $dueDate,
            'amount_due' => 6216.67,
            'amount_paid' => 6216.67,
            'balance_due' => 0.00,
            'status' => 'Paid',
            'paid_date' => $dueDate,
        ]);

        Payment::create([
            'installment_id' => $inst4->installment_id,
            'schedule_id' => $sched->schedule_id,
            'receipt_no' => 'REC-2026-0000' . ($i + 1),
            'payment_date' => $dueDate,
            'amount' => 6216.67,
            'payment_method' => ($i % 2 === 0) ? 'Maya' : 'Cash',
            'reference_no' => ($i % 2 === 0) ? 'MAYA-44910293' : null,
            'received_by' => $userSouth->user_id,
            'notes' => "Installment Amortization #{$i} paid in full",
        ]);
    }

    echo "✓ Seeded 4 Sales Transactions & Installment Accounts (Active, Overdue, and Completed)\n";

    DB::commit();
    echo "\n=== SEEDING COMPLETED SUCCESSFULLY ===\n";
} catch (\Exception $e) {
    DB::rollBack();
    echo "ERROR SEEDING: " . $e->getMessage() . "\n" . $e->getTraceAsString() . "\n";
}
