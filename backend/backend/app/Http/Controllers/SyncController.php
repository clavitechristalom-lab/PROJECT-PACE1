<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\SystemLog;
use App\Models\Notification;
use App\Models\AttendanceVerificationRequest;
use App\Models\QrRequest;

class SyncController extends Controller
{
    /**
     * Return ultra-lightweight real-time synchronization indicators.
     */
    public function status(Request $request)
    {
        $user = $request->user();

        // 1. Unified mutation version across all core business tables
        $maxLog = (int)(SystemLog::max('id') ?? 0);
        $maxPayment = (int)(\App\Models\Payment::max('payment_id') ?? 0);
        $maxSale = (int)(\App\Models\SaleTransaction::max('sale_id') ?? 0);
        $maxProduct = (int)(\App\Models\Product::max('product_id') ?? 0);
        $maxCustomer = (int)(\App\Models\Customer::max('customer_id') ?? 0);
        
        $latestUpdateEpoch = max(
            \App\Models\Product::max('updated_at') ? strtotime(\App\Models\Product::max('updated_at')) : 0,
            \App\Models\InstallmentAccount::max('updated_at') ? strtotime(\App\Models\InstallmentAccount::max('updated_at')) : 0,
            \App\Models\PaymentSchedule::max('updated_at') ? strtotime(\App\Models\PaymentSchedule::max('updated_at')) : 0
        );

        $latestLogId = $maxLog + ($maxPayment * 10) + ($maxSale * 100) + ($maxProduct * 1000) + ($maxCustomer * 10000) + $latestUpdateEpoch;

        // 2. User specific notifications
        $latestNotifId = 0;
        $unreadNotifs = 0;
        if ($user) {
            $latestNotifId = Notification::forUser($user->user_id)->max('notification_id') ?? 0;
            $unreadNotifs = Notification::forUser($user->user_id)->unread()->count();
        }

        // 3. Pending Attendance Verifications (for Employees / Store Admins)
        $pendingVerifications = 0;
        if ($user && in_array($user->role, ['Employee', 'Store Administrator', 'Store Admin']) && $user->employee_id) {
            $pendingVerifications = AttendanceVerificationRequest::where('employee_id', $user->employee_id)
                ->where('status', 'pending')
                ->count();
        }

        // 4. Pending QR requests (for Administrator)
        $pendingQrRequests = 0;
        if ($user && $user->role === 'Administrator') {
            $pendingQrRequests = QrRequest::where('status', 'Pending')->count();
        }

        return response()->json([
            'latest_log_id' => (int)$latestLogId,
            'latest_notif_id' => (int)$latestNotifId,
            'unread_notifications' => (int)$unreadNotifs,
            'pending_verifications' => (int)$pendingVerifications,
            'pending_qr_requests' => (int)$pendingQrRequests,
            'timestamp' => now()->toISOString(),
        ]);
    }
}
