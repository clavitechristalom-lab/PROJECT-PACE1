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

function sendOTPEmail($email, $otp, $name) {
    $mail = new PHPMailer(true);
    $mailConfig = getMailConfig();

    try {
        // Real Gmail SMTP Server Settings
        $mail->isSMTP();
        $mail->Host       = $mailConfig['host'];
        $mail->SMTPAuth   = true;
        $mail->Username   = $mailConfig['username'];
        $mail->Password   = $mailConfig['password'];
        $mail->SMTPSecure = PHPMailer::ENCRYPTION_STARTTLS;
        $mail->Port       = $mailConfig['port'];
        $mail->Timeout    = 20;
        $mail->CharSet    = 'UTF-8';

        // Recipients
        $mail->setFrom($mailConfig['from_email'], $mailConfig['from_name']);
        $mail->addAddress($email, $name);
        $mail->addReplyTo($mailConfig['from_email'], $mailConfig['from_name']);

        // Email Content
        $mail->isHTML(true);
        $mail->Subject = 'PROJECT: PACE Z-LICZ - Security Verification OTP';

        $year = date('Y');
        $mail->Body = "
        <html>
        <head>
            <title>PROJECT: PACE Z-LICZ OTP Verification</title>
            <style>
                body { font-family: Arial, sans-serif; background-color: #f4f4f4; padding: 20px; }
                .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 10px rgba(0,0,0,0.1); }
                .header { background: #0f1f3d; color: #ffffff; padding: 25px; text-align: center; }
                .header h2 { margin: 0; color: #22c55e; letter-spacing: 1px; font-size: 24px; }
                .content { padding: 30px; color: #333333; }
                .otp-code { 
                    font-size: 36px; 
                    font-weight: bold; 
                    text-align: center; 
                    color: #1a3a6b;
                    background: #f8fafc;
                    padding: 15px;
                    border-radius: 6px;
                    margin: 25px 0;
                    letter-spacing: 8px;
                    border: 1px dashed #cbd5e1;
                }
                .footer { background: #f1f5f9; padding: 15px; text-align: center; color: #64748b; font-size: 12px; }
            </style>
        </head>
        <body>
            <div class='container'>
                <div class='header'>
                    <h2>PROJECT: PACE &bull; Z-LICZ</h2>
                    <p style='margin: 6px 0 0; color: #94a3b8; font-size: 13px; text-transform: uppercase; letter-spacing: 1px;'>Furniture & Appliances Trading</p>
                </div>
                <div class='content'>
                    <h3>Authentication OTP Code</h3>
                    <p>Hello <b>" . htmlspecialchars($name) . "</b>,</p>
                    <p>Your requested verification code for Z-LICZ account access is:</p>
                    
                    <div class='otp-code'>{$otp}</div>
                    
                    <p>This OTP code will expire in <b>15 minutes</b>.</p>
                    <p>If you did not initiate this request, please ignore this email.</p>
                </div>
                <div class='footer'>
                    <p>&copy; {$year} Z-LICZ Furniture & Appliances Trading. All rights reserved.</p>
                </div>
            </div>
        </body>
        </html>
        ";
        $mail->AltBody = "Z-LICZ Furniture & Appliances Trading\n\nHello {$name},\nYour requested OTP verification code is: {$otp}\nValid for 15 minutes only.\nDo not share this code.";

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

    // Paghimo og 6-digit OTP ug 15-minutos nga expiration
    $otp_code = sprintf("%06d", mt_rand(1, 999999));
    $expiry_time = date("Y-m-d H:i:s", time() + (15 * 60));

    // Pagtangtang sa daang OTP para sa maong email sa password_reset_otp ug otps
    try {
        $delete_sql = "DELETE FROM password_reset_otp WHERE email = ?";
        $delete_stmt = $pdo->prepare($delete_sql);
        $delete_stmt->execute([$user_email]);
    } catch (\Throwable $e) {}

    // Pagsulod sa bag-ong OTP sa password_reset_otp
    try {
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
            $_SERVER['REMOTE_ADDR'] ?? null,
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

    // Send OTP strictly via live Gmail SMTP
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
