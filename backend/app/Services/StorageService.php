<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Cache;
use App\Models\SystemLog;

class StorageService
{
    /**
     * Get a comprehensive real-time audit of system storage across disk, database, and files.
     */
    public static function getStorageOverview(bool $forceRefresh = false): array
    {
        if ($forceRefresh) {
            Cache::forget('pace_storage_overview');
        }

        return Cache::remember('pace_storage_overview', 15, function () {
            return self::computeStorageOverview();
        });
    }

    private static function computeStorageOverview(): array
    {
        $disk = self::getDiskSpace();
        $db = self::getDatabaseStorage();
        $uploads = self::getUploadsStorage();
        $backups = self::getBackupsStorage();
        $logs = self::getLogsStorage();
        $cache = self::getCacheStorage();

        $appTotalBytes = $db['size_bytes'] + $uploads['size_bytes'] + $backups['size_bytes'] + $logs['file_size_bytes'] + $cache['size_bytes'];

        // Determine Health Status
        $health = 'optimal';
        $healthWarnings = [];

        if ($disk['percentage'] >= 90) {
            $health = 'critical';
            $healthWarnings[] = "Host disk is critically full ({$disk['percentage']}% used). Free up space immediately.";
        } elseif ($disk['percentage'] >= 80) {
            $health = 'warning';
            $healthWarnings[] = "Host disk is nearing capacity ({$disk['percentage']}% used).";
        }

        if ($logs['file_size_bytes'] > 100 * 1024 * 1024) { // > 100 MB logs
            if ($health === 'optimal') $health = 'warning';
            $healthWarnings[] = "Application log file is unusually large ({$logs['file_size_formatted']}). Consider purging.";
        }

        if ($backups['size_bytes'] > 500 * 1024 * 1024) { // > 500 MB backups
            if ($health === 'optimal') $health = 'warning';
            $healthWarnings[] = "Database backups are consuming significant space ({$backups['size_formatted']}).";
        }

        return [
            'disk' => $disk,
            'breakdown' => [
                'database' => $db,
                'uploads' => $uploads,
                'backups' => $backups,
                'logs' => $logs,
                'cache' => $cache,
                'app_total' => [
                    'size_bytes' => $appTotalBytes,
                    'size_formatted' => self::formatBytes($appTotalBytes),
                ],
            ],
            'health' => [
                'status' => $health,
                'warnings' => $healthWarnings,
                'recommendation' => empty($healthWarnings) 
                    ? 'Storage health is optimal. No action required.' 
                    : implode(' ', $healthWarnings),
            ],
            'server_environment' => [
                'php_version' => PHP_VERSION,
                'os' => PHP_OS_FAMILY . ' (' . php_uname('s') . ' ' . php_uname('r') . ')',
                'server_software' => $_SERVER['SERVER_SOFTWARE'] ?? 'PHP CLI / Built-in Server',
                'base_path' => base_path(),
                'timestamp' => now()->toIso8601String(),
            ]
        ];
    }

    /**
     * Inspect host physical disk storage partition hosting the application.
     */
    public static function getDiskSpace(): array
    {
        $path = base_path();
        $total = @disk_total_space($path);
        $free = @disk_free_space($path);

        if ($total === false || $total <= 0) {
            // Fallback to checking root drive if specific path is inaccessible
            $root = substr($path, 0, 3);
            $total = @disk_total_space($root) ?: 0;
            $free = @disk_free_space($root) ?: 0;
        }

        $used = max(0, $total - $free);
        $percentage = $total > 0 ? round(($used / $total) * 100, 1) : 0;

        return [
            'total' => (float)$total,
            'used' => (float)$used,
            'free' => (float)$free,
            'total_bytes' => (float)$total,
            'used_bytes' => (float)$used,
            'free_bytes' => (float)$free,
            'percentage' => $percentage,
            'total_formatted' => self::formatBytes($total),
            'used_formatted' => self::formatBytes($used),
            'free_formatted' => self::formatBytes($free),
        ];
    }

