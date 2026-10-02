<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureRole
{
    /**
     * Handle an incoming request.
     *
     * @param  \Closure(\Illuminate\Http\Request): (\Symfony\Component\HttpFoundation\Response)  $next
     * @param  string  ...$roles
     */
    public function handle(Request $request, Closure $next, ...$roles): Response
    {
        $user = $request->user();

        if (!$user) {
            return response()->json([
                'success' => false,
                'message' => '401 Unauthorized: Authentication required.',
            ], 401);
        }

        if (!$user->is_active) {
            return response()->json([
                'success' => false,
                'message' => '403 Forbidden: Account is inactive.',
            ], 403);
        }

        if (empty($roles)) {
            return $next($request);
        }

        // Normalize roles list (support comma-separated string or array arguments)
        $allowedRoles = [];
        foreach ($roles as $r) {
            foreach (explode(',', $r) as $subRole) {
                $allowedRoles[] = trim($subRole);
            }
        }

        if (!in_array($user->role, $allowedRoles)) {
            return response()->json([
                'success' => false,
                'message' => '403 Forbidden: Unauthorized access. Your role is not permitted to perform this action.',
                'required_roles' => $allowedRoles,
                'current_role' => $user->role,
            ], 403);
        }

        return $next($request);
    }
}
