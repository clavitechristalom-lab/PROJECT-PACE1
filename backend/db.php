<?php
/**
 * Z-LICZ Furniture & Appliances Trading
 * Clean PDO Database & PHPMailer Configuration Helper
 */

require_once __DIR__ . '/vendor/autoload.php';

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception as PHPMailerException;

/**
 * Handle CORS headers cleanly for all standalone API endpoints
 */
function setCORSHeaders(): void
{
    if (!headers_sent()) {
        header('Access-Control-Allow-Origin: *');
        header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
        header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, Accept, Origin');
        header('Content-Type: application/json; charset=UTF-8');
    }

    if (isset($_SERVER['REQUEST_METHOD']) && strtoupper($_SERVER['REQUEST_METHOD']) === 'OPTIONS') {
        http_response_code(200);
        exit;
    }
}

/**
 * Send JSON response and exit
 */
function sendJsonResponse(array $data, int $statusCode = 200): void
{
    if (!headers_sent()) {
        setCORSHeaders();
        http_response_code($statusCode);
    }
    echo json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

/**
 * Get cached/parsed environment variables from backend/.env
 */
function getEnvConfig(): array
{
    static $envVars = null;
    if ($envVars !== null) {
        return $envVars;
    }

    $envVars = [];
    $envPath = __DIR__ . '/.env';
    if (!file_exists($envPath)) {
        $envPath = dirname(__DIR__) . '/.env';
    }

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

    return $envVars;
}

/**
 * Get PDO Database Connection
 */
function getDbConnection(): PDO
{
    static $pdo = null;
    if ($pdo !== null) {
        return $pdo;
    }

    $env = getEnvConfig();

    $host     = $env['DB_HOST'] ?? '127.0.0.1';
    $port     = $env['DB_PORT'] ?? '3306';
    $dbname   = $env['DB_DATABASE'] ?? 'project_pace';
    $username = $env['DB_USERNAME'] ?? 'root';
    $password = $env['DB_PASSWORD'] ?? '';

    $dsn = "mysql:host={$host};port={$port};dbname={$dbname};charset=utf8mb4";
    $options = [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
    ];

    $pdo = new PDO($dsn, $username, $password, $options);
    return $pdo;
}

/**
 * Get Gmail SMTP Configuration
 */
function getMailConfig(): array
{
    $env = getEnvConfig();

    $user = $env['GMAIL_USER'] ?? ($env['MAIL_USERNAME'] ?? 'Z-LICZ@gmail.com');
    $pass = $env['GMAIL_APP_PASSWORD'] ?? ($env['MAIL_PASSWORD'] ?? 'sziq apba sink lsch');

    // Strip quotes if any
    if ((str_starts_with($pass, '"') && str_ends_with($pass, '"')) ||
        (str_starts_with($pass, "'") && str_ends_with($pass, "'"))) {
        $pass = substr($pass, 1, -1);
    }

    $fromEmail = $env['MAIL_FROM_ADDRESS'] ?? 'Z-LICZ@gmail.com';
    $authUsername = (empty($user) || strcasecmp($user, 'Z-LICZ@gmail.com') === 0) 
        ? ($env['GMAIL_AUTH_ACCOUNT'] ?? '35barangay@gmail.com') 
        : $user;

    return [
        'host'       => $env['MAIL_HOST'] ?? 'smtp.gmail.com',
        'port'       => (int)($env['MAIL_PORT'] ?? 587),
        'encryption' => $env['MAIL_ENCRYPTION'] ?? 'tls',
        'username'   => $authUsername,
        'password'   => $pass,
        'from_email' => $fromEmail,
        'from_name'  => $env['MAIL_FROM_NAME'] ?? 'Z-LICZ Furniture & Appliances Trading',
    ];
}

/**
 * Build branded HTML Email Template
 */
function buildZliczEmailHtml(string $title, string $subtitle, string $otp, string $instructions, string $recipientName): string
{
    $year = date('Y');
    $currentTime = date('M d, Y h:i A');

    return <<<HTML
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{$title}</title>
  <style>
    body { margin: 0; padding: 0; background-color: #0d1b2a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #334155; }
    .container { max-width: 580px; margin: 30px auto; background: #ffffff; border-radius: 14px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.15); border: 1px solid #e2e8f0; }
    .header { background: linear-gradient(135deg, #0f1f3d 0%, #1a3a6b 100%); padding: 32px 24px; text-align: center; color: #ffffff; }
    .header h1 { margin: 0 0 6px 0; font-size: 24px; font-weight: 700; letter-spacing: 0.5px; color: #ffffff; }
    .header p { margin: 0; font-size: 13px; color: #94a3b8; text-transform: uppercase; letter-spacing: 1.5px; }
    .content { padding: 36px 32px; background-color: #ffffff; }
    .greeting { font-size: 16px; font-weight: 600; color: #1e293b; margin-bottom: 12px; }
    .lead { font-size: 14px; line-height: 1.6; color: #475569; margin-bottom: 24px; }
    .otp-wrapper { text-align: center; margin: 28px 0; padding: 22px; background: #f8fafc; border-radius: 12px; border: 1px dashed #cbd5e1; }
    .otp-label { font-size: 12px; text-transform: uppercase; font-weight: 700; color: #64748b; letter-spacing: 1px; margin-bottom: 8px; }
    .otp-digits { font-family: 'Courier New', Courier, monospace; font-size: 38px; font-weight: 800; letter-spacing: 10px; color: #1a3a6b; }
    .otp-validity { font-size: 12px; color: #e11d48; margin-top: 8px; font-weight: 600; }
    .security-notice { background: #fffbeb; border-left: 4px solid #f59e0b; padding: 14px 16px; border-radius: 6px; font-size: 13px; line-height: 1.5; color: #92400e; margin-top: 24px; }
    .footer { background: #f1f5f9; padding: 20px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Z-LICZ</h1>
      <p>Furniture & Appliances Trading</p>
    </div>
    <div class="content">
      <div class="greeting">Hello {$recipientName},</div>
      <div class="lead">{$instructions}</div>

      <div class="otp-wrapper">
        <div class="otp-label">Your 6-Digit Verification Code</div>
        <div class="otp-digits">{$otp}</div>
        <div class="otp-validity">&#9200; Valid for 15 minutes only (Issued at {$currentTime})</div>
      </div>

      <div class="security-notice">
        <strong>Security Warning:</strong> Never share this OTP code with anyone. Official Z-LICZ staff will never ask for your verification code.
      </div>
    </div>
    <div class="footer">
      &copy; {$year} Z-LICZ Furniture & Appliances Trading. All rights reserved.
    </div>
  </div>
</body>
</html>
HTML;
}

/**
 * Dispatch an email via live PHPMailer on Gmail SMTP (smtp.gmail.com:587 TLS)
 */
function sendPHPMailerEmail(string $recipientEmail, string $subject, string $htmlBody, string $textBody, string $recipientName = 'Valued Customer'): array
{
    $config = getMailConfig();

    if (empty($config['username']) || empty($config['password'])) {
        return [
            'success' => false,
            'message' => 'Gmail SMTP credentials missing in backend/.env'
        ];
    }

    $mail = new PHPMailer(true);

    try {
        $mail->isSMTP();
        $mail->Host       = $config['host'];
        $mail->SMTPAuth   = true;
        $mail->Username   = $config['username'];
        $mail->Password   = $config['password'];
        $mail->SMTPSecure = PHPMailer::ENCRYPTION_STARTTLS;
        $mail->Port       = $config['port'];
        $mail->Timeout    = 20;
        $mail->CharSet    = 'UTF-8';

        $mail->setFrom($config['from_email'], $config['from_name']);
        $mail->addAddress($recipientEmail, $recipientName);
        $mail->addReplyTo($config['from_email'], $config['from_name']);

        // Deliverability & RFC Anti-Spam Headers
        $uniqueId = sprintf('%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
            mt_rand(0, 0xffff), mt_rand(0, 0xffff),
            mt_rand(0, 0xffff),
            mt_rand(0, 0x0fff) | 0x4000,
            mt_rand(0, 0x3fff) | 0x8000,
            mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff)
        );
        $mail->MessageID = "<{$uniqueId}@zlicz.com>";
        $mail->addCustomHeader('Auto-Submitted', 'auto-generated');
        $mail->addCustomHeader('X-Auto-Response-Suppress', 'All');
        $mail->addCustomHeader('X-Entity-Ref-ID', $uniqueId);
        $mail->addCustomHeader('Precedence', 'bulk');
        $mail->Priority = 3;

        $mail->isHTML(true);
        $mail->Subject = $subject;
        $mail->Body    = $htmlBody;
        $mail->AltBody = $textBody;

        $mail->send();

        return [
            'success'  => true,
            'message'  => 'Email dispatched successfully via PHPMailer Gmail SMTP',
            'provider' => 'PHPMailer-Gmail-TLS'
        ];
    } catch (PHPMailerException $e) {
        error_log("[PHPMAILER ERROR] Failed to send email to {$recipientEmail}: " . $mail->ErrorInfo . " | Exception: " . $e->getMessage());
        return [
            'success' => false,
            'message' => 'PHPMailer SMTP Error: ' . $mail->ErrorInfo,
            'error'   => $mail->ErrorInfo,
        ];
    } catch (\Throwable $e) {
        error_log("[SMTP FATAL ERROR] " . $e->getMessage());
        return [
            'success' => false,
            'message' => 'Unexpected error delivering email: ' . $e->getMessage(),
            'error'   => $e->getMessage(),
        ];
    }
}

// Global PDO instance for scripts expecting $pdo in scope
$pdo = getDbConnection();

