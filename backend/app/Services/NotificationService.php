<?php

namespace App\Services;

use App\Models\Notification;
use App\Models\User;
use App\Models\Employee;
use App\Http\Controllers\SyncController;

class NotificationService
{
    /**
     * Directly create a notification record for a known active user ID.
     */
    private static function createForUserId($userId, array $data): Notification
    {
        return Notification::create([
            'user_id' => $userId,
            'type' => $data['type'] ?? 'system_alert',
            'title' => $data['title'] ?? 'Notification',
            'message' => $data['message'] ?? '',
            'module' => $data['module'] ?? 'System',
            'related_id' => isset($data['related_id']) ? (string)$data['related_id'] : null,
            'related_type' => $data['related_type'] ?? null,
            'action_url' => $data['action_url'] ?? null,
            'priority' => $data['priority'] ?? 'normal',
            'is_read' => false,
            'read_at' => null,
        ]);
    }

    /**
     * Send a notification to a specific user.
     */
    public static function sendToUser($userId, array $data): ?Notification
    {
        if (!$userId) return null;

        $user = User::select(['user_id', 'is_active'])->find($userId);
        if (!$user) return null;

        $notif = self::createForUserId($userId, $data);
        SyncController::invalidateFingerprint('notifications');

        $targetUser = User::select(['user_id', 'role', 'customer_id'])->find($userId);
        if ($targetUser) {
            if ($targetUser->role === 'Customer' && $targetUser->customer_id) {
                RealtimeBroadcaster::dispatch(new \App\Events\SystemNotificationCreated([
                    'notification_id' => $notif->notification_id ?? $notif->id,
                    'title' => $notif->title,
                    'message' => $notif->message,
                    'module' => $notif->module,
                ], null, (int) $targetUser->customer_id, null, false));
            } else {
                RealtimeBroadcaster::dispatch(new \App\Events\SystemNotificationCreated([
                    'notification_id' => $notif->notification_id ?? $notif->id,
                    'title' => $notif->title,
                    'message' => $notif->message,
                    'module' => $notif->module,
                ], (int) $userId, null, null, false));
            }
        }

        return $notif;
    }

    public static function sendToAdmins(array $data): array
    {
        $adminIds = User::where('role', 'Administrator')
            ->pluck('user_id');

        $created = [];
        foreach ($adminIds as $adminId) {
            $created[] = self::createForUserId($adminId, $data);
        }

        if (!empty($created)) {
            SyncController::invalidateFingerprint('notifications');
            RealtimeBroadcaster::dispatch(new \App\Events\SystemNotificationCreated([
                'title' => $data['title'] ?? 'Notification',
                'message' => $data['message'] ?? '',
                'module' => $data['module'] ?? 'System',
            ], null, null, null, true));
        }

        return $created;
    }

    public static function sendToStoreAdmins(array $data, ?string $branch = null): array
    {
        $query = User::whereIn('role', ['Store Administrator', 'Store Admin']);

        if ($branch && $branch !== 'All') {
            $query->whereHas('employee', function ($q) use ($branch) {
                $q->where('branch_id', $branch);
            });
        }

        $storeAdminIds = $query->pluck('user_id');
        $created = [];

        foreach ($storeAdminIds as $adminId) {
            $created[] = self::createForUserId($adminId, $data);
        }

        if (!empty($created)) {
            SyncController::invalidateFingerprint('notifications');
            $branchInt = ($branch && is_numeric($branch)) ? (int) $branch : null;
            if ($branchInt) {
                RealtimeBroadcaster::dispatch(new \App\Events\SystemNotificationCreated([
                    'title' => $data['title'] ?? 'Notification',
                    'message' => $data['message'] ?? '',
                    'module' => $data['module'] ?? 'System',
                ], null, null, $branchInt, false));
            } else {
                foreach ($storeAdminIds as $adminId) {
                    RealtimeBroadcaster::dispatch(new \App\Events\SystemNotificationCreated([
                        'title' => $data['title'] ?? 'Notification',
                        'message' => $data['message'] ?? '',
                        'module' => $data['module'] ?? 'System',
                    ], (int) $adminId, null, null, false));
                }
            }
        }

        return $created;
    }

    /**
     * Send a notification to users with a specific role.
     */
    public static function sendToRole(string $role, array $data): array
    {
        $userIds = User::where('role', $role)
            ->pluck('user_id');

        $created = [];
        foreach ($userIds as $userId) {
            $created[] = self::createForUserId($userId, $data);
        }

        if (!empty($created)) {
            SyncController::invalidateFingerprint('notifications');
        }

        return $created;
    }

    /**
     * Send a notification to the user account linked to an employee.
     */
    public static function sendToEmployeeUser($employeeId, array $data): ?Notification
    {
        if (!$employeeId) return null;

        $userId = User::where('employee_id', $employeeId)
            ->value('user_id');

        if (!$userId) return null;

        $notif = self::createForUserId($userId, $data);
        SyncController::invalidateFingerprint('notifications');

        RealtimeBroadcaster::dispatch(new \App\Events\SystemNotificationCreated([
            'notification_id' => $notif->notification_id ?? $notif->id,
            'title' => $notif->title,
            'message' => $notif->message,
            'module' => $notif->module,
        ], (int) $userId, null, null, false));

        return $notif;
    }

    public static function sendToCustomers(array $data, ?string $branchId = null): array
    {
        $query = User::where('role', 'Customer');

        if ($branchId && $branchId !== 'All') {
            $query->whereHas('customer', function ($q) use ($branchId) {
                $q->where('branch_id', $branchId);
            });
        }

        $userIds = $query->pluck('user_id');
        $created = [];

        foreach ($userIds as $userId) {
            $created[] = self::createForUserId($userId, $data);
        }

        if (!empty($created)) {
            SyncController::invalidateFingerprint('notifications');
        }

        return $created;
    }

    public static function sendToCustomer($customerId, array $data): ?Notification
    {
        if (!$customerId) return null;

        $userId = User::where('customer_id', $customerId)
            ->value('user_id');

        if (!$userId) return null;

        $notif = self::createForUserId($userId, $data);
        SyncController::invalidateFingerprint('notifications');

        RealtimeBroadcaster::dispatch(new \App\Events\SystemNotificationCreated([
            'notification_id' => $notif->notification_id ?? $notif->id,
            'title' => $notif->title,
            'message' => $notif->message,
            'module' => $notif->module,
        ], null, (int) $customerId, null, false));

        return $notif;
    }
}
