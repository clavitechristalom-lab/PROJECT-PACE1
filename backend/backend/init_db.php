<?php

$host = '127.0.0.1';
$port = 3306;
$user = 'root';
$pass = '';
$dbname = 'project_pace';
$sqlFile = __DIR__ . '/../../schema_export_fixed.sql';

try {
    // Connect without database to create it
    $pdo = new PDO("mysql:host=$host;port=$port", $user, $pass);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    $pdo->exec("CREATE DATABASE IF NOT EXISTS `$dbname`");
    echo "Database `$dbname` created or already exists.\n";

    // Reconnect with database
    $pdo->exec("USE `$dbname`");

    // Import the SQL dump
    if (file_exists($sqlFile)) {
        echo "Importing schema from $sqlFile...\n";
        $sql = file_get_contents($sqlFile);
        $pdo->exec($sql);
        echo "Schema imported successfully.\n";
    } else {
        echo "Error: SQL file not found at $sqlFile\n";
    }

} catch (PDOException $e) {
    echo "Connection failed: " . $e->getMessage() . "\n";
}
