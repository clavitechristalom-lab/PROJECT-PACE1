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
        Schema::table('employees', function (Blueprint $table) {
            if (!Schema::hasColumn('employees', 'qr_token')) {
                $table->string('qr_token')->nullable()->unique()->after('notes');
            }
            if (!Schema::hasColumn('employees', 'qr_active')) {
                $table->boolean('qr_active')->default(true)->after('qr_token');
            }
            if (!Schema::hasColumn('employees', 'qr_generated_at')) {
                $table->timestamp('qr_generated_at')->nullable()->after('qr_active');
            }
            if (!Schema::hasColumn('employees', 'attendance_pin')) {
                $table->string('attendance_pin')->nullable()->after('qr_generated_at');
            }
            if (!Schema::hasColumn('employees', 'pin_failed_attempts')) {
                $table->integer('pin_failed_attempts')->default(0)->after('attendance_pin');
            }
            if (!Schema::hasColumn('employees', 'pin_locked_until')) {
                $table->timestamp('pin_locked_until')->nullable()->after('pin_failed_attempts');
            }
        });

        Schema::table('attendance', function (Blueprint $table) {
            if (!Schema::hasColumn('attendance', 'verification_method')) {
                $table->string('verification_method')->default('QR + PIN')->after('status');
            }
            if (!Schema::hasColumn('attendance', 'device_info')) {
                $table->string('device_info')->nullable()->after('verification_method');
            }
            if (!Schema::hasColumn('attendance', 'ip_address')) {
                $table->string('ip_address')->nullable()->after('device_info');
            }
        });

        if (!Schema::hasTable('attendance_scan_logs')) {
            Schema::create('attendance_scan_logs', function (Blueprint $table) {
                $table->unsignedBigInteger('id')->autoIncrement();
                $table->unsignedBigInteger('employee_id')->nullable();
                $table->string('qr_token_scanned')->nullable();
                $table->timestamp('scan_time')->useCurrent();
                $table->boolean('qr_verified')->default(false);
                $table->boolean('pin_verified')->default(false);
                $table->string('action_type')->default('REJECTED'); // TIME_IN, TIME_OUT, REJECTED
                $table->string('status')->default('FAILED'); // SUCCESS, FAILED
                $table->string('failure_reason')->nullable();
                $table->string('device_info')->nullable();
                $table->string('ip_address')->nullable();
                $table->timestamps();

                $table->foreign('employee_id')
                    ->references('employee_id')
                    ->on('employees')
                    ->onDelete('set null');
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('attendance_scan_logs');

        Schema::table('attendance', function (Blueprint $table) {
            $table->dropColumn(['verification_method', 'device_info', 'ip_address']);
        });

        Schema::table('employees', function (Blueprint $table) {
            $table->dropColumn([
                'qr_token',
                'qr_active',
                'qr_generated_at',
                'attendance_pin',
                'pin_failed_attempts',
                'pin_locked_until'
            ]);
        });
    }
};
