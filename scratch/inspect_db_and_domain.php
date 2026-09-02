<?php

require_once __DIR__ . '/../backend/backend/vendor/autoload.php';

$app = require_once __DIR__ . '/../backend/backend/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

echo "=== TABLES IN DATABASE ===\n";
$tables = DB::select('SHOW TABLES');
foreach ($tables as $t) {
    $arr = (array)$t;
    $tableName = array_values($arr)[0];
    $count = DB::table($tableName)->count();
    echo "- {$tableName} ({$count} rows)\n";
}

echo "\n=== STORES TABLE SCHEMA ===\n";
if (Schema::hasTable('stores')) {
    $columns = Schema::getColumnListing('stores');
    echo "Columns: " . implode(', ', $columns) . "\n";
} else {
    echo "stores table does not exist.\n";
}

echo "\n=== SYSTEM / BUSINESS SETTINGS TABLE SCHEMA ===\n";
if (Schema::hasTable('system_settings')) {
    $columns = Schema::getColumnListing('system_settings');
    echo "Columns: " . implode(', ', $columns) . "\n";
    $settings = DB::table('system_settings')->get();
    echo "Settings rows:\n";
    foreach ($settings as $s) {
        echo json_encode($s) . "\n";
    }
} else {
    echo "system_settings table does not exist.\n";
}

echo "\n=== USERS TABLE ===\n";
$users = DB::table('users')->select('user_id', 'username', 'role', 'is_active', 'employee_id')->get();
foreach ($users as $u) {
    echo json_encode($u) . "\n";
}
