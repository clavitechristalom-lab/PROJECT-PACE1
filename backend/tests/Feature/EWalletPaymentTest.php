<?php

namespace Tests\Feature;

use Tests\TestCase;
use App\Models\EWalletDeposit;
use App\Models\Customer;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;

class EWalletPaymentTest extends TestCase
{
    use DatabaseTransactions;

    public function test_can_create_checkout_and_deposit()
    {
        $user = \App\Models\User::create([
            'username' => 'testuser_' . uniqid(),
            'password_hash' => bcrypt('password123'),
            'role' => 'Customer',
            'is_active' => true,
        ]);

        $response = $this->actingAs($user)->postJson('/api/payments/ewallet/checkout', [
            'amount' => 15000,
            'payment_method' => 'GCash',
            'payment_type' => 'deposit',
        ]);

        $response->assertStatus(201);
        $response->assertJson(['success' => true]);

        $depositData = $response->json('deposit');
        $this->assertNotEmpty($depositData['transaction_reference']);
        $this->assertStringStartsWith('REF-GCASH-', $depositData['transaction_reference']);
        $this->assertNotEmpty($depositData['qr_code_data']);
        $this->assertEquals('pending', $depositData['status']);
    }

    public function test_payment_confirmation_and_automated_detection()
    {
        $customer = Customer::create([
            'first_name' => 'Juan',
            'last_name' => 'Dela Cruz',
            'email' => 'juan@example.com',
            'phone' => '09123456789',
            'status' => 'active',
            'wallet_balance' => 0.00,
        ]);

        $deposit = EWalletDeposit::create([
            'transaction_reference' => 'REF-GCASH-' . uniqid(),
            'customer_id' => $customer->customer_id,
            'amount' => 15000.00,
            'payment_method' => 'GCash',
            'payment_type' => 'deposit',
            'status' => 'pending',
            'qr_code_data' => '0002010102122658...',
        ]);

        // Post payment confirmation to /api/webhooks/payment
        $response = $this->postJson('/api/webhooks/payment', [
            'reference' => $deposit->transaction_reference,
            'status' => 'paid',
            'amount' => 15000.00,
        ]);

        $response->assertStatus(200);
        $response->assertJson(['status' => 'success']);

        // Verify deposit updated to 'paid' instantly in database
        $deposit->refresh();
        $this->assertEquals('paid', $deposit->status);
        $this->assertNotNull($deposit->paid_at);

        // Verify customer wallet balance credited automatically
        $customer->refresh();
        $this->assertEquals(15000.00, (float)$customer->wallet_balance);

        // Test Idempotency: Posting duplicate should return 200 without double crediting
        $responseDuplicate = $this->postJson('/api/webhooks/payment', [
            'reference' => $deposit->transaction_reference,
            'status' => 'paid',
            'amount' => 15000.00,
        ]);

        $responseDuplicate->assertStatus(200);
        $customer->refresh();
        $this->assertEquals(15000.00, (float)$customer->wallet_balance); // balance remains 15000, not 30000
    }

    public function test_product_order_creates_sale_and_deducts_stock()
    {
        $customer = Customer::create([
            'first_name' => 'Maria',
            'last_name' => 'Santos',
            'email' => 'maria@example.com',
            'phone' => '09987654321',
            'status' => 'active',
            'wallet_balance' => 0.00,
        ]);

        $product = \App\Models\Product::create([
            'product_name' => 'Smart Inverter Refrigerator',
            'product_code' => 'TEST-REF-' . uniqid(),
            'category' => 'Appliances',
            'unit_price' => 25000.00,
            'stock_quantity' => 10,
            'status' => 'Active',
        ]);

        $deposit = EWalletDeposit::create([
            'transaction_reference' => 'REF-PROD-' . uniqid(),
            'customer_id' => $customer->customer_id,
            'amount' => 25000.00,
            'payment_method' => 'GCash',
            'payment_type' => 'product_order',
            'status' => 'pending',
            'qr_code_data' => '0002010102122658...',
            'gateway_response' => [
                'items' => [
                    [
                        'product_id' => $product->product_id,
                        'product_name' => $product->product_name,
                        'price' => 25000.00,
                        'quantity' => 2,
                    ]
                ]
            ],
        ]);

        $response = $this->postJson('/api/webhooks/payment', [
            'reference' => $deposit->transaction_reference,
            'status' => 'paid',
        ]);

        $response->assertStatus(200);
        $response->assertJson(['status' => 'success']);

        // Check deposit status is marked Paid
        $deposit->refresh();
        $this->assertEquals('paid', $deposit->status);

        // Check product stock was decremented from 10 to 8
        $product->refresh();
        $this->assertEquals(8, $product->stock_quantity);

        // Check sale transaction was automatically generated and marked 'Completed'
        $this->assertDatabaseHas('sale_transactions', [
            'customer_id' => $customer->customer_id,
            'total_amount' => 25000.00,
            'status' => 'Completed',
        ]);

        // Check sale items were stored
        $this->assertDatabaseHas('sale_items', [
            'product_id' => $product->product_id,
            'quantity' => 2,
            'unit_price' => 25000.00,
        ]);
    }

