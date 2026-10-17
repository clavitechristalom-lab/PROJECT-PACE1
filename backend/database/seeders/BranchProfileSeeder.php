<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use App\Models\BranchProfile;

class BranchProfileSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        $branches = [
            [
                'name' => 'Cagayan de Oro',
                'location' => 'Cagayan de Oro City',
                'status' => 'open',
                'color' => '#10B981',
            ],
            [
                'name' => 'Iligan Branch',
                'location' => 'Iligan City',
                'status' => 'open',
                'color' => '#3B82F6',
            ],
            [
                'name' => 'Davao Branch',
                'location' => 'Davao City',
                'status' => 'open',
                'color' => '#8B5CF6',
            ],
        ];

        foreach ($branches as $b) {
            BranchProfile::firstOrCreate(['name' => $b['name']], $b);
        }
    }
}
