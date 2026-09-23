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
        Schema::create('reports', function (Blueprint $table) {
            $table->id('report_id');
            $table->string('report_title');
            $table->string('report_type'); // 'Weekly Store Report', 'Product / Inventory Report'
            $table->unsignedBigInteger('branch_id');
            $table->date('week_start')->nullable();
            $table->date('week_end')->nullable();
            $table->unsignedBigInteger('created_by'); // user_id of Store Admin
            $table->string('status')->default('DRAFT'); // DRAFT, SUBMITTED, REVIEWED
            $table->json('content')->nullable(); // report data payload (calculated by server)
            $table->text('notes')->nullable();
            $table->timestamp('submitted_at')->nullable();
            $table->unsignedBigInteger('reviewed_by')->nullable(); // user_id of Admin
            $table->timestamp('reviewed_at')->nullable();
            $table->timestamps();
            
            // Note: Since this is an existing database with non-standard foreign keys,
            // we will not add explicit foreign key constraints to avoid mismatch errors.
            // Branch ID matches branch_profiles.id, created_by/reviewed_by match users.user_id.
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('reports');
    }
};