    public function test_installment_order_creates_active_installment_plan_and_schedules()
    {
        $customer = Customer::create([
            'first_name' => 'Carlos',
            'last_name' => 'Reyes',
            'email' => 'carlos@example.com',
            'phone' => '09171234567',
            'status' => 'active',
            'wallet_balance' => 0.00,
        ]);

        $product = \App\Models\Product::create([
            'product_name' => 'Nordic 3-Seater Sofa',
            'product_code' => 'TEST-FUR-' . uniqid(),
            'category' => 'Furniture',
            'unit_price' => 30000.00,
            'stock_quantity' => 5,
            'status' => 'Active',
        ]);

        $downpayment = 6000.00; // 20% downpayment
        $totalPayable = 30900.00; // 3% interest added on principal
        $monthlyAmort = 4150.00; // 24900 / 6

        $deposit = EWalletDeposit::create([
            'transaction_reference' => 'REF-GCASH-INST-' . uniqid(),
            'customer_id' => $customer->customer_id,
            'amount' => $downpayment,
            'payment_method' => 'GCash',
            'payment_type' => 'installment_order',
            'status' => 'pending',
            'qr_code_data' => '0002010102122658...',
            'gateway_response' => [
                'items' => [
                    [
                        'product_id' => $product->product_id,
                        'product_name' => $product->product_name,
                        'price' => 30000.00,
                        'quantity' => 1,
                    ]
                ],
                'installment_plan' => [
                    'term_months' => 6,
                    'downpayment' => $downpayment,
                    'monthly_amortization' => $monthlyAmort,
                    'interest_rate' => 3.0,
                    'total_payable' => $totalPayable,
                ]
            ],
        ]);

        $response = $this->postJson('/api/webhooks/payment', [
            'reference' => $deposit->transaction_reference,
            'status' => 'paid',
        ]);

        $response->assertStatus(200);
        $response->assertJson(['status' => 'success']);

        // Check deposit status is marked Paid
        $deposit->refresh();
        $this->assertEquals('paid', $deposit->status);
        $this->assertNotNull($deposit->installment_id);

        // Check product stock was decremented from 5 to 4
        $product->refresh();
        $this->assertEquals(4, $product->stock_quantity);

        // Check sale transaction was marked 'Active Installment'
        $this->assertDatabaseHas('sale_transactions', [
            'customer_id' => $customer->customer_id,
            'amount_paid' => $downpayment,
            'total_amount' => $totalPayable,
            'status' => 'Active Installment',
        ]);

        // Check InstallmentAccount created with status 'Active'
        $this->assertDatabaseHas('installment_accounts', [
            'customer_id' => $customer->customer_id,
            'number_of_installments' => 6,
            'down_payment' => $downpayment,
            'status' => 'Active',
        ]);

        // Check that 6 payment schedule records exist
        $schedulesCount = \App\Models\PaymentSchedule::where('installment_id', $deposit->installment_id)->count();
        $this->assertEquals(6, $schedulesCount);
    }

    public function test_installment_due_payment_updates_account_and_schedules()
    {
        $customer = Customer::create([
            'first_name' => 'Elena',
            'last_name' => 'Ramos',
            'email' => 'elena_' . uniqid() . '@example.com',
            'phone' => '09181234567',
            'status' => 'active',
            'allow_installment' => true,
        ]);

        $account = \App\Models\InstallmentAccount::create([
            'account_no' => 'ACC-' . date('Y') . '-' . rand(1000, 9999),
            'customer_id' => $customer->customer_id,
            'start_date' => now()->toDateString(),
            'principal_amount' => 20000.00,
            'down_payment' => 4000.00,
            'interest_rate' => 0,
            'interest_amount' => 0,
            'total_payable' => 20000.00,
            'installment_amount' => 5333.33,
            'number_of_installments' => 3,
            'frequency' => 'Monthly',
            'total_paid' => 4000.00,
            'balance' => 16000.00,
            'status' => 'Active',
        ]);

        $schedule1 = \App\Models\PaymentSchedule::create([
            'installment_id' => $account->installment_id,
            'installment_no' => 1,
            'due_date' => now()->addDays(15)->toDateString(),
            'amount_due' => 5333.33,
            'amount_paid' => 0.00,
            'balance_due' => 5333.33,
            'status' => 'Pending',
        ]);

        $schedule2 = \App\Models\PaymentSchedule::create([
            'installment_id' => $account->installment_id,
            'installment_no' => 2,
            'due_date' => now()->addDays(45)->toDateString(),
            'amount_due' => 5333.33,
            'amount_paid' => 0.00,
            'balance_due' => 5333.33,
            'status' => 'Pending',
        ]);

        // Customer pays due of ₱5,333.33 via GCash (linked to ACC-2026-...)
        $deposit = EWalletDeposit::create([
            'transaction_reference' => 'REF-GCASH-DUE-' . uniqid(),
            'customer_id' => $customer->customer_id,
            'installment_id' => $account->installment_id,
            'schedule_id' => $schedule1->schedule_id,
            'amount' => 5333.33,
            'payment_method' => 'GCash',
            'payment_type' => 'installment_payment',
            'status' => 'pending',
            'qr_code_data' => '0002010102122658...',
        ]);

        // Payment confirmed
        $response = $this->postJson('/api/webhooks/payment', [
            'reference' => $deposit->transaction_reference,
            'status' => 'paid',
        ]);

        $response->assertStatus(200);
        $response->assertJson(['status' => 'success']);

        // Check deposit is paid
        $deposit->refresh();
        $this->assertEquals('paid', $deposit->status);
        $this->assertNotNull($deposit->payment_id);

        // Check schedule 1 was updated to Paid
        $schedule1->refresh();
        $this->assertEquals('Paid', $schedule1->status);
        $this->assertEquals(0.00, (float)$schedule1->balance_due);
        $this->assertEquals(5333.33, (float)$schedule1->amount_paid);

        // Check installment account total_paid and balance updated
        $account->refresh();
        $this->assertEquals(9333.33, round((float)$account->total_paid, 2));
        $this->assertEquals(10666.67, round((float)$account->balance, 2));

        // Check that an official Payment record was created
        $this->assertDatabaseHas('payments', [
            'payment_id' => $deposit->payment_id,
            'installment_id' => $account->installment_id,
            'amount' => 5333.33,
            'payment_method' => 'GCash',
            'status' => 'Completed',
        ]);
    }

