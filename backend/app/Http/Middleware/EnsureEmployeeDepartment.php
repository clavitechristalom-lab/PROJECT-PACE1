<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureEmployeeDepartment
{
    public function handle(Request $request, Closure $next, ...$departments): Response
    {
        $user = $request->user();

        if (!$user) {
            return response()->json([
                'success' => false,
                'message' => '401 Unauthorized: Authentication required.',
            ], 401);
        }

        if ($user->role !== 'Employee') {
            return response()->json([
                'success' => false,
                'message' => '403 Forbidden: Access is restricted to Employee accounts in the authorized department.',
                'current_role' => $user->role,
            ], 403);
        }

        $user->loadMissing('employee');
        $currentDepartment = $user->resolveEmployeeDepartment();

        $allowed = [];
        foreach ($departments as $dept) {
            foreach (explode(',', (string) $dept) as $item) {
                $normalized = strtolower(trim($item));
                if ($normalized !== '') {
                    $allowed[] = $normalized;
                }
            }
        }

        if (empty($allowed) || !$currentDepartment || !in_array($currentDepartment, $allowed, true)) {
            return response()->json([
                'success' => false,
                'message' => '403 Forbidden: Your employee department is not authorized to access this resource.',
                'required_departments' => $allowed,
                'current_department' => $currentDepartment,
                'current_position' => $user->employee?->position,
            ], 403);
        }

        return $next($request);
    }
}