    /**
     * Inspect live MySQL database storage and table details from information_schema.
     */
    public static function getDatabaseStorage(): array
    {
        $dbName = DB::connection()->getDatabaseName();

        $tables = DB::select("
            SELECT 
                table_name AS name,
                ROUND((data_length + index_length), 0) AS size_bytes,
                ROUND(data_length, 0) AS data_bytes,
                ROUND(index_length, 0) AS index_bytes,
                table_rows AS rows_count,
                engine,
                update_time
            FROM information_schema.tables 
            WHERE table_schema = ?
            ORDER BY (data_length + index_length) DESC
        ", [$dbName]);

        $totalBytes = 0;
        $tableList = [];

        foreach ($tables as $t) {
            $tArr = (array)$t;
            $name = $tArr['name'] ?? $tArr['NAME'] ?? $tArr['table_name'] ?? $tArr['TABLE_NAME'] ?? 'unknown';
            $bytes = (float)($tArr['size_bytes'] ?? $tArr['SIZE_BYTES'] ?? 0);
            $dataBytes = (float)($tArr['data_bytes'] ?? $tArr['DATA_BYTES'] ?? 0);
            $indexBytes = (float)($tArr['index_bytes'] ?? $tArr['INDEX_BYTES'] ?? 0);
            $rows = (int)($tArr['rows_count'] ?? $tArr['ROWS_COUNT'] ?? $tArr['table_rows'] ?? $tArr['TABLE_ROWS'] ?? 0);
            $engine = $tArr['engine'] ?? $tArr['ENGINE'] ?? 'InnoDB';
            $updatedAt = $tArr['update_time'] ?? $tArr['UPDATE_TIME'] ?? null;

            $totalBytes += $bytes;

            $tableList[] = [
                'name' => $name,
                'size_bytes' => $bytes,
                'size_formatted' => self::formatBytes($bytes),
                'data_formatted' => self::formatBytes($dataBytes),
                'index_formatted' => self::formatBytes($indexBytes),
                'rows' => $rows,
                'engine' => $engine,
                'updated_at' => $updatedAt,
            ];
        }

        return [
            'database_name' => $dbName,
            'size_bytes' => $totalBytes,
            'size_formatted' => self::formatBytes($totalBytes),
            'table_count' => count($tables),
            'tables' => $tableList,
        ];
    }

    /**
     * Inspect live uploads and media folder storage.
     */
    public static function getUploadsStorage(): array
    {
        $publicStorage = storage_path('app/public');
        $stats = self::scanDirectory($publicStorage);

        // Scan subcategories
        $subfolders = ['proofs', 'products', 'carousel', 'profile_photos', 'qrcodes', 'branches'];
        $categories = [];

        foreach ($subfolders as $folder) {
            $folderPath = $publicStorage . DIRECTORY_SEPARATOR . $folder;
            if (File::isDirectory($folderPath)) {
                $fStats = self::scanDirectory($folderPath);
                $categories[$folder] = [
                    'size_bytes' => $fStats['bytes'],
                    'size_formatted' => self::formatBytes($fStats['bytes']),
                    'files_count' => $fStats['count'],
                ];
            } else {
                $categories[$folder] = [
                    'size_bytes' => 0,
                    'size_formatted' => '0 B',
                    'files_count' => 0,
                ];
            }
        }

        return [
            'path' => 'storage/app/public',
            'size_bytes' => $stats['bytes'],
            'size_formatted' => self::formatBytes($stats['bytes']),
            'files_count' => $stats['count'],
            'file_count' => $stats['count'],
            'categories' => $categories,
        ];
    }

    /**
     * Inspect database backup storage directory.
     */
    public static function getBackupsStorage(): array
    {
        $backupPath = storage_path('app/backups');
        $stats = self::scanDirectory($backupPath);

        // List individual backup files
        $backupFiles = [];
        if (File::isDirectory($backupPath)) {
            $files = File::files($backupPath);
            foreach ($files as $file) {
                $size = $file->getSize();
                $backupFiles[] = [
                    'filename' => $file->getFilename(),
                    'size_bytes' => $size,
                    'size_formatted' => self::formatBytes($size),
                    'created_at' => date('Y-m-d H:i:s', $file->getMTime()),
                ];
            }
            // Sort by latest created
            usort($backupFiles, fn($a, $b) => strcmp($b['created_at'], $a['created_at']));
        }

        return [
            'path' => 'storage/app/backups',
            'size_bytes' => $stats['bytes'],
            'size_formatted' => self::formatBytes($stats['bytes']),
            'files_count' => $stats['count'],
            'file_count' => $stats['count'],
            'files' => $backupFiles,
        ];
    }

    /**
     * Inspect application logs directory and system_logs table.
     */
    public static function getLogsStorage(): array
    {
        $logsPath = storage_path('logs');
        $stats = self::scanDirectory($logsPath);

        $dbLogCount = SystemLog::count();
        $dbLogBytes = 0;

        $dbName = DB::connection()->getDatabaseName();
        $tableInfo = DB::select("
            SELECT (data_length + index_length) AS size_bytes 
            FROM information_schema.tables 
            WHERE table_schema = ? AND table_name = 'system_logs'
        ", [$dbName]);

        if (!empty($tableInfo)) {
            $tArr = (array)$tableInfo[0];
            $dbLogBytes = (float)($tArr['size_bytes'] ?? $tArr['SIZE_BYTES'] ?? 0);
        }

        return [
            'path' => 'storage/logs',
            'file_size_bytes' => $stats['bytes'],
            'file_size_formatted' => self::formatBytes($stats['bytes']),
            'file_count' => $stats['count'],
            'files_count' => $stats['count'],
            'db_logs_count' => $dbLogCount,
            'db_logs_size_bytes' => $dbLogBytes,
            'db_logs_size_formatted' => self::formatBytes($dbLogBytes),
        ];
    }

    /**
     * Inspect framework cache and compiled views storage.
     */
    public static function getCacheStorage(): array
    {
        $cachePath = storage_path('framework/cache');
        $viewsPath = storage_path('framework/views');
        $sessionsPath = storage_path('framework/sessions');

        $cacheStats = self::scanDirectory($cachePath);
        $viewsStats = self::scanDirectory($viewsPath);
        $sessionsStats = self::scanDirectory($sessionsPath);

        $totalBytes = $cacheStats['bytes'] + $viewsStats['bytes'] + $sessionsStats['bytes'];
        $totalFiles = $cacheStats['count'] + $viewsStats['count'] + $sessionsStats['count'];

        return [
            'path' => 'storage/framework',
            'size_bytes' => $totalBytes,
            'size_formatted' => self::formatBytes($totalBytes),
            'total_size_bytes' => $totalBytes,
            'total_size_formatted' => self::formatBytes($totalBytes),
            'files_count' => $totalFiles,
            'file_count' => $totalFiles,
            'details' => [
                'cache' => [
                    'size_bytes' => $cacheStats['bytes'],
                    'size_formatted' => self::formatBytes($cacheStats['bytes']),
                    'files_count' => $cacheStats['count'],
                ],
                'views' => [
                    'size_bytes' => $viewsStats['bytes'],
                    'size_formatted' => self::formatBytes($viewsStats['bytes']),
                    'files_count' => $viewsStats['count'],
                ],
                'sessions' => [
                    'size_bytes' => $sessionsStats['bytes'],
                    'size_formatted' => self::formatBytes($sessionsStats['bytes']),
                    'files_count' => $sessionsStats['count'],
                ],
            ]
        ];
    }

    /**
     * Recursively scan a folder for total file size and count.
     */
    public static function scanDirectory(string $path): array
    {
        if (!File::isDirectory($path)) {
            return ['bytes' => 0, 'count' => 0];
        }

        $totalBytes = 0;
        $fileCount = 0;

        try {
            $iterator = new \RecursiveIteratorIterator(
                new \RecursiveDirectoryIterator($path, \FilesystemIterator::SKIP_DOTS),
                \RecursiveIteratorIterator::SELF_FIRST
            );

            foreach ($iterator as $item) {
                if ($item->isFile()) {
                    $totalBytes += $item->getSize();
                    $fileCount++;
                }
            }
        } catch (\Throwable $e) {
            // Silently handle read permissions on temporary lockfiles
        }

        return [
            'bytes' => $totalBytes,
            'count' => $fileCount,
        ];
    }

    /**
     * Perform safe maintenance: Clear application cache and compiled views.
     */
    public static function clearApplicationCache(): array
    {
        $before = self::getCacheStorage();

        try {
            Artisan::call('cache:clear');
            Artisan::call('view:clear');
        } catch (\Throwable $e) {}

        // Clean directory manually if needed
        $cacheDataPath = storage_path('framework/cache/data');
        if (File::isDirectory($cacheDataPath)) {
            File::cleanDirectory($cacheDataPath);
        }

        $viewsPath = storage_path('framework/views');
        if (File::isDirectory($viewsPath)) {
            foreach (File::files($viewsPath) as $file) {
                if ($file->getFilename() !== '.gitignore') {
                    @File::delete($file->getPathname());
                }
            }
        }

        $after = self::getCacheStorage();
        $reclaimed = max(0, $before['size_bytes'] - $after['size_bytes']);
        Cache::forget('pace_storage_overview');

        return [
            'success' => true,
            'message' => 'Application cache and compiled view files cleared successfully.',
            'reclaimed_bytes' => $reclaimed,
            'reclaimed_formatted' => self::formatBytes($reclaimed),
        ];
    }

    /**
     * Perform safe maintenance: Purge old log files and truncate active laravel.log.
     */
    public static function purgeLogs(): array
    {
        $logsPath = storage_path('logs');
        $before = self::scanDirectory($logsPath);

        if (File::isDirectory($logsPath)) {
            $files = File::files($logsPath);
            foreach ($files as $file) {
                if ($file->getFilename() === 'laravel.log') {
                    // Truncate file rather than delete to preserve open file descriptors
                    @file_put_contents($file->getPathname(), '');
                } elseif (str_ends_with($file->getFilename(), '.log')) {
                    @File::delete($file->getPathname());
                }
            }
        }

        $after = self::scanDirectory($logsPath);
        $reclaimed = max(0, $before['bytes'] - $after['bytes']);
        Cache::forget('pace_storage_overview');

        return [
            'success' => true,
            'message' => 'Log files purged successfully. Active log file truncated.',
            'reclaimed_bytes' => $reclaimed,
            'reclaimed_formatted' => self::formatBytes($reclaimed),
        ];
    }

    /**
     * Perform safe maintenance: Clean expired temporary session files.
     */
    public static function cleanTempFiles(): array
    {
        $sessionsPath = storage_path('framework/sessions');
        $before = self::scanDirectory($sessionsPath);

        $expiredCount = 0;
        $now = time();
        $maxAge = 86400 * 7; // Delete sessions older than 7 days

        if (File::isDirectory($sessionsPath)) {
            foreach (File::files($sessionsPath) as $file) {
                if ($file->getFilename() === '.gitignore') continue;
                if (($now - $file->getMTime()) > $maxAge) {
                    @File::delete($file->getPathname());
                    $expiredCount++;
                }
            }
        }

        $after = self::scanDirectory($sessionsPath);
        $reclaimed = max(0, $before['bytes'] - $after['bytes']);
        Cache::forget('pace_storage_overview');

        return [
            'success' => true,
            'message' => "Cleaned {$expiredCount} expired session/temp files.",
            'reclaimed_bytes' => $reclaimed,
            'reclaimed_formatted' => self::formatBytes($reclaimed),
        ];
    }

    /**
     * Human-readable byte formatting utility.
     */
    public static function formatBytes(float $bytes, int $precision = 2): string
    {
        if ($bytes <= 0) return '0 B';

        $units = ['B', 'KB', 'MB', 'GB', 'TB'];
        $power = floor(log($bytes, 1024));
        $power = min($power, count($units) - 1);

        $value = $bytes / pow(1024, $power);
        return round($value, $precision) . ' ' . $units[$power];
    }
}
