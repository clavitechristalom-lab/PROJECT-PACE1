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
        if (!Schema::hasTable('statements')) {
            Schema::create('statements', function (Blueprint $table) {
                $table->id();

                // Foreign key referencing customers (supports project's 'customer_id' or standard 'id')
                $customerKey = Schema::hasColumn('customers', 'customer_id') ? 'customer_id' : 'id';
                $table->unsignedBigInteger('customer_id');
                $table->foreign('customer_id')
                      ->references($customerKey)
                      ->on('customers')
                      ->onDelete('cascade');

                $table->string('statement_number')->unique();
                $table->date('start_date');
                $table->date('end_date');
                $table->decimal('opening_balance', 12, 2)->default(0.00);
                $table->decimal('total_charges', 12, 2)->default(0.00);
                $table->decimal('total_payments', 12, 2)->default(0.00);
                $table->decimal('closing_balance', 12, 2);
                $table->date('due_date')->nullable();
                $table->timestamps();

                // Performance Indexes
                $table->index(['customer_id', 'start_date', 'end_date']);
                $table->index('statement_number');
            });
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

