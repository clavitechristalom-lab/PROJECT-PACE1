<?php
require __DIR__ . '/vendor/autoload.php';
$app = require_once __DIR__ . '/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

$msgs = App\Models\SupportMessage::all();
echo "Messages count: " . $msgs->count() . "\n";
