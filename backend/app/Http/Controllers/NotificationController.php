<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\Notification;

class NotificationController extends Controller
{
    /**
     * Get paginated notifications for the authenticated user.
     */
    public function index(Request $request)
    {
        $user = $request->user();
        if (!$user) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        $this->syncSystemAlerts($user);

        $query = Notification::forUser($user->user_id);

        // Status Filter
        $status = $request->query('status', 'all');
        if ($status === 'unread') {
            $query->unread();
        } elseif ($status === 'read') {
            $query->read();
        }

        // Module Filter
        if ($request->filled('module') && $request->query('module') !== 'All') {
            $query->byModule($request->query('module'));
        }

        // Priority Filter
        if ($request->filled('priority') && $request->query('priority') !== 'All') {
            $query->byPriority($request->query('priority'));
        }

        // Keyword Search
        if ($request->filled('search')) {
            $search = $request->query('search');
            $query->where(function ($q) use ($search) {
                $q->where('title', 'like', "%{$search}%")
                  ->orWhere('message', 'like', "%{$search}%")
                  ->orWhere('module', 'like', "%{$search}%");
            });
        }

        $perPage = min((int)$request->query('per_page', 20), 100);
        $paginated = $query->orderByDesc('notification_id')->paginate($perPage);

        // Unread Counts
        $unreadCount = Notification::forUser($user->user_id)->unread()->count();
        $criticalCount = Notification::forUser($user->user_id)->unread()->where('priority', 'critical')->count();
        $highCount = Notification::forUser($user->user_id)->unread()->where('priority', 'high')->count();

        $notifications = collect($paginated->items())->map(function ($n) {
            return [
                'id' => $n->notification_id,
                'notification_id' => $n->notification_id,
                'type' => $n->type,
                'title' => $n->title,
                'message' => $n->message,
                'module' => $n->module,
                'related_id' => $n->related_id,
                'related_type' => $n->related_type,
                'action_url' => $n->action_url,
                'priority' => $n->priority,
                'is_read' => (bool)$n->is_read,
                'read_at' => $n->read_at ? $n->read_at->toIso8601String() : null,
                'created_at' => $n->created_at ? $n->created_at->toIso8601String() : null,
                'time_ago' => $n->created_at ? $n->created_at->diffForHumans() : 'Recently',
                'time' => $n->created_at ? date('Y-m-d H:i', strtotime($n->created_at)) : '—',
            ];
        });

        return response()->json([
            'notifications' => $notifications,
            'total' => $paginated->total(),
            'current_page' => $paginated->currentPage(),
            'last_page' => $paginated->lastPage(),
            'per_page' => $paginated->perPage(),
            'unread_count' => $unreadCount,
            'critical_count' => $criticalCount,
            'high_count' => $highCount,
        ]);
    }

    /**
     * Get top latest notifications for header dropdown.
     */
    public function latest(Request $request)
    {
        $user = $request->user();
        if (!$user) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        $this->syncSystemAlerts($user);

        $limit = (int)$request->query('limit', 15);
        $items = Notification::forUser($user->user_id)
            ->orderByDesc('notification_id')
            ->limit($limit)
            ->get();

        $unreadCount = Notification::forUser($user->user_id)->unread()->count();
        $criticalCount = Notification::forUser($user->user_id)->unread()->where('priority', 'critical')->count();
        $highCount = Notification::forUser($user->user_id)->unread()->where('priority', 'high')->count();

        $notifications = $items->map(function ($n) {
            return [
                'id' => $n->notification_id,
                'notification_id' => $n->notification_id,
                'type' => $n->type,
                'title' => $n->title,
                'message' => $n->message,
                'module' => $n->module,
                'related_id' => $n->related_id,
                'related_type' => $n->related_type,
                'action_url' => $n->action_url,
                'priority' => $n->priority,
                'is_read' => (bool)$n->is_read,
                'read_at' => $n->read_at ? $n->read_at->toIso8601String() : null,
                'created_at' => $n->created_at ? $n->created_at->toIso8601String() : null,
                'time_ago' => $n->created_at ? $n->created_at->diffForHumans() : 'Recently',
                'time' => $n->created_at ? date('Y-m-d H:i', strtotime($n->created_at)) : '—',
            ];
        });

        return response()->json([
            'notifications' => $notifications,
            'unread_count' => $unreadCount,
            'critical_count' => $criticalCount,
            'high_count' => $highCount,
        ]);
    }

    /**
     * Get live unread count for badges and pollers.
     */
    public function unreadCount(Request $request)
    {
        $user = $request->user();
        if (!$user) {
            return response()->json(['unread_count' => 0, 'critical_count' => 0, 'high_count' => 0]);
        }

        $this->syncSystemAlerts($user);

        $unreadCount = Notification::forUser($user->user_id)->unread()->count();
        $criticalCount = Notification::forUser($user->user_id)->unread()->where('priority', 'critical')->count();
        $highCount = Notification::forUser($user->user_id)->unread()->where('priority', 'high')->count();

        return response()->json([
            'unread_count' => $unreadCount,
            'critical_count' => $criticalCount,
            'high_count' => $highCount,
        ]);
    }

    /**
     * Mark a single notification as read.
     */
    public function markAsRead(Request $request, $id)
    {
        $user = $request->user();
        $notification = Notification::where('notification_id', $id)->firstOrFail();

        if ($notification->user_id !== $user->user_id) {
            return response()->json(['message' => 'Unauthorized access to notification.'], 403);
        }

        $notification->is_read = true;
        $notification->read_at = now();
        $notification->save();

        $unreadCount = Notification::forUser($user->user_id)->unread()->count();

        return response()->json([
            'success' => true,
            'message' => 'Notification marked as read.',
            'unread_count' => $unreadCount,
            'notification' => $notification,
        ]);
    }

