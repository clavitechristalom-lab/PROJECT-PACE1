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
use Laravel\Sanctum\PersonalAccessToken;
use Symfony\Component\HttpFoundation\StreamedResponse;

class SyncController extends Controller
{
    /**
     * Compute a unified version hash across all core database tables.
     */
    public static function computeFingerprint(): int
    {
        $maxLog = (int)(SystemLog::max('id') ?? 0);
        $maxPayment = (int)(Payment::max('payment_id') ?? 0);
        $maxSale = (int)(SaleTransaction::max('sale_id') ?? 0);
        $maxProduct = (int)(Product::max('product_id') ?? 0);
        $maxCustomer = (int)(Customer::max('customer_id') ?? 0);
        $maxScan = (int)(AttendanceScanLog::max('id') ?? 0);
        $maxQr = (int)(QrRequest::max('request_id') ?? 0);
        $maxSupport = (int)(SupportMessage::max('id') ?? 0);
        $maxPayroll = (int)(Payroll::max('payroll_id') ?? 0);

        $latestProductUpdate = Product::max('updated_at') ? strtotime(Product::max('updated_at')) : 0;
        $latestBranchUpdate = BranchProfile::max('updated_at') ? strtotime(BranchProfile::max('updated_at')) : 0;
        $latestSupportUpdate = SupportMessage::max('updated_at') ? strtotime(SupportMessage::max('updated_at')) : 0;
        $latestCarouselUpdate = CarouselImage::max('updated_at') ? strtotime(CarouselImage::max('updated_at')) : 0;

        $maxEpoch = max($latestProductUpdate, $latestBranchUpdate, $latestSupportUpdate, $latestCarouselUpdate);

        return $maxLog 
            + ($maxPayment * 10) 
            + ($maxSale * 100) 
            + ($maxProduct * 1000) 
            + ($maxCustomer * 10000) 
            + ($maxScan * 3) 
            + ($maxQr * 7) 
            + ($maxSupport * 13) 
            + ($maxPayroll * 17) 
            + $maxEpoch;
    }

    /**
     * Return ultra-lightweight real-time synchronization indicators and run automations.
     */
    public function status(Request $request)
    {
        $user = $this->resolveUser($request);

        // Run automated tasks (throttled to at most once per 60s)
        $autoResults = AutomationService::runAllAutomations();

        // 1. Unified mutation fingerprint
        $latestLogId = self::computeFingerprint();

        // 2. User specific notifications
        $latestNotifId = 0;
        $unreadNotifs = 0;
        if ($user) {
            $latestNotifId = (int)(Notification::forUser($user->user_id)->max('notification_id') ?? 0);
            $unreadNotifs = (int)(Notification::forUser($user->user_id)->unread()->count());
        }

        // 3. Pending Attendance Verifications
        $pendingVerifications = 0;
        if ($user && in_array($user->role, ['Employee', 'Store Administrator', 'Store Admin']) && $user->employee_id) {
            $pendingVerifications = AttendanceScanLog::where('employee_id', $user->employee_id)
                ->where('action_type', 'PENDING_VERIFICATION')
                ->where('status', 'PENDING')
                ->count();
        }

        // 4. Pending QR requests (for Administrator)
        $pendingQrRequests = 0;
        if ($user && $user->role === 'Administrator') {
            $pendingQrRequests = (int)QrRequest::where('status', 'Pending')->count();
        }

        return response()->json([
            'latest_log_id' => (int)$latestLogId,
            'latest_notif_id' => (int)$latestNotifId,
            'unread_notifications' => (int)$unreadNotifs,
            'pending_verifications' => (int)$pendingVerifications,
            'pending_qr_requests' => (int)$pendingQrRequests,
            'timestamp' => now()->toISOString(),
            'automations' => $autoResults,
        ]);
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
            echo "event: connected\n";
            echo "data: " . json_encode([
                'status' => 'connected',
                'timestamp' => now()->toIso8601String(),
                'version' => $initialFingerprint,
            ]) . "\n\n";
            flush();

            $lastFingerprint = $initialFingerprint;
            $lastUserNotifId = $user ? (int)(Notification::forUser($user->user_id)->max('notification_id') ?? 0) : 0;
            $lastUserUnread = $user ? (int)(Notification::forUser($user->user_id)->unread()->count()) : 0;

            // Stream for up to 25 seconds (Vite and browsers auto-reconnect cleanly per SSE protocol)
            $startTime = time();
            $heartbeatInterval = 5;
            $lastHeartbeat = time();

            while (time() - $startTime < 25) {
                if (connection_aborted()) {
                    break;
                }

                // Run scheduled background automations
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

                // Heartbeat to keep connection alive
                if (time() - $lastHeartbeat >= $heartbeatInterval) {
                    echo ": ping\n\n";
                    flush();
                    $lastHeartbeat = time();
                }

                usleep(1000000); // Check every 1 second
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
