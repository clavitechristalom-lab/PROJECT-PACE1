<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\BackupLog;
use App\Models\BranchProfile;
use App\Models\Customer;
use App\Models\Employee;
use App\Models\EWalletDeposit;
use App\Models\InstallmentAccount;
use App\Models\Notification;
use App\Models\Payment;
use App\Models\PaymentSchedule;
use App\Models\Product;
use App\Models\SaleTransaction;
use App\Models\User;
use App\Models\UtilityTask;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class SystemIntegrityRegressionTest extends TestCase
{
    use DatabaseTransactions;

    private function createBranch(string $suffix): BranchProfile
    {
        return BranchProfile::create([
            'name' => 'Regression Branch ' . $suffix . '-' . uniqid(),
            'location' => 'Cagayan de Oro',
            'status' => 'open',
            'color' => '#2563eb',
        ]);
    }

    private function createStaff(string $role, string $position, string $department, BranchProfile $branch, string $prefix = 'STF'): array
    {
        $emp = Employee::create([
            'employee_code' => $prefix . '-' . strtoupper(substr(uniqid(), -6)),
            'first_name' => $prefix,
            'last_name' => 'Tester',
            'email' => strtolower($prefix) . '.' . uniqid() . '@example.test',
            'position' => $position,
            'department' => $department,
            'branch_id' => $branch->id,
            'branch' => $branch->name,
            'pay_type' => 'Cash',
            'basic_salary' => 13000,
            'daily_rate' => 500,
            'hourly_rate' => 62.5,
            'status' => 'Active',
        ]);

        $user = User::create([
            'username' => strtolower($prefix) . '_user_' . uniqid(),
            'email' => $emp->email,
            'phone_number' => '0917' . random_int(1000000, 9999999),
            'password_hash' => Hash::make('secret1234'),
            'role' => $role,
            'employee_id' => $emp->employee_id,
            'is_active' => true,
            'account_verified' => true,
        ]);

        return [$user, $emp];
    }

    private function createCustomerUser(BranchProfile $branch, bool $allowInstallment = true): array
    {
        $cust = Customer::create([
            'customer_code' => 'CUS-R-' . strtoupper(substr(uniqid(), -6)),
            'first_name' => 'Maria',
            'last_name' => 'Santos',
            'email' => 'cust.' . uniqid() . '@example.test',
            'phone' => '0918' . random_int(1000000, 9999999),
            'address' => '123 Main St',
            'branch_id' => $branch->id,
            'branch' => $branch->name,
            'allow_installment' => $allowInstallment,
            'status' => 'Active',
        ]);

        $user = User::create([
            'username' => $cust->email,
            'email' => $cust->email,
            'phone_number' => $cust->phone,
            'password_hash' => Hash::make('secret1234'),
            'role' => 'Customer',
            'customer_id' => $cust->customer_id,
            'is_active' => true,
            'account_verified' => true,
        ]);

        return [$user, $cust];
    }

    public function test_unauthenticated_user_creation_and_admin_registration_escalation_are_blocked(): void
    {
        $this->postJson('/api/create_user', [
            'username' => 'hacker_admin',
            'role' => 'Administrator',
        ])->assertStatus(401);

        $this->postJson('/api/update_user', [
            'user_id' => 1,
            'role' => 'Administrator',
        ])->assertStatus(401);

        $regRes = $this->postJson('/api/register', [
            'first_name' => 'Rogue',
            'last_name' => 'Admin',
            'phone' => '09171234567',
            'address' => 'Nowhere',
            'email' => 'rogue.' . uniqid() . '@example.test',
            'password' => 'pass1234',
            'confirmPassword' => 'pass1234',
            'role' => 'Administrator',
            'from_admin' => true,
            'gender' => 'Male',
            'date_of_birth' => '1995-01-01',
            'marital_status' => 'Single',
        ]);
        $regRes->assertStatus(422);
    }

    public function test_ewallet_auto_verify_requires_admin_and_offline_collectors_remain_listed(): void
    {
        $branch = $this->createBranch('EW');
        [$custUser, $customer] = $this->createCustomerUser($branch);
        [$collectorUser, $collectorEmp] = $this->createStaff('Employee', Employee::POSITION_COLLECTOR, 'Employee', $branch, 'COL');

        // Ensure collector stays listed even with is_active = false (logged out)
        $collectorUser->is_active = false;
        $collectorUser->save();

        $collectorsRes = $this->actingAs($custUser)->getJson('/api/payments/cash/collectors');
        $collectorsRes->assertStatus(200);
        $ids = collect($collectorsRes->json('collectors'))->pluck('collector_id')->all();
        $this->assertContains($collectorUser->user_id, $ids);

        $deposit = EWalletDeposit::create([
            'user_id' => $custUser->user_id,
            'customer_id' => $customer->customer_id,
            'transaction_reference' => 'REF-SEC-' . uniqid(),
            'payment_method' => 'GCash',
            'amount' => 1500,
            'status' => 'pending',
            'payment_type' => 'deposit',
        ]);

        // Unauthenticated caller cannot force auto_verify=true
        $this->postJson('/api/payments/ewallet/simulate-webhook', [
            'transaction_reference' => $deposit->transaction_reference,
            'auto_verify' => true,
        ])->assertStatus(403);

        // Customer cannot force auto_verify=true either
        $this->actingAs($custUser)->postJson('/api/payments/ewallet/simulate-webhook', [
            'transaction_reference' => $deposit->transaction_reference,
            'auto_verify' => true,
        ])->assertStatus(403);
    }

    public function test_customer_blocked_from_employee_me_and_employee_verify_me_works(): void
    {
        $branch = $this->createBranch('EMPME');
        [$custUser] = $this->createCustomerUser($branch);
        [$empUser, $emp] = $this->createStaff('Employee', Employee::POSITION_CASHIER, 'Employee', $branch, 'EMP');

        $empCountBefore = Employee::count();
        $this->actingAs($custUser)->getJson('/api/employee/me')->assertStatus(403);
        $this->actingAs($custUser)->postJson('/api/employee/me/verify')->assertStatus(403);
        $this->assertSame($empCountBefore, Employee::count());

        $emp->forceFill([
            'phone' => '09171234567',
            'address' => 'Valid Branch Address',
            'birth_date' => '1992-05-10',
            'gender' => 'Male',
            'marital_status' => 'Single',
        ])->save();

        $this->actingAs($empUser)->postJson('/api/employee/me/verify')->assertStatus(200);
    }

    public function test_installment_sale_downpayment_math_and_pending_customer_payment_settlement(): void
    {
        $branch = $this->createBranch('SALE');
        [$storeAdmin] = $this->createStaff('Store Administrator', Employee::POSITION_MANAGER, 'Store Admin', $branch, 'SA');
        [$custUser, $customer] = $this->createCustomerUser($branch, true);
        [$otherCustUser] = $this->createCustomerUser($branch, true);

        $product = Product::create([
            'branch_id' => $branch->id,
            'product_code' => 'REG-TST-' . strtoupper(substr(uniqid(), -5)),
            'product_name' => 'Inverter Fridge 10cuft',
            'category' => 'Refrigerators',
            'unit_price' => 10000,
            'stock_quantity' => 5,
            'status' => 'Active',
        ]);

        // Create installment sale with 1000 downpayment, 10% interest on 9000 financed (= 900) => total_payable = 10900, 3 terms of 3300
        $saleRes = $this->actingAs($storeAdmin)->postJson('/api/sales', [
            'customer_id' => $customer->customer_id,
            'payment_method' => 'Installment',
            'down_payment' => 1000,
            'interest_rate' => 10,
            'number_of_installments' => 3,
            'frequency' => 'Monthly',
            'items' => [
                ['product_id' => $product->product_id, 'quantity' => 1, 'discount' => 0],
            ],
        ]);
        $saleRes->assertStatus(201);
        $saleId = $saleRes->json('sale.sale_id');

        $account = InstallmentAccount::where('sale_id', $saleId)->firstOrFail();
        $breakdown = $account->financialBreakdown();
        $this->assertEquals(10900.00, (float) $account->total_payable);
        $this->assertEquals(1000.00, $breakdown['paid']);
        $this->assertEquals(9900.00, $breakdown['balance']);
        $this->assertEquals(3300.00, (float) $account->installment_amount);

        // Other customer cannot submit payment on this account
        $this->actingAs($otherCustUser)->postJson('/api/payments', [
            'installment_id' => $account->installment_id,
            'amount' => 3300,
            'payment_method' => 'GCash',
            'reference_no' => 'UNAUTH-REF',
            'payment_date' => now()->toDateString(),
        ])->assertStatus(403);

        // Owner customer submits Pending payment: schedule & balance must NOT be settled yet!
        $payRes = $this->actingAs($custUser)->postJson('/api/payments', [
            'installment_id' => $account->installment_id,
            'amount' => 3300,
            'payment_method' => 'GCash',
            'reference_no' => 'GCASH-' . uniqid(),
            'payment_date' => now()->toDateString(),
        ]);
        $payRes->assertStatus(201);
        $paymentId = $payRes->json('payment.payment_id');
        $this->assertSame('Pending', $payRes->json('payment.status'));

        $account->refresh();
        $this->assertEquals(9900.00, $account->financialBreakdown()['balance']);
        $firstSched = PaymentSchedule::where('installment_id', $account->installment_id)->orderBy('installment_no')->firstOrFail();
        $this->assertEquals(0.00, (float) $firstSched->amount_paid);

        // Store Admin confirms receipt -> balance settles to 6600 and Schedule #1 becomes Paid!
        $this->actingAs($storeAdmin)->postJson("/api/payments/{$paymentId}/receive")->assertStatus(200);
        $account->refresh();
        $firstSched->refresh();
        $this->assertEquals(4300.00, $account->financialBreakdown()['paid']);
        $this->assertEquals(6600.00, $account->financialBreakdown()['balance']);
        $this->assertSame('Paid', $firstSched->status);

        // Settled payment cannot be rejected
        $this->actingAs($storeAdmin)->postJson("/api/payments/{$paymentId}/reject")->assertStatus(422);
    }

    public function test_reports_role_guards_and_system_settings_backup_validation(): void
    {
        $branch = $this->createBranch('SYS');
        [$admin] = $this->createStaff('Administrator', 'Main Administrator', 'Administration', $branch, 'ADM');
        [$storeAdmin] = $this->createStaff('Store Administrator', Employee::POSITION_MANAGER, 'Store Admin', $branch, 'SA');
        [$custUser] = $this->createCustomerUser($branch);

        // Customer blocked from reports
        $this->actingAs($custUser)->getJson('/api/reports/employees')->assertStatus(403);
        $this->actingAs($custUser)->getJson('/api/reports/payroll')->assertStatus(403);
        $this->actingAs($custUser)->getJson('/api/reports/attendance')->assertStatus(403);

        // Store Admin blocked from payroll report and qr monitoring
        $this->actingAs($storeAdmin)->getJson('/api/reports/payroll')->assertStatus(403);
        $this->actingAs($storeAdmin)->getJson('/api/admin/qr-monitoring')->assertStatus(403);

        // Missing backup file returns 404 instead of silent 200
        $missingBackup = BackupLog::create([
            'backup_name' => 'Missing Regression Backup',
            'file_path' => storage_path('app/backups/nonexistent_' . uniqid() . '.sql'),
            'file_size' => 0,
            'created_by' => $admin->user_id,
            'created_at' => now(),
        ]);
        $this->actingAs($admin)->postJson("/api/backups/{$missingBackup->backup_id}/restore", [])->assertStatus(404);

        // Settings persistence for maintenance_mode / debug_mode / default_language
        $saveRes = $this->actingAs($admin)->postJson('/api/settings', [
            'maintenance_mode' => false,
            'debug_mode' => true,
            'default_language' => 'en',
        ]);
        $saveRes->assertStatus(200);
        $this->assertTrue((bool) $saveRes->json('data.debug_mode'));
    }

    public function test_utility_task_workflow_and_department_isolation(): void
    {
        $branch = $this->createBranch('UTIL');
        $otherBranch = $this->createBranch('UTIL-OTHER');
        [$storeAdmin] = $this->createStaff('Store Administrator', Employee::POSITION_MANAGER, 'Store Admin', $branch, 'SA');
        [$utilityUser, $utilityEmp] = $this->createStaff('Employee', Employee::POSITION_UTILITY, 'Employee', $branch, 'UTL');
        [$cashierUser] = $this->createStaff('Employee', Employee::POSITION_CASHIER, 'Employee', $branch, 'CSH');
        [$otherStoreAdmin] = $this->createStaff('Store Administrator', Employee::POSITION_MANAGER, 'Store Admin', $otherBranch, 'SA2');

        // Store Admin assigns task to Utility employee
        $createRes = $this->actingAs($storeAdmin)->postJson('/api/utility/tasks', [
            'title' => 'Inspect Display Freezers',
            'category' => 'Appliance Inspection',
            'priority' => 'High',
            'assigned_to' => $utilityEmp->employee_id,
        ]);
        // Store Admin hits /utility-tasks (not employee-only /utility/tasks)
        $createRes->assertStatus(403);

        $createRes = $this->actingAs($storeAdmin)->postJson('/api/utility-tasks', [
            'title' => 'Inspect Display Freezers',
            'category' => 'Appliance Inspection',
            'priority' => 'High',
            'assigned_to' => $utilityEmp->employee_id,
        ]);
        $createRes->assertStatus(201);
        $taskId = $createRes->json('task.id');

        // Cashier & cross-branch Store Admin are blocked
        $this->actingAs($cashierUser)->getJson('/api/utility-tasks')->assertStatus(403);
        $this->actingAs($otherStoreAdmin)->postJson("/api/utility-tasks/{$taskId}/status", ['status' => 'Verified'])->assertStatus(403);

        // Utility completes the task (but cannot self-Verify!)
        $this->actingAs($utilityUser)->postJson("/api/utility/tasks/{$taskId}/status", [
            'status' => 'Verified',
        ])->assertStatus(403);

        $this->actingAs($utilityUser)->postJson("/api/utility/tasks/{$taskId}/status", [
            'status' => 'Completed',
            'completion_notes' => 'Checked coils and temperatures.',
        ])->assertStatus(200);

        // Store Admin verifies completion
        $verifyRes = $this->actingAs($storeAdmin)->postJson("/api/utility-tasks/{$taskId}/status", [
            'status' => 'Verified',
        ]);
        $verifyRes->assertStatus(200);
        $this->assertSame('Verified', $verifyRes->json('task.status'));
    }

    public function test_search_and_store_admin_branch_self_settings(): void
    {
        $branch = $this->createBranch('SRCH');
        $otherBranch = $this->createBranch('SRCH-2');
        [$storeAdmin] = $this->createStaff('Store Administrator', Employee::POSITION_MANAGER, 'Store Admin', $branch, 'SA');
        [$custUser] = $this->createCustomerUser($branch);

        // Store Admin cannot create/delete branches, nor edit other branch, but CAN edit own branch
        $this->actingAs($storeAdmin)->postJson('/api/branches', ['name' => 'Forbidden Branch'])->assertStatus(403);
        $this->actingAs($storeAdmin)->putJson("/api/branches/{$otherBranch->id}", ['name' => 'Hijacked'])->assertStatus(403);
        $this->actingAs($storeAdmin)->putJson("/api/branches/{$branch->id}", [
            'name' => $branch->name,
            'location' => 'Updated Location',
            'operating_hours' => '9AM - 6PM',
        ])->assertStatus(200);

        // Search works for Customer and Store Admin
        $this->actingAs($custUser)->getJson('/api/search?q=installment')->assertStatus(200);
        $this->actingAs($storeAdmin)->getJson('/api/search?q=employee')->assertStatus(200);
    }
}
