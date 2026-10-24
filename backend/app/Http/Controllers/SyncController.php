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
     * Compute a unified version hash across all core database tables.
     * Ultra-fast single aggregated query cached for 2 seconds (matching the 1 to 2 second target refresh).
     */
    public static function computeFingerprint(): int
    {
        return Cache::remember('pace_unified_fingerprint', 1, function () {
            try {
                $res = DB::selectOne("
                    SELECT 
                        (SELECT COALESCE(MAX(payment_id), 0) + COUNT(*) FROM payments) as p_sig,
                        (SELECT COALESCE(MAX(sale_id), 0) + COUNT(*) FROM sale_transactions) as s_sig,
                        (SELECT COALESCE(MAX(product_id), 0) + COUNT(*) FROM products) as pr_sig,
                        (SELECT COALESCE(MAX(customer_id), 0) + COUNT(*) FROM customers) as c_sig,
                        (SELECT COALESCE(MAX(id), 0) + COUNT(*) FROM attendance_scan_logs) as sc_sig,
                        (SELECT COALESCE(MAX(attendance_id), 0) + COUNT(*) FROM attendance) as att_sig,
                        (SELECT COALESCE(MAX(employee_id), 0) + COUNT(*) FROM employees) as emp_sig,
                        (SELECT COALESCE(MAX(user_id), 0) + COUNT(*) FROM users) as u_sig,
                        (SELECT COALESCE(MAX(request_id), 0) + COUNT(*) FROM qr_requests) as qr_sig,
                        (SELECT COALESCE(MAX(id), 0) + COUNT(*) FROM support_messages) as sp_sig,
                        (SELECT COALESCE(MAX(payroll_id), 0) + COUNT(*) FROM payroll) as py_sig,
                        (SELECT COALESCE(UNIX_TIMESTAMP(MAX(updated_at)), 0) FROM products) as pr_upd,
                        (SELECT COALESCE(UNIX_TIMESTAMP(MAX(updated_at)), 0) FROM branch_profiles) as br_upd,
                        (SELECT COALESCE(UNIX_TIMESTAMP(MAX(updated_at)), 0) FROM support_messages) as sp_upd,
                        (SELECT COALESCE(UNIX_TIMESTAMP(MAX(updated_at)), 0) FROM carousel_images) as cr_upd,
                        (SELECT COALESCE(UNIX_TIMESTAMP(MAX(updated_at)), 0) FROM attendance) as att_upd,
                        (SELECT COALESCE(UNIX_TIMESTAMP(MAX(updated_at)), 0) FROM employees) as emp_upd,
                        (SELECT COALESCE(UNIX_TIMESTAMP(MAX(updated_at)), 0) FROM users) as u_upd,
                        (SELECT COUNT(*) FROM carousel_images) as cr_cnt
                ");
                return (int)crc32(json_encode($res));
            } catch (\Throwable $e) {
                return (int)time();
            }
        });
    }

    /**
     * Return ultra-lightweight real-time synchronization indicators and run automations.
     */
    public function status(Request $request)
    {
        $user = $this->resolveUser($request);

        // Run automated tasks (throttled to at most once per 600s)
        $autoResults = AutomationService::runAllAutomations();

        // 1. Unified mutation fingerprint (ultra-fast single aggregated query cached 1s)
        $latestLogId = self::computeFingerprint();

        $userId = $user ? $user->user_id : 0;
        $role = $user ? $user->role : '';
        $empId = $user ? ($user->employee_id ?? 0) : 0;

        $cacheKey = "pace_sync_status_{$userId}_{$latestLogId}";
        $data = Cache::remember($cacheKey, 1, function () use ($user, $userId, $role, $empId, $latestLogId) {
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
        });

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

        Cache::forget('pace_unified_fingerprint');
        Cache::forget('pace_dash_charts');
        Cache::forget('pace_dash_branch_comparison');

        return response()->json([
            'success' => true,
            'message' => 'Real-time synchronization triggered',
            'fingerprint' => self::computeFingerprint(),
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
