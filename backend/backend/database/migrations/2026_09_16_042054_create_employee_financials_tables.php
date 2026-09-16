<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('employee_allowances', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('employee_id');
            $table->string('name');
            $table->decimal('amount', 12, 2);
            $table->boolean('is_active')->default(true);
            $table->timestamps();
            
            $table->foreign('employee_id')->references('employee_id')->on('employees')->onDelete('cascade');
        });

        Schema::create('employee_bonuses', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('employee_id');
            $table->string('name');
            $table->decimal('amount', 12, 2);
            $table->string('status')->default('Pending'); // Pending, Paid
            $table->date('date_given')->nullable();
            $table->timestamps();
            
            $table->foreign('employee_id')->references('employee_id')->on('employees')->onDelete('cascade');
        });

        Schema::create('employee_deductions', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('employee_id');
            $table->string('name');
            $table->decimal('amount', 12, 2);
            $table->boolean('is_active')->default(true);
            $table->timestamps();
            
            $table->foreign('employee_id')->references('employee_id')->on('employees')->onDelete('cascade');
        });

        Schema::create('employee_loans', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('employee_id');
            $table->string('name');
            $table->decimal('total_amount', 12, 2);
            $table->decimal('monthly_deduction', 12, 2);
            $table->decimal('amount_paid', 12, 2)->default(0);
            $table->string('status')->default('Active'); // Active, Paid
            $table->timestamps();
            
            $table->foreign('employee_id')->references('employee_id')->on('employees')->onDelete('cascade');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('employee_loans');
        Schema::dropIfExists('employee_deductions');
        Schema::dropIfExists('employee_bonuses');
        Schema::dropIfExists('employee_allowances');
    }
};
