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
     * Whether a deferred per-module mutation bump is already scheduled for the current request.
     */
    private static bool $mutationBumpScheduled = false;

    /**
     * Modules queued for fingerprint invalidation at the end of the current request.
     *
     * @var array<string, bool>
     */
    private static array $pendingMutationModules = [];

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

        // 2. Per-Module Write-Invalidation: only invalidate caches of the specific module(s) touched
        $modelModuleMap = [
            \App\Models\Payment::class => ['payments', 'installments', 'customers', 'sales', 'dashboard'],
            \App\Models\SaleTransaction::class => ['sales', 'installments', 'dashboard'],
            \App\Models\SaleItem::class => ['sales', 'installments', 'dashboard'],
            \App\Models\Product::class => ['products', 'categories', 'sales', 'installments', 'dashboard'],
            \App\Models\Category::class => ['categories', 'products', 'dashboard'],
            \App\Models\Customer::class => ['customers', 'sales', 'installments', 'payments', 'dashboard'],
            \App\Models\Attendance::class => ['attendance', 'employees', 'dashboard'],
            \App\Models\AttendanceScanLog::class => ['attendance', 'employees', 'dashboard'],
            \App\Models\Employee::class => ['employees', 'attendance', 'payroll', 'dashboard'],
            \App\Models\User::class => ['employees', 'customers', 'system', 'dashboard'],
            \App\Models\InstallmentAccount::class => ['installments', 'payments', 'customers', 'dashboard'],
            \App\Models\PaymentSchedule::class => ['installments', 'payments', 'customers', 'dashboard'],
            \App\Models\Notification::class => ['notifications'],
            \App\Models\QrRequest::class => ['employees', 'attendance', 'dashboard'],
            \App\Models\SupportMessage::class => ['support', 'dashboard'],
            \App\Models\CarouselImage::class => ['carousels'],
            \App\Models\BranchProfile::class => ['branches', 'employees', 'customers', 'products', 'sales', 'payroll', 'dashboard'],
            \App\Models\Payroll::class => ['payroll', 'dashboard'],
            \App\Models\EmployeeLetter::class => ['employees', 'attendance'],
            \App\Models\PayrollPeriod::class => ['payroll', 'dashboard'],
            \App\Models\PayrollDeduction::class => ['payroll', 'dashboard'],
            \App\Models\EmployeeLoan::class => ['payroll', 'employees'],
            \App\Models\EmployeeAllowance::class => ['payroll', 'employees'],
            \App\Models\EmployeeBonus::class => ['payroll', 'employees'],
            \App\Models\EmployeeDeduction::class => ['payroll', 'employees'],
            \App\Models\EWalletDeposit::class => ['payments', 'installments', 'customers'],
            \App\Models\Setting::class => ['system', 'attendance', 'payroll'],
        ];

        // Bump only affected modules once per request (after the response is sent)
        foreach ($modelModuleMap as $modelClass => $modules) {
            if (!class_exists($modelClass)) {
                continue;
            }
            $scheduleBump = static function () use ($modules) {
                foreach ($modules as $mod) {
                    self::$pendingMutationModules[$mod] = true;
                }
                if (self::$mutationBumpScheduled) {
                    return;
                }
                self::$mutationBumpScheduled = true;
                app()->terminating(static function () {
                    $toBump = array_keys(self::$pendingMutationModules);
                    self::$pendingMutationModules = [];
                    self::$mutationBumpScheduled = false;
                    if (!empty($toBump)) {
                        SyncController::bumpMutation($toBump);
                    }
                    try {
                        if (\Illuminate\Support\Facades\Cache::add('pace_prune_cache_lock', true, 120)) {
                            \App\Services\AutomationService::pruneExpiredFileCache(400);
                        }
                    } catch (\Throwable) {
                    }
                });
            };
            $modelClass::saved($scheduleBump);
            $modelClass::deleted($scheduleBump);
        }
    }
}
