<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Create `categories` table strictly for Master Category Framework taxonomy.
     * Existing `products` rows remain completely untouched.
     */
    public function up(): void
    {
        if (Schema::hasTable('categories')) {
            return;
        }

        Schema::create('categories', function (Blueprint $table) {
            $table->id();
            $table->string('name', 120);
            $table->string('slug', 160)->unique();
            $table->enum('level', ['main', 'group', 'subcategory'])->index();
            $table->unsignedBigInteger('parent_id')->nullable()->index();
            $table->string('main_category', 120)->index();
            $table->string('group_name', 120)->nullable()->index();
            $table->string('sku_prefix', 10)->default('PRD');
            $table->text('classification_scope')->nullable();
            $table->unsignedInteger('sort_order')->default(0);
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->foreign('parent_id')
                ->references('id')
                ->on('categories')
                ->nullOnDelete();

            $table->index(['level', 'sort_order']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('categories');
    }
};

