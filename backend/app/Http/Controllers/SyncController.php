<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\SystemLog;
use App\Models\Notification;
use App\Models\AttendanceVerificationRequest;
use App\Models\QrRequest;
use App\Models\Payment;
use App\Models\SaleTransaction;
use App\Models\Product;
use App\Models\Customer;
use App\Models\BranchProfile;
use App\Models\CarouselImage;
use App\Models\Payroll;
use App\Models\SupportMessage;
use App\Models\AttendanceScanLog;
use App\Services\AutomationService;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\PersonalAccessToken;
use Symfony\Component\HttpFoundation\StreamedResponse;

class SyncController extends Controller
{
    /**
     * Bump database mutation counter and invalidate sync caches.
     * Supports strictly individual module invalidation so unrelated modules keep their caches warm.
     */
    public static function bumpMutation(string|array|null $module = null): void
    {
        if ($module === null) {
            Cache::increment('pace_mutation_counter');
            Cache::put('pace_db_mutation_version', microtime(true), 86400);
            Cache::forget('pace_unified_fingerprint');
            Cache::forget('pace_dash_charts');
            Cache::forget('pace_dash_branch_comparison');
            Cache::forget('pace_dash_recent');
            Cache::forget('pace_storage_overview');
            return;
        }

        $modules = is_array($module) ? $module : [$module];
        $normalized = [];
        foreach ($modules as $mod) {
            $m = strtolower(trim((string) $mod));
            if ($m !== '') {
                $normalized[$m] = true;
            }
        }

        if (empty($normalized) || isset($normalized['all']) || isset($normalized['global'])) {
            self::bumpMutation(null);
            return;
        }

        $ver = microtime(true);
        foreach (array_keys($normalized) as $mod) {
            Cache::increment("pace_mod_counter_{$mod}");
            Cache::put("pace_mod_ver_{$mod}", $ver, 86400);
            Cache::forget("pace_fp_{$mod}");

            if ($mod === 'dashboard') {
                Cache::forget('pace_dash_charts');
                Cache::forget('pace_dash_branch_comparison');
                Cache::forget('pace_dash_recent');
            }
            if ($mod === 'storage' || $mod === 'system') {
                Cache::forget('pace_storage_overview');
            }
        }
    }

    /**
     * Invalidate fingerprint and clear targeted module sync caches.
     * Backward-compatible alias for bumpMutation() invoked by controllers and services.
     */
    public static function invalidateFingerprint(string|array|null $module = null): void
    {
        self::bumpMutation($module);
    }

