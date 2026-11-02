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
     * Whether a deferred mutation bump is already scheduled for the current request.
     */
    private static bool $mutationBumpScheduled = false;

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // 1. Optimize SQLite performance if SQLite connection is used
        // (checked via config first so MySQL requests no longer open a DB connection during boot)
        try {
            if (config('database.default') === 'sqlite' && DB::connection() instanceof \Illuminate\Database\SQLiteConnection) {
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
            // Previously untracked: changes here only showed up via the 1.4s full-data polling
            \App\Models\EmployeeLetter::class,
            \App\Models\PayrollPeriod::class,
            \App\Models\PayrollDeduction::class,
            \App\Models\EmployeeLoan::class,
            \App\Models\EmployeeAllowance::class,
            \App\Models\EmployeeBonus::class,
            \App\Models\EmployeeDeduction::class,
            \App\Models\EWalletDeposit::class,
            \App\Models\SaleItem::class,
            \App\Models\Setting::class,
        ];

        // Bump once per request (after the response is sent) instead of 7 cache-file writes per saved row.
        $scheduleBump = static function () {
            if (self::$mutationBumpScheduled) {
                return;
            }
            self::$mutationBumpScheduled = true;
            app()->terminating(static function () {
                self::$mutationBumpScheduled = false;
                SyncController::bumpMutation();
            });
        };

        foreach ($modelsToTrack as $modelClass) {
            if (class_exists($modelClass)) {
                $modelClass::saved($scheduleBump);
                $modelClass::deleted($scheduleBump);
            }
        }
    }
}
