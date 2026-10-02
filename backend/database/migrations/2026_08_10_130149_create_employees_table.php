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
        if (! Schema::hasTable('employees')) {
            Schema::create('employees', function (Blueprint $table) {
            $table->unsignedBigInteger('employee_id')->autoIncrement();
            $table->string('employee_code')->unique();
            $table->string('first_name');
            $table->string('middle_name')->nullable();
            $table->string('last_name');
            $table->string('gender')->nullable();
            $table->date('birth_date')->nullable();
            $table->string('position')->nullable();
            $table->string('department')->nullable();
            $table->string('pay_type')->nullable();
            $table->decimal('basic_salary', 12, 2)->default(0);
            $table->decimal('daily_rate', 12, 2)->default(0);
            $table->decimal('hourly_rate', 12, 2)->default(0);
            $table->string('phone')->nullable();
            $table->string('email')->nullable();
            $table->text('address')->nullable();
            $table->date('hire_date')->nullable();
            $table->string('qr_code')->nullable();
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
        Schema::dropIfExists('employees');
    }
};
