<?php

use App\Http\Controllers\CustomerDashboardController;
use Illuminate\Support\Facades\Broadcast;

Broadcast::channel('admin.global', function ($user) {
    return $user && in_array($user->role, ['Administrator', 'Admin'], true);
});

Broadcast::channel('branch.{branchId}', function ($user, int $branchId) {
    if (!$user || $branchId <= 0) {
        return false;
    }

    if (in_array($user->role, ['Administrator', 'Admin'], true)) {
        return true;
    }

    if (in_array($user->role, ['Store Administrator', 'Store Admin', 'Employee'], true)) {
        $empBranchId = $user->employee?->branch_id;
        return $empBranchId !== null && (int) $empBranchId === (int) $branchId;
    }

    return false;
});

Broadcast::channel('employee.{userId}', function ($user, int $userId) {
    if (!$user || $userId <= 0) {
        return false;
    }

    if (in_array($user->role, ['Administrator', 'Admin'], true)) {
        return (int) $user->user_id === (int) $userId;
    }

    return in_array($user->role, ['Employee', 'Store Administrator', 'Store Admin'], true)
        && (int) $user->user_id === (int) $userId;
});

Broadcast::channel('customer.{customerId}', function ($user, int $customerId) {
    if (!$user || $customerId <= 0) {
        return false;
    }

    if (in_array($user->role, ['Administrator', 'Admin'], true)) {
        return true;
    }

    if ($user->role !== 'Customer') {
        return false;
    }

    $resolvedCustomerId = CustomerDashboardController::resolveCustomerId($user);
    return $resolvedCustomerId !== null && (int) $resolvedCustomerId === (int) $customerId;
});
