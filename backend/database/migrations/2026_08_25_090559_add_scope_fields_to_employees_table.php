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
            $table->date('date_of_birth')->nullable()->after('gender');
            $table->string('marital_status')->nullable()->after('date_of_birth');
            $table->string('tin_number')->nullable()->after('address');
            $table->string('sss_number')->nullable()->after('tin_number');
            $table->string('philhealth_number')->nullable()->after('sss_number');
            $table->string('pagibig_number')->nullable()->after('philhealth_number');
            $table->string('working_hours')->default('8 AM to 5 PM')->after('status');
            $table->string('emergency_contact_name')->nullable()->after('working_hours');
            $table->string('emergency_contact_relation')->nullable()->after('emergency_contact_name');
            $table->string('emergency_contact_phone')->nullable()->after('emergency_contact_relation');
            $table->json('documents')->nullable()->after('emergency_contact_phone');
            $table->string('branch')->nullable()->after('department');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('employees', function (Blueprint $table) {
            $table->dropColumn([
                'date_of_birth',
                'marital_status',
                'tin_number',
                'sss_number',
                'philhealth_number',
                'pagibig_number',
                'working_hours',
                'emergency_contact_name',
                'emergency_contact_relation',
                'emergency_contact_phone',
                'documents',
                'branch'
            ]);
        });
    }
};
