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
