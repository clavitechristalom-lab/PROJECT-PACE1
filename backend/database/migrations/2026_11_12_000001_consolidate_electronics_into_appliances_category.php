<?php

use App\Http\Controllers\SyncController;
use App\Services\CategoryFramework;
use Illuminate\Database\Migrations\Migration;

return new class extends Migration
{
    /**
     * Consolidate Consumer Electronics & Audio-Visual groups under Appliances.
     * Categories taxonomy only — zero product records added or modified.
     */
    public function up(): void
    {
        CategoryFramework::syncDatabase();
        SyncController::bumpMutation(['categories', 'products']);
    }

    public function down(): void
    {
        // Taxonomy consolidation preserves all subcategories and existing product assignments
    }
};

