<?php
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, Accept");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

ini_set('display_errors', 0);
ini_set('log_errors', 1);
ob_start();

date_default_timezone_set('Asia/Manila');

try {
    if (file_exists("db.php")) {
        require_once "db.php";
    } elseif (file_exists(__DIR__ . "/db.php")) {
        require_once __DIR__ . "/db.php";
    } else {
        throw new Exception("Wala makita ang database configuration file.");
    }
    
    $rawInput = file_get_contents('php://input');
    $input = json_decode($rawInput, true);
    
    if (empty($input)) {
        $input = $_POST;
    }

    if (empty($input)) {
        throw new Exception("Walay nadawat nga data.");
    }

    $user_email = isset($input['user_email']) ? trim($input['user_email']) : (isset($input['email']) ? trim($input['email']) : (isset($input['target']) ? trim($input['target']) : ''));
    $new_password = isset($input['new_password']) ? $input['new_password'] : (isset($input['password']) ? $input['password'] : '');

    if (empty($user_email) || empty($new_password)) {
        throw new Exception("Kinahanglan ang email ug bag-ong password.");
    }

    if (strlen($new_password) < 6) {
        throw new Exception("Ang password kinahanglan labing minus 6 ka karakter.");
    }

    // Secure password hashing
    $hashed_password = password_hash($new_password, PASSWORD_DEFAULT);

    $updatedAny = false;

    // 1. Pag-update sa password sa residents table
    try {
        $update_sql = "UPDATE residents SET 
                       mobile_password = ?, 
                       updated_at = NOW()
                       WHERE email = ? AND has_mobile_account = 1";
        
        $update_stmt = $pdo->prepare($update_sql);
        $update_stmt->execute([$hashed_password, $user_email]);

        if ($update_stmt->rowCount() > 0) {
            $updatedAny = true;
        }
    } catch (\Throwable $e) {}

    // 2. Pag-update usab sa users table para sa web access
    try {
        $sqlUser = "UPDATE users SET 
                    password_hash = ?, 
                    otp_code = NULL, 
                    otp_expires_at = NULL, 
                    otp_created_at = NULL,
                    updated_at = NOW() 
                    WHERE LOWER(email) = LOWER(?) OR LOWER(username) = LOWER(?)";
        $stmtUser = $pdo->prepare($sqlUser);
        $stmtUser->execute([$hashed_password, $user_email, $user_email]);

        if ($stmtUser->rowCount() > 0) {
            $updatedAny = true;

            // Siguruha nga anaa usab sa residents table
            try {
                $checkRes = $pdo->prepare("SELECT id FROM residents WHERE email = ?");
                $checkRes->execute([$user_email]);
                if (!$checkRes->fetch()) {
                    $insRes = $pdo->prepare("INSERT INTO residents (firstName, email, mobile_password, mobile_account_status, has_mobile_account, created_at, updated_at) VALUES (?, ?, ?, 'active', 1, NOW(), NOW())");
                    $insRes->execute([explode('@', $user_email)[0], $user_email, $hashed_password]);
                    $updatedAny = true;
                }
            } catch (\Throwable $e) {}
        }
    } catch (\Throwable $e) {}

    // 3. Kon walay na-update nga row, susiha kon ang user anaa ba daan (pananglitan pareho ang password)
    if (!$updatedAny) {
        $userFound = false;

        try {
            $checkRes = $pdo->prepare("SELECT id FROM residents WHERE email = ? AND has_mobile_account = 1");
            $checkRes->execute([$user_email]);
            if ($checkRes->fetch()) {
                $userFound = true;
            }
        } catch (\Throwable $e) {}

        if (!$userFound) {
            try {
                $checkUser = $pdo->prepare("SELECT user_id FROM users WHERE LOWER(email) = LOWER(?) OR LOWER(username) = LOWER(?)");
                $checkUser->execute([$user_email, $user_email]);
                if ($checkUser->fetch()) {
                    $userFound = true;
                }
            } catch (\Throwable $e) {}
        }

        if (!$userFound) {
            throw new Exception("Walay nakit-an nga aktibong account sa maong email.");
        }
    }

    // Pagtangtang sa nahabiling OTP records
    try {
        $clear_otp_sql = "DELETE FROM password_reset_otp WHERE email = ?";
        $clear_otp_stmt = $pdo->prepare($clear_otp_sql);
        $clear_otp_stmt->execute([$user_email]);
    } catch (\Throwable $e) {}

    try {
        $clear_otps_sql = "DELETE FROM otps WHERE LOWER(email) = LOWER(?)";
        $clear_otps_stmt = $pdo->prepare($clear_otps_sql);
        $clear_otps_stmt->execute([$user_email]);
    } catch (\Throwable $e) {}

    ob_clean();
    echo json_encode([
        "success" => true,
        "message" => "Malampusong na-reset ang imong password. Pwede ka na mag-login."
    ]);

} catch (Exception $e) {
    ob_clean();
    http_response_code(500);
    echo json_encode([
        "success" => false, 
        "message" => $e->getMessage()
    ]);
}

ob_end_flush();
?>
