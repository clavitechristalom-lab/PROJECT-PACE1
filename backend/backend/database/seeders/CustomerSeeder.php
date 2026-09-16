<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use App\Models\Customer;
use App\Models\User;
use Illuminate\Support\Facades\Hash;

class CustomerSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        $customer = Customer::create([
            'customer_code' => 'CUST-001',
            'first_name' => 'John',
            'last_name' => 'Doe',
            'email' => 'customer@example.com',
            'phone' => '09123456789',
            'status' => 'Active',
            'address' => '123 Main St, City',
        ]);

        User::create([
            'username' => 'customer',
            'password_hash' => Hash::make('password123'),
            'role' => 'Customer',
            'is_active' => true,
            'customer_id' => $customer->customer_id,
        ]);
    }
}
