<?php
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, Accept");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_once __DIR__ . "/db.php";
date_default_timezone_set('Asia/Manila');

try {
    $input = json_decode(file_get_contents('php://input'), true);
    if (empty($input)) {
        $input = $_POST;
    }
    if (empty($input)) {
        throw new Exception("No input data received.");
    }

    $rawTarget = trim($input['user_email'] ?? ($input['email'] ?? ($input['target'] ?? ($input['username'] ?? ''))));
    $userId = !empty($input['user_id']) ? (int) $input['user_id'] : null;
    $rawOtp = trim((string)($input['otp_code'] ?? ($input['otp'] ?? '')));
    $otp_code = preg_replace('/\D/', '', $rawOtp);

    if (empty($otp_code) || strlen($otp_code) !== 6) {
        http_response_code(422);
        echo json_encode([
            "success" => false,
            "message" => "Please enter a valid 6-digit numeric verification code."
        ]);
        exit();
    }

    if (empty($rawTarget) && empty($userId)) {
        http_response_code(422);
        echo json_encode([
            "success" => false,
            "message" => "User identifier (email, username, or user_id) is required."
        ]);
        exit();
    }

    // 1. Resolve user ID if email/username is provided
    $foundUser = null;
    if ($userId) {
        $stmtFind = $pdo->prepare("SELECT * FROM users WHERE user_id = ? LIMIT 1");
        $stmtFind->execute([$userId]);
        $foundUser = $stmtFind->fetch(PDO::FETCH_ASSOC);
    }

    if (!$foundUser && !empty($rawTarget)) {
        $stmtFindTarget = $pdo->prepare("
            SELECT * FROM users 
            WHERE LOWER(email) = LOWER(?) OR LOWER(username) = LOWER(?)
            LIMIT 1
        ");
        $stmtFindTarget->execute([$rawTarget, $rawTarget]);
        $foundUser = $stmtFindTarget->fetch(PDO::FETCH_ASSOC);
    }

    $resolvedEmail = $foundUser['email'] ?? (filter_var($rawTarget, FILTER_VALIDATE_EMAIL) ? $rawTarget : null);
    $resolvedUserId = $foundUser ? (int)$foundUser['user_id'] : $userId;

    // 2. Strictly validate OTP against otps table: must be used = 0 and expiry_time > NOW()
    $otpRecord = null;
    $recordSource = null;

    $stmtOtps = $pdo->prepare("
        SELECT * FROM otps 
        WHERE (
            (LOWER(email) = LOWER(?) AND ? IS NOT NULL)
            OR (user_id = ? AND ? > 0)
        )
        AND otp_code = ? 
        AND used = 0 
        AND expiry_time > NOW() 
        ORDER BY id DESC LIMIT 1
    ");
    $stmtOtps->execute([
        $resolvedEmail, $resolvedEmail,
        $resolvedUserId, $resolvedUserId ?: 0,
        $otp_code
    ]);
    $otpRecord = $stmtOtps->fetch(PDO::FETCH_ASSOC);
    if ($otpRecord) {
        $recordSource = 'otps';
    }

    // Fallback check against password_reset_otp table
    if (!$otpRecord && $resolvedEmail) {
        try {
            $stmtReset = $pdo->prepare("
                SELECT * FROM password_reset_otp 
                WHERE LOWER(email) = LOWER(?) 
                  AND otp_code = ? 
                  AND used = 0 
                  AND expiry_time > NOW() 
                ORDER BY id DESC LIMIT 1
            ");
            $stmtReset->execute([$resolvedEmail, $otp_code]);
            $resetRow = $stmtReset->fetch(PDO::FETCH_ASSOC);
            if ($resetRow) {
                $otpRecord = $resetRow;
                $recordSource = 'password_reset_otp';
            }
        } catch (\Throwable $e) {}
    }

    // Fallback check against users table direct otp_code
    if (!$otpRecord && $foundUser) {
        if (!empty($foundUser['otp_code']) && $foundUser['otp_code'] === $otp_code) {
            $expiresAt = $foundUser['otp_expires_at'] ? strtotime($foundUser['otp_expires_at']) : null;
            if (!$expiresAt || $expiresAt > time()) {
                $otpRecord = $foundUser;
                $recordSource = 'users';
            }
        }
    }

    // Strict rejection if no valid unexpired, unused token matches
    if (!$otpRecord) {
        http_response_code(422);
        echo json_encode([
            "success" => false,
            "message" => "Invalid, expired, or already used verification code. Please request a new code."
        ]);
        exit();
    }

    // 3. Mark OTP code as used (used = 1) immediately to prevent replay attacks
    if ($recordSource === 'otps' && !empty($otpRecord['id'])) {
        $stmtMark = $pdo->prepare("UPDATE otps SET used = 1, updated_at = NOW() WHERE id = ?");
        $stmtMark->execute([$otpRecord['id']]);
    }
    if ($resolvedEmail) {
        try {
            $stmtMarkAll = $pdo->prepare("UPDATE otps SET used = 1, updated_at = NOW() WHERE LOWER(email) = LOWER(?) AND otp_code = ?");
            $stmtMarkAll->execute([$resolvedEmail, $otp_code]);

            $stmtMarkReset = $pdo->prepare("UPDATE password_reset_otp SET used = 1, updated_at = NOW() WHERE LOWER(email) = LOWER(?) AND otp_code = ?");
            $stmtMarkReset->execute([$resolvedEmail, $otp_code]);
        } catch (\Throwable $e) {}
    }

    // 4. Update user account: clear OTP, mark verified, and record login timestamp
    $sessionToken = null;
    $userData = null;

    if ($foundUser) {
        $stmtUpdateUser = $pdo->prepare("
            UPDATE users 
            SET otp_code = NULL, 
                otp_expires_at = NULL, 
                otp_created_at = NULL, 
                account_verified = 1, 
                account_verified_at = NOW(), 
                last_login = NOW() 
            WHERE user_id = ?
        ");
        $stmtUpdateUser->execute([$foundUser['user_id']]);

        // Generate cryptographically secure session token
        $sessionToken = bin2hex(random_bytes(32));

        // Load linked employee profile if applicable (Admin, Store Admin, Employee)
        $emp = null;
        if (!empty($foundUser['employee_id'])) {
            $stE = $pdo->prepare("
                SELECT e.*, b.name as branch_name 
                FROM employees e 
                LEFT JOIN branch_profiles b ON b.id = e.branch_id 
                WHERE e.employee_id = ? LIMIT 1
            ");
            $stE->execute([$foundUser['employee_id']]);
            $emp = $stE->fetch(PDO::FETCH_ASSOC);
        }

        // Load linked customer profile if applicable
        $cust = null;
        if (!empty($foundUser['customer_id'])) {
            $stC = $pdo->prepare("
                SELECT c.*, b.name as branch_name 
                FROM customers c 
                LEFT JOIN branch_profiles b ON b.id = c.branch_id 
                WHERE c.customer_id = ? LIMIT 1
            ");
            $stC->execute([$foundUser['customer_id']]);
            $cust = $stC->fetch(PDO::FETCH_ASSOC);
        }

        $displayName = $foundUser['username'];
        if ($emp && !empty($emp['first_name'])) {
            $displayName = trim($emp['first_name'] . ' ' . ($emp['last_name'] ?? ''));
        } elseif ($cust && !empty($cust['first_name'])) {
            $displayName = trim($cust['first_name'] . ' ' . ($cust['last_name'] ?? ''));
        }

        $branchId = $emp['branch_id'] ?? ($cust['branch_id'] ?? null);
        $branchName = $emp['branch_name'] ?? ($cust['branch_name'] ?? ($emp['branch'] ?? null));

        $userData = [
            'user_id'          => (int) $foundUser['user_id'],
            'username'         => $foundUser['username'],
            'email'            => $foundUser['email'],
            'role'             => $foundUser['role'],
            'is_active'        => (bool) $foundUser['is_active'],
            'account_verified' => true,
            'name'             => $displayName,
            'employee'         => $emp ?: null,
            'customer'         => $cust ?: null,
            'branch_id'        => $branchId,
            'branch_name'      => $branchName,
        ];
    }

    echo json_encode([
        "success"       => true,
        "verified"      => true,
        "message"       => "Verification successful. Welcome to PROJECT: PACE Z-LICZ!",
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
