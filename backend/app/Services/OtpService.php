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
            $resolvedUser = 'Z-LICZ@gmail.com';
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

        if (empty($resolvedPass)) {
            $resolvedPass = 'sziq apba sink lsch';
        }

        $fromAddress = self::getEnvValue('MAIL_FROM_ADDRESS', 'mail.from.address') ?: 'Z-LICZ@gmail.com';
        $fromName = self::getEnvValue('MAIL_FROM_NAME', 'mail.from.name', 'Z-LICZ Furniture & Appliances');

        // SMTP transport auth account:
        // Google SMTP handshake requires an active Google account that matches the Google App Password.
        // For branded alias Z-LICZ@gmail.com, route the underlying transport authentication to 35barangay@gmail.com
        // while preserving Z-LICZ@gmail.com as the From, Sender, and Reply-To address on every email.
        $smtpAuthUser = $resolvedUser;
        if (strcasecmp($smtpAuthUser, 'Z-LICZ@gmail.com') === 0 || empty($smtpAuthUser)) {
            $smtpAuthUser = self::getEnvValue('GMAIL_AUTH_ACCOUNT') ?: '35barangay@gmail.com';
        }

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
     * Get active reusable OTP or generate a secure new 6-digit code.
     * Reusing an active code issued within the last 2 minutes prevents spam heuristics
     * caused by generating and dispatching distinct random codes repeatedly.
     */
    public static function getOrCreateActiveOtp(int $userId, string $email, string $type, string $ip, ?string $userAgent): string
    {
        $normalizedEmail = strtolower(trim($email));

        // Check for active unexpired OTP created within the last 2 minutes
        $recent = DB::table('otps')
            ->where('user_id', $userId)
            ->where('type', $type)
            ->where('used', 0)
            ->where('expiry_time', '>', now())
            ->where('created_at', '>=', now()->subMinutes(2))
            ->orderByDesc('id')
            ->first();

        if ($recent && !empty($recent->otp_code)) {
            return (string) $recent->otp_code;
        }

        // Generate fresh 6-digit code
        $otp = (string) random_int(100000, 999999);

        DB::table('otps')->insert([
            'user_id'     => $userId,
            'email'       => $normalizedEmail,
            'otp_code'    => $otp,
            'type'        => $type,
            'used'        => 0,
            'expiry_time' => now()->addMinutes(15),
            'ip_address'  => $ip,
            'user_agent'  => $userAgent,
            'created_at'  => now(),
            'updated_at'  => now(),
        ]);

        return $otp;
    }

    /**
     * Build spam-resistant, deliverability-optimized email subjects and bodies.
     * Complies with Google & Yahoo 2024 Bulk Sender requirements and SpamAssassin heuristics:
     * - No raw OTP codes in the subject line (prevents automated spam flags)
     * - No spam trigger keywords (NO ALL-CAPS, NO "URGENT!", NO excessive punctuation)
     * - Hidden preheader preview text for clean mobile inbox view
     * - Balanced HTML/text ratio with standard web-safe fonts
     */
    public static function buildEmailPayload(string $otp, string $recipientName, string $type): array
    {
        $subject = match($type) {
            'registration'   => 'Complete your Z-LICZ account verification',
            'password_reset' => 'Reset your Z-LICZ account password',
            default          => 'Your Z-LICZ verification code'
        };

        $actionText = match($type) {
            'registration'   => 'Thank you for registering with Z-LICZ Furniture & Appliances. Please enter the security code below to confirm your account.',
            'password_reset' => 'We received a request to reset your password. Enter this single-use code to proceed with creating a new password.',
            default          => 'A sign-in request was initiated for your Z-LICZ account. Enter this single-use code to verify your identity.'
        };

        $year = date('Y');
        $preheader = "Your single-use security code is {$otp}. It will expire in 15 minutes.";

        $htmlBody = <<<HTML
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>{$subject}</title>
  <style>
    body { margin: 0; padding: 0; width: 100% !important; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; }
    table { border-collapse: collapse; }
    .email-container { max-width: 560px; margin: 32px auto; background-color: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; }
    .email-header { background-color: #064e3b; padding: 28px 32px; text-align: left; }
    .brand-title { color: #ffffff; font-size: 20px; font-weight: 700; margin: 0; letter-spacing: 0.5px; }
    .brand-sub { color: #a7f3d0; font-size: 12px; margin: 4px 0 0 0; text-transform: uppercase; letter-spacing: 1px; }
    .email-body { padding: 36px 32px; }
    .greeting { font-size: 16px; font-weight: 600; color: #0f172a; margin: 0 0 14px 0; }
    .description { font-size: 14px; line-height: 1.6; color: #334155; margin: 0 0 24px 0; }
    .otp-card { background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 10px; padding: 24px; text-align: center; margin: 24px 0; }
    .otp-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.2px; color: #166534; margin: 0 0 8px 0; }
    .otp-code { font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace; font-size: 36px; font-weight: 700; color: #065f46; letter-spacing: 8px; margin: 0; }
    .otp-expiration { font-size: 12px; color: #64748b; margin: 10px 0 0 0; }
    .notice { font-size: 12px; line-height: 1.6; color: #64748b; margin: 24px 0 0 0; border-top: 1px solid #f1f5f9; padding-top: 16px; }
    .email-footer { background-color: #f8fafc; padding: 20px 32px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 11px; color: #94a3b8; line-height: 1.5; }
  </style>
</head>
<body>
  <!-- Preheader preview text for email clients -->
  <div style="display:none;font-size:1px;color:#ffffff;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">
    {$preheader}
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8fafc; padding: 20px 0;">
    <tr>
      <td align="center">
        <div class="email-container">
          <div class="email-header">
            <h1 class="brand-title">Z-LICZ</h1>
            <p class="brand-sub">Furniture &amp; Appliances Trading</p>
          </div>

          <div class="email-body">
            <p class="greeting">Hello {$recipientName},</p>
            <p class="description">{$actionText}</p>

            <div class="otp-card">
              <p class="otp-label">Security Verification Code</p>
              <h2 class="otp-code">{$otp}</h2>
              <p class="otp-expiration">Expires in 15 minutes</p>
            </div>

            <p class="notice">
              If you did not request this verification code, please ignore this email or review your account credentials. For security, never forward or disclose this code to anyone.
            </p>
          </div>

          <div class="email-footer">
            <p style="margin: 0 0 6px 0;">&copy; {$year} Z-LICZ Furniture &amp; Appliances Trading. All rights reserved.</p>
            <p style="margin: 0;">This is an automated operational notification sent from an unmonitored mailbox.</p>
          </div>
        </div>
      </td>
    </tr>
  </table>
</body>
</html>
HTML;

        $plainText = <<<TEXT
Z-LICZ Furniture & Appliances Trading

Hello {$recipientName},

{$actionText}

Verification Code: {$otp}
(This single-use code is valid for 15 minutes)

If you did not request this verification code, please ignore this email. Never disclose this code to anyone.

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
     * Send OTP email with enterprise deliverability headers and multi-provider fallback.
     */
    public static function sendEmailOTP(string $email, string $otp, string $recipientName = 'Valued Customer', string $type = 'login'): array
    {
        $normalizedEmail = strtolower(trim($email));
        $creds = self::getMailCredentials();

        if (empty($creds['user']) || empty($creds['pass'])) {
            Log::error("[EMAIL NOT CONFIGURED] Attempted to send OTP to {$normalizedEmail}, but mail credentials are not configured in backend/.env.");
            if (config('app.debug') || app()->environment('local')) {
                Log::warning("[DEV OTP FALLBACK] Mail credentials missing. Local OTP for {$normalizedEmail} is [ {$otp} ].");
                return [
                    'success'  => true,
                    'provider' => 'dev-local-fallback',
                    'dev_otp'  => $otp,
                ];
            }
            return [
                'success' => false,
                'message' => 'Email service credentials are not configured in backend/.env.',
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

        $uniqueMessageId = sprintf('%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
            mt_rand(0, 0xffff), mt_rand(0, 0xffff),
            mt_rand(0, 0xffff),
            mt_rand(0, 0x0fff) | 0x4000,
            mt_rand(0, 0x3fff) | 0x8000,
            mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff)
        );

        $domain = parse_url(self::getEnvValue('APP_URL') ?: 'http://localhost', PHP_URL_HOST) ?: 'zlicz.com';

        // 1. Primary Dispatch: PHPMailer with RFC-3834 / anti-spam headers
        try {
            if (class_exists(\PHPMailer\PHPMailer\PHPMailer::class)) {
                $mail = new \PHPMailer\PHPMailer\PHPMailer(true);
                $mail->isSMTP();
                $mail->Host       = $host;
                $mail->SMTPAuth   = true;
                $mail->Username   = $smtpAuthUser;
                $mail->Password   = $pass;
                $mail->SMTPSecure = ($encryption === 'ssl' || $port === 465) 
                    ? \PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_SMTPS 
                    : \PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_STARTTLS;
                $mail->Port       = $port;
                $mail->Timeout    = 15;
                $mail->CharSet    = 'UTF-8';

                $mail->setFrom($fromAddress, $fromName);
                $mail->addAddress($normalizedEmail, $recipientName);
                $mail->addReplyTo($fromAddress, $fromName);

                // Critical Deliverability Headers:
                $mail->MessageID = "<{$uniqueMessageId}@{$domain}>";
                $mail->addCustomHeader('Auto-Submitted', 'auto-generated');
                $mail->addCustomHeader('X-Auto-Response-Suppress', 'All');
                $mail->addCustomHeader('X-Entity-Ref-ID', $uniqueMessageId);
                $mail->addCustomHeader('Precedence', 'bulk');
                $mail->Priority = 3; // Normal Priority (High Priority triggers spam filters)

                $mail->isHTML(true);
                $mail->Subject = $subject;
                $mail->Body    = $htmlBody;
                $mail->AltBody = $plainText;

                $mail->send();

                Log::info("[OTP EMAIL SENT] Successfully delivered {$type} OTP to {$normalizedEmail} via {$host}:{$port} (From: {$fromAddress}).");
                return [
                    'success'  => true,
                    'provider' => 'SMTP-' . $host,
                ];
            }
        } catch (\Throwable $e) {
            Log::warning("[SMTP DISPATCH WARNING] Primary mail dispatch failed for {$normalizedEmail}: " . $e->getMessage() . ". Attempting Laravel fallback...");
        }

        // 2. Secondary fallback via Laravel Mail
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

            Mail::html($htmlBody, function ($message) use ($normalizedEmail, $fromAddress, $fromName, $subject, $uniqueMessageId) {
                $message->to($normalizedEmail)
                    ->from($fromAddress, $fromName)
                    ->subject($subject);

                $headers = $message->getHeaders();
                $headers->addTextHeader('Auto-Submitted', 'auto-generated');
                $headers->addTextHeader('X-Auto-Response-Suppress', 'All');
                $headers->addTextHeader('X-Entity-Ref-ID', $uniqueMessageId);
                $headers->addTextHeader('Precedence', 'bulk');
            });

            Log::info("[OTP EMAIL SENT via Laravel Mail] Delivered {$type} OTP to {$normalizedEmail}.");
            return [
                'success'  => true,
                'provider' => 'laravel-mail-' . $host,
            ];
        } catch (\Throwable $e) {
            Log::error("[EMAIL DISPATCH ERROR] Failed to send OTP to {$normalizedEmail}: " . $e->getMessage());

            if (config('app.debug') || app()->environment('local')) {
                Log::warning("[DEV OTP FALLBACK] Live SMTP dispatch failed ({$e->getMessage()}). Local OTP for {$normalizedEmail} is [ {$otp} ] (Type: {$type}). Allowing authentication to proceed.");
                return [
                    'success'  => true,
                    'provider' => 'dev-local-fallback',
                    'dev_otp'  => $otp,
                    'message'  => 'Verification code dispatched via local dev fallback',
                ];
            }

            return [
                'success' => false,
                'message' => 'Failed to deliver OTP email: ' . $e->getMessage(),
            ];
        }
    }
}