    /**
     * Mark a single notification as unread.
     */
    public function markAsUnread(Request $request, $id)
    {
        $user = $request->user();
        $notification = Notification::where('notification_id', $id)->firstOrFail();

        if ($notification->user_id !== $user->user_id) {
            return response()->json(['message' => 'Unauthorized access to notification.'], 403);
        }

        $notification->is_read = false;
        $notification->read_at = null;
        $notification->save();

        $unreadCount = Notification::forUser($user->user_id)->unread()->count();

        return response()->json([
            'success' => true,
            'message' => 'Notification marked as unread.',
            'unread_count' => $unreadCount,
            'notification' => $notification,
        ]);
    }

    /**
     * Mark all unread notifications as read for current user.
     */
    public function markAllAsRead(Request $request)
    {
        $user = $request->user();
        $count = Notification::forUser($user->user_id)
            ->unread()
            ->update([
                'is_read' => true,
                'read_at' => now(),
            ]);

        return response()->json([
            'success' => true,
            'message' => "Marked {$count} notifications as read.",
            'marked_count' => $count,
            'unread_count' => 0,
        ]);
    }

    /**
     * Delete a single notification.
     */
    public function destroy(Request $request, $id)
    {
        $user = $request->user();
        $notification = Notification::where('notification_id', $id)->firstOrFail();

        if ($notification->user_id !== $user->user_id) {
            return response()->json(['message' => 'Unauthorized access to notification.'], 403);
        }

        $notification->delete();

        $unreadCount = Notification::forUser($user->user_id)->unread()->count();

        return response()->json([
            'success' => true,
            'message' => 'Notification deleted successfully.',
            'unread_count' => $unreadCount,
        ]);
    }

    /**
     * Clear all read notifications for current user.
     */
    public function clearAllRead(Request $request)
    {
        $user = $request->user();
        $count = Notification::forUser($user->user_id)->read()->delete();

        return response()->json([
            'success' => true,
            'message' => "Cleared {$count} read notifications.",
            'cleared_count' => $count,
        ]);
    }

    /**
     * View single notification details.
     */
    public function show(Request $request, $id)
    {
        $user = $request->user();
        $notification = Notification::where('notification_id', $id)->firstOrFail();

        if ($notification->user_id !== $user->user_id) {
            return response()->json(['message' => 'Unauthorized access to notification.'], 403);
        }

        return response()->json(['notification' => $notification]);
    }

    /**
     * Auto-sync real system alerts (unverified accounts, low stock, overdue accounts)
     * so they are immediately visible in the notification bar.
     */
    private function syncSystemAlerts($user)
    {
        if (!$user) return;

        // 1. Pending Account Verifications (Administrators)
        if ($user->role === 'Administrator') {
            $unverifiedCount = \App\Models\User::where('account_verified', false)->count();
            if ($unverifiedCount > 0) {
                $exists = Notification::where('user_id', $user->user_id)
                    ->where('type', 'unverified_accounts_alert')
                    ->where('is_read', false)
                    ->exists();
                if (!$exists) {
                    Notification::create([
                        'user_id' => $user->user_id,
                        'type' => 'unverified_accounts_alert',
                        'title' => 'Pending Account Verifications',
                        'message' => "{$unverifiedCount} user account(s) are awaiting Administrator verification.",
                        'module' => 'Users',
                        'action_url' => '/users',
                        'priority' => 'high',
                        'is_read' => false,
                    ]);
                }
            }
        }

        // 2. Overdue Installment (Administrators and Store Administrators)
        $isStoreAdmin = in_array($user->role, ['Store Administrator', 'Store Admin']);
        if ($user->role === 'Administrator' || $isStoreAdmin) {
            $instQuery = \App\Models\InstallmentAccount::where('status', 'Overdue');
            if ($isStoreAdmin) {
                $branch = $user->employee ? $user->employee->branch_id : null;
                $instQuery->whereHas('sale.processedBy.employee', fn($eq) => $eq->where('branch_id', $branch));
            }
            $overdueCount = $instQuery->count();
            if ($overdueCount > 0) {
                $exists = Notification::where('user_id', $user->user_id)
                    ->where('type', 'overdue_installments_alert')
                    ->where('is_read', false)
                    ->exists();
                if (!$exists) {
                    Notification::create([
                        'user_id' => $user->user_id,
                        'type' => 'overdue_installments_alert',
                        'title' => 'Overdue Installment',
                        'message' => "{$overdueCount} installment(s) have past-due schedules.",
                        'module' => 'Installments',
                        'action_url' => '/installments?tab=overdue',
                        'priority' => 'critical',
                        'is_read' => false,
                    ]);
                }
            }
        }

        // 3. Low Stock Alert (Administrators and Store Administrators)
        if ($user->role === 'Administrator' || $isStoreAdmin) {
            $lowStockCount = \App\Models\Product::where('stock_quantity', 1)
                ->where('stock_quantity', '>', 0)
                ->count();
            if ($lowStockCount > 0) {
                $exists = Notification::where('user_id', $user->user_id)
                    ->where('type', 'low_stock_alert')
                    ->where('is_read', false)
                    ->exists();
                if (!$exists) {
                    Notification::create([
                        'user_id' => $user->user_id,
                        'type' => 'low_stock_alert',
                        'title' => 'Low Inventory Alert',
                        'message' => "{$lowStockCount} product(s) are below configured reorder levels.",
                        'module' => 'Inventory',
                        'action_url' => '/products',
                        'priority' => 'high',
                        'is_read' => false,
                    ]);
                }
            }
        }
    }
}

