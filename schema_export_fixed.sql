-- ========================================================
-- Project PACE (Z-LICZ APPLIANCES & FURNITURE)
-- Comprehensive Database Schema & Seed Data Export
-- Export Date: 2026-08-25 23:23:34
-- Compatibility: MySQL 5.7+ / MySQL 8.0+ / MariaDB 10.4+
-- ========================================================

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

CREATE DATABASE IF NOT EXISTS `project_pace` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `project_pace`;

-- MariaDB dump 10.19  Distrib 10.4.32-MariaDB, for Win64 (AMD64)
--
-- Host: localhost    Database: project_pace
-- ------------------------------------------------------
-- Server version	10.4.32-MariaDB

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `attendance`
--

DROP TABLE IF EXISTS `attendance`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `attendance` (
  `attendance_id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `employee_id` bigint(20) unsigned NOT NULL,
  `attendance_date` date NOT NULL,
  `time_in` time DEFAULT NULL,
  `time_out` time DEFAULT NULL,
  `total_hours` decimal(8,2) NOT NULL DEFAULT 0.00,
  `overtime_hours` decimal(8,2) NOT NULL DEFAULT 0.00,
  `status` varchar(255) NOT NULL DEFAULT 'present',
  `verification_method` varchar(255) NOT NULL DEFAULT 'QR + PIN',
  `device_info` varchar(255) DEFAULT NULL,
  `ip_address` varchar(255) DEFAULT NULL,
  `qr_scan_in` varchar(255) DEFAULT NULL,
  `qr_scan_out` varchar(255) DEFAULT NULL,
  `remarks` text DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`attendance_id`),
  KEY `attendance_employee_id_foreign` (`employee_id`),
  CONSTRAINT `attendance_employee_id_foreign` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`employee_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `attendance`
--

LOCK TABLES `attendance` WRITE;
/*!40000 ALTER TABLE `attendance` DISABLE KEYS */;
INSERT INTO `attendance` VALUES (1,1,'2026-08-25','18:54:48',NULL,0.00,0.00,'Late','QR + PIN','Test Terminal','127.0.0.1','QR_PIN_VERIFIED',NULL,NULL,'2026-08-26 06:54:48','2026-08-26 06:54:48');
/*!40000 ALTER TABLE `attendance` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `attendance_scan_logs`
--

DROP TABLE IF EXISTS `attendance_scan_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `attendance_scan_logs` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `employee_id` bigint(20) unsigned DEFAULT NULL,
  `qr_token_scanned` varchar(255) DEFAULT NULL,
  `scan_time` timestamp NOT NULL DEFAULT current_timestamp(),
  `qr_verified` tinyint(1) NOT NULL DEFAULT 0,
  `pin_verified` tinyint(1) NOT NULL DEFAULT 0,
  `action_type` varchar(255) NOT NULL DEFAULT 'REJECTED',
  `status` varchar(255) NOT NULL DEFAULT 'FAILED',
  `failure_reason` varchar(255) DEFAULT NULL,
  `device_info` varchar(255) DEFAULT NULL,
  `ip_address` varchar(255) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `attendance_scan_logs_employee_id_foreign` (`employee_id`),
  CONSTRAINT `attendance_scan_logs_employee_id_foreign` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`employee_id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `attendance_scan_logs`
--

LOCK TABLES `attendance_scan_logs` WRITE;
/*!40000 ALTER TABLE `attendance_scan_logs` DISABLE KEYS */;
INSERT INTO `attendance_scan_logs` VALUES (1,1,'bf2df2f5-f031-4b7c-aa36-53a245314d52','2026-08-25 18:54:48',0,0,'REJECTED','FAILED','QR code is inactive/disabled by administrator','Symfony','127.0.0.1','2026-08-26 06:54:48','2026-08-26 06:54:48'),(2,1,'bf2df2f5-f031-4b7c-aa36-53a245314d52','2026-08-25 18:54:48',1,1,'TIME_IN','SUCCESS',NULL,'Test Terminal','127.0.0.1','2026-08-26 06:54:48','2026-08-26 06:54:48'),(3,NULL,'EMP-002','2026-08-25 20:32:48',0,0,'REJECTED','FAILED','Invalid or unrecognized QR code token','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36','127.0.0.1','2026-08-26 08:32:48','2026-08-26 08:32:48');
/*!40000 ALTER TABLE `attendance_scan_logs` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `backup_logs`
--

DROP TABLE IF EXISTS `backup_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `backup_logs` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `backup_name` varchar(255) DEFAULT NULL,
  `file_path` varchar(255) DEFAULT NULL,
  `backup_type` varchar(255) NOT NULL DEFAULT 'Full',
  `file_size` varchar(255) DEFAULT NULL,
  `status` varchar(255) NOT NULL DEFAULT 'Completed',
  `started_at` datetime DEFAULT NULL,
  `completed_at` datetime DEFAULT NULL,
  `created_by` bigint(20) unsigned DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `backup_logs`
--

LOCK TABLES `backup_logs` WRITE;
/*!40000 ALTER TABLE `backup_logs` DISABLE KEYS */;
/*!40000 ALTER TABLE `backup_logs` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `cache`
--

DROP TABLE IF EXISTS `cache`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `cache` (
  `key` varchar(255) NOT NULL,
  `value` mediumtext NOT NULL,
  `expiration` int(11) NOT NULL,
  PRIMARY KEY (`key`),
  KEY `cache_expiration_index` (`expiration`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `cache`
--

LOCK TABLES `cache` WRITE;
/*!40000 ALTER TABLE `cache` DISABLE KEYS */;
/*!40000 ALTER TABLE `cache` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `cache_locks`
--

DROP TABLE IF EXISTS `cache_locks`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `cache_locks` (
  `key` varchar(255) NOT NULL,
  `owner` varchar(255) NOT NULL,
  `expiration` int(11) NOT NULL,
  PRIMARY KEY (`key`),
  KEY `cache_locks_expiration_index` (`expiration`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `cache_locks`
--

LOCK TABLES `cache_locks` WRITE;
/*!40000 ALTER TABLE `cache_locks` DISABLE KEYS */;
/*!40000 ALTER TABLE `cache_locks` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `customers`
--

DROP TABLE IF EXISTS `customers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `customers` (
  `customer_id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `customer_code` varchar(255) DEFAULT NULL,
  `first_name` varchar(255) NOT NULL,
  `middle_name` varchar(255) DEFAULT NULL,
  `last_name` varchar(255) NOT NULL,
  `phone` varchar(255) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL,
  `address` text DEFAULT NULL,
  `status` varchar(255) NOT NULL DEFAULT 'active',
  `notes` text DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`customer_id`),
  UNIQUE KEY `customers_customer_code_unique` (`customer_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `customers`
--

LOCK TABLES `customers` WRITE;
/*!40000 ALTER TABLE `customers` DISABLE KEYS */;
/*!40000 ALTER TABLE `customers` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `employees`
--

DROP TABLE IF EXISTS `employees`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `employees` (
  `employee_id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `employee_code` varchar(255) NOT NULL,
  `first_name` varchar(255) NOT NULL,
  `middle_name` varchar(255) DEFAULT NULL,
  `last_name` varchar(255) NOT NULL,
  `gender` varchar(255) DEFAULT NULL,
  `date_of_birth` date DEFAULT NULL,
  `marital_status` varchar(255) DEFAULT NULL,
  `birth_date` date DEFAULT NULL,
  `position` varchar(255) DEFAULT NULL,
  `department` varchar(255) DEFAULT NULL,
  `branch` varchar(255) DEFAULT NULL,
  `pay_type` varchar(255) DEFAULT NULL,
  `ewallet_provider` varchar(255) DEFAULT NULL,
  `ewallet_account_no` varchar(255) DEFAULT NULL,
  `bank_name` varchar(255) DEFAULT NULL,
  `bank_account_no` varchar(255) DEFAULT NULL,
  `basic_salary` decimal(12,2) NOT NULL DEFAULT 0.00,
  `daily_rate` decimal(12,2) NOT NULL DEFAULT 0.00,
  `hourly_rate` decimal(12,2) NOT NULL DEFAULT 0.00,
  `phone` varchar(255) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL,
  `address` text DEFAULT NULL,
  `tin_number` varchar(255) DEFAULT NULL,
  `sss_number` varchar(255) DEFAULT NULL,
  `philhealth_number` varchar(255) DEFAULT NULL,
  `pagibig_number` varchar(255) DEFAULT NULL,
  `hire_date` date DEFAULT NULL,
  `qr_code` varchar(255) DEFAULT NULL,
  `status` varchar(255) NOT NULL DEFAULT 'active',
  `information_verified` tinyint(1) NOT NULL DEFAULT 0,
  `information_verified_at` timestamp NULL DEFAULT NULL,
  `account_verified` tinyint(1) NOT NULL DEFAULT 0,
  `account_verified_at` timestamp NULL DEFAULT NULL,
  `working_hours` varchar(255) NOT NULL DEFAULT '8 AM to 5 PM',
  `emergency_contact_name` varchar(255) DEFAULT NULL,
  `emergency_contact_relation` varchar(255) DEFAULT NULL,
  `emergency_contact_phone` varchar(255) DEFAULT NULL,
  `documents` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`documents`)),
  `notes` text DEFAULT NULL,
  `qr_token` varchar(255) DEFAULT NULL,
  `qr_active` tinyint(1) NOT NULL DEFAULT 1,
  `qr_generated_at` timestamp NULL DEFAULT NULL,
  `attendance_pin` varchar(255) DEFAULT NULL,
  `pin_failed_attempts` int(11) NOT NULL DEFAULT 0,
  `pin_locked_until` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`employee_id`),
  UNIQUE KEY `employees_employee_code_unique` (`employee_code`),
  UNIQUE KEY `employees_qr_token_unique` (`qr_token`)
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `employees`
--

LOCK TABLES `employees` WRITE;
/*!40000 ALTER TABLE `employees` DISABLE KEYS */;
INSERT INTO `employees` VALUES (1,'SYS-001','System','','Administrator','Other','2000-01-01','Single','2000-01-01','System Administrator','IT','Cagayan de Oro','Ewallet','Maya','0918-987-6543',NULL,NULL,0.00,0.00,0.00,'0917-888-9999','admin.verified@pace.com','Pace Headquarters, Cagayan de Oro City','','','','','2026-08-25',NULL,'Active',1,'2026-08-26 08:29:03',1,'2026-08-26 08:29:03','8 AM to 5 PM','Jane Administrator','Spouse','0918-777-6666',NULL,'Primary System Administrator Account','bf2df2f5-f031-4b7c-aa36-53a245314d52',1,'2026-08-26 06:54:48','$2y$12$XB/wjMaWF2W/X91IRtvENezHtKj0i52tbm28dtj6IT4I3/72ItPMS',0,NULL,'2026-08-26 06:22:46','2026-08-26 08:29:03'),(6,'EMP-002','talom',NULL,'',NULL,NULL,NULL,NULL,'Employee',NULL,NULL,'Monthly',NULL,NULL,NULL,NULL,0.00,0.00,0.00,NULL,'clavite@gmail.com',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'Active',1,'2026-08-26 09:03:37',1,'2026-08-26 09:03:37','8 AM to 5 PM',NULL,NULL,NULL,NULL,NULL,'08d6286e-5c99-4435-94c3-3a1c3b535c7c',1,'2026-08-26 09:03:10','$2y$12$eGZ.Y1aBDLxO3jGacTO4LefRPMshOOpQWOlFbWt1ccqmq2barb0Xq',0,NULL,'2026-08-26 09:02:04','2026-08-26 09:03:37'),(7,'EMP-003','roli',NULL,'',NULL,NULL,NULL,NULL,'Store Admin',NULL,NULL,'Monthly',NULL,NULL,NULL,NULL,0.00,0.00,0.00,NULL,'talom@gmail.com',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'Active',1,'2026-08-26 09:22:27',1,'2026-08-26 09:22:27','8 AM to 5 PM',NULL,NULL,NULL,NULL,NULL,'d2fb2f90-086b-4ff9-8992-01d1266d40ba',1,'2026-08-26 09:06:10','$2y$12$pYaillgc0BePoGUQ3nVNPu9Y7oVZU/K25aL3iSJ.wnpJHWYRrBFT.',0,NULL,'2026-08-26 09:05:19','2026-08-26 09:22:27');
/*!40000 ALTER TABLE `employees` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `failed_jobs`
--

DROP TABLE IF EXISTS `failed_jobs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `failed_jobs` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `uuid` varchar(255) NOT NULL,
  `connection` text NOT NULL,
  `queue` text NOT NULL,
  `payload` longtext NOT NULL,
  `exception` longtext NOT NULL,
  `failed_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `failed_jobs_uuid_unique` (`uuid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `failed_jobs`
--

LOCK TABLES `failed_jobs` WRITE;
/*!40000 ALTER TABLE `failed_jobs` DISABLE KEYS */;
/*!40000 ALTER TABLE `failed_jobs` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `installment_accounts`
--

DROP TABLE IF EXISTS `installment_accounts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `installment_accounts` (
  `installment_id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `account_no` varchar(255) NOT NULL,
  `customer_id` bigint(20) unsigned NOT NULL,
  `sale_id` bigint(20) unsigned DEFAULT NULL,
  `start_date` date NOT NULL,
  `principal_amount` decimal(12,2) NOT NULL DEFAULT 0.00,
  `down_payment` decimal(12,2) NOT NULL DEFAULT 0.00,
  `interest_rate` decimal(8,2) NOT NULL DEFAULT 0.00,
  `interest_amount` decimal(12,2) NOT NULL DEFAULT 0.00,
  `total_payable` decimal(12,2) NOT NULL DEFAULT 0.00,
  `installment_amount` decimal(12,2) NOT NULL DEFAULT 0.00,
  `number_of_installments` int(10) unsigned NOT NULL,
  `frequency` varchar(255) NOT NULL,
  `status` varchar(255) NOT NULL DEFAULT 'active',
  `notes` text DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`installment_id`),
  UNIQUE KEY `installment_accounts_account_no_unique` (`account_no`),
  KEY `installment_accounts_customer_id_foreign` (`customer_id`),
  KEY `installment_accounts_sale_id_foreign` (`sale_id`),
  CONSTRAINT `installment_accounts_customer_id_foreign` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`customer_id`) ON DELETE CASCADE,
  CONSTRAINT `installment_accounts_sale_id_foreign` FOREIGN KEY (`sale_id`) REFERENCES `sale_transactions` (`sale_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `installment_accounts`
--

LOCK TABLES `installment_accounts` WRITE;
/*!40000 ALTER TABLE `installment_accounts` DISABLE KEYS */;
/*!40000 ALTER TABLE `installment_accounts` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `installment_payroll_attendance_views`
--

DROP TABLE IF EXISTS `installment_payroll_attendance_views`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `installment_payroll_attendance_views` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `installment_payroll_attendance_views`
--

LOCK TABLES `installment_payroll_attendance_views` WRITE;
/*!40000 ALTER TABLE `installment_payroll_attendance_views` DISABLE KEYS */;
/*!40000 ALTER TABLE `installment_payroll_attendance_views` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `job_batches`
--

DROP TABLE IF EXISTS `job_batches`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `job_batches` (
  `id` varchar(255) NOT NULL,
  `name` varchar(255) NOT NULL,
  `total_jobs` int(11) NOT NULL,
  `pending_jobs` int(11) NOT NULL,
  `failed_jobs` int(11) NOT NULL,
  `failed_job_ids` longtext NOT NULL,
  `options` mediumtext DEFAULT NULL,
  `cancelled_at` int(11) DEFAULT NULL,
  `created_at` int(11) NOT NULL,
  `finished_at` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `job_batches`
--

LOCK TABLES `job_batches` WRITE;
/*!40000 ALTER TABLE `job_batches` DISABLE KEYS */;
/*!40000 ALTER TABLE `job_batches` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `jobs`
--

DROP TABLE IF EXISTS `jobs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `jobs` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `queue` varchar(255) NOT NULL,
  `payload` longtext NOT NULL,
  `attempts` tinyint(3) unsigned NOT NULL,
  `reserved_at` int(10) unsigned DEFAULT NULL,
  `available_at` int(10) unsigned NOT NULL,
  `created_at` int(10) unsigned NOT NULL,
  PRIMARY KEY (`id`),
  KEY `jobs_queue_index` (`queue`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `jobs`
--

LOCK TABLES `jobs` WRITE;
/*!40000 ALTER TABLE `jobs` DISABLE KEYS */;
/*!40000 ALTER TABLE `jobs` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `migrations`
--

DROP TABLE IF EXISTS `migrations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `migrations` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `migration` varchar(255) NOT NULL,
  `batch` int(11) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=29 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `migrations`
--

LOCK TABLES `migrations` WRITE;
/*!40000 ALTER TABLE `migrations` DISABLE KEYS */;
INSERT INTO `migrations` VALUES (1,'0001_01_01_000000_create_users_table',1),(2,'0001_01_01_000001_create_cache_table',1),(3,'0001_01_01_000002_create_jobs_table',1),(4,'2026_08_10_130149_create_employees_table',1),(5,'2026_08_10_130248_create_customers_table',1),(6,'2026_08_10_130313_create_products_table',1),(7,'2026_08_10_130549_create_sale_transactions_table',1),(8,'2026_08_10_130626_create_installment_accounts_table',1),(9,'2026_08_10_130652_create_payroll_periods_table',1),(10,'2026_08_10_130721_create_sale_items_table',1),(11,'2026_08_10_130739_create_attendance_table',1),(12,'2026_08_10_130816_create_payment_schedule_table',1),(13,'2026_08_10_130837_create_payroll_table',1),(14,'2026_08_10_130859_create_payroll_deductions_table',1),(15,'2026_08_10_130917_create_payments_table',1),(16,'2026_08_10_130932_create_system_logs_table',1),(17,'2026_08_10_130949_create_backup_logs_table',1),(18,'2026_08_10_131432_create_installment_payroll_attendance_views',1),(19,'2026_08_17_165852_create_personal_access_tokens_table',1),(20,'2026_08_20_000001_update_system_and_backup_logs_tables',1),(21,'2026_08_25_090559_add_scope_fields_to_employees_table',1),(22,'2026_08_25_151400_add_foreign_keys_to_tables',1),(23,'2026_08_25_160000_add_qr_and_pin_to_employees_and_attendance',2),(24,'2026_08_25_190000_add_verification_fields_to_employees_table',3),(25,'2026_08_25_200000_add_ewallet_and_bank_fields_to_employees_table',4),(26,'2026_08_25_210000_add_account_verified_to_employees_table',5),(27,'2026_08_25_220000_add_verification_fields_to_users_table',6),(28,'2026_08_25_230000_create_notifications_table',7);
/*!40000 ALTER TABLE `migrations` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `notifications`
--

DROP TABLE IF EXISTS `notifications`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `notifications` (
  `notification_id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint(20) unsigned NOT NULL,
  `type` varchar(100) NOT NULL,
  `title` varchar(255) NOT NULL,
  `message` text NOT NULL,
  `module` varchar(100) NOT NULL,
  `related_id` varchar(100) DEFAULT NULL,
  `related_type` varchar(100) DEFAULT NULL,
  `action_url` varchar(255) DEFAULT NULL,
  `priority` varchar(20) NOT NULL DEFAULT 'normal',
  `is_read` tinyint(1) NOT NULL DEFAULT 0,
  `read_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`notification_id`),
  KEY `notifications_user_id_index` (`user_id`),
  KEY `notifications_type_index` (`type`),
  KEY `notifications_module_index` (`module`),
  KEY `notifications_priority_index` (`priority`),
  KEY `notifications_is_read_index` (`is_read`),
  CONSTRAINT `notifications_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `notifications`
--

LOCK TABLES `notifications` WRITE;
/*!40000 ALTER TABLE `notifications` DISABLE KEYS */;
INSERT INTO `notifications` VALUES (1,1,'employee_account_verification','User Account Verification Required','Employee account for @storeadmin requires Administrator review and official verification.','Users','10','App\\Models\\User','/users?id=10','high',0,NULL,'2026-08-26 09:22:18','2026-08-26 09:22:18'),(2,1,'payroll_generated','Payroll Generated','August 2026 Semi-Monthly Payroll has been generated and awaits approval.','Payroll','1','App\\Models\\PayrollPeriod','/payroll','normal',0,NULL,'2026-08-26 09:22:18','2026-08-26 09:22:18'),(3,1,'system_alert','System Backup Completed','Daily automated database snapshot completed successfully (14.2 MB).','System','1','App\\Models\\BackupLog','/backups','low',1,'2026-08-26 09:22:27','2026-08-26 09:22:18','2026-08-26 09:22:27'),(4,10,'attendance_time_in','Employee Clock In (Main Branch)','John Doe (EMP-002) clocked in at Main Branch at 08:02 AM.','Attendance','1','App\\Models\\Attendance','/attendance','normal',1,'2026-08-26 09:22:27','2026-08-26 09:22:18','2026-08-26 09:22:27'),(5,10,'low_stock','Low Stock Warning','Modern Recliner Sofa is below reorder level (3 units remaining).','Inventory','1','App\\Models\\Product','/products','high',1,'2026-08-26 09:22:27','2026-08-26 09:22:18','2026-08-26 09:22:27'),(6,10,'installment_due','Overdue Installment Account','Customer installment payment for ACC-0001 is overdue by 5 days.','Installments','1','App\\Models\\InstallmentAccount','/installments','high',1,'2026-08-26 09:22:27','2026-08-26 09:22:18','2026-08-26 09:22:27'),(7,10,'payment_received','Payment Received','Payment REC-2026-0001 of ₱2,500.00 received for account ACC-0001.','Payments','1','App\\Models\\Payment','/payments','normal',1,'2026-08-26 09:22:27','2026-08-26 09:22:18','2026-08-26 09:22:27'),(8,9,'attendance_time_in','Time In Recorded','Your Time In was successfully recorded at 08:02 AM today.','Attendance','1','App\\Models\\Attendance','/attendance','normal',0,NULL,'2026-08-26 09:22:18','2026-08-26 09:22:18'),(9,9,'payroll_released','Payroll Slip Ready','Your August 2026 payroll slip has been generated and approved.','Payroll','1','App\\Models\\Payroll','/payroll','normal',0,NULL,'2026-08-26 09:22:18','2026-08-26 09:22:18'),(10,10,'employee_account_verification','Account Verified','Your Store Admin account has been verified by Administrator admin.','Account','10','App\\Models\\User','/profile','normal',1,'2026-08-26 09:22:27','2026-08-26 09:22:27','2026-08-26 09:22:27');
/*!40000 ALTER TABLE `notifications` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `password_reset_tokens`
--

DROP TABLE IF EXISTS `password_reset_tokens`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `password_reset_tokens` (
  `email` varchar(255) NOT NULL,
  `token` varchar(255) NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `password_reset_tokens`
--

LOCK TABLES `password_reset_tokens` WRITE;
/*!40000 ALTER TABLE `password_reset_tokens` DISABLE KEYS */;
/*!40000 ALTER TABLE `password_reset_tokens` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `payment_schedule`
--

DROP TABLE IF EXISTS `payment_schedule`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `payment_schedule` (
  `schedule_id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `installment_id` bigint(20) unsigned NOT NULL,
  `installment_no` int(10) unsigned NOT NULL,
  `due_date` date NOT NULL,
  `amount_due` decimal(12,2) NOT NULL,
  `amount_paid` decimal(12,2) NOT NULL DEFAULT 0.00,
  `balance_due` decimal(12,2) NOT NULL DEFAULT 0.00,
  `status` varchar(255) NOT NULL DEFAULT 'pending',
  `paid_date` date DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`schedule_id`),
  KEY `payment_schedule_installment_id_foreign` (`installment_id`),
  CONSTRAINT `payment_schedule_installment_id_foreign` FOREIGN KEY (`installment_id`) REFERENCES `installment_accounts` (`installment_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `payment_schedule`
--

LOCK TABLES `payment_schedule` WRITE;
/*!40000 ALTER TABLE `payment_schedule` DISABLE KEYS */;
/*!40000 ALTER TABLE `payment_schedule` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `payments`
--

DROP TABLE IF EXISTS `payments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `payments` (
  `payment_id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `installment_id` bigint(20) unsigned NOT NULL,
  `schedule_id` bigint(20) unsigned DEFAULT NULL,
  `receipt_no` varchar(255) NOT NULL,
  `payment_date` date NOT NULL,
  `amount` decimal(12,2) NOT NULL,
  `payment_method` varchar(255) NOT NULL,
  `reference_no` varchar(255) DEFAULT NULL,
  `received_by` bigint(20) unsigned DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`payment_id`),
  UNIQUE KEY `payments_receipt_no_unique` (`receipt_no`),
  KEY `payments_installment_id_foreign` (`installment_id`),
  KEY `payments_schedule_id_foreign` (`schedule_id`),
  KEY `payments_received_by_foreign` (`received_by`),
  CONSTRAINT `payments_installment_id_foreign` FOREIGN KEY (`installment_id`) REFERENCES `installment_accounts` (`installment_id`) ON DELETE CASCADE,
  CONSTRAINT `payments_received_by_foreign` FOREIGN KEY (`received_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `payments_schedule_id_foreign` FOREIGN KEY (`schedule_id`) REFERENCES `payment_schedule` (`schedule_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `payments`
--

LOCK TABLES `payments` WRITE;
/*!40000 ALTER TABLE `payments` DISABLE KEYS */;
/*!40000 ALTER TABLE `payments` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `payroll`
--

DROP TABLE IF EXISTS `payroll`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `payroll` (
  `payroll_id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `period_id` bigint(20) unsigned NOT NULL,
  `employee_id` bigint(20) unsigned NOT NULL,
  `basic_salary` decimal(12,2) NOT NULL DEFAULT 0.00,
  `regular_hours` decimal(8,2) NOT NULL DEFAULT 0.00,
  `overtime_hours` decimal(8,2) NOT NULL DEFAULT 0.00,
  `overtime_pay` decimal(12,2) NOT NULL DEFAULT 0.00,
  `allowance` decimal(12,2) NOT NULL DEFAULT 0.00,
  `gross_pay` decimal(12,2) NOT NULL DEFAULT 0.00,
  `total_deductions` decimal(12,2) NOT NULL DEFAULT 0.00,
  `net_pay` decimal(12,2) NOT NULL DEFAULT 0.00,
  `status` varchar(255) NOT NULL DEFAULT 'draft',
  `generated_by` bigint(20) unsigned DEFAULT NULL,
  `approved_by` bigint(20) unsigned DEFAULT NULL,
  `generated_at` timestamp NULL DEFAULT NULL,
  `approved_at` timestamp NULL DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`payroll_id`),
  KEY `payroll_period_id_foreign` (`period_id`),
  KEY `payroll_employee_id_foreign` (`employee_id`),
  KEY `payroll_generated_by_foreign` (`generated_by`),
  KEY `payroll_approved_by_foreign` (`approved_by`),
  CONSTRAINT `payroll_approved_by_foreign` FOREIGN KEY (`approved_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `payroll_employee_id_foreign` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`employee_id`) ON DELETE CASCADE,
  CONSTRAINT `payroll_generated_by_foreign` FOREIGN KEY (`generated_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `payroll_period_id_foreign` FOREIGN KEY (`period_id`) REFERENCES `payroll_periods` (`period_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `payroll`
--

LOCK TABLES `payroll` WRITE;
/*!40000 ALTER TABLE `payroll` DISABLE KEYS */;
/*!40000 ALTER TABLE `payroll` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `payroll_deductions`
--

DROP TABLE IF EXISTS `payroll_deductions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `payroll_deductions` (
  `deduction_id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `payroll_id` bigint(20) unsigned NOT NULL,
  `deduction_type` varchar(255) NOT NULL,
  `amount` decimal(12,2) NOT NULL,
  `notes` text DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`deduction_id`),
  KEY `payroll_deductions_payroll_id_foreign` (`payroll_id`),
  CONSTRAINT `payroll_deductions_payroll_id_foreign` FOREIGN KEY (`payroll_id`) REFERENCES `payroll` (`payroll_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `payroll_deductions`
--

LOCK TABLES `payroll_deductions` WRITE;
/*!40000 ALTER TABLE `payroll_deductions` DISABLE KEYS */;
/*!40000 ALTER TABLE `payroll_deductions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `payroll_periods`
--

DROP TABLE IF EXISTS `payroll_periods`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `payroll_periods` (
  `period_id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `period_name` varchar(255) NOT NULL,
  `start_date` date NOT NULL,
  `end_date` date NOT NULL,
  `pay_date` date DEFAULT NULL,
  `status` varchar(255) NOT NULL DEFAULT 'open',
  `created_by` bigint(20) unsigned DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`period_id`),
  KEY `payroll_periods_created_by_foreign` (`created_by`),
  CONSTRAINT `payroll_periods_created_by_foreign` FOREIGN KEY (`created_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `payroll_periods`
--

LOCK TABLES `payroll_periods` WRITE;
/*!40000 ALTER TABLE `payroll_periods` DISABLE KEYS */;
/*!40000 ALTER TABLE `payroll_periods` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `personal_access_tokens`
--

DROP TABLE IF EXISTS `personal_access_tokens`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `personal_access_tokens` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `tokenable_type` varchar(255) NOT NULL,
  `tokenable_id` bigint(20) unsigned NOT NULL,
  `name` text NOT NULL,
  `token` varchar(64) NOT NULL,
  `abilities` text DEFAULT NULL,
  `last_used_at` timestamp NULL DEFAULT NULL,
  `expires_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `personal_access_tokens_token_unique` (`token`),
  KEY `personal_access_tokens_tokenable_type_tokenable_id_index` (`tokenable_type`,`tokenable_id`),
  KEY `personal_access_tokens_expires_at_index` (`expires_at`)
) ENGINE=InnoDB AUTO_INCREMENT=33 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `personal_access_tokens`
--

LOCK TABLES `personal_access_tokens` WRITE;
/*!40000 ALTER TABLE `personal_access_tokens` DISABLE KEYS */;
INSERT INTO `personal_access_tokens` VALUES (5,'App\\Models\\User',4,'auth_token','9101dcee0324027665307714994db0ec37b423aa0ec5ab69f7b600cc03ceba66','[\"*\"]','2026-08-26 06:19:21',NULL,'2026-08-26 06:18:36','2026-08-26 06:19:21'),(23,'App\\Models\\User',5,'auth_token','5ea4f73a46ee2e057f08e2776b6a1c048f70745927b474b9fb537eb5b0eb9e0b','[\"*\"]','2026-08-26 08:58:16',NULL,'2026-08-26 08:35:51','2026-08-26 08:58:16'),(26,'App\\Models\\User',1,'auth_token','bf1a2714350764e7e3b5f8b0eb3e7dd55049a655641a9be9a495ae2b8997fa22','[\"*\"]',NULL,NULL,'2026-08-26 08:39:37','2026-08-26 08:39:37'),(27,'App\\Models\\User',1,'auth_token','62e4b57d892a87253acd782d4c2c8829edc57701da138eeb9c14179213300142','[\"*\"]',NULL,NULL,'2026-08-26 08:41:38','2026-08-26 08:41:38'),(28,'App\\Models\\User',6,'auth_token','0d683b78a0dd6a7ed358b02023fc5eaab5c40f048edf51379b96d10cf3764892','[\"*\"]',NULL,NULL,'2026-08-26 08:41:38','2026-08-26 08:41:38'),(29,'App\\Models\\User',5,'auth_token','fc1b9363e6c366c408b73965262e37868c071dfcfcda74f50a7ac17d05ec661f','[\"*\"]',NULL,NULL,'2026-08-26 08:41:39','2026-08-26 08:41:39'),(30,'App\\Models\\User',9,'auth_token','cde6f38a4b946842311e43d22dc07eaae0023370fae96e90fa925887c7fa15fe','[\"*\"]','2026-08-26 09:23:04',NULL,'2026-08-26 09:02:24','2026-08-26 09:23:04'),(31,'App\\Models\\User',1,'auth_token','3245950b6a8d44fa26a896d156ef44be1c1ad47042084cbe6dc6caac578a3393','[\"*\"]','2026-08-26 09:23:03',NULL,'2026-08-26 09:02:59','2026-08-26 09:23:03'),(32,'App\\Models\\User',10,'auth_token','1dd0ecb342fc41b5a3bcc6f3ede7eb249f03b93979ab714d0eb272d849c5f40a','[\"*\"]','2026-08-26 09:23:28',NULL,'2026-08-26 09:05:41','2026-08-26 09:23:28');
/*!40000 ALTER TABLE `personal_access_tokens` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `products`
--

DROP TABLE IF EXISTS `products`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `products` (
  `product_id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `product_code` varchar(255) NOT NULL,
  `product_name` varchar(255) NOT NULL,
  `category` varchar(255) DEFAULT NULL,
  `brand` varchar(255) DEFAULT NULL,
  `description` text DEFAULT NULL,
  `unit_price` decimal(12,2) NOT NULL DEFAULT 0.00,
  `cost_price` decimal(12,2) NOT NULL DEFAULT 0.00,
  `stock_quantity` int(11) NOT NULL DEFAULT 0,
  `reorder_level` int(11) NOT NULL DEFAULT 0,
  `unit` varchar(255) DEFAULT NULL,
  `status` varchar(255) NOT NULL DEFAULT 'active',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`product_id`),
  UNIQUE KEY `products_product_code_unique` (`product_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `products`
--

LOCK TABLES `products` WRITE;
/*!40000 ALTER TABLE `products` DISABLE KEYS */;
/*!40000 ALTER TABLE `products` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sale_items`
--

DROP TABLE IF EXISTS `sale_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `sale_items` (
  `sale_item_id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `sale_id` bigint(20) unsigned NOT NULL,
  `product_id` bigint(20) unsigned NOT NULL,
  `quantity` decimal(12,3) NOT NULL,
  `unit_price` decimal(12,2) NOT NULL,
  `discount_amount` decimal(12,2) NOT NULL DEFAULT 0.00,
  `line_total` decimal(12,2) NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`sale_item_id`),
  KEY `sale_items_sale_id_foreign` (`sale_id`),
  KEY `sale_items_product_id_foreign` (`product_id`),
  CONSTRAINT `sale_items_product_id_foreign` FOREIGN KEY (`product_id`) REFERENCES `products` (`product_id`) ON DELETE CASCADE,
  CONSTRAINT `sale_items_sale_id_foreign` FOREIGN KEY (`sale_id`) REFERENCES `sale_transactions` (`sale_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sale_items`
--

LOCK TABLES `sale_items` WRITE;
/*!40000 ALTER TABLE `sale_items` DISABLE KEYS */;
/*!40000 ALTER TABLE `sale_items` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sale_transactions`
--

DROP TABLE IF EXISTS `sale_transactions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `sale_transactions` (
  `sale_id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `invoice_no` varchar(255) NOT NULL,
  `customer_id` bigint(20) unsigned DEFAULT NULL,
  `processed_by` bigint(20) unsigned DEFAULT NULL,
  `sale_date` datetime NOT NULL,
  `payment_method` varchar(255) NOT NULL,
  `subtotal` decimal(12,2) NOT NULL DEFAULT 0.00,
  `discount_amount` decimal(12,2) NOT NULL DEFAULT 0.00,
  `total_amount` decimal(12,2) NOT NULL DEFAULT 0.00,
  `amount_paid` decimal(12,2) NOT NULL DEFAULT 0.00,
  `balance_due` decimal(12,2) NOT NULL DEFAULT 0.00,
  `status` varchar(255) NOT NULL DEFAULT 'completed',
  `notes` text DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`sale_id`),
  UNIQUE KEY `sale_transactions_invoice_no_unique` (`invoice_no`),
  KEY `sale_transactions_customer_id_foreign` (`customer_id`),
  KEY `sale_transactions_processed_by_foreign` (`processed_by`),
  CONSTRAINT `sale_transactions_customer_id_foreign` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`customer_id`) ON DELETE SET NULL,
  CONSTRAINT `sale_transactions_processed_by_foreign` FOREIGN KEY (`processed_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sale_transactions`
--

LOCK TABLES `sale_transactions` WRITE;
/*!40000 ALTER TABLE `sale_transactions` DISABLE KEYS */;
/*!40000 ALTER TABLE `sale_transactions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sessions`
--

DROP TABLE IF EXISTS `sessions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `sessions` (
  `id` varchar(255) NOT NULL,
  `user_id` bigint(20) unsigned DEFAULT NULL,
  `ip_address` varchar(45) DEFAULT NULL,
  `user_agent` text DEFAULT NULL,
  `payload` longtext NOT NULL,
  `last_activity` int(11) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `sessions_user_id_index` (`user_id`),
  KEY `sessions_last_activity_index` (`last_activity`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sessions`
--

LOCK TABLES `sessions` WRITE;
/*!40000 ALTER TABLE `sessions` DISABLE KEYS */;
/*!40000 ALTER TABLE `sessions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `system_logs`
--

DROP TABLE IF EXISTS `system_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `system_logs` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint(20) unsigned DEFAULT NULL,
  `action` varchar(255) DEFAULT NULL,
  `module` varchar(255) DEFAULT NULL,
  `description` text DEFAULT NULL,
  `ip_address` varchar(45) DEFAULT NULL,
  `user_agent` text DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `system_logs_user_id_foreign` (`user_id`),
  CONSTRAINT `system_logs_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=77 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `system_logs`
--

LOCK TABLES `system_logs` WRITE;
/*!40000 ALTER TABLE `system_logs` DISABLE KEYS */;
INSERT INTO `system_logs` VALUES (1,1,'LOGIN','Auth','Administrator (admin) logged in successfully','127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36','2026-08-26 06:33:16','2026-08-26 06:33:16'),(2,1,'LOGOUT','Auth','User admin logged out','127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36','2026-08-26 06:34:12','2026-08-26 06:34:12'),(6,1,'UPDATE','Employees','Disabled QR attendance access for System Administrator (SYS-001)','127.0.0.1','Symfony','2026-08-26 06:54:28','2026-08-26 06:54:28'),(7,1,'UPDATE','Employees','Generated permanent unique QR code for System Administrator (SYS-001)','127.0.0.1','Symfony','2026-08-26 06:54:48','2026-08-26 06:54:48'),(8,1,'UPDATE','Employees','Disabled QR attendance access for System Administrator (SYS-001)','127.0.0.1','Symfony','2026-08-26 06:54:48','2026-08-26 06:54:48'),(9,1,'UPDATE','Employees','Enabled QR attendance access for System Administrator (SYS-001)','127.0.0.1','Symfony','2026-08-26 06:54:48','2026-08-26 06:54:48'),(10,1,'CREATE','Attendance','TIME IN recorded via QR + PIN for System Administrator (SYS-001) at 06:54 PM','127.0.0.1','Test Terminal','2026-08-26 06:54:48','2026-08-26 06:54:48'),(12,1,'LOGIN','Auth','Administrator (admin) logged in successfully','127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36','2026-08-26 06:56:31','2026-08-26 06:56:31'),(13,1,'LOGOUT','Auth','User admin logged out','127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36','2026-08-26 06:57:42','2026-08-26 06:57:42'),(18,1,'LOGIN','Auth','Administrator (admin) logged in successfully','127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36','2026-08-26 07:04:34','2026-08-26 07:04:34'),(19,1,'LOGOUT','Auth','User admin logged out','127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36','2026-08-26 07:05:13','2026-08-26 07:05:13'),(22,1,'LOGIN','Auth','Administrator (admin) logged in successfully','127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36','2026-08-26 07:07:34','2026-08-26 07:07:34'),(23,1,'LOGOUT','Auth','User admin logged out','127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36','2026-08-26 07:08:55','2026-08-26 07:08:55'),(26,1,'LOGIN','Auth','Administrator (admin) logged in successfully','127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36','2026-08-26 07:11:12','2026-08-26 07:11:12'),(27,1,'LOGOUT','Auth','User admin logged out','127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36','2026-08-26 07:12:10','2026-08-26 07:12:10'),(31,1,'UPDATE','Employees','Employee System Administrator (SYS-001) updated contact profile details','127.0.0.1','Symfony','2026-08-26 07:32:12','2026-08-26 07:32:12'),(32,1,'UPDATE','Employees','Employee System Administrator (SYS-001) confirmed profile information is verified and accurate','127.0.0.1','Symfony','2026-08-26 07:32:12','2026-08-26 07:32:12'),(33,1,'UPDATE','Employees','Administrator admin verified employee account for System Administrator (SYS-001)','127.0.0.1','Symfony','2026-08-26 07:38:00','2026-08-26 07:38:00'),(34,1,'UPDATE','Employees','Administrator admin revoked verification for employee System Administrator (SYS-001)','127.0.0.1','Symfony','2026-08-26 07:38:00','2026-08-26 07:38:00'),(35,1,'UPDATE','Employees','Employee System Administrator (SYS-001) updated contact profile details','127.0.0.1','Symfony','2026-08-26 07:44:21','2026-08-26 07:44:21'),(36,1,'UPDATE','Employees','Employee System Administrator (SYS-001) updated contact profile details','127.0.0.1','Symfony','2026-08-26 07:44:21','2026-08-26 07:44:21'),(37,1,'UPDATE','Employees','Employee System Administrator (SYS-001) updated contact profile details','127.0.0.1','Symfony','2026-08-26 07:44:21','2026-08-26 07:44:21'),(38,1,'UPDATE','Employees','Employee System Administrator (SYS-001) updated contact profile details','127.0.0.1','Symfony','2026-08-26 07:50:10','2026-08-26 07:50:10'),(39,1,'UPDATE','Employees','Employee System Administrator (SYS-001) updated contact profile details','127.0.0.1','Symfony','2026-08-26 07:50:10','2026-08-26 07:50:10'),(41,1,'LOGIN','Auth','Administrator (admin) logged in successfully','127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36','2026-08-26 08:10:29','2026-08-26 08:10:29'),(42,1,'LOGOUT','Auth','User admin logged out','127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36','2026-08-26 08:23:08','2026-08-26 08:23:08'),(43,1,'LOGIN','Auth','Administrator (admin) logged in successfully','127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36','2026-08-26 08:26:16','2026-08-26 08:26:16'),(44,1,'DELETE','System','Deleted user account: clavite@gmail.com','127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36','2026-08-26 08:28:10','2026-08-26 08:28:10'),(45,1,'DELETE','System','Deleted user account: carlo@gmail.com','127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36','2026-08-26 08:28:14','2026-08-26 08:28:14'),(46,1,'DELETE','System','Deleted user account: storeadmin','127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36','2026-08-26 08:28:19','2026-08-26 08:28:19'),(47,1,'UPDATE','Employees','Administrator admin verified employee account for System Administrator (SYS-001)','127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36','2026-08-26 08:29:03','2026-08-26 08:29:03'),(48,1,'LOGOUT','Auth','User admin logged out','127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36','2026-08-26 08:29:18','2026-08-26 08:29:18'),(51,1,'LOGIN','Auth','Administrator (admin) logged in successfully','127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36','2026-08-26 08:31:23','2026-08-26 08:31:23'),(52,1,'LOGOUT','Auth','User admin logged out','127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36','2026-08-26 08:35:35','2026-08-26 08:35:35'),(55,1,'LOGIN','Auth','Administrator (admin) logged in successfully','127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36','2026-08-26 08:37:33','2026-08-26 08:37:33'),(56,1,'LOGOUT','Auth','User admin logged out','127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36','2026-08-26 08:37:56','2026-08-26 08:37:56'),(57,1,'LOGIN','Auth','Administrator (admin) logged in successfully','127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36','2026-08-26 08:38:11','2026-08-26 08:38:11'),(58,1,'LOGIN','Auth','Administrator (admin) logged in successfully','127.0.0.1','Symfony','2026-08-26 08:39:37','2026-08-26 08:39:37'),(59,1,'LOGIN','Auth','Administrator (admin) logged in successfully','127.0.0.1','Symfony','2026-08-26 08:41:38','2026-08-26 08:41:38'),(63,1,'VERIFY_ACCOUNT','Users','Administrator admin verified account for clavite@gmail.com (Store Administrator) - Employee: talom (EMP-002)','127.0.0.1','Symfony','2026-08-26 08:55:57','2026-08-26 08:55:57'),(64,1,'REVOKE_VERIFICATION','Users','Administrator admin revoked account verification for clavite@gmail.com (Store Administrator)','127.0.0.1','Symfony','2026-08-26 08:55:57','2026-08-26 08:55:57'),(65,1,'VERIFY_ACCOUNT','Users','Administrator admin verified account for clavite@gmail.com (Store Administrator) - Employee: talom (EMP-002)','127.0.0.1','Symfony','2026-08-26 08:55:57','2026-08-26 08:55:57'),(66,1,'REVOKE_VERIFICATION','Users','Administrator admin revoked account verification for clavite@gmail.com (Store Administrator)','127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36','2026-08-26 08:57:07','2026-08-26 08:57:07'),(67,1,'VERIFY_ACCOUNT','Users','Administrator admin verified account for clavite@gmail.com (Store Administrator) - Employee: talom (EMP-002)','127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36','2026-08-26 08:57:37','2026-08-26 08:57:37'),(68,1,'DELETE','System','Deleted user account: storeadmin','127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36','2026-08-26 08:58:55','2026-08-26 08:58:55'),(69,1,'DELETE','System','Deleted user account: clavite@gmail.com','127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36','2026-08-26 08:59:02','2026-08-26 08:59:02'),(70,1,'LOGOUT','Auth','User admin logged out','127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36','2026-08-26 09:01:21','2026-08-26 09:01:21'),(71,9,'LOGIN','Auth','Employee (clavite@gmail.com) logged in successfully','127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36','2026-08-26 09:02:24','2026-08-26 09:02:24'),(72,1,'LOGIN','Auth','Administrator (admin) logged in successfully','127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36','2026-08-26 09:02:59','2026-08-26 09:02:59'),(73,1,'VERIFY_ACCOUNT','Users','Administrator admin verified account for clavite@gmail.com (Employee) - Employee: talom (EMP-002)','127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36','2026-08-26 09:03:37','2026-08-26 09:03:37'),(74,10,'LOGIN','Auth','Store Admin (talom@gmail.com) logged in successfully','127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36','2026-08-26 09:05:41','2026-08-26 09:05:41'),(75,1,'VERIFY_ACCOUNT','Users','Administrator admin verified account for talom@gmail.com (Store Admin) - Employee: roli (EMP-003)','127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36','2026-08-26 09:06:58','2026-08-26 09:06:58'),(76,1,'VERIFY_ACCOUNT','Users','Administrator admin verified account for talom@gmail.com (Store Admin) - Employee: roli (EMP-003)','127.0.0.1','Symfony','2026-08-26 09:22:27','2026-08-26 09:22:27');
/*!40000 ALTER TABLE `system_logs` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `users` (
  `user_id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `employee_id` bigint(20) unsigned DEFAULT NULL,
  `username` varchar(255) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `role` varchar(255) NOT NULL DEFAULT 'staff',
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `account_verified` tinyint(1) NOT NULL DEFAULT 0,
  `account_verified_at` timestamp NULL DEFAULT NULL,
  `account_verified_by` bigint(20) unsigned DEFAULT NULL,
  `last_login` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `users_username_unique` (`username`),
  KEY `users_employee_id_foreign` (`employee_id`),
  CONSTRAINT `users_employee_id_foreign` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`employee_id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES (1,1,'admin','$2y$12$y5CXANCqojEcTECn.uBQkuXh2nu.3PO0N9.o7OTEh4u0djo4HE6K6','Administrator',1,1,'2026-08-26 08:52:32',1,'2026-08-26 09:02:59','2026-08-26 06:22:46','2026-08-26 09:02:59'),(9,6,'clavite@gmail.com','$2y$12$X8OSVwuLLnSsXkkviCbl6e01w8YOwjZr5MASkV4LQolJNyml3kSZ6','Employee',1,1,'2026-08-26 09:03:37',1,'2026-08-26 09:02:24','2026-08-26 09:02:04','2026-08-26 09:03:37'),(10,7,'talom@gmail.com','$2y$12$EOsNa0DSgmQkUuHqpIE8Lu1/rqkar0WBf.V.PnQT.fZcM4Su0hAnq','Store Admin',1,1,'2026-08-26 09:22:27',1,'2026-08-26 09:05:41','2026-08-26 09:05:19','2026-08-26 09:22:27');
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Dumping events for database 'project_pace'
--

--
-- Dumping routines for database 'project_pace'
--
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-08-25  9:23:34


COMMIT;
