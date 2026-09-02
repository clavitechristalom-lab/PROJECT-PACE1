<?php

namespace App\Services;

use App\Models\Notification;
use App\Models\User;
use App\Models\Employee;

class NotificationService
{
    /**
     * Send a notification to a specific user.
     */
    public static function sendToUser($userId, array $data): ?Notification
    {
        if (!$userId) return null;

        $user = User::find($userId);
        if (!$user) return null;
        if (isset($user->is_active) && $user->is_active === false) return null;

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
     * Send a notification to all active Administrators.
     */
    public static function sendToAdmins(array $data): array
    {
        $adminIds = User::where('role', 'Administrator')
            ->where(function ($q) {
                $q->whereNull('is_active')->orWhere('is_active', true)->orWhere('is_active', 1);
            })
            ->pluck('user_id');

        $created = [];
        foreach ($adminIds as $adminId) {
            $notif = self::sendToUser($adminId, $data);
            if ($notif) $created[] = $notif;
        }

        return $created;
    }

    /**
     * Send a notification to Store Administrators (optionally filtered by branch).
     */
    public static function sendToStoreAdmins(array $data, ?string $branch = null): array
    {
        $query = User::with('employee')
            ->whereIn('role', ['Store Administrator', 'Store Admin'])
            ->where('is_active', true);

        if ($branch && $branch !== 'All' && $branch !== 'Main Branch') {
            $query->whereHas('employee', function ($q) use ($branch) {
                $q->where('branch', $branch);
            });
        }

        $storeAdminIds = $query->pluck('user_id');
        $created = [];

        foreach ($storeAdminIds as $adminId) {
            $notif = self::sendToUser($adminId, $data);
            if ($notif) $created[] = $notif;
        }

        return $created;
    }

    /**
     * Send a notification to users with a specific role.
     */
    public static function sendToRole(string $role, array $data): array
    {
        $userIds = User::where('role', $role)
            ->where('is_active', true)
            ->pluck('user_id');

        $created = [];
        foreach ($userIds as $userId) {
            $notif = self::sendToUser($userId, $data);
            if ($notif) $created[] = $notif;
        }

        return $created;
    }

    /**
     * Send a notification to the user account linked to an employee.
     */
    public static function sendToEmployeeUser($employeeId, array $data): ?Notification
    {
        if (!$employeeId) return null;

        $user = User::where('employee_id', $employeeId)
            ->where('is_active', true)
            ->first();

        if (!$user) return null;

        return self::sendToUser($user->user_id, $data);
    }
}
