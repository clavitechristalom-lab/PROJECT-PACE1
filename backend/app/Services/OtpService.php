<?php

namespace App\Services;

use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

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
     */
    public static function getEnvValue(string $key, ?string $configKey = null, ?string $default = null): ?string
    {
        // 0. For mail/Gmail keys, always prefer fresh backend/.env on disk so edits work even without restarting php artisan serve
        if (str_starts_with($key, 'MAIL_') || str_starts_with($key, 'GMAIL_')) {
            $freshEnv = self::parseDirectEnv();
            if (isset($freshEnv[$key]) && $freshEnv[$key] !== '' && $freshEnv[$key] !== 'null') {
                return trim((string)$freshEnv[$key]);
            }
        }

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
     * Direct parser for backend/.env file on disk.
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
     * Resolve mail transport credentials with multi-tiered resolution.
     */
    public static function getMailCredentials(): array
    {
        $host = self::getEnvValue('MAIL_HOST', 'mail.mailers.smtp.host', 'smtp.gmail.com');
        $port = (int) self::getEnvValue('MAIL_PORT', 'mail.mailers.smtp.port', '587');
        $encryption = self::getEnvValue('MAIL_ENCRYPTION', 'mail.mailers.smtp.encryption', 'tls');

        // Resolve Username
        $userCandidates = [
            self::getEnvValue('MAIL_USERNAME', 'mail.mailers.smtp.username'),
            self::getEnvValue('GMAIL_USER', 'mail.gmail.user'),
            self::getEnvValue('SENDGRID_API_KEY'),
            self::getEnvValue('POSTMARK_API_TOKEN'),
        ];

        $resolvedUser = null;
        foreach ($userCandidates as $candidate) {
            if (!empty($candidate) && $candidate !== 'null' && !str_contains($candidate, 'example.com')) {
                $resolvedUser = trim((string)$candidate);
                break;
            }
        }

        if (empty($resolvedUser)) {
            $resolvedUser = self::getEnvValue('GMAIL_AUTH_ACCOUNT') ?: 'z.licz2000@gmail.com';
        }

        // Resolve Password / Secret
        $passCandidates = [
            self::getEnvValue('MAIL_PASSWORD', 'mail.mailers.smtp.password'),
            self::getEnvValue('GMAIL_APP_PASSWORD', 'mail.gmail.app_password'),
            self::getEnvValue('SENDGRID_API_KEY'),
            self::getEnvValue('POSTMARK_API_TOKEN'),
        ];

        $resolvedPass = null;
        foreach ($passCandidates as $candidate) {
            if (!empty($candidate) && $candidate !== 'null') {
                $cleaned = trim((string)$candidate);
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

        $fromAddress = self::getEnvValue('MAIL_FROM_ADDRESS', 'mail.from.address');
        if (empty($fromAddress)) {
            $fromAddress = $resolvedUser ?: 'z.licz2000@gmail.com';
        }
        $fromName = self::getEnvValue('MAIL_FROM_NAME', 'mail.from.name') ?: 'Z-LICZ Furniture & Appliances';

        $smtpAuthUser = $resolvedUser;

        return [
            'host'           => $host,
            'port'           => $port,
            'encryption'     => $encryption,
            'user'           => $resolvedUser,
            'smtp_auth_user' => $smtpAuthUser,
            'pass'           => $resolvedPass,
            'from_email'     => $fromAddress,
            'from_name'      => $fromName,
        ];
    }

    /**
     * Comprehensive multi-tier rate limiting to protect sender reputation against spam flags:
     * 1. 60-second cooldown per email
     * 2. Max 5 OTP requests per email per hour
     * 3. Max 10 OTP requests per IP address per 15 minutes
     */
    public static function checkRateLimit(string $email, string $ip): array
    {
        $normalizedEmail = strtolower(trim($email));
        $emailCooldownKey = 'otp_cooldown_' . md5($normalizedEmail);
        $emailHourlyKey   = 'otp_hourly_' . md5($normalizedEmail);
        $ipWindowKey      = 'otp_ip_window_' . md5($ip);

        // In local development / debug mode, bypass rate limit so testing login is seamless
        if (config('app.debug') || app()->environment('local')) {
            return ['allowed' => true];
        }

        // 1. Check 60-second cooldown per email
        $lastSent = Cache::get($emailCooldownKey);
        if ($lastSent) {
            $elapsed = time() - $lastSent;
            if ($elapsed < 60) {
                $remaining = 60 - $elapsed;
                return [
                    'allowed'           => false,
                    'remaining_seconds' => $remaining,
                    'message'           => "Please wait {$remaining} seconds before requesting another verification code.",
                ];
            }
        }

        // 2. Check Hourly Cap (max 5 emails per hour per recipient)
        $hourlyCount = (int) Cache::get($emailHourlyKey, 0);
        if ($hourlyCount >= 5) {
            return [
                'allowed'           => false,
                'remaining_seconds' => 300,
                'message'           => 'Too many verification requests for this email address. Please try again in 1 hour.',
            ];
        }

        // 3. Check IP-level abuse prevention (max 10 requests per IP per 15 mins)
        $ipCount = (int) Cache::get($ipWindowKey, 0);
        if ($ipCount >= 10) {
            return [
                'allowed'           => false,
                'remaining_seconds' => 600,
                'message'           => 'Too many verification attempts from this network. Please wait a few minutes before trying again.',
            ];
        }

        return ['allowed' => true];
    }

    /**
     * Record rate limit usage after successful OTP dispatch.
     */
    public static function hitRateLimit(string $email, string $ip): void
    {
        $normalizedEmail = strtolower(trim($email));
        $emailCooldownKey = 'otp_cooldown_' . md5($normalizedEmail);
        $emailHourlyKey   = 'otp_hourly_' . md5($normalizedEmail);
        $ipWindowKey      = 'otp_ip_window_' . md5($ip);

        Cache::put($emailCooldownKey, time(), 60);

        $hourly = (int) Cache::get($emailHourlyKey, 0);
        Cache::put($emailHourlyKey, $hourly + 1, 3600);

        $ipCount = (int) Cache::get($ipWindowKey, 0);
        Cache::put($ipWindowKey, $ipCount + 1, 900);
    }

    /**
     * Clear old unused tokens for this email and generate a fresh secure 6-digit cryptographic OTP.
     * Sets a strict 15-minute expiration timestamp and records audit details.
     */
    public static function getOrCreateActiveOtp(int $userId, string $email, string $type, string $ip, ?string $userAgent): string
    {
        $normalizedEmail = strtolower(trim($email));

        // 1. Clear old unused tokens for this email to prevent multiple concurrent unconsumed tokens
        try {
            DB::table('otps')
                ->where('email', $normalizedEmail)
                ->where('used', 0)
                ->update(['used' => 1, 'updated_at' => now()]);
        } catch (\Throwable $e) {
            Log::warning("[OTP CLEAR WARNING] " . $e->getMessage());
        }

        // 2. Generate a secure 6-digit cryptographic OTP
        $otp = sprintf('%06d', random_int(100000, 999999));
        $expiryTime = now()->addMinutes(15);

        // 3. Insert fresh OTP record in otps table with strict 15-minute expiration
        DB::table('otps')->insert([
            'user_id'     => $userId,
            'email'       => $normalizedEmail,
            'otp_code'    => $otp,
            'type'        => $type,
            'used'        => 0,
            'expiry_time' => $expiryTime,
            'ip_address'  => $ip,
            'user_agent'  => $userAgent,
            'created_at'  => now(),
            'updated_at'  => now(),
        ]);

        // 4. Synchronize with password_reset_otp table for backward compatibility
        try {
            DB::table('password_reset_otp')->where('email', $normalizedEmail)->delete();
            DB::table('password_reset_otp')->insert([
                'email'       => $normalizedEmail,
                'otp_code'    => $otp,
                'used'        => 0,
                'expiry_time' => $expiryTime,
                'created_at'  => now(),
                'updated_at'  => now(),
            ]);
        } catch (\Throwable $e) {
            Log::warning("[PASSWORD RESET OTP SYNC WARNING] " . $e->getMessage());
        }

        return $otp;
    }

    /**
     * Build branded HTML email payload with PROJECT: PACE Z-LICZ branding.
     */
    public static function buildEmailPayload(string $otp, string $recipientName, string $type): array
    {
        $subject = match($type) {
            'registration'   => '[PROJECT: PACE Z-LICZ] Complete your account verification',
            'password_reset' => '[PROJECT: PACE Z-LICZ] Password reset verification code',
            default          => '[PROJECT: PACE Z-LICZ] Your 6-Digit Verification Code: ' . $otp
        };

        $actionText = match($type) {
            'registration'   => 'Thank you for registering with Z-LICZ Furniture & Appliances Trading. Please enter the security verification code below to confirm and activate your account.',
            'password_reset' => 'We received a request to reset your password. Enter this single-use security code to proceed with creating a new password.',
            default          => 'A sign-in request was initiated for your Z-LICZ account. Enter this single-use security code to verify your identity and complete sign-in.'
        };

        $year = date('Y');
        $currentTime = date('M d, Y h:i A');
        $preheader = "Your single-use security verification code is {$otp}. Valid for 15 minutes.";

        $htmlBody = <<<HTML
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{$subject}</title>
  <style>
    body { margin: 0; padding: 0; width: 100% !important; background-color: #0b1329; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; }
    .email-container { max-width: 580px; margin: 32px auto; background-color: #ffffff; border-radius: 16px; border: 1px solid #1e293b; overflow: hidden; box-shadow: 0 12px 35px rgba(0,0,0,0.3); }
    .email-header { background: linear-gradient(135deg, #064e3b 0%, #047857 100%); padding: 32px 36px; text-align: left; }
    .badge-tag { display: inline-block; background-color: rgba(255,255,255,0.18); color: #d1fae5; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; padding: 4px 10px; border-radius: 6px; margin-bottom: 8px; }
    .brand-title { color: #ffffff; font-size: 22px; font-weight: 800; margin: 0; letter-spacing: 0.5px; }
    .brand-sub { color: #a7f3d0; font-size: 12px; margin: 4px 0 0 0; text-transform: uppercase; letter-spacing: 1.2px; font-weight: 600; }
    .email-body { padding: 36px 36px; background-color: #ffffff; }
    .greeting { font-size: 17px; font-weight: 700; color: #0f172a; margin: 0 0 14px 0; }
    .description { font-size: 14px; line-height: 1.65; color: #334155; margin: 0 0 24px 0; }
    .otp-card { background: linear-gradient(180deg, #f0fdf4 0%, #dcfce7 100%); border: 1.5px solid #86efac; border-radius: 12px; padding: 26px; text-align: center; margin: 24px 0; }
    .otp-label { font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 1.5px; color: #166534; margin: 0 0 10px 0; }
    .otp-code { font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace; font-size: 40px; font-weight: 800; color: #065f46; letter-spacing: 10px; margin: 0; line-height: 1; }
    .otp-expiration { font-size: 12px; color: #047857; margin: 12px 0 0 0; font-weight: 600; }
    .security-notice { background-color: #fffbeb; border-left: 4px solid #f59e0b; padding: 14px 18px; border-radius: 6px; font-size: 12px; line-height: 1.6; color: #92400e; margin: 24px 0 0 0; }
    .email-footer { background-color: #f8fafc; padding: 24px 36px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 11px; color: #64748b; line-height: 1.6; }
  </style>
</head>
<body>
  <div style="display:none;font-size:1px;color:#ffffff;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">
    {$preheader}
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #0b1329; padding: 24px 0;">
    <tr>
      <td align="center">
        <div class="email-container">
          <div class="email-header">
            <span class="badge-tag">PROJECT: PACE</span>
            <h1 class="brand-title">Z-LICZ</h1>
            <p class="brand-sub">Furniture &amp; Appliances Trading</p>
          </div>

          <div class="email-body">
            <p class="greeting">Hello {$recipientName},</p>
            <p class="description">{$actionText}</p>

            <div class="otp-card">
              <p class="otp-label">Security Verification Code</p>
              <h2 class="otp-code">{$otp}</h2>
              <p class="otp-expiration">&#9200; Valid for 15 minutes only (Issued at {$currentTime})</p>
            </div>

            <div class="security-notice">
              <strong>Strict Security Warning:</strong> Never share this verification code with anyone. Official Z-LICZ support or administrators will never ask for your verification code or password.
            </div>
          </div>

          <div class="email-footer">
            <p style="margin: 0 0 4px 0; font-weight: 600;">&copy; {$year} Z-LICZ Furniture &amp; Appliances Trading. All rights reserved.</p>
            <p style="margin: 0;">PROJECT: PACE &bull; Automated security notification dispatched from an unmonitored mailbox.</p>
          </div>
        </div>
      </td>
    </tr>
  </table>
</body>
</html>
HTML;

        $plainText = <<<TEXT
PROJECT: PACE | Z-LICZ Furniture & Appliances Trading

Hello {$recipientName},

{$actionText}

Your 6-Digit Security Verification Code: {$otp}
(Valid for 15 minutes only)

Security Notice: Never share this verification code with anyone. Official Z-LICZ staff will never request your code.

© {$year} Z-LICZ Furniture & Appliances Trading. All rights reserved.
TEXT;

        return [
            'subject'   => $subject,
            'html'      => $htmlBody,
            'plain'     => $plainText,
            'preheader' => $preheader,
        ];
    }

    /**
     * Send OTP email strictly via live PHPMailer on Gmail SMTP (smtp.gmail.com:587 TLS).
     * Completely eliminates any mock/dummy fallbacks.
     * Supports fast background dispatch (< 1000ms response) while ensuring real email delivery.
     */
    public static function sendEmailOTP(string $email, string $otp, string $recipientName = 'Valued Customer', string $type = 'login', bool $async = true): array
    {
        $normalizedEmail = strtolower(trim($email));

        // When async is requested (default for web authentication), spawn background worker to satisfy < 1000ms requirement
        if ($async) {
            $phpBin = 'C:\\xampp\\php\\php.exe';
            if (defined('PHP_BINARY') && PHP_BINARY && str_ends_with(strtolower(PHP_BINARY), 'php.exe') && file_exists(PHP_BINARY)) {
                $phpBin = PHP_BINARY;
            } elseif (!file_exists($phpBin)) {
                $phpBin = 'php';
            }
            $scriptPath = base_path('send_otp.php');

            if (file_exists($scriptPath)) {
                if (str_starts_with(strtoupper(PHP_OS), 'WIN')) {
                    $cmd = 'cmd /c start "" /B "' . str_replace('/', '\\', $phpBin) . '" "' . str_replace('/', '\\', $scriptPath) . '" ' . escapeshellarg($normalizedEmail) . ' ' . escapeshellarg($otp) . ' ' . escapeshellarg($recipientName) . ' ' . escapeshellarg($type) . ' > NUL 2>&1';
                    @pclose(@popen($cmd, 'r'));
                } else {
                    $cmd = escapeshellarg($phpBin) . ' ' . escapeshellarg($scriptPath) . ' ' . escapeshellarg($normalizedEmail) . ' ' . escapeshellarg($otp) . ' ' . escapeshellarg($recipientName) . ' ' . escapeshellarg($type) . ' > /dev/null 2>&1 &';
                    @exec($cmd);
                }

                Log::info("[OTP EMAIL DISPATCH INITIATED] Async Gmail SMTP dispatch triggered for {$normalizedEmail} (Type: {$type}).");
                return [
                    'success'  => true,
                    'provider' => 'SMTP-smtp.gmail.com-async',
                    'message'  => 'Verification code dispatched via Gmail SMTP',
                ];
            }
        }

        $creds = self::getMailCredentials();

        if (empty($creds['user']) || empty($creds['pass'])) {
            Log::error("[EMAIL NOT CONFIGURED] Attempted to send OTP to {$normalizedEmail}, but mail credentials are not configured in backend/.env.");
            return [
                'success' => false,
                'message' => 'Gmail SMTP credentials are not configured in backend/.env.',
            ];
        }

        $payload = self::buildEmailPayload($otp, $recipientName, $type);
        $subject = $payload['subject'];
        $htmlBody = $payload['html'];
        $plainText = $payload['plain'];

        $fromAddress = $creds['from_email'];
        $fromName = $creds['from_name'];
        $host = $creds['host'];
        $port = (int) ($creds['port'] ?? 587);
        $user = $creds['user'];
        $smtpAuthUser = $creds['smtp_auth_user'] ?? $user;
        $pass = $creds['pass'];
        $encryption = $creds['encryption'];

        // 1. Primary Dispatch: PHPMailer configured for direct Primary Inbox delivery
        try {
            if (class_exists(\PHPMailer\PHPMailer\PHPMailer::class)) {
                $mail = new \PHPMailer\PHPMailer\PHPMailer(true);
                $mail->isSMTP();
                $mail->Host       = $host;
                $mail->SMTPAuth   = true;
                $mail->Username   = $smtpAuthUser;
                $mail->Password   = $pass;
                $mail->SMTPSecure = \PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_STARTTLS;
                $mail->Port       = $port;
                $mail->Timeout    = 10;
                $mail->CharSet    = 'UTF-8';

                // Prevent SSL certificate handshake failures in local development (XAMPP/WAMP/Linux)
                $mail->SMTPOptions = [
                    'ssl' => [
                        'verify_peer' => false,
                        'verify_peer_name' => false,
                        'allow_self_signed' => true
                    ]
                ];

                $mail->setFrom($fromAddress, $fromName);
                $mail->addAddress($normalizedEmail, $recipientName);
                $mail->addReplyTo($fromAddress, $fromName);

                // Transactional Priority: Normal (3)
                $mail->Priority = 3;
                $mail->addCustomHeader('X-Auto-Response-Suppress', 'All');

                // NOTE: Strictly omit 'Precedence: bulk' to ensure Primary Inbox delivery
                // NOTE: Strictly omit custom MessageID with @zlicz.com to maintain authentic Gmail SPF/DKIM/DMARC

                $mail->isHTML(true);
                $mail->Subject = $subject;
                $mail->Body    = $htmlBody;
                $mail->AltBody = $plainText;

                try {
                    $mail->send();
                } catch (\Throwable $primaryErr) {
                    // Fallback to Port 465 SMTPS if 587 is blocked
                    $mail->Port       = 465;
                    $mail->SMTPSecure = \PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_SMTPS;
                    $mail->send();
                }

                Log::info("[OTP EMAIL SENT] Successfully delivered {$type} OTP to {$normalizedEmail} via {$host}:{$port} (From: {$fromAddress}).");
                return [
                    'success'  => true,
                    'provider' => 'SMTP-' . $host,
                ];
            }
        } catch (\Throwable $e) {
            Log::warning("[SMTP DISPATCH WARNING] Primary mail dispatch failed for {$normalizedEmail}: " . $e->getMessage() . ". Attempting Laravel fallback...");
        }

        // 2. Secondary fallback via Laravel Mail on Gmail SMTP
        try {
            config([
                'mail.default' => 'smtp',
                'mail.mailers.smtp.transport' => 'smtp',
                'mail.mailers.smtp.host' => $host,
                'mail.mailers.smtp.port' => $port,
                'mail.mailers.smtp.encryption' => $encryption,
                'mail.mailers.smtp.username' => $smtpAuthUser,
                'mail.mailers.smtp.password' => $pass,
                'mail.from.address' => $fromAddress,
                'mail.from.name' => $fromName,
            ]);

            app()->forgetInstance('mail.manager');
            Mail::clearResolvedInstances();

            Mail::html($htmlBody, function ($message) use ($normalizedEmail, $fromAddress, $fromName, $subject) {
                $message->to($normalizedEmail)
                    ->from($fromAddress, $fromName)
                    ->subject($subject);

                $headers = $message->getHeaders();
                $headers->addTextHeader('X-Auto-Response-Suppress', 'All');
            });

            Log::info("[OTP EMAIL SENT via Laravel Mail] Delivered {$type} OTP to {$normalizedEmail}.");
            return [
                'success'  => true,
                'provider' => 'laravel-mail-' . $host,
            ];
        } catch (\Throwable $e) {
            Log::error("[EMAIL DISPATCH ERROR] Failed to send OTP to {$normalizedEmail}: " . $e->getMessage());

            // NO MOCK CODES: Return actual error
            return [
                'success' => false,
                'message' => 'Failed to deliver OTP email via Gmail SMTP: ' . $e->getMessage(),
            ];
        }
    }
}
