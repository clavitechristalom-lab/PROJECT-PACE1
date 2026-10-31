<?php

namespace App\Providers;

use Illuminate\Support\ServiceProvider;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use App\Http\Controllers\SyncController;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // 1. Optimize SQLite performance if SQLite connection is used
        try {
            if (DB::connection() instanceof \Illuminate\Database\SQLiteConnection) {
                DB::statement('PRAGMA journal_mode = WAL;');
                DB::statement('PRAGMA synchronous = NORMAL;');
                DB::statement('PRAGMA busy_timeout = 5000;');
                DB::statement('PRAGMA cache_size = -20000;'); // 20MB cache
            }
        } catch (\Throwable $e) {
            // Silently ignore if connection not yet established
        }

        // 2. Global Write-Invalidation: automatically bump mutation version on database writes
        $modelsToTrack = [
            \App\Models\Payment::class,
            \App\Models\SaleTransaction::class,
            \App\Models\Product::class,
            \App\Models\Customer::class,
            \App\Models\Attendance::class,
            \App\Models\AttendanceScanLog::class,
            \App\Models\Employee::class,
            \App\Models\User::class,
            \App\Models\InstallmentAccount::class,
            \App\Models\PaymentSchedule::class,
            \App\Models\Notification::class,
            \App\Models\QrRequest::class,
            \App\Models\SupportMessage::class,
            \App\Models\CarouselImage::class,
            \App\Models\BranchProfile::class,
            \App\Models\Payroll::class,
        ];

        foreach ($modelsToTrack as $modelClass) {
            if (class_exists($modelClass)) {
                $modelClass::saved(function () {
                    SyncController::bumpMutation();
                });
                $modelClass::deleted(function () {
                    SyncController::bumpMutation();
                });
            }
        }
    }
}
