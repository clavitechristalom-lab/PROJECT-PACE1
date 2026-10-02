<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        if (! Schema::hasTable('sale_transactions')) {
            Schema::create('sale_transactions', function (Blueprint $table) {
            $table->unsignedBigInteger('sale_id')->autoIncrement();
            $table->string('invoice_no')->unique();
            $table->unsignedBigInteger('customer_id')->nullable();
            $table->unsignedBigInteger('processed_by')->nullable();
            $table->dateTime('sale_date');
            $table->string('payment_method');
            $table->decimal('subtotal', 12, 2)->default(0);
            $table->decimal('discount_amount', 12, 2)->default(0);
            $table->decimal('total_amount', 12, 2)->default(0);
            $table->decimal('amount_paid', 12, 2)->default(0);
            $table->decimal('balance_due', 12, 2)->default(0);
            $table->string('status')->default('completed');
            $table->text('notes')->nullable();
            $table->timestamps();
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('sale_transactions');
    }
};
