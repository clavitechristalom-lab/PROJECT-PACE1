<?php

namespace App\Services;

use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Artisan;

class OtpService
{
    /**
     * In-memory cache for directly parsed .env file lines to avoid multiple disk reads per request.
     */
    private static ?array $parsedEnvCache = null;

    /**
     * Clear configuration cache internally if cached to avoid stale env() issues.
     */
    public static function clearConfigCache(): void
    {
        try {
            if (app()->configurationIsCached() || file_exists(base_path('bootstrap/cache/config.php'))) {
                Artisan::call('config:clear');
            }
        } catch (\Throwable $e) {
            Log::warning("[CONFIG CLEAR WARNING] Could not clear config cache: " . $e->getMessage());
        }
        self::$parsedEnvCache = null;
    }

    /**
     * Robustly retrieve an environment or configuration variable.
     * Order of precedence:
     * 1. env() helper
     * 2. $_ENV superglobal
     * 3. $_SERVER superglobal
     * 4. getenv()
     * 5. config() loader (if configKey provided)
     * 6. Direct parsing of backend/.env file from disk
     */
    public static function getEnvValue(string $key, ?string $configKey = null, ?string $default = null): ?string
    {
        // 1. Check Laravel env() helper directly
        try {
            $val = env($key);
            if ($val !== null && $val !== '' && $val !== 'null') {
                return trim((string)$val);
            }
        } catch (\Throwable $e) {}

        // 2. Check $_ENV superglobal
        if (isset($_ENV[$key]) && $_ENV[$key] !== '' && $_ENV[$key] !== 'null') {
            return trim((string)$_ENV[$key]);
        }

        // 3. Check $_SERVER superglobal
        if (isset($_SERVER[$key]) && $_SERVER[$key] !== '' && $_SERVER[$key] !== 'null') {
            return trim((string)$_SERVER[$key]);
        }

        // 4. Check getenv()
        $getEnvVal = getenv($key);
        if ($getEnvVal !== false && $getEnvVal !== '' && $getEnvVal !== 'null') {
            return trim((string)$getEnvVal);
        }

        // 5. Check Laravel config() loader
        if ($configKey) {
            try {
                $configVal = config($configKey);
                if ($configVal !== null && $configVal !== '' && $configVal !== 'null') {
                    return trim((string)$configVal);
                }
            } catch (\Throwable $e) {}
        }

        // 6. Direct filesystem fallback parser for backend/.env
        if (self::$parsedEnvCache === null) {
            self::$parsedEnvCache = self::parseDirectEnv();
        }

        if (isset(self::$parsedEnvCache[$key]) && self::$parsedEnvCache[$key] !== '' && self::$parsedEnvCache[$key] !== 'null') {
            return trim((string)self::$parsedEnvCache[$key]);
        }

        return $default;
    }

