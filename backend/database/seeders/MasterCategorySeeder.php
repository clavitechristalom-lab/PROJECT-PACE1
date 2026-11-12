<?php

namespace Database\Seeders;

use App\Services\CategoryFramework;
use Illuminate\Database\Seeder;

class MasterCategorySeeder extends Seeder
{
    /**
     * Seed the 3-level Master Category Framework strictly into `categories`.
     * Zero products are added, seeded, or modified.
     */
    public function run(): void
    {
        CategoryFramework::syncDatabase();
    }
}

