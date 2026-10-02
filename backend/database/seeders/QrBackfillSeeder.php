<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use App\Models\Employee;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\Hash;

class QrBackfillSeeder extends Seeder
{
    public function run(): void
    {
        $employees = Employee::all();
        $count = 0;
        foreach ($employees as $emp) {
            $updated = false;
            if (empty($emp->qr_token)) {
                $emp->qr_token = (string)Str::uuid();
                $emp->qr_active = true;
                $emp->qr_generated_at = now();
                $updated = true;
            }
            if (empty($emp->attendance_pin)) {
                $emp->attendance_pin = Hash::make('1234');
                $updated = true;
            }
            if ($updated) {
                $emp->save();
                $count++;
            }
        }
        $this->command->info("Successfully ensured QR and PIN for {$count} employee(s).");
    }
}
