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

        $freeGB = $disk['free_bytes'] / (1024 * 1024 * 1024);
        if ($freeGB < 5 || $disk['percentage'] >= 95) {
            $health = 'critical';
            $healthWarnings[] = "Host disk partition ({$disk['partition_name']}) is critically low on space ({$disk['free_formatted']} remaining, {$disk['percentage']}% used). Free up space immediately.";
        } elseif ($freeGB < 15 || $disk['percentage'] >= 90) {
            $health = 'warning';
            $healthWarnings[] = "Host disk partition ({$disk['partition_name']}) is nearing capacity ({$disk['free_formatted']} remaining, {$disk['percentage']}% used).";
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
                    ? "Server storage health is optimal. Host partition {$disk['partition_name']} has {$disk['free_formatted']} free space available." 
                    : implode(' ', $healthWarnings),
            ],
            'server_environment' => [
                'php_version' => PHP_VERSION,
                'os' => PHP_OS_FAMILY . ' (' . php_uname('s') . ' ' . php_uname('r') . ')',
                'server_software' => $_SERVER['SERVER_SOFTWARE'] ?? 'PHP CLI / Built-in Server',
                'base_path' => base_path(),
                'partition' => $disk['partition_name'] ?? 'System Disk',
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
        $driveLetter = strtoupper(substr($path, 0, 2));
        $rootPath = $driveLetter ? ($driveLetter . DIRECTORY_SEPARATOR) : $path;

        $total = @disk_total_space($rootPath);
        $free = @disk_free_space($rootPath);

        if ($total === false || $total <= 0) {
            $total = @disk_total_space($path) ?: 0;
            $free = @disk_free_space($path) ?: 0;
        }

        $used = max(0, $total - $free);
        $percentage = $total > 0 ? round(($used / $total) * 100, 1) : 0;
        $freePercentage = $total > 0 ? round(($free / $total) * 100, 1) : 0;

        $label = 'Local Disk';
        if (PHP_OS_FAMILY === 'Windows' && $driveLetter) {
            try {
                $output = @shell_exec('vol ' . $driveLetter);
                if ($output && preg_match('/Volume in drive [A-Z] is (.+)/i', $output, $m)) {
                    $trimmed = trim($m[1]);
                    if (!empty($trimmed)) {
                        $label = $trimmed;
                    }
                }
            } catch (\Throwable $e) {}
        }

        $partitionName = $driveLetter ? "{$label} ({$driveLetter})" : ($label ?: 'Server Partition');

        return [
            'drive' => $driveLetter ?: 'Root',
            'label' => $label,
            'partition_name' => $partitionName,
            'total' => (float)$total,
            'used' => (float)$used,
            'free' => (float)$free,
            'total_bytes' => (float)$total,
            'used_bytes' => (float)$used,
            'free_bytes' => (float)$free,
            'percentage' => $percentage,
            'free_percentage' => $freePercentage,
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
     * Inspect live uploads and media folder storage, scanning all real files dynamically.
     */
    public static function getUploadsStorage(): array
    {
        $publicStorage = storage_path('app/public');
        
        $knownMeta = [
            'products' => [
                'label' => 'Products Catalog',
                'description' => 'E-commerce item showcase photos',
                'color' => 'emerald',
            ],
            'payments' => [
                'label' => 'Payment Proofs & Receipts',
                'description' => 'Customer deposit slips & GCash/bank transaction proofs',
                'color' => 'blue',
            ],
            'proofs' => [
                'label' => 'Installment Application Requirements',
                'description' => 'Customer valid IDs, proof of billing, and proof of income',
                'color' => 'purple',
            ],
            'branches' => [
                'label' => 'Branch Storefronts',
                'description' => 'Branch showroom, store facade, and location photos',
                'color' => 'indigo',
            ],
            'profiles' => [
                'label' => 'Staff & User Profiles',
                'description' => 'Customer and employee profile avatars',
                'color' => 'amber',
            ],
            'face_biometrics' => [
                'label' => 'Face Biometrics Data',
                'description' => 'Biometric facial training images for attendance scanner',
                'color' => 'cyan',
            ],
            'company' => [
                'label' => 'Company Branding & Logos',
                'description' => 'Official Z-LICZ logos, brand assets, and stamps',
                'color' => 'rose',
            ],
            'carousel' => [
                'label' => 'Carousel Banners',
                'description' => 'Homepage promotional banner slides',
                'color' => 'violet',
            ],
            'qrcodes' => [
                'label' => 'QR Badges',
                'description' => 'Permanent attendance and staff QR codes',
                'color' => 'sky',
            ],
        ];

        $categories = [];
        $allFiles = [];
        $totalBytes = 0;
        $totalFiles = 0;

        if (File::isDirectory($publicStorage)) {
            $directories = File::directories($publicStorage);
            foreach ($directories as $dirPath) {
                $folder = basename($dirPath);
                $files = File::allFiles($dirPath);
                $catBytes = 0;
                $catFileList = [];

                foreach ($files as $file) {
                    if ($file->getFilename() === '.gitignore') continue;
                    $size = $file->getSize();
                    $catBytes += $size;
                    $ext = strtolower($file->getExtension());
                    $isImg = in_array($ext, ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg']);
                    $relPath = str_replace('\\', '/', substr($file->getPathname(), strlen($publicStorage) + 1));
                    $meta = $knownMeta[$folder] ?? null;
                    $catLabel = $meta ? $meta['label'] : ucwords(str_replace(['_', '-'], ' ', $folder));

                    $fileItem = [
                        'name' => $file->getFilename(),
                        'folder' => $folder,
                        'category_label' => $catLabel,
                        'relative_path' => $relPath,
                        'url' => '/storage/' . $relPath,
                        'size_bytes' => $size,
                        'size_formatted' => self::formatBytes($size),
                        'extension' => $ext,
                        'is_image' => $isImg,
                        'modified_at' => date('Y-m-d H:i:s', $file->getMTime()),
                        'timestamp' => $file->getMTime(),
                    ];

                    $catFileList[] = $fileItem;
                    $allFiles[] = $fileItem;
                }

                usort($catFileList, fn($a, $b) => $b['timestamp'] <=> $a['timestamp']);

                $meta = $knownMeta[$folder] ?? [
                    'label' => ucwords(str_replace(['_', '-'], ' ', $folder)),
                    'description' => "Uploaded files stored under {$folder}",
                    'color' => 'slate',
                ];

                $categories[$folder] = [
                    'folder' => $folder,
                    'label' => $meta['label'],
                    'description' => $meta['description'],
                    'color' => $meta['color'],
                    'size_bytes' => $catBytes,
                    'size_formatted' => self::formatBytes($catBytes),
                    'files_count' => count($catFileList),
                    'files' => $catFileList,
                ];

                $totalBytes += $catBytes;
                $totalFiles += count($catFileList);
            }

            // Also check files directly in root public storage
            $rootFiles = File::files($publicStorage);
            $rootList = [];
            $rootBytes = 0;
            foreach ($rootFiles as $file) {
                if ($file->getFilename() === '.gitignore') continue;
                $size = $file->getSize();
                $rootBytes += $size;
                $ext = strtolower($file->getExtension());
                $relPath = $file->getFilename();
                $item = [
                    'name' => $file->getFilename(),
                    'folder' => 'root',
                    'category_label' => 'Root Storage',
                    'relative_path' => $relPath,
                    'url' => '/storage/' . $relPath,
                    'size_bytes' => $size,
                    'size_formatted' => self::formatBytes($size),
                    'extension' => $ext,
                    'is_image' => in_array($ext, ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg']),
                    'modified_at' => date('Y-m-d H:i:s', $file->getMTime()),
                    'timestamp' => $file->getMTime(),
                ];
                $rootList[] = $item;
                $allFiles[] = $item;
            }

            if (!empty($rootList)) {
                $categories['root'] = [
                    'folder' => 'root',
                    'label' => 'Root Storage Files',
                    'description' => 'Files directly under public storage root',
                    'color' => 'slate',
                    'size_bytes' => $rootBytes,
                    'size_formatted' => self::formatBytes($rootBytes),
                    'files_count' => count($rootList),
                    'files' => $rootList,
                ];
                $totalBytes += $rootBytes;
                $totalFiles += count($rootList);
            }
        }

        // Sort all files across all folders by newest modified first
        usort($allFiles, fn($a, $b) => $b['timestamp'] <=> $a['timestamp']);

        return [
            'path' => 'storage/app/public',
            'size_bytes' => $totalBytes,
            'size_formatted' => self::formatBytes($totalBytes),
            'files_count' => $totalFiles,
            'file_count' => $totalFiles,
            'categories' => $categories,
            'files' => $allFiles,
        ];
    }

    /**
     * Inspect database backup storage directory across all system backup locations.
     */
    public static function getBackupsStorage(): array
    {
        $backupDirs = [
            storage_path('app/backups'),
            storage_path('app/db-backups'),
            storage_path('app/private/backups'),
        ];

        $backupFiles = [];
        $totalBytes = 0;

        foreach ($backupDirs as $bDir) {
            if (File::isDirectory($bDir)) {
                $files = File::files($bDir);
                foreach ($files as $file) {
                    if ($file->getFilename() === '.gitignore') continue;
                    $size = $file->getSize();
                    $totalBytes += $size;
                    $backupFiles[] = [
                        'filename' => $file->getFilename(),
                        'path' => str_replace('\\', '/', substr($file->getPathname(), strlen(base_path()) + 1)),
                        'size_bytes' => $size,
                        'size_formatted' => self::formatBytes($size),
                        'created_at' => date('Y-m-d H:i:s', $file->getMTime()),
                        'timestamp' => $file->getMTime(),
                    ];
                }
            }
        }

        usort($backupFiles, fn($a, $b) => $b['timestamp'] <=> $a['timestamp']);

        return [
            'path' => 'storage/app/backups',
            'size_bytes' => $totalBytes,
            'size_formatted' => self::formatBytes($totalBytes),
            'files_count' => count($backupFiles),
            'file_count' => count($backupFiles),
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
