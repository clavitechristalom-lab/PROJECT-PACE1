<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Drop global uniqueness on products.product_code so Furniture and Appliances
     * can each use independent SKU sequences starting from 001.
     */
    public function up(): void
    {
        if (!Schema::hasTable('products')) {
            return;
        }

        $driver = DB::connection()->getDriverName();
        if ($driver === 'mysql') {
            $indexes = collect(DB::select('SHOW INDEX FROM products'));
            if ($indexes->contains('Key_name', 'products_product_code_unique')) {
                Schema::table('products', function (Blueprint $table) {
                    $table->dropUnique('products_product_code_unique');
                });
            }
            $indexesAfter = collect(DB::select('SHOW INDEX FROM products'));
            if (!$indexesAfter->contains('Key_name', 'products_product_code_index')) {
                Schema::table('products', function (Blueprint $table) {
                    $table->index('product_code', 'products_product_code_index');
                });
            }
            return;
        }

        Schema::table('products', function (Blueprint $table) {
            try {
                $table->dropUnique(['product_code']);
            } catch (\Throwable $e) {
            }
            try {
                $table->index('product_code', 'products_product_code_index');
            } catch (\Throwable $e) {
            }
        });
    }

    public function down(): void
    {
        if (!Schema::hasTable('products')) {
            return;
        }

        Schema::table('products', function (Blueprint $table) {
            try {
                $table->dropIndex('products_product_code_index');
            } catch (\Throwable $e) {
            }
        });
    }
};