    /**
     * Direct parser for backend/.env file on disk to guarantee zero false-positives
     * even if Laravel's config was cached or env() was restricted.
     */
    protected static function parseDirectEnv(): array
    {
        $vars = [];
        $envPath = base_path('.env');
        if (!file_exists($envPath)) {
            return $vars;
        }

        $lines = @file($envPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        if (!$lines) {
            return $vars;
        }

        foreach ($lines as $line) {
            $line = trim($line);
            if ($line === '' || str_starts_with($line, '#')) {
                continue;
            }

            $pos = strpos($line, '=');
            if ($pos === false) {
                continue;
            }

            $k = trim(substr($line, 0, $pos));
            $v = trim(substr($line, $pos + 1));

            // Strip surrounding double or single quotes
            if ((str_starts_with($v, '"') && str_ends_with($v, '"')) ||
                (str_starts_with($v, "'") && str_ends_with($v, "'"))) {
                $v = substr($v, 1, -1);
            }

            $v = trim($v);
            if ($v !== '' && $v !== 'null') {
                $vars[$k] = $v;
            }
        }

        return $vars;
    }

    /**
     * Load Gmail SMTP credentials with multi-tiered resolution and fallback logic.
     */
    public static function getGmailCredentials(): array
    {
        // 1. Resolve User/Email: Check GMAIL_USER and MAIL_USERNAME across all sources
        $userCandidates = [
            self::getEnvValue('GMAIL_USER', 'mail.gmail.user'),
            self::getEnvValue('MAIL_USERNAME', 'mail.mailers.smtp.username'),
        ];

        $resolvedUser = null;
        foreach ($userCandidates as $candidate) {
            if (!empty($candidate) && $candidate !== 'null' && !str_contains($candidate, 'example.com')) {
                $resolvedUser = trim((string)$candidate);
                break;
            }
        }

        // 2. Resolve Password: Check GMAIL_APP_PASSWORD and MAIL_PASSWORD across all sources
        $passCandidates = [
            self::getEnvValue('GMAIL_APP_PASSWORD', 'mail.gmail.app_password'),
            self::getEnvValue('MAIL_PASSWORD', 'mail.mailers.smtp.password'),
        ];

        $resolvedPass = null;
        foreach ($passCandidates as $candidate) {
            if (!empty($candidate) && $candidate !== 'null') {
                $cleaned = trim((string)$candidate);
                // Strip surrounding quotes
                if ((str_starts_with($cleaned, '"') && str_ends_with($cleaned, '"')) ||
                    (str_starts_with($cleaned, "'") && str_ends_with($cleaned, "'"))) {
                    $cleaned = trim(substr($cleaned, 1, -1));
                }
                if ($cleaned !== '' && $cleaned !== 'null') {
                    $resolvedPass = $cleaned;
                    break;
                }
            }
        }

        // 3. If credentials missing and config is cached, automatically clear cache and re-evaluate
        if ((empty($resolvedUser) || empty($resolvedPass)) && (app()->configurationIsCached() || file_exists(base_path('bootstrap/cache/config.php')))) {
            self::clearConfigCache();
            $directVars = self::parseDirectEnv();
            if (empty($resolvedUser)) {
                $resolvedUser = $directVars['GMAIL_USER'] ?? ($directVars['MAIL_USERNAME'] ?? null);
            }
            if (empty($resolvedPass)) {
                $resolvedPass = $directVars['GMAIL_APP_PASSWORD'] ?? ($directVars['MAIL_PASSWORD'] ?? null);
            }
        }

        return [
            'user' => $resolvedUser,
            'pass' => $resolvedPass,
        ];
    }

    /**
    /**
     * Send OTP strictly via live Gmail SMTP using PHPMailer (smtp.gmail.com, Port 587, TLS).
     * Robustly reads credentials without false positives.
     */
    public static function sendEmailOTP(string $email, string $otp, string $recipientName = 'Valued Customer', string $type = 'login'): array
    {
        $creds = self::getGmailCredentials();
        $gmailUser = $creds['user'];
        $gmailPassword = $creds['pass'];

        if (empty($gmailUser) || empty($gmailPassword) || str_contains($gmailUser, 'example.com')) {
            Log::error("[GMAIL SMTP NOT CONFIGURED] Attempted to send email to {$email}, but MAIL_USERNAME / GMAIL_USER or MAIL_PASSWORD / GMAIL_APP_PASSWORD is not configured in backend/.env.");
            return [
                'success' => false,
                'message' => 'Gmail SMTP credentials are not configured in backend/.env. Please configure MAIL_USERNAME / GMAIL_USER and MAIL_PASSWORD / GMAIL_APP_PASSWORD.',
            ];
        }

        $host = self::getEnvValue('MAIL_HOST', 'mail.mailers.smtp.host', 'smtp.gmail.com');
        $port = (int) self::getEnvValue('MAIL_PORT', 'mail.mailers.smtp.port', '587');
        $fromAddress = self::getEnvValue('MAIL_FROM_ADDRESS', 'mail.from.address') ?: $gmailUser;
        $fromName = self::getEnvValue('MAIL_FROM_NAME', 'mail.from.name', 'Z-LICZ Furniture & Appliances Trading');

        $subjectTitle = match($type) {
            'registration'   => 'Account Registration Verification Code',
            'password_reset' => 'Password Reset Verification Code',
            default          => 'Login Verification Code (2FA)'
        };
        $subject = "Z-LICZ Furniture & Appliances: {$subjectTitle} [{$otp}]";

        $instructions = match($type) {
            'registration'   => 'Thank you for registering with Z-LICZ Furniture & Appliances Trading. Use the verification code below to complete your registration.',
            'password_reset' => 'We received a request to reset your password. Use the verification code below to set up a new password.',
            default          => 'A sign-in attempt was detected for your account. Please enter the verification code below to securely authenticate your session.'
        };

        $year = date('Y');
        $currentTime = date('M d, Y h:i A');

        $htmlBody = <<<HTML
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
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
        $plainText = "Z-LICZ Furniture & Appliances Trading\n\nYour 6-digit verification code is: {$otp}\nValid for 15 minutes.\nDo not share this code.";

        // 1. Primary Dispatch: PHPMailer on Gmail SMTP (smtp.gmail.com:587 TLS)
        try {
            if (class_exists(\PHPMailer\PHPMailer\PHPMailer::class)) {
                $mail = new \PHPMailer\PHPMailer\PHPMailer(true);
                $mail->isSMTP();
                $mail->Host       = $host;
                $mail->SMTPAuth   = true;
                $mail->Username   = $gmailUser;
                $mail->Password   = $gmailPassword;
                $mail->SMTPSecure = \PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_STARTTLS;
                $mail->Port       = $port;
                $mail->Timeout    = 20;
                $mail->CharSet    = 'UTF-8';

                $mail->setFrom($fromAddress, $fromName);
                $mail->addAddress($email, $recipientName);
                $mail->addReplyTo($fromAddress, $fromName);

                $mail->isHTML(true);
                $mail->Subject = $subject;
                $mail->Body    = $htmlBody;
                $mail->AltBody = $plainText;

                $mail->send();

                Log::info("[LIVE GMAIL SENT via PHPMailer] Successfully dispatched {$type} OTP to: {$email} via PHPMailer Gmail SMTP.");
                return [
                    'success'  => true,
                    'provider' => 'PHPMailer-Gmail-TLS',
                ];
            }
        } catch (\Throwable $e) {
            Log::warning("[PHPMAILER ERROR] Failed to send to {$email}: " . $e->getMessage() . ". Attempting fallback...");
        }

        // 2. Secondary fallback via Laravel Mail
        try {
            config([
                'mail.default' => 'smtp',
                'mail.mailers.smtp.transport' => 'smtp',
                'mail.mailers.smtp.host' => $host,
                'mail.mailers.smtp.port' => $port,
                'mail.mailers.smtp.encryption' => 'tls',
                'mail.mailers.smtp.username' => $gmailUser,
                'mail.mailers.smtp.password' => $gmailPassword,
                'mail.from.address' => $fromAddress,
                'mail.from.name' => $fromName,
            ]);

            app()->forgetInstance('mail.manager');
            Mail::clearResolvedInstances();

            Mail::html($htmlBody, function ($message) use ($email, $fromAddress, $fromName, $subject) {
                $message->to($email)
                    ->from($fromAddress, $fromName)
                    ->subject($subject);
            });

            Log::info("[LIVE GMAIL SENT via Laravel Mail] Successfully dispatched {$type} OTP to: {$email}.");
            return [
                'success'  => true,
                'provider' => 'laravel-gmail-smtp',
            ];
        } catch (\Throwable $e) {
            Log::error("[LIVE GMAIL SMTP ERROR] Failed to send to {$email}: " . $e->getMessage());
            return [
                'success' => false,
                'message' => 'Failed to deliver OTP via Gmail SMTP: ' . $e->getMessage(),
            ];
        }
    }
}
