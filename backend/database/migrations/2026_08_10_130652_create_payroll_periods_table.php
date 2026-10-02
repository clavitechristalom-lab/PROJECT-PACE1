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
        if (! Schema::hasTable('payroll_periods')) {
            Schema::create('payroll_periods', function (Blueprint $table) {
            $table->unsignedBigInteger('period_id')->autoIncrement();
            $table->string('period_name');
            $table->date('start_date');
            $table->date('end_date');
            $table->date('pay_date')->nullable();
            $table->string('status')->default('open');
            $table->unsignedBigInteger('created_by')->nullable();
            $table->timestamps();
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('payroll_periods');
    }
};
