<?php

namespace Tests\Feature;

use Tests\TestCase;
use App\Models\User;
use App\Models\Customer;
use App\Models\Product;
use Illuminate\Foundation\Testing\DatabaseTransactions;

class CustomerInstallmentAuthorizationTest extends TestCase
{
    use DatabaseTransactions;

    protected $storeAdmin;
    protected $customerUser;
    protected $customer;
    protected $product;

    protected function setUp(): void
    {
        parent::setUp();

        // 1. Create a Store Administrator
        $this->storeAdmin = User::create([
            'username' => 'storeadmin_' . uniqid(),
            'name' => 'Store Admin Test',
            'role' => 'Store Administrator',
            'password_hash' => bcrypt('secret123'),
        ]);

        // 2. Create a Customer model
        $this->customer = Customer::create([
            'customer_code' => 'CUST-' . uniqid(),
            'first_name' => 'Maria',
            'last_name' => 'Santos',
            'email' => 'maria_' . uniqid() . '@example.com',
            'phone' => '09191234567',
            'status' => 'active',
            'allow_installment' => false,
        ]);

        // 3. Create a Customer user account linked to the customer
        $this->customerUser = User::create([
            'username' => $this->customer->email,
            'name' => 'Maria Santos',
            'role' => 'Customer',
            'customer_id' => $this->customer->customer_id,
            'password_hash' => bcrypt('secret123'),
        ]);

        // 4. Create a test catalog product
        $this->product = Product::create([
            'product_name' => 'Dining Table Set',
            'product_code' => 'PROD-' . uniqid(),
            'unit_price' => 12000.00,
            'stock_quantity' => 10,
            'category' => 'Furniture',
            'status' => 'active',
        ]);
    }

    public function test_only_store_admin_can_allow_customer_installment()
    {
        // A regular customer cannot grant installment permission
        $response = $this->actingAs($this->customerUser)
            ->putJson("/api/customers/{$this->customer->customer_id}/allow-installment", [
                'allow_installment' => true,
            ]);
        $response->assertStatus(403);

        // A Store Administrator CAN grant installment permission
        $adminResponse = $this->actingAs($this->storeAdmin)
            ->putJson("/api/customers/{$this->customer->customer_id}/allow-installment", [
                'allow_installment' => true,
                'notes' => 'Store Admin approved installment after credit assessment.',
            ]);
        $adminResponse->assertStatus(200);
        $adminResponse->assertJson(['success' => true]);

        $this->customer->refresh();
        $this->assertTrue((bool)$this->customer->allow_installment);
        $this->assertEquals($this->storeAdmin->user_id, $this->customer->installment_allowed_by);
        $this->assertNotNull($this->customer->installment_allowed_at);
    }

    public function test_unauthorized_customer_cannot_initiate_installment_checkout()
    {
        // Ensure customer is NOT allowed installment
        $this->customer->update(['allow_installment' => false]);

        // Attempting to checkout with payment_term = 'installment' should return HTTP 403
        $response = $this->actingAs($this->customerUser)
            ->postJson('/api/payments/ewallet/checkout', [
                'amount' => 2400.00, // 20% downpayment
                'payment_method' => 'GCash',
                'payment_term' => 'installment',
                'installment_term_months' => 6,
                'items' => [
                    [
                        'product_id' => $this->product->product_id,
                        'product_name' => $this->product->product_name,
                        'price' => 12000.00,
                        'quantity' => 1,
                    ]
                ],
            ]);

        $response->assertStatus(403);
        $response->assertJson([
            'success' => false,
        ]);
        $this->assertStringContainsString('Store Administrator', $response->json('message'));
    }

    public function test_authorized_customer_can_initiate_installment_checkout()
    {
        // Store Admin allows installment for customer
        $this->customer->update(['allow_installment' => true]);

        $response = $this->actingAs($this->customerUser)
            ->postJson('/api/payments/ewallet/checkout', [
                'amount' => 2400.00, // 20% downpayment
                'payment_method' => 'GCash',
                'payment_term' => 'installment',
                'installment_term_months' => 6,
                'items' => [
                    [
                        'product_id' => $this->product->product_id,
                        'product_name' => $this->product->product_name,
                        'price' => 12000.00,
                        'quantity' => 1,
                    ]
                ],
            ]);

        $response->assertStatus(201);
        $response->assertJson(['success' => true]);
        $this->assertNotEmpty($response->json('deposit.checkout_url'));
        $this->assertEquals('installment_order', $response->json('deposit.payment_type'));
    }

    public function test_customer_can_request_installment_approval_from_store_admin()
    {
        $this->customer->update(['allow_installment' => false]);

        $response = $this->actingAs($this->customerUser)
            ->postJson('/api/customer/request-installment', [
                'notes' => 'Customer applied for installment via checkout modal.',
            ]);

        $response->assertStatus(200);
        $response->assertJson(['success' => true]);
        $this->assertStringContainsString('Store Administrator', $response->json('message'));

        $this->customer->refresh();
        $this->assertEquals('Customer applied for installment via checkout modal.', $this->customer->installment_notes);
    }
}
