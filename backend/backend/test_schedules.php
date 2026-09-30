<?php
$req = \Illuminate\Http\Request::create('/api/payment-schedules', 'GET', ['branch' => 17]);
$user = \App\Models\User::where('role', 'Store Administrator')->first();
$req->setUserResolver(function() use ($user) { return $user; });
echo json_encode(app(\App\Http\Controllers\PaymentController::class)->schedules($req)->getContent());
