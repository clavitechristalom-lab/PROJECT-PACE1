<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use App\Models\Statement;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::dropIfExists('statements');

        Schema::create('statements', function (Blueprint $table) {
            $table->id();

            // Foreign key referencing customers (supports project's 'customer_id' or standard 'id')
            $customerKey = Schema::hasColumn('customers', 'customer_id') ? 'customer_id' : 'id';
            $table->unsignedBigInteger('customer_id');
            $table->foreign('customer_id')
                  ->references($customerKey)
                  ->on('customers')
                  ->onDelete('cascade');

            // ─── Exact Statements Table Columns Matching UI ───
            $table->date('date');                                             // 1. Date
            $table->string('reference_no', 100)->unique();                    // 2. Reference #
            $table->string('description');                                    // 3. Description
            $table->string('type', 50)->default('Purchase');                  // 4. Type (Purchase, Payment, Down Payment, Debit, Credit)
            $table->string('channel_method', 100)->default('Standard');       // 5. Channel / Method
            $table->decimal('amount', 12, 2)->default(0.00);                  // 6. Amount

            // ─── Supporting Ledger & Statement Summary Columns ───
            $table->string('reference', 100)->nullable();
            $table->string('payment_method', 100)->nullable();
            $table->string('category', 30)->default('Debit');                 // Debit or Credit
            $table->string('account_no', 100)->nullable();
            $table->string('status', 50)->default('Completed');
            $table->string('statement_number', 100)->nullable();
            $table->date('start_date')->nullable();
            $table->date('end_date')->nullable();
            $table->decimal('opening_balance', 12, 2)->default(0.00);
            $table->decimal('total_charges', 12, 2)->default(0.00);
            $table->decimal('total_payments', 12, 2)->default(0.00);
            $table->decimal('closing_balance', 12, 2)->default(0.00);
            $table->date('due_date')->nullable();
            $table->timestamps();

            // Performance Indexes
            $table->index(['customer_id', 'date']);
            $table->index(['customer_id', 'type']);
            $table->index('reference_no');
            $table->index('account_no');
        });

        // Automatically populate statements from existing customer sales, installments, and payments
        if (class_exists(Statement::class) && method_exists(Statement::class, 'syncAllFromTransactions')) {
            try {
                Statement::syncAllFromTransactions();
            } catch (\Throwable $e) {
                // Safe fallback during initial migration
            }
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('statements');
    }
};
