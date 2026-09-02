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
        if (!Schema::hasTable('notifications')) {
            Schema::create('notifications', function (Blueprint $table) {
                $table->id('notification_id');
                $table->unsignedBigInteger('user_id')->index();
                $table->string('type', 100)->index();
                $table->string('title', 255);
                $table->text('message');
                $table->string('module', 100)->index();
                $table->string('related_id', 100)->nullable();
                $table->string('related_type', 100)->nullable();
                $table->string('action_url', 255)->nullable();
                $table->string('priority', 20)->default('normal')->index(); // low, normal, high, critical
                $table->boolean('is_read')->default(false)->index();
                $table->timestamp('read_at')->nullable();
                $table->timestamps();

                $table->foreign('user_id')
                      ->references('user_id')
                      ->on('users')
                      ->onDelete('cascade');
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('notifications');
    }
};