    public function test_simulate_webhook_with_customer_reference_and_proof_image()
    {
        Storage::fake('public');

        $customer = Customer::create([
            'first_name' => 'Ana',
            'last_name' => 'Reyes',
            'email' => 'ana.reyes@example.com',
            'phone' => '09123456789',
            'status' => 'active',
            'wallet_balance' => 0.00,
        ]);

        $reference = 'REF-GCASH-PROOF-TEST-' . time();
        $deposit = EWalletDeposit::create([
            'transaction_reference' => $reference,
            'customer_id' => $customer->customer_id,
            'amount' => 2500.00,
            'fee' => 0.00,
            'currency' => 'PHP',
            'payment_method' => 'GCash',
            'payment_type' => 'deposit',
            'status' => 'pending',
            'qr_code_data' => '0002010102122658...',
        ]);

        $file = UploadedFile::fake()->create('receipt.png', 100, 'image/png');
        $customerRef = 'GCASH-REF-88997766';

        $response = $this->post('/api/payments/ewallet/simulate-webhook', [
            'reference' => $reference,
            'customer_reference' => $customerRef,
            'proof_of_payment' => $file,
        ]);

        $response->assertStatus(200);
        $response->assertJson([
            'success' => true,
            'is_pending' => true,
            'is_paid' => false,
            'status' => 'pending',
            'customer_reference' => $customerRef,
        ]);

        $deposit->refresh();
        $this->assertEquals('pending', $deposit->status);
        $this->assertEquals($customerRef, $deposit->customer_reference);
        $this->assertNotNull($deposit->proof_of_payment);
        $this->assertNotNull($deposit->payment_id);
        Storage::disk('public')->assertExists($deposit->proof_of_payment);

        // Verify Payment record was created in 'Pending' status and NOT directly received yet
        $this->assertDatabaseHas('payments', [
            'payment_id' => $deposit->payment_id,
            'status' => 'Pending',
            'received_by' => null,
            'reference_no' => $customerRef,
        ]);

        // Verify checkStatus endpoint returns is_pending and proof_of_payment_url
        $checkRes = $this->getJson("/api/payments/ewallet/status/{$reference}");
        $checkRes->assertStatus(200);
        $checkRes->assertJson([
            'success' => true,
            'is_pending' => true,
            'is_paid' => false,
            'customer_reference' => $customerRef,
        ]);
        $this->assertNotNull($checkRes->json('proof_of_payment_url'));

        // Now test Store Admin receiving the payment
        $adminUser = \App\Models\User::create([
            'username' => 'admin_' . uniqid(),
            'password_hash' => bcrypt('password123'),
            'role' => 'Store Administrator',
            'is_active' => true,
        ]);

        $receiveRes = $this->actingAs($adminUser)->postJson("/api/payments/{$deposit->payment_id}/receive");
        $receiveRes->assertStatus(200);
        $receiveRes->assertJson(['success' => true]);

        // Check payment is now Completed and received_by is set to the store admin
        $deposit->refresh();
        $this->assertEquals('paid', $deposit->status);
        $this->assertDatabaseHas('payments', [
            'payment_id' => $deposit->payment_id,
            'status' => 'Completed',
            'received_by' => $adminUser->user_id,
        ]);

        // Now checkStatus reports is_paid = true
        $paidCheckRes = $this->getJson("/api/payments/ewallet/status/{$reference}");
        $paidCheckRes->assertStatus(200);
        $paidCheckRes->assertJson([
            'success' => true,
            'is_paid' => true,
        ]);
    }
}
