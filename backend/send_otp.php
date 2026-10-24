<?php
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, Accept");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_once "db.php";
require_once "vendor/autoload.php";

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception;

date_default_timezone_set('Asia/Manila');

function sendOTPEmail($email, $otp, $name, $type = 'login') {
    $mail = new PHPMailer(true);
    $mailConfig = getMailConfig();

    try {
        $mail->isSMTP();
        $mail->Host       = $mailConfig['host'];
        $mail->SMTPAuth   = true;
        $mail->Username   = $mailConfig['username'];
        $mail->Password   = $mailConfig['password'];
        $mail->SMTPSecure = ($mailConfig['encryption'] === 'ssl' || (int)$mailConfig['port'] === 465)
            ? PHPMailer::ENCRYPTION_SMTPS
            : PHPMailer::ENCRYPTION_STARTTLS;
        $mail->Port       = (int) $mailConfig['port'];
        $mail->Timeout    = 20;
        $mail->CharSet    = 'UTF-8';

        // Consistent sender information
        $mail->setFrom($mailConfig['from_email'], $mailConfig['from_name']);
        $mail->addAddress($email, $name);
        $mail->addReplyTo($mailConfig['from_email'], $mailConfig['from_name']);

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
        $mail->Priority = 3; // Normal Priority

        $subject = 'Your Z-LICZ verification code';
        $year = date('Y');
        $preheader = "Your single-use security code is {$otp}. It will expire in 15 minutes.";

        $htmlBody = <<<HTML
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{$subject}</title>
  <style>
    body { margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
    .email-container { max-width: 560px; margin: 30px auto; background-color: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; }
    .email-header { background-color: #064e3b; padding: 26px 32px; text-align: left; }
    .brand-title { color: #ffffff; font-size: 20px; font-weight: 700; margin: 0; }
    .brand-sub { color: #a7f3d0; font-size: 12px; margin: 4px 0 0 0; text-transform: uppercase; letter-spacing: 1px; }
    .email-body { padding: 34px 32px; }
    .greeting { font-size: 16px; font-weight: 600; color: #0f172a; margin: 0 0 14px 0; }
    .description { font-size: 14px; line-height: 1.6; color: #334155; margin: 0 0 24px 0; }
    .otp-card { background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 10px; padding: 22px; text-align: center; margin: 24px 0; }
    .otp-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #166534; margin: 0 0 8px 0; }
    .otp-code { font-family: 'SFMono-Regular', Consolas, Menlo, monospace; font-size: 36px; font-weight: 700; color: #065f46; letter-spacing: 8px; margin: 0; }
    .otp-expiration { font-size: 12px; color: #64748b; margin: 8px 0 0 0; }
    .notice { font-size: 12px; line-height: 1.6; color: #64748b; margin: 24px 0 0 0; border-top: 1px solid #f1f5f9; padding-top: 16px; }
    .email-footer { background-color: #f8fafc; padding: 20px 32px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 11px; color: #94a3b8; }
  </style>
</head>
<body>
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
            <p class="greeting">Hello {$name},</p>
            <p class="description">A verification code was requested for your Z-LICZ account. Please enter this code to complete verification:</p>
            <div class="otp-card">
              <p class="otp-label">Security Verification Code</p>
              <h2 class="otp-code">{$otp}</h2>
              <p class="otp-expiration">Valid for 15 minutes</p>
            </div>
            <p class="notice">If you did not request this verification code, please ignore this email. Never disclose this code to anyone.</p>
          </div>
          <div class="email-footer">
            <p style="margin:0 0 4px 0;">&copy; {$year} Z-LICZ Furniture &amp; Appliances Trading. All rights reserved.</p>
            <p style="margin:0;">Automated operational notification sent from an unmonitored mailbox.</p>
          </div>
        </div>
      </td>
    </tr>
  </table>
</body>
</html>
HTML;

        $mail->isHTML(true);
        $mail->Subject = $subject;
        $mail->Body    = $htmlBody;
        $mail->AltBody = "Z-LICZ Furniture & Appliances Trading\n\nHello {$name},\n\nYour security verification code is: {$otp}\nValid for 15 minutes.\n\nIf you did not request this code, please ignore this email.";

        $mail->send();
        return true;
    } catch (Exception $e) {
        error_log("Mailer Error: {$mail->ErrorInfo} | " . $e->getMessage());
        return false;
    }
}

try {
    $input = json_decode(file_get_contents('php://input'), true);

    if (empty($input)) {
        $input = $_POST;
    }

    if (empty($input)) {
        throw new Exception("Walay nadawat nga data.");
    }

    $user_email = trim($input['user_email'] ?? ($input['email'] ?? ($input['target'] ?? ($input['username'] ?? ''))));

    if (empty($user_email)) {
        throw new Exception("Kinahanglan ang email address.");
    }

    // 1. Pagsusi sa residents table kon aktibo ang account
    $user = null;
    $recipientName = 'Valued Customer';
    $userId = null;

    try {
        $sqlResidents = "SELECT id, firstName, email, mobile_account_status 
                         FROM residents 
                         WHERE email = ? AND mobile_account_status = 'active' AND has_mobile_account = 1 
                         LIMIT 1";
        $stmtResidents = $pdo->prepare($sqlResidents);
        $stmtResidents->execute([$user_email]);
        $user = $stmtResidents->fetch(PDO::FETCH_ASSOC);
        if ($user) {
            $recipientName = $user['firstName'] ?? 'Valued Customer';
            $userId = $user['id'];
        }
    } catch (\Throwable $e) {}

    // 2. Pagsusi sa users / customers / employees table kon wala sa residents
    if (!$user) {
        $stmtUser = $pdo->prepare("
            SELECT user_id, username, email, role, is_active 
            FROM users 
            WHERE (LOWER(email) = LOWER(?) OR LOWER(username) = LOWER(?)) 
              AND (is_active = 1 OR is_active IS NULL)
            LIMIT 1
        ");
        $stmtUser->execute([$user_email, $user_email]);
        $uRow = $stmtUser->fetch(PDO::FETCH_ASSOC);

        if ($uRow) {
            $user = $uRow;
            $userId = $uRow['user_id'];
            $user_email = !empty($uRow['email']) ? $uRow['email'] : $user_email;
            $recipientName = $uRow['username'];

            // Fetch linked customer name if any
            $stmtCust = $pdo->prepare("SELECT first_name, last_name, email FROM customers WHERE customer_id = (SELECT customer_id FROM users WHERE user_id = ?) LIMIT 1");
            $stmtCust->execute([$uRow['user_id']]);
            $cRow = $stmtCust->fetch(PDO::FETCH_ASSOC);
            if ($cRow && !empty($cRow['first_name'])) {
                $recipientName = trim($cRow['first_name'] . ' ' . ($cRow['last_name'] ?? ''));
                if (!empty($cRow['email'])) $user_email = $cRow['email'];
            }

            // Fetch linked employee name if role is Employee
            if (($uRow['role'] ?? '') === 'Employee') {
                try {
                    $stmtEmp = $pdo->prepare("SELECT first_name, last_name, email FROM employees WHERE employee_id = (SELECT employee_id FROM users WHERE user_id = ?) LIMIT 1");
                    $stmtEmp->execute([$uRow['user_id']]);
                    $eRow = $stmtEmp->fetch(PDO::FETCH_ASSOC);
                    if ($eRow && !empty($eRow['first_name'])) {
                        $recipientName = trim($eRow['first_name'] . ' ' . ($eRow['last_name'] ?? ''));
                        if (!empty($eRow['email'])) $user_email = $eRow['email'];
                    }
                } catch (\Throwable $e) {}
            }
        }
    }

    // Allow new customer registration check
    $isRegistration = isset($input['type']) && $input['type'] === 'registration';
    if (!$user && !$isRegistration) {
        throw new Exception("Walay nakit-an nga aktibong account gamit kining email.");
    }

    if (empty($user_email) || !filter_var($user_email, FILTER_VALIDATE_EMAIL)) {
        // If username was provided without email, fallback for admin
        if ($user && in_array(strtolower($user['username'] ?? ''), ['admin', 'administrator'])) {
            $mailCfg = getMailConfig();
            $user_email = $mailCfg['username'];
        } else {
            throw new Exception("Kinahanglan ang balidong email address.");
        }
    }

    $clientIp = $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1';

    // 1. Rate Limiting Check: 60-second cooldown per email
    try {
        $stmtCooldown = $pdo->prepare("SELECT created_at FROM otps WHERE email = ? ORDER BY id DESC LIMIT 1");
        $stmtCooldown->execute([$user_email]);
        $lastOtp = $stmtCooldown->fetch(PDO::FETCH_ASSOC);
        if ($lastOtp && !empty($lastOtp['created_at'])) {
            $lastTime = strtotime($lastOtp['created_at']);
            $elapsed = time() - $lastTime;
            if ($elapsed < 60) {
                $rem = 60 - $elapsed;
                http_response_code(429);
                echo json_encode([
                    "success"           => false,
                    "message"           => "Please wait {$rem} seconds before requesting another verification code.",
                    "remaining_seconds" => $rem
                ]);
                exit();
            }
        }
    } catch (\Throwable $e) {}

    // 2. Rate Limiting Check: Max 5 OTPs per hour per email
    try {
        $stmtHourly = $pdo->prepare("SELECT COUNT(*) as cnt FROM otps WHERE email = ? AND created_at >= (NOW() - INTERVAL 1 HOUR)");
        $stmtHourly->execute([$user_email]);
        $hourly = $stmtHourly->fetch(PDO::FETCH_ASSOC);
        if ($hourly && (int)$hourly['cnt'] >= 5) {
            http_response_code(429);
            echo json_encode([
                "success"           => false,
                "message"           => "Too many verification requests for this email address. Please try again in 1 hour.",
                "remaining_seconds" => 300
            ]);
            exit();
        }
    } catch (\Throwable $e) {}

    // 3. Rate Limiting Check: Max 10 requests per 15 minutes per IP
    try {
        $stmtIp = $pdo->prepare("SELECT COUNT(*) as cnt FROM otps WHERE ip_address = ? AND created_at >= (NOW() - INTERVAL 15 MINUTE)");
        $stmtIp->execute([$clientIp]);
        $ipRow = $stmtIp->fetch(PDO::FETCH_ASSOC);
        if ($ipRow && (int)$ipRow['cnt'] >= 10) {
            http_response_code(429);
            echo json_encode([
                "success"           => false,
                "message"           => "Too many verification requests from this network. Please wait a few minutes before trying again.",
                "remaining_seconds" => 600
            ]);
            exit();
        }
    } catch (\Throwable $e) {}

    // 4. Reuse active unexpired OTP if generated within the last 2 minutes
    $otp_code = null;
    $expiry_time = date("Y-m-d H:i:s", time() + (15 * 60));

    try {
        $stmtRecent = $pdo->prepare("
            SELECT otp_code, expiry_time FROM otps 
            WHERE email = ? AND used = 0 AND expiry_time > NOW() AND created_at >= (NOW() - INTERVAL 2 MINUTE) 
            ORDER BY id DESC LIMIT 1
        ");
        $stmtRecent->execute([$user_email]);
        $recentRow = $stmtRecent->fetch(PDO::FETCH_ASSOC);
        if ($recentRow && !empty($recentRow['otp_code'])) {
            $otp_code = (string) $recentRow['otp_code'];
            $expiry_time = $recentRow['expiry_time'];
        }
    } catch (\Throwable $e) {}

    // Generate fresh code if no recent active code found
    if (!$otp_code) {
        $otp_code = sprintf("%06d", mt_rand(1, 999999));

        // Pagsulod sa bag-ong OTP sa password_reset_otp
        try {
            $delete_sql = "DELETE FROM password_reset_otp WHERE email = ?";
            $delete_stmt = $pdo->prepare($delete_sql);
            $delete_stmt->execute([$user_email]);

            $insert_sql = "INSERT INTO password_reset_otp (email, otp_code, expiry_time, used, created_at, updated_at) VALUES (?, ?, ?, 0, NOW(), NOW())";
            $insert_stmt = $pdo->prepare($insert_sql);
            $insert_stmt->execute([$user_email, $otp_code, $expiry_time]);
        } catch (\Throwable $e) {}

        // Pagsulod usab sa otps table
        try {
            $stmtOtps = $pdo->prepare("
                INSERT INTO otps (user_id, email, otp_code, type, used, expiry_time, ip_address, user_agent, created_at, updated_at)
                VALUES (?, ?, ?, 'login', 0, ?, ?, ?, NOW(), NOW())
            ");
            $stmtOtps->execute([
                $userId,
                $user_email,
                $otp_code,
                $expiry_time,
                $clientIp,
                $_SERVER['HTTP_USER_AGENT'] ?? null,
            ]);
        } catch (\Throwable $e) {}

        // Update usab sa users table para sa 100% synchronization
        if ($userId) {
            try {
                $stmtSync = $pdo->prepare("UPDATE users SET otp_code = ?, otp_expires_at = ?, otp_created_at = NOW() WHERE user_id = ?");
                $stmtSync->execute([$otp_code, $expiry_time, $userId]);
            } catch (\Throwable $e) {}
        }
    }

    // Send OTP strictly via deliverability-optimized PHPMailer
    $email_sent = sendOTPEmail($user_email, $otp_code, $recipientName);

    $parts = explode('@', $user_email, 2);
    $masked = strlen($parts[0]) > 2
        ? substr($parts[0], 0, 1) . '***' . substr($parts[0], -1)
        : substr($parts[0], 0, 1) . '***';
    $maskedEmail = "{$masked}@{$parts[1]}";

    if ($email_sent) {
        echo json_encode([
            "success"            => true,
            "message"            => "A 6-digit verification code has been dispatched to your Gmail inbox.",
            "email"              => $user_email,
            "masked_email"       => $maskedEmail,
            "recipient_email"    => $maskedEmail,
            "masked_target"      => $maskedEmail,
            "expires_in_seconds" => 900,
            "cooldown_seconds"   => 60,
            "user_id"            => $userId
        ]);
    } else {
        throw new Exception("Failed to deliver OTP verification email via Gmail SMTP. Please verify your email address.");
    }

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        "success" => false, 
        "message" => $e->getMessage()
    ]);
}
