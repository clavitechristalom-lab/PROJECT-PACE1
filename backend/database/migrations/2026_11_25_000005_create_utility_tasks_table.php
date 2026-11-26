<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('utility_tasks')) {
            Schema::create('utility_tasks', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('branch_id')->nullable()->index();
                $table->unsignedBigInteger('assigned_to')->nullable()->index();
                $table->unsignedBigInteger('assigned_by')->nullable()->index();
                $table->string('title', 180);
                $table->string('category', 60)->default('Store Cleaning');
                $table->string('priority', 20)->default('Normal');
                $table->date('due_date')->nullable();
                $table->string('status', 30)->default('Pending')->index();
                $table->text('description')->nullable();
                $table->text('completion_notes')->nullable();
                $table->timestamp('completed_at')->nullable();
                $table->unsignedBigInteger('verified_by')->nullable();
                $table->timestamp('verified_at')->nullable();
                $table->timestamps();
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('utility_tasks');
    }
};