    /**
     * Compute a version hash either for an individual module or across all core tables.
     * Ultra-fast O(1) mutation counter check with per-module fallback so modules never collide.
     */
    public static function computeFingerprint(?string $module = null): int
    {
        if ($module !== null) {
            $mod = strtolower(trim($module));
            if ($mod !== '' && $mod !== 'all' && $mod !== 'global') {
                $modCounter = (int) Cache::get("pace_mod_counter_{$mod}", 0);
                $modVersion = (int) Cache::get("pace_mod_ver_{$mod}", 0);

                if ($modCounter > 0 && $modVersion > 0) {
                    return (int) crc32("{$mod}_{$modCounter}_{$modVersion}");
                }

                return Cache::remember("pace_fp_{$mod}", 300, function () use ($mod, $modCounter, $modVersion) {
                    try {
                        $res = match ($mod) {
                            'attendance' => DB::selectOne("
                                SELECT
                                    (SELECT COALESCE(MAX(attendance_id), 0) FROM attendance) as att_max,
                                    (SELECT COALESCE(MAX(id), 0) FROM attendance_scan_logs) as sc_max
                            "),
                            'employees' => DB::selectOne("
                                SELECT
                                    (SELECT COALESCE(MAX(employee_id), 0) FROM employees) as emp_max,
                                    (SELECT COALESCE(MAX(user_id), 0) FROM users) as u_max,
                                    (SELECT COALESCE(MAX(request_id), 0) FROM qr_requests) as qr_max,
                                    (SELECT COALESCE(MAX(letter_id), 0) FROM employee_letters) as lt_max
                            "),
                            'customers' => DB::selectOne("
                                SELECT
                                    (SELECT COALESCE(MAX(customer_id), 0) FROM customers) as c_max,
                                    (SELECT COALESCE(MAX(user_id), 0) FROM users) as u_max
                            "),
                            'products' => DB::selectOne("
                                SELECT (SELECT COALESCE(MAX(product_id), 0) FROM products) as pr_max
                            "),
                            'sales' => DB::selectOne("
                                SELECT
                                    (SELECT COALESCE(MAX(sale_id), 0) FROM sale_transactions) as s_max,
                                    (SELECT COALESCE(MAX(product_id), 0) FROM products) as pr_max
                            "),
                            'installments' => DB::selectOne("
                                SELECT
                                    (SELECT COALESCE(MAX(installment_id), 0) FROM installment_accounts) as i_max,
                                    (SELECT COALESCE(MAX(schedule_id), 0) FROM payment_schedule) as ps_max,
                                    (SELECT COALESCE(MAX(payment_id), 0) FROM payments) as p_max
                            "),
                            'payments' => DB::selectOne("
                                SELECT
                                    (SELECT COALESCE(MAX(payment_id), 0) FROM payments) as p_max,
                                    (SELECT COALESCE(MAX(installment_id), 0) FROM installment_accounts) as i_max,
                                    (SELECT COALESCE(MAX(deposit_id), 0) FROM e_wallet_deposits) as d_max
                            "),
                            'payroll' => DB::selectOne("
                                SELECT
                                    (SELECT COALESCE(MAX(payroll_id), 0) FROM payroll) as py_max,
                                    (SELECT COALESCE(MAX(period_id), 0) FROM payroll_periods) as pp_max,
                                    (SELECT COALESCE(MAX(deduction_id), 0) FROM payroll_deductions) as pd_max
                            "),
                            'notifications' => DB::selectOne("
                                SELECT (SELECT COALESCE(MAX(notification_id), 0) FROM notifications) as n_max
                            "),
                            'branches' => BranchProfile::max('id') ?? 0,
                            'system' => DB::selectOne("
                                SELECT
                                    (SELECT COALESCE(MAX(user_id), 0) FROM users) as u_max,
                                    (SELECT COALESCE(MAX(id), 0) FROM system_logs) as l_max
                            "),
                            default => DB::selectOne("
                                SELECT 
                                    (SELECT COALESCE(MAX(payment_id), 0) FROM payments) as p_max,
                                    (SELECT COALESCE(MAX(sale_id), 0) FROM sale_transactions) as s_max,
                                    (SELECT COALESCE(MAX(product_id), 0) FROM products) as pr_max,
                                    (SELECT COALESCE(MAX(customer_id), 0) FROM customers) as c_max,
                                    (SELECT COALESCE(MAX(id), 0) FROM attendance_scan_logs) as sc_max,
                                    (SELECT COALESCE(MAX(attendance_id), 0) FROM attendance) as att_max,
                                    (SELECT COALESCE(MAX(employee_id), 0) FROM employees) as emp_max,
                                    (SELECT COALESCE(MAX(user_id), 0) FROM users) as u_max,
                                    (SELECT COALESCE(MAX(request_id), 0) FROM qr_requests) as qr_max,
                                    (SELECT COALESCE(MAX(id), 0) FROM support_messages) as sp_max,
                                    (SELECT COALESCE(MAX(payroll_id), 0) FROM payroll) as py_max,
                                    (SELECT COALESCE(MAX(id), 0) FROM carousel_images) as cr_max
                            "),
                        };
                        return (int) crc32(json_encode([$mod, $res, $modCounter, $modVersion]));
                    } catch (\Throwable $e) {
                        return (int) time();
                    }
                });
            }
        }

        $mutationCounter = (int) Cache::get('pace_mutation_counter', 0);
        $mutationVersion = (int) Cache::get('pace_db_mutation_version', 0);

        if ($mutationCounter > 0 && $mutationVersion > 0) {
            return (int) crc32("{$mutationCounter}_{$mutationVersion}");
        }

        return Cache::remember('pace_unified_fingerprint', 300, function () use ($mutationCounter, $mutationVersion) {
            try {
                // Sub-1ms O(1) B-tree index queries on primary keys (no slow COUNT(*) or table scans)
                $res = DB::selectOne("
                    SELECT 
                        (SELECT COALESCE(MAX(payment_id), 0) FROM payments) as p_max,
                        (SELECT COALESCE(MAX(sale_id), 0) FROM sale_transactions) as s_max,
                        (SELECT COALESCE(MAX(product_id), 0) FROM products) as pr_max,
                        (SELECT COALESCE(MAX(customer_id), 0) FROM customers) as c_max,
                        (SELECT COALESCE(MAX(id), 0) FROM attendance_scan_logs) as sc_max,
                        (SELECT COALESCE(MAX(attendance_id), 0) FROM attendance) as att_max,
                        (SELECT COALESCE(MAX(employee_id), 0) FROM employees) as emp_max,
                        (SELECT COALESCE(MAX(user_id), 0) FROM users) as u_max,
                        (SELECT COALESCE(MAX(request_id), 0) FROM qr_requests) as qr_max,
                        (SELECT COALESCE(MAX(id), 0) FROM support_messages) as sp_max,
                        (SELECT COALESCE(MAX(payroll_id), 0) FROM payroll) as py_max,
                        (SELECT COALESCE(MAX(id), 0) FROM carousel_images) as cr_max
                ");
                return (int)crc32(json_encode([$res, $mutationCounter, $mutationVersion]));
            } catch (\Throwable $e) {
                return (int)time();
            }
        });
    }

    /**
     * Return ultra-lightweight real-time synchronization indicators and optionally scope automations by active module.
     */
    public function status(Request $request)
    {
        $user = $this->resolveUser($request);
        $module = $request->query('module');
        $normalizedMod = $module ? strtolower(trim((string) $module)) : null;

        // Run only the targeted module's automation when module is specified (or all if omitted)
        $autoResults = AutomationService::runAllAutomations(false, $normalizedMod);

        // 1. Targeted or unified mutation fingerprint (ultra-fast sub-1ms check)
        $latestLogId = self::computeFingerprint($normalizedMod);

        $userId = $user ? $user->user_id : 0;
        $role = $user ? $user->role : '';
        $empId = $user ? ($user->employee_id ?? 0) : 0;

        // Computed directly: these are 1-3 indexed aggregate queries (~1ms). The previous
        // Cache::remember("pace_sync_status_{$userId}_{$latestLogId}", 1, ...) created a brand-new cache
        // file for every user/fingerprint combination; the file store never deletes expired entries,
        // so tens of thousands of stale files piled up and each poll paid a disk write.
        $data = (function () use ($user, $userId, $role, $empId, $latestLogId) {
            $latestNotifId = 0;
            $unreadNotifs = 0;
            if ($user && $userId) {
                $notifAgg = Notification::forUser($userId)
                    ->selectRaw("COALESCE(MAX(notification_id), 0) as max_id, SUM(CASE WHEN is_read = 0 THEN 1 ELSE 0 END) as unread_cnt")
                    ->first();
                if ($notifAgg) {
                    $latestNotifId = (int)$notifAgg->max_id;
                    $unreadNotifs = (int)$notifAgg->unread_cnt;
                }
            }

            $pendingVerifications = 0;
            if ($user && in_array($role, ['Employee', 'Store Administrator', 'Store Admin']) && $empId) {
                $pendingVerifications = AttendanceScanLog::where('employee_id', $empId)
                    ->where('status', 'PENDING')
                    ->count();
            }

            $pendingQrRequests = 0;
            if ($user && $role === 'Administrator') {
                $pendingQrRequests = (int)QrRequest::where('status', 'Pending')->count();
            }

            return [
                'latest_log_id' => (int)$latestLogId,
                'latest_notif_id' => (int)$latestNotifId,
                'unread_notifications' => (int)$unreadNotifs,
                'pending_verifications' => (int)$pendingVerifications,
                'pending_qr_requests' => (int)$pendingQrRequests,
            ];
        })();

        $data['timestamp'] = now()->toISOString();
        $data['automations'] = $autoResults;

        return response()->json($data);
    }

    /**
     * Server-Sent Events (SSE) Live Stream: Push events to client dashboards in real-time.
     */
    public function stream(Request $request): StreamedResponse
    {
        $user = $this->resolveUser($request);
        $initialFingerprint = self::computeFingerprint();

        $response = new StreamedResponse(function () use ($user, $initialFingerprint) {
            // Disable output buffering
            if (ob_get_level() > 0) {
                ob_end_clean();
            }

            // Send initial connection event
            echo "retry: 15000\n";
            echo "event: connected\n";
            echo "data: " . json_encode([
                'status' => 'connected',
                'timestamp' => now()->toIso8601String(),
                'version' => $initialFingerprint,
                'cli_server' => php_sapi_name() === 'cli-server',
            ]) . "\n\n";
            flush();

            // CRITICAL: On single-threaded PHP CLI server (php artisan serve),
            // a continuous while-loop holds the process hostage, preventing ANY other HTTP
            // request from being handled. Exit immediately to keep server 100% responsive.
            if (php_sapi_name() === 'cli-server') {
                return;
            }

            $lastFingerprint = $initialFingerprint;
            $lastUserNotifId = $user ? (int)(Notification::forUser($user->user_id)->max('notification_id') ?? 0) : 0;
            $lastUserUnread = $user ? (int)(Notification::forUser($user->user_id)->unread()->count()) : 0;

            // Stream for up to 6 seconds in multi-threaded production environments
            $startTime = time();
            $heartbeatInterval = 3;
            $lastHeartbeat = time();

            while (time() - $startTime < 6) {
                if (connection_aborted()) {
                    break;
                }

                // Run scheduled background automations (throttled)
                AutomationService::runAllAutomations();

                $currentFingerprint = self::computeFingerprint();
                $currentNotifId = $user ? (int)(Notification::forUser($user->user_id)->max('notification_id') ?? 0) : 0;
                $currentUnread = $user ? (int)(Notification::forUser($user->user_id)->unread()->count()) : 0;

                $changed = false;
                $payload = [];

                if ($currentFingerprint !== $lastFingerprint) {
                    $changed = true;
                    $payload['type'] = 'database';
                    $payload['version'] = $currentFingerprint;
                    $lastFingerprint = $currentFingerprint;
                }

                if ($currentNotifId !== $lastUserNotifId || $currentUnread !== $lastUserUnread) {
                    $changed = true;
                    $payload['type'] = 'notifications';
                    $payload['notif_id'] = $currentNotifId;
                    $payload['unread'] = $currentUnread;
                    $lastUserNotifId = $currentNotifId;
                    $lastUserUnread = $currentUnread;
                }

                if ($changed) {
                    $payload['timestamp'] = now()->toIso8601String();
                    echo "event: sync\n";
                    echo "data: " . json_encode($payload) . "\n\n";
                    flush();
                }

                if (time() - $lastHeartbeat >= $heartbeatInterval) {
                    echo ": ping\n\n";
                    flush();
                    $lastHeartbeat = time();
                }

                usleep(1500000); // Check every 1.5s
            }
        });

        $response->headers->set('Content-Type', 'text/event-stream');
        $response->headers->set('Cache-Control', 'no-cache, no-transform');
        $response->headers->set('Connection', 'keep-alive');
        $response->headers->set('X-Accel-Buffering', 'no');

        return $response;
    }

    /**
     * Explicit trigger for cross-user mutation synchronization.
     */
    public function triggerManualSync(Request $request)
    {
        $user = $this->resolveUser($request);
        $module = $request->input('module', 'System');

        if ($user) {
            SystemLog::create([
                'user_id' => $user->user_id,
                'action' => 'SYNC_TRIGGER',
                'module' => $module,
                'description' => "{$user->username} triggered cross-system synchronization for {$module}",
                'ip_address' => $request->ip(),
                'user_agent' => $request->userAgent(),
            ]);
        }

        $normalizedMod = strtolower(trim((string) $module)) ?: 'system';
        self::bumpMutation($normalizedMod);

        return response()->json([
            'success' => true,
            'message' => 'Real-time synchronization triggered',
            'module' => $normalizedMod,
            'fingerprint' => self::computeFingerprint($normalizedMod),
            'timestamp' => now()->toIso8601String(),
        ]);
    }

    /**
     * Resolve authenticated user from request or Sanctum query token.
     */
    private function resolveUser(Request $request)
    {
        $user = $request->user();
        if ($user) return $user;

        if ($request->has('token')) {
            $tokenStr = trim((string)$request->query('token'));
            if ($tokenStr) {
                $token = PersonalAccessToken::findToken($tokenStr);
                if ($token) {
                    return $token->tokenable;
                }
            }
        }

        return null;
    }
}
