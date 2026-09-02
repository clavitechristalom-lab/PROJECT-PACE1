<?php

namespace Tests\Feature;

use Tests\TestCase;
use App\Models\User;
use App\Models\Customer;
use App\Models\Product;
use App\Models\Employee;

class ApiEndpointsTest extends TestCase
{
    /**
     * Test login endpoint with valid credentials.
     */
    public function test_login_successful(): void
    {
        $response = $this->postJson('/api/login', [
            'username' => 'admin',
            'password' => 'admin123',
        ]);

        $response->assertStatus(200)
            ->assertJsonStructure([
                'message',
                'user' => ['user_id', 'username', 'role', 'name']
            ]);
    }

    /**
     * Test login endpoint with invalid credentials.
     */
    public function test_login_invalid_credentials(): void
    {
        $response = $this->postJson('/api/login', [
            'username' => 'admin',
            'password' => 'wrongpassword',
        ]);

        $response->assertStatus(401);
    }

    /**
     * Test Dashboard Stats endpoint.
     */
    public function test_dashboard_stats(): void
    {
        $response = $this->getJson('/api/dashboard/stats');
        $response->assertStatus(200)
            ->assertJsonStructure([
                'total_employees',
                'active_employees',
                'total_customers',
                'total_products',
                'total_sales',
                'active_installments',
            ]);
    }

    /**
     * Test Products API listing and CRUD.
     */
    public function test_products_api(): void
    {
        // Index
        $indexResponse = $this->getJson('/api/products');
        $indexResponse->assertStatus(200)
            ->assertJsonStructure(['products', 'total']);

        // Create
        $createResponse = $this->postJson('/api/products', [
            'product_code' => 'TEST-001',
            'product_name' => 'Test Unit Item',
            'category' => 'Appliances',
            'unit_price' => 5000,
            'stock_quantity' => 10,
            'status' => 'Active',
        ]);
        $createResponse->assertStatus(201);
        $productId = $createResponse->json('product.product_id');

        // Show
        $showResponse = $this->getJson("/api/products/{$productId}");
        $showResponse->assertStatus(200);

        // Update
        $updateResponse = $this->putJson("/api/products/{$productId}", [
            'product_code' => 'TEST-001',
            'product_name' => 'Test Unit Item Updated',
            'category' => 'Appliances',
            'unit_price' => 5500,
            'stock_quantity' => 8,
            'status' => 'Active',
        ]);
        $updateResponse->assertStatus(200);

        // Delete
        $deleteResponse = $this->deleteJson("/api/products/{$productId}");
        $deleteResponse->assertStatus(200);
    }

    /**
     * Test Customers API.
     */
    public function test_customers_api(): void
    {
        $response = $this->getJson('/api/customers');
        $response->assertStatus(200)
            ->assertJsonStructure(['customers', 'total']);
    }

    /**
     * Test Sales API listing.
     */
    public function test_sales_api(): void
    {
        $response = $this->getJson('/api/sales');
        $response->assertStatus(200)
            ->assertJsonStructure(['sales', 'total']);
    }

    /**
     * Test Installments API.
     */
    public function test_installments_api(): void
    {
        $response = $this->getJson('/api/installments');
        $response->assertStatus(200)
            ->assertJsonStructure(['installments', 'total']);
    }

    /**
     * Test Payments API.
     */
    public function test_payments_api(): void
    {
        $response = $this->getJson('/api/payments');
        $response->assertStatus(200)
            ->assertJsonStructure(['payments', 'total']);
    }

    /**
     * Test Attendance API.
     */
    public function test_attendance_api(): void
    {
        $response = $this->getJson('/api/attendance');
        $response->assertStatus(200)
            ->assertJsonStructure(['attendance', 'total']);
    }

    /**
     * Test Payroll API.
     */
    public function test_payroll_api(): void
    {
        $response = $this->getJson('/api/payroll');
        $response->assertStatus(200)
            ->assertJsonStructure(['payroll', 'periods']);
    }

    /**
     * Test System Endpoints.
     */
    public function test_system_endpoints(): void
    {
        $this->getJson('/api/users')->assertStatus(200);
        $this->getJson('/api/system-logs')->assertStatus(200);
        $this->getJson('/api/backups')->assertStatus(200);
        $this->getJson('/api/notifications')->assertStatus(200);
        $this->getJson('/api/settings')->assertStatus(200);
    }
}
