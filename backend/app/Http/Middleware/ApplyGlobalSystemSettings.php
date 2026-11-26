<?php

namespace App\Http\Middleware;

use App\Models\Setting;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Symfony\Component\HttpFoundation\Response;

class ApplyGlobalSystemSettings
{
    public const CACHE_KEY = 'pace_global_runtime_flags';

    public static function getRuntimeFlags(): array
    {
        try {
            return Cache::remember(self::CACHE_KEY, 15, function () {
                $rows = Setting::whereIn('key', ['maintenance_mode', 'debug_mode', 'site_name', 'company_name'])
                    ->pluck('value', 'key')
                    ->toArray();

                return [
                    'maintenance_mode' => filter_var($rows['maintenance_mode'] ?? false, FILTER_VALIDATE_BOOLEAN),
                    'debug_mode'       => filter_var($rows['debug_mode'] ?? false, FILTER_VALIDATE_BOOLEAN),
                    'site_name'        => $rows['site_name'] ?? $rows['company_name'] ?? 'Z-LICZ Appliances',
                ];
            });
        } catch (\Throwable $e) {
            return [
                'maintenance_mode' => false,
                'debug_mode'       => (bool) config('app.debug', false),
                'site_name'        => 'Z-LICZ Appliances',
            ];
        }
    }

    public function handle(Request $request, Closure $next): Response
    {
        $flags = self::getRuntimeFlags();
        $debugMode = (bool) ($flags['debug_mode'] ?? false);
        $maintenanceMode = (bool) ($flags['maintenance_mode'] ?? false);

        // Apply Debug Mode dynamically for this request
        config(['app.debug' => $debugMode]);

        $startedAt = $debugMode ? microtime(true) : null;

        // Enforce Maintenance Mode for non-admin API requests
        if ($maintenanceMode && $request->is('api/*')) {
            $path = strtolower(trim($request->path(), '/'));
            $isGet = strtoupper($request->method()) === 'GET';

            $alwaysAllowed = [
                'api/login',
                'api/verify-login-otp',
                'api/resend-login-otp',
                'api/verify-otp',
                'api/resend-otp',
                'api/logout',
            ];
            $allowedGets = [
                'api/settings',
                'api/public/settings',
                'api/public/bootstrap',
                'api/sync/status',
                'api/user',
            ];

            $exempt = in_array($path, $alwaysAllowed, true)
                || ($isGet && in_array($path, $allowedGets, true));

            if (!$exempt) {
                $user = $request->user() ?? auth('sanctum')->user();
                $isAdmin = $user && in_array($user->role, ['Administrator', 'Admin'], true);

                if (!$isAdmin) {
                    $siteName = $flags['site_name'] ?: 'Z-LICZ Appliances';
                    $resp = response()->json([
                        'success'          => false,
                        'maintenance_mode' => true,
                        'site_name'        => $siteName,
                        'message'          => "{$siteName} is currently in Maintenance Mode. Access is temporarily suspended for non-admin users.",
                    ], 503);
                    if ($debugMode) {
                        $resp->headers->set('X-Debug-Mode', 'enabled');
                    }
                    return $resp;
                }
            }
        }

        $response = $next($request);

        if ($debugMode) {
            $elapsedMs = $startedAt ? round((microtime(true) - $startedAt) * 1000, 1) : 0;
            $user = $request->user() ?? auth('sanctum')->user();
            $userLabel = $user ? "{$user->username} (#{$user->user_id}, {$user->role})" : 'guest';
            Log::info("[DEBUG MODE] {$request->method()} /{$request->path()} | User: {$userLabel} | Status: {$response->getStatusCode()} | {$elapsedMs}ms");
            $response->headers->set('X-Debug-Mode', 'enabled');
            $response->headers->set('X-Response-Time-Ms', (string) $elapsedMs);
        }

        return $response;
    }
}
