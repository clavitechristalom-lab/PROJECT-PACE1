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
        if (! Schema::hasTable('installment_accounts')) {
            Schema::create('installment_accounts', function (Blueprint $table) {
            $table->unsignedBigInteger('installment_id')->autoIncrement();
            $table->string('account_no')->unique();
            $table->unsignedBigInteger('customer_id');
            $table->unsignedBigInteger('sale_id')->nullable();
            $table->date('start_date');
            $table->decimal('principal_amount', 12, 2)->default(0);
            $table->decimal('down_payment', 12, 2)->default(0);
            $table->decimal('interest_rate', 8, 2)->default(0);
            $table->decimal('interest_amount', 12, 2)->default(0);
            $table->decimal('total_payable', 12, 2)->default(0);
            $table->decimal('installment_amount', 12, 2)->default(0);
            $table->unsignedInteger('number_of_installments');
            $table->string('frequency');
            $table->string('status')->default('active');
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
        Schema::dropIfExists('installment_accounts');
    }
};
