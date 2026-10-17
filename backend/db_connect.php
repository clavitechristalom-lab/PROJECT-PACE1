<?php
/**
 * Database connection helper using PDO for standalone scripts.
 * Loads connection configuration dynamically from backend/.env.
 */

function getDbConnection(): PDO
{
    static $pdo = null;
    if ($pdo !== null) {
        return $pdo;
    }

    $envPath = __DIR__ . '/.env';
    $envVars = [];
    if (file_exists($envPath)) {
        $lines = file($envPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        foreach ($lines as $line) {
            $line = trim($line);
            if ($line === '' || str_starts_with($line, '#')) {
                continue;
            }
            $pos = strpos($line, '=');
            if ($pos !== false) {
                $key = trim(substr($line, 0, $pos));
                $val = trim(substr($line, $pos + 1));
                if ((str_starts_with($val, '"') && str_ends_with($val, '"')) ||
                    (str_starts_with($val, "'") && str_ends_with($val, "'"))) {
                    $val = substr($val, 1, -1);
                }
                $envVars[$key] = $val;
            }
        }
    }

    $host = $envVars['DB_HOST'] ?? '127.0.0.1';
    $port = $envVars['DB_PORT'] ?? '3306';
    $dbname = $envVars['DB_DATABASE'] ?? 'forge';
    $username = $envVars['DB_USERNAME'] ?? 'root';
    $password = $envVars['DB_PASSWORD'] ?? '';

    $dsn = "mysql:host={$host};port={$port};dbname={$dbname};charset=utf8mb4";
    $options = [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => true,
    ];

    $pdo = new PDO($dsn, $username, $password, $options);
    return $pdo;
}

function getMailConfig(): array
{
    $envPath = __DIR__ . '/.env';
    $envVars = [];
    if (file_exists($envPath)) {
        $lines = file($envPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        foreach ($lines as $line) {
            $line = trim($line);
            if ($line === '' || str_starts_with($line, '#')) {
                continue;
            }
            $pos = strpos($line, '=');
            if ($pos !== false) {
                $key = trim(substr($line, 0, $pos));
                $val = trim(substr($line, $pos + 1));
                if ((str_starts_with($val, '"') && str_ends_with($val, '"')) ||
                    (str_starts_with($val, "'") && str_ends_with($val, "'"))) {
                    $val = substr($val, 1, -1);
                }
                $envVars[$key] = $val;
            }
        }
    }

    return [
        'host'       => $envVars['MAIL_HOST'] ?? 'smtp.gmail.com',
        'port'       => (int)($envVars['MAIL_PORT'] ?? 587),
        'encryption' => $envVars['MAIL_ENCRYPTION'] ?? 'tls',
        'username'   => $envVars['GMAIL_USER'] ?? ($envVars['MAIL_USERNAME'] ?? ''),
        'password'   => $envVars['GMAIL_APP_PASSWORD'] ?? ($envVars['MAIL_PASSWORD'] ?? ''),
        'from_email' => $envVars['MAIL_FROM_ADDRESS'] ?? ($envVars['GMAIL_USER'] ?? ($envVars['MAIL_USERNAME'] ?? '')),
        'from_name'  => $envVars['MAIL_FROM_NAME'] ?? 'Z-LICZ Furniture & Appliances Trading',
    ];
}
