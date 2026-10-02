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
        if (! Schema::hasTable('attendance')) {
            Schema::create('attendance', function (Blueprint $table) {
            $table->unsignedBigInteger('attendance_id')->autoIncrement();
            $table->unsignedBigInteger('employee_id');
            $table->date('attendance_date');
            $table->time('time_in')->nullable();
            $table->time('time_out')->nullable();
            $table->decimal('total_hours', 8, 2)->default(0);
            $table->decimal('overtime_hours', 8, 2)->default(0);
            $table->string('status')->default('present');
            $table->string('qr_scan_in')->nullable();
            $table->string('qr_scan_out')->nullable();
            $table->text('remarks')->nullable();
            $table->timestamps();
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('attendance');
    }
};
