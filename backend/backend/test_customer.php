<?php
require __DIR__.'/vendor/autoload.php';
$app = require_once __DIR__.'/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Http\Kernel::class);

$request = Illuminate\Http\Request::create('/api/customer/dashboard', 'GET');

// mock auth
$user = App\Models\User::where('role', 'Customer')->first();
if (!$user) {
    echo "No customer user found.\n";
    exit;
}
$request->setUserResolver(function () use ($user) {
    return $user;
});

$response = $kernel->handle($request);
echo "Status: " . $response->getStatusCode() . "\n";
echo $response->getContent() . "\n";
