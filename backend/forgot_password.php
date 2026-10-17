<?php
if (!headers_sent()) {
    @header('Content-Type: application/json; charset=utf-8');
    @header('Access-Control-Allow-Origin: *');
    @header('Access-Control-Allow-Methods: POST, OPTIONS');
    @header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
}

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method Not Allowed. Please use POST.']);
    exit;
}

require_once __DIR__ . '/../vendor/autoload.php';
require_once __DIR__ . '/../db_connect.php';

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception;

try {
    $rawInput = file_get_contents('php://input');
    $data = json_decode($rawInput, true) ?: $_POST;

    $email = trim($data['email'] ?? $data['target'] ?? '');

    if (empty($email)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Email address is required.']);
        exit;
    }

    $pdo = getDbConnection();

    // Check residents table if it exists, otherwise check users
    $userFound = null;
    $targetTable = 'users';

    try {
        $checkResidents = $pdo->query("SHOW TABLES LIKE 'residents'")->rowCount() > 0;
        if ($checkResidents) {
            $stmt = $pdo->prepare("SELECT * FROM residents WHERE email = :email AND mobile_account_status = 'active' LIMIT 1");
            $stmt->execute([':email' => $email]);
            $res = $stmt->fetch();
            if ($res) {
                $userFound = $res;
                $targetTable = 'residents';
            }
        }
    } catch (\Throwable $e) {}

    if (!$userFound) {
        $stmt = $pdo->prepare("
            SELECT user_id, username, email, is_active 
            FROM users 
            WHERE (LOWER(email) = LOWER(:email) OR LOWER(username) = LOWER(:uname))
            AND (is_active = 1 OR is_active IS NULL)
            LIMIT 1
        ");
        $stmt->execute([':email' => $email, ':uname' => $email]);
        $userFound = $stmt->fetch();
        $targetTable = 'users';
    }

    if (!$userFound) {
        http_response_code(404);
        echo json_encode([
            'success' => false,
            'message' => 'No active account found registered with this email address.'
        ]);
        exit;
    }

    $recipientEmail = !empty($userFound['email']) ? $userFound['email'] : $email;
    $recipientName = $userFound['username'] ?? ($userFound['first_name'] ?? 'Valued Customer');

    // Generate secure 6-digit cryptographic OTP code
    $otp = (string) random_int(100000, 999999);
    $expiryTime = date('Y-m-d H:i:s', time() + (15 * 60)); // 15 minutes expiration

    // Clear old tokens and store new OTP in database
    if ($targetTable === 'users') {
        $stmtUpdate = $pdo->prepare("
            UPDATE users 
            SET otp_code = :otp, 
                otp_expires_at = :expires, 
                otp_created_at = NOW() 
            WHERE user_id = :uid
        ");
        $stmtUpdate->execute([
            ':otp'     => $otp,
            ':expires' => $expiryTime,
            ':uid'     => $userFound['user_id']
        ]);
    } else {
        // Residents table token update if applicable
        $stmtUpdate = $pdo->prepare("
            UPDATE residents 
            SET otp_code = :otp, 
                expiry_time = :expires 
            WHERE id = :id
        ");
        $stmtUpdate->execute([
            ':otp'     => $otp,
            ':expires' => $expiryTime,
            ':id'      => $userFound['id']
        ]);
    }

    // Also update password_reset_tokens table if present
    try {
        $checkPr = $pdo->query("SHOW TABLES LIKE 'password_reset_tokens'")->rowCount() > 0;
        if ($checkPr) {
            $del = $pdo->prepare("DELETE FROM password_reset_tokens WHERE email = :email");
            $del->execute([':email' => $recipientEmail]);

            $ins = $pdo->prepare("INSERT INTO password_reset_tokens (email, token, created_at) VALUES (:email, :token, NOW())");
            $ins->execute([':email' => $recipientEmail, ':token' => $otp]);
        }
    } catch (\Throwable $e) {}

    // Dispatch cleanly styled HTML email using Gmail SMTP via PHPMailer
    $mailConfig = getMailConfig();

    if (empty($mailConfig['username']) || empty($mailConfig['password'])) {
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'message' => 'SMTP mail credentials are not configured in backend/.env.'
        ]);
        exit;
    }

    $mail = new PHPMailer(true);

    try {
        $mail->isSMTP();
        $mail->Host       = $mailConfig['host'];
        $mail->SMTPAuth   = true;
        $mail->Username   = $mailConfig['username'];
        $mail->Password   = $mailConfig['password'];
        $mail->SMTPSecure = PHPMailer::ENCRYPTION_STARTTLS;
        $mail->Port       = $mailConfig['port'];
        $mail->CharSet    = 'UTF-8';

        $mail->setFrom($mailConfig['from_email'], $mailConfig['from_name']);
        $mail->addAddress($recipientEmail, $recipientName);

        $mail->isHTML(true);
        $mail->Subject = "Z-LICZ Furniture & Appliances Trading: Password Recovery OTP Code [{$otp}]";

        $mail->Body = "
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset='utf-8'>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b; }
            .card { max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; padding: 32px; box-shadow: 0 4px 20px rgba(0,0,0,0.05); }
            .brand { font-size: 18px; font-weight: 800; color: #0f172a; margin-bottom: 24px; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 2px solid #58b947; padding-bottom: 12px; }
            .brand span { color: #58b947; }
            .otp-box { background: #f1f5f9; border: 2px dashed #94a3b8; border-radius: 12px; padding: 18px; text-align: center; margin: 24px 0; font-family: 'Courier New', monospace; font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #1e40af; }
            .notice { font-size: 13px; color: #64748b; line-height: 1.6; }
            .footer { margin-top: 28px; font-size: 11px; color: #94a3b8; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 16px; }
          </style>
        </head>
        <body>
          <div class='card'>
            <div class='brand'>Z-LICZ <span>Furniture & Appliances</span></div>
            <h2 style='font-size: 20px; font-weight: 700; margin-top: 0; color: #0f172a;'>Password Reset Request</h2>
            <p style='font-size: 14px; color: #475569;'>Hello <strong>" . htmlspecialchars($recipientName) . "</strong>,</p>
            <p style='font-size: 14px; color: #475569;'>We received a request to recover the password for your account. Please use the 6-digit verification code below to complete your password reset:</p>
            <div class='otp-box'>{$otp}</div>
            <div class='notice'>
              <p>• <strong>Validity:</strong> This code is valid for <strong>15 minutes</strong> and can only be used once.</p>
              <p>• <strong>Security:</strong> If you did not request a password reset, please ignore this email. Your current password remains safe and unchanged.</p>
            </div>
            <div class='footer'>
              &copy; " . date('Y') . " Z-LICZ Furniture & Appliances Trading. All rights reserved.
            </div>
          </div>
        </body>
        </html>
        ";

        $mail->AltBody = "Hello {$recipientName},\n\nYour 6-digit password reset OTP code is: {$otp}\n\nThis code is valid for 15 minutes.\n\nZ-LICZ Furniture & Appliances Trading";

        $mail->send();

        // Email masking for UI privacy
        $parts = explode('@', $recipientEmail);
        $namePart = $parts[0];
        $domain = $parts[1] ?? 'gmail.com';
        $maskedName = strlen($namePart) <= 2 ? $namePart . '***' : substr($namePart, 0, 1) . '***' . substr($namePart, -1);
        $maskedEmail = $maskedName . '@' . $domain;

        http_response_code(200);
        echo json_encode([
            'success'            => true,
            'message'            => "A 6-digit verification code has been dispatched to {$maskedEmail} via Gmail.",
            'masked_email'       => $maskedEmail,
            'expires_in_minutes' => 15,
        ]);

    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'message' => 'Unable to dispatch verification email via Gmail SMTP: ' . $mail->ErrorInfo
        ]);
    }

} catch (\Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Internal server error: ' . $e->getMessage()
    ]);
}
