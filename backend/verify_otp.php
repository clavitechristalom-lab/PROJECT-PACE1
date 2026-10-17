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
date_default_timezone_set('Asia/Manila');

try {
    $input = json_decode(file_get_contents('php://input'), true);

    if (empty($input)) {
        $input = $_POST;
    }

    if (empty($input)) {
        throw new Exception("Walay nadawat nga data.");
    }

    $user_email = trim($input['user_email'] ?? ($input['email'] ?? ($input['target'] ?? ($input['username'] ?? ''))));
    $otp_code = preg_replace('/\D/', '', trim((string)($input['otp_code'] ?? ($input['otp'] ?? ''))));

    if (empty($user_email) || empty($otp_code)) {
        throw new Exception("Kinahanglan ang email ug OTP code.");
    }

    // 1. Susiha ang OTP nga wala pa magamit ug wala pa na-expire sa password_reset_otp
    $otp_record = null;
    $recordType = 'password_reset_otp';

    try {
        $sql = "SELECT * FROM password_reset_otp 
                WHERE email = ? AND otp_code = ? AND used = 0 AND expiry_time > NOW()
                ORDER BY id DESC LIMIT 1";
        $stmt = $pdo->prepare($sql);
        $stmt->execute([$user_email, $otp_code]);
        $otp_record = $stmt->fetch(PDO::FETCH_ASSOC);
    } catch (\Throwable $e) {}

    // 2. Susiha usab sa otps table kon wala sa password_reset_otp
    if (!$otp_record) {
        try {
            $sqlOtps = "SELECT * FROM otps 
                        WHERE (LOWER(email) = LOWER(?) OR user_id = ?) 
                          AND otp_code = ? AND used = 0 AND expiry_time > NOW() 
                        ORDER BY id DESC LIMIT 1";
            $stmtOtps = $pdo->prepare($sqlOtps);
            $stmtOtps->execute([$user_email, is_numeric($user_email) ? (int)$user_email : 0, $otp_code]);
            $otp_record = $stmtOtps->fetch(PDO::FETCH_ASSOC);
            if ($otp_record) {
                $recordType = 'otps';
            }
        } catch (\Throwable $e) {}
    }

    // 3. Fallback: check users table otp_code directly
    if (!$otp_record) {
        try {
            $stmtUserCheck = $pdo->prepare("
                SELECT user_id, email, username, otp_code, otp_expires_at 
                FROM users 
                WHERE (LOWER(email) = LOWER(?) OR LOWER(username) = LOWER(?)) 
                  AND otp_code = ? AND (otp_expires_at IS NULL OR otp_expires_at > NOW())
                LIMIT 1
            ");
            $stmtUserCheck->execute([$user_email, $user_email, $otp_code]);
            $uMatched = $stmtUserCheck->fetch(PDO::FETCH_ASSOC);
            if ($uMatched) {
                $recordType = 'users';
                $otp_record = $uMatched;
            }
        } catch (\Throwable $e) {}
    }

    if (!$otp_record) {
        throw new Exception("Sayop ang OTP code, nahurot na ang oras, o nagamit na kini.");
    }

    // Markahan ang OTP nga nagamit na aron dili na magamit pag-usab (used = 1)
    if ($recordType === 'password_reset_otp') {
        try {
            $update_sql = "UPDATE password_reset_otp SET used = 1, updated_at = NOW() WHERE id = ?";
            $update_stmt = $pdo->prepare($update_sql);
            $update_stmt->execute([$otp_record['id']]);
        } catch (\Throwable $e) {}
    }

    try {
        $update_otps = "UPDATE otps SET used = 1, updated_at = NOW() WHERE (email = ? OR otp_code = ?) AND used = 0";
        $update_stmt_otps = $pdo->prepare($update_otps);
        $update_stmt_otps->execute([$user_email, $otp_code]);
    } catch (\Throwable $e) {}

    // Susiha ang user account ug i-update ang last_login & account_verified
    $sessionToken = null;
    $userData = null;

    try {
        $stmtFindUser = $pdo->prepare("
            SELECT * FROM users 
            WHERE LOWER(email) = LOWER(?) OR LOWER(username) = LOWER(?)
            LIMIT 1
        ");
        $stmtFindUser->execute([$user_email, $user_email]);
        $foundUser = $stmtFindUser->fetch(PDO::FETCH_ASSOC);

        if ($foundUser) {
            $stmtClear = $pdo->prepare("
                UPDATE users 
                SET otp_code = NULL, 
                    otp_expires_at = NULL, 
                    otp_created_at = NULL, 
                    account_verified = 1, 
                    account_verified_at = NOW(), 
                    last_login = NOW() 
                WHERE user_id = ?
            ");
            $stmtClear->execute([$foundUser['user_id']]);

            $sessionToken = bin2hex(random_bytes(32));

            // Fetch employee or customer profile
            $emp = null;
            if (!empty($foundUser['employee_id'])) {
                $stE = $pdo->prepare("SELECT e.*, b.name as branch_name FROM employees e LEFT JOIN branch_profiles b ON b.id = e.branch_id WHERE e.employee_id = ? LIMIT 1");
                $stE->execute([$foundUser['employee_id']]);
                $emp = $stE->fetch(PDO::FETCH_ASSOC);
            }

            $cust = null;
            if (!empty($foundUser['customer_id'])) {
                $stC = $pdo->prepare("SELECT c.*, b.name as branch_name FROM customers c LEFT JOIN branch_profiles b ON b.id = c.branch_id WHERE c.customer_id = ? LIMIT 1");
                $stC->execute([$foundUser['customer_id']]);
                $cust = $stC->fetch(PDO::FETCH_ASSOC);
            }

            $name = $foundUser['username'];
            if ($emp) $name = trim($emp['first_name'] . ' ' . $emp['last_name']);
            elseif ($cust) $name = trim($cust['first_name'] . ' ' . $cust['last_name']);

            $userData = [
                'user_id'          => (int)$foundUser['user_id'],
                'username'         => $foundUser['username'],
                'email'            => $foundUser['email'],
                'role'             => $foundUser['role'],
                'is_active'        => (bool)$foundUser['is_active'],
                'account_verified' => true,
                'name'             => $name,
                'employee'         => $emp ?: null,
                'customer'         => $cust ?: null,
                'branch_id'        => $emp['branch_id'] ?? ($cust['branch_id'] ?? null),
                'branch_name'      => $emp['branch_name'] ?? ($cust['branch_name'] ?? null),
            ];
        }
    } catch (\Throwable $e) {}

    echo json_encode([
        "success"       => true,
        "message"       => "Malampusong na-verify ang OTP.",
        "verified"      => true,
        "session_token" => $sessionToken,
        "token"         => $sessionToken,
        "access_token"  => $sessionToken,
        "token_type"    => "Bearer",
        "user"          => $userData
    ]);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        "success" => false, 
        "message" => $e->getMessage()
    ]);
}
