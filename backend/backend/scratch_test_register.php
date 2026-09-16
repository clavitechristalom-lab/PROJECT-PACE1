<?php
require __DIR__.'/vendor/autoload.php';
$app = require_once __DIR__.'/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

$request = Illuminate\Http\Request::create('/api/register', 'POST', [
    'name' => 'John Doe',
    'email' => 'john.doe' . rand(1,1000) . '@example.com',
    'username' => 'johndoe' . rand(1,1000),
    'password' => 'password123',
    'confirmPassword' => 'password123',
    'role' => 'Administrator',
]);

$response = app()->handle($request);
echo "Status: " . $response->getStatusCode() . "\n";
echo "Content: " . $response->getContent() . "\n";
