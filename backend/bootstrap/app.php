<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withBroadcasting(
        __DIR__.'/../routes/channels.php',
        ['prefix' => 'api', 'middleware' => ['api', 'auth:sanctum']],
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->api(append: [
            \App\Http\Middleware\ApplyGlobalSystemSettings::class,
        ]);
        $middleware->alias([
            'role' => \App\Http\Middleware\EnsureRole::class,
            'employee.dept' => \App\Http\Middleware\EnsureEmployeeDepartment::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->render(function (\Illuminate\Database\Eloquent\ModelNotFoundException $e, \Illuminate\Http\Request $request) {
            $modelName = class_basename($e->getModel());
            return response()->json([
                'message' => "The requested {$modelName} was not found or has been removed.",
                'error' => 'not_found'
            ], 404);
        });
        $exceptions->render(function (\Symfony\Component\HttpKernel\Exception\NotFoundHttpException $e, \Illuminate\Http\Request $request) {
            if ($request->is('api/*') || $request->wantsJson()) {
                $prev = $e->getPrevious();
                if ($prev instanceof \Illuminate\Database\Eloquent\ModelNotFoundException) {
                    $modelName = class_basename($prev->getModel());
                    return response()->json([
                        'message' => "The requested {$modelName} was not found or has been removed.",
                        'error' => 'not_found'
                    ], 404);
                }
                return response()->json([
                    'message' => $e->getMessage() ?: 'The requested resource was not found.',
                    'error' => 'not_found'
                ], 404);
            }
        });
    })->create();
