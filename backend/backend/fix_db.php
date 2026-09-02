<?php

$host = '127.0.0.1';
$port = 3306;
$user = 'root';
$pass = '';
$dbname = 'project_pace';

try {
    $pdo = new PDO("mysql:host=$host;port=$port;dbname=$dbname", $user, $pass);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    $sql = "
    CREATE TABLE IF NOT EXISTS `qr_requests` (
      `request_id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
      `request_code` varchar(255) NOT NULL,
      `user_id` bigint(20) unsigned NOT NULL,
      `employee_id` bigint(20) unsigned DEFAULT NULL,
      `role` varchar(255) NOT NULL,
      `branch` varchar(255) DEFAULT NULL,
      `department` varchar(255) DEFAULT NULL,
      `position` varchar(255) DEFAULT NULL,
      `status` varchar(255) NOT NULL DEFAULT 'PENDING',
      `checklist` json DEFAULT NULL,
      `reviewed_by` bigint(20) unsigned DEFAULT NULL,
      `reviewed_at` timestamp NULL DEFAULT NULL,
      `approved_by` bigint(20) unsigned DEFAULT NULL,
      `approved_at` timestamp NULL DEFAULT NULL,
      `rejected_by` bigint(20) unsigned DEFAULT NULL,
      `rejected_at` timestamp NULL DEFAULT NULL,
      `rejection_reason` text DEFAULT NULL,
      `ip_address` varchar(45) DEFAULT NULL,
      `user_agent` text DEFAULT NULL,
      `created_at` timestamp NULL DEFAULT NULL,
      `updated_at` timestamp NULL DEFAULT NULL,
      PRIMARY KEY (`request_id`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ";

    $pdo->exec($sql);
    echo "Table qr_requests created successfully.\n";

    // Add scanned_by and branch to attendance_scan_logs
    try {
        $pdo->exec("ALTER TABLE `attendance_scan_logs` ADD COLUMN `scanned_by` bigint(20) unsigned DEFAULT NULL;");
        echo "Added scanned_by to attendance_scan_logs.\n";
    } catch (PDOException $e) {
        if ($e->getCode() !== '42S21') { // 42S21 is column already exists
            echo "Error adding scanned_by to attendance_scan_logs: " . $e->getMessage() . "\n";
        } else {
            echo "Column scanned_by already exists in attendance_scan_logs.\n";
        }
    }

    try {
        $pdo->exec("ALTER TABLE `attendance_scan_logs` ADD COLUMN `branch` varchar(255) DEFAULT NULL;");
        echo "Added branch to attendance_scan_logs.\n";
    } catch (PDOException $e) {
        if ($e->getCode() !== '42S21') {
            echo "Error adding branch to attendance_scan_logs: " . $e->getMessage() . "\n";
        } else {
            echo "Column branch already exists in attendance_scan_logs.\n";
        }
    }

    // Add scanned_by to attendance
    try {
        $pdo->exec("ALTER TABLE `attendance` ADD COLUMN `scanned_by` bigint(20) unsigned DEFAULT NULL;");
        echo "Added scanned_by to attendance.\n";
    } catch (PDOException $e) {
        if ($e->getCode() !== '42S21') {
            echo "Error adding scanned_by to attendance: " . $e->getMessage() . "\n";
        } else {
            echo "Column scanned_by already exists in attendance.\n";
        }
    }
    // Add verified_by_name to attendance
    try {
        $sql = "ALTER TABLE `attendance` ADD COLUMN `verified_by_name` varchar(255) DEFAULT NULL;";
        $pdo->exec($sql);
        echo "Added verified_by_name to attendance.\n";
    } catch (PDOException $e) {
        if ($e->getCode() !== '42S21') {
            echo "Error adding verified_by_name to attendance: " . $e->getMessage() . "\n";
        } else {
            echo "Column verified_by_name already exists in attendance.\n";
        }
    }
} catch (PDOException $e) {
    echo "Connection failed: " . $e->getMessage() . "\n";
}
