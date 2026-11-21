<?php

use Illuminate\Support\Facades\Route;
use Illuminate\Http\Request;

Route::get('/', function (Request $request) {
    if ($request->has('payment_status') || $request->has('ref')) {
        $frontendUrl = env('FRONTEND_URL', 'http://localhost:5173');
        return redirect("{$frontendUrl}/?" . http_build_query($request->query()));
    }
    return view('welcome');
});

// Fallback media server for /storage/* when Windows junctions/symlinks are bypassed
Route::get('/storage/{path}', function (string $path) {
    $safePath = str_replace(['..', '\\'], ['', '/'], ltrim($path, '/'));
    $fullPath = storage_path('app/public/' . $safePath);
    if (!is_file($fullPath)) {
        abort(404);
    }
    return response()->file($fullPath, [
        'Cache-Control' => 'public, max-age=86400',
    ]);
})->where('path', '.*');
