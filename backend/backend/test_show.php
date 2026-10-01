<?php
require __DIR__ . '/vendor/autoload.php';
$app = require_once __DIR__ . '/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Http\Kernel::class);
$request = Illuminate\Http\Request::capture();
$kernel->handle($request);

try {
    $user = \App\Models\User::where('role', 'Customer')->first();
    $request = \Illuminate\Http\Request::create('/api/installments/31', 'GET');
    $request->setUserResolver(function() use ($user) { return $user; });
    $controller = app(\App\Http\Controllers\InstallmentController::class);
    $response = $controller->show($request, 31);
    echo json_encode($response->getData(), JSON_PRETTY_PRINT);
} catch (\Exception $e) {
    echo $e->getMessage() . " in " . $e->getFile() . " on line " . $e->getLine();
}
