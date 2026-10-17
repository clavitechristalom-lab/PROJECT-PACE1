<?php
/**
 * Z-LICZ Furniture & Appliances Trading
 * Customer Self-Registration Endpoint with Automated Gmail SMTP OTP Dispatch
 */

require_once __DIR__ . '/db.php';

setCORSHeaders();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendJsonResponse(['success' => false, 'message' => 'Method Not Allowed. POST required.'], 405);
}

try {
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true) ?: $_POST;

    // Strict validation
    $firstName   = trim($data['first_name'] ?? '');
    $middleName  = trim($data['middle_name'] ?? '');
    $lastName    = trim($data['last_name'] ?? '');
    $rawEmail    = trim($data['email'] ?? '');
    $rawPhone    = trim($data['phone'] ?? ($data['phone_number'] ?? ''));
    $address     = trim($data['address'] ?? '');
    $gender      = trim($data['gender'] ?? 'Male');
    $dob         = trim($data['date_of_birth'] ?? ($data['birth_date'] ?? ''));
    $marital     = trim($data['marital_status'] ?? 'Single');
    $branchId    = !empty($data['branch_id']) ? (int)$data['branch_id'] : null;
    $password    = $data['password'] ?? '';
    $confirmPass = $data['confirmPassword'] ?? ($data['confirm_password'] ?? '');

    if (empty($firstName) || empty($lastName)) {
        sendJsonResponse(['success' => false, 'message' => 'First and last name are required.'], 422);
    }

    if (empty($rawEmail) || !filter_var($rawEmail, FILTER_VALIDATE_EMAIL)) {
        sendJsonResponse(['success' => false, 'message' => 'A valid Gmail or email address is required.'], 422);
    }

    if (empty($rawPhone)) {
        sendJsonResponse(['success' => false, 'message' => 'Contact phone number is required.'], 422);
    }

    if (empty($address)) {
        sendJsonResponse(['success' => false, 'message' => 'Complete residential address is required.'], 422);
    }

    if (empty($dob)) {
        sendJsonResponse(['success' => false, 'message' => 'Date of birth is required.'], 422);
    }

    if (strlen($password) < 6) {
        sendJsonResponse(['success' => false, 'message' => 'Password must be at least 6 characters.'], 422);
    }

    if ($password !== $confirmPass) {
        sendJsonResponse(['success' => false, 'message' => 'Passwords do not match.'], 422);
    }

    $email = strtolower($rawEmail);
    $pdo = getDbConnection();

    // Check duplicate email in users or customers
    $stmtCheckEmail = $pdo->prepare("
        SELECT 1 FROM users WHERE LOWER(email) = :e OR LOWER(username) = :e
        UNION 
        SELECT 1 FROM customers WHERE LOWER(email) = :e
        LIMIT 1
    ");
    $stmtCheckEmail->execute([':e' => $email]);
    if ($stmtCheckEmail->fetch()) {
        sendJsonResponse([
            'success' => false,
            'message' => 'This email address is already registered to an account. Please log in or use Forgot Password.'
        ], 422);
    }

    // Check duplicate phone
    $cleanPhone = preg_replace('/\D/', '', $rawPhone);
    $last10 = substr($cleanPhone, -10);
    $stmtCheckPhone = $pdo->prepare("
        SELECT 1 FROM users WHERE phone_number LIKE :p
        UNION
        SELECT 1 FROM customers WHERE phone LIKE :p
        LIMIT 1
    ");
    $stmtCheckPhone->execute([':p' => "%{$last10}"]);
    if ($stmtCheckPhone->fetch()) {
        sendJsonResponse([
            'success' => false,
            'message' => 'This phone number is already registered to another account.'
        ], 422);
    }

    // Resolve branch name if branch_id provided
    $branchName = null;
    if ($branchId) {
        $stmtBranch = $pdo->prepare("SELECT name FROM branch_profiles WHERE id = :bid LIMIT 1");
        $stmtBranch->execute([':bid' => $branchId]);
        $branchName = $stmtBranch->fetchColumn() ?: null;
    }

    // Generate Customer Code (e.g. CUS-001)
    $maxCustId = (int)$pdo->query("SELECT MAX(customer_id) FROM customers")->fetchColumn();
    $nextCustId = $maxCustId + 1;
    $customerCode = 'CUS-' . str_pad($nextCustId, 3, '0', STR_PAD_LEFT);

    // Secure password hashing using bcrypt
    $passwordHash = password_hash($password, PASSWORD_BCRYPT, ['cost' => 12]);

    $pdo->beginTransaction();

    // Insert into customers table
    $stmtCust = $pdo->prepare("
        INSERT INTO customers (
            customer_code, first_name, middle_name, last_name, email, phone, 
            address, gender, date_of_birth, marital_status, status, branch_id, branch, 
            created_at, updated_at
        ) VALUES (
            :code, :fn, :mn, :ln, :email, :phone, 
            :address, :gender, :dob, :marital, 'Active', :bid, :bname, 
            NOW(), NOW()
        )
    ");
    $stmtCust->execute([
        ':code'    => $customerCode,
        ':fn'      => $firstName,
        ':mn'      => $middleName ?: null,
        ':ln'      => $lastName,
        ':email'   => $email,
        ':phone'   => $rawPhone,
        ':address' => $address,
        ':gender'  => $gender,
        ':dob'     => $dob,
        ':marital' => $marital,
        ':bid'     => $branchId,
        ':bname'   => $branchName,
    ]);

    $customerId = (int)$pdo->lastInsertId();

    // Insert into users table
    $stmtUser = $pdo->prepare("
        INSERT INTO users (
            username, email, phone_number, password_hash, role, is_active, 
            customer_id, account_verified, created_at, updated_at
        ) VALUES (
            :uname, :email, :phone, :phash, 'Customer', 1, 
            :cid, 0, NOW(), NOW()
        )
    ");
    $stmtUser->execute([
        ':uname' => $email,
        ':email' => $email,
        ':phone' => $rawPhone,
        ':phash' => $passwordHash,
        ':cid'   => $customerId,
    ]);

    $userId = (int)$pdo->lastInsertId();

    // Generate 6-digit cryptographic registration OTP
    $otpCode = (string) random_int(100000, 999999);
    $expiryTimestamp = date('Y-m-d H:i:s', time() + (15 * 60)); // 15-minute expiration

    // Store in otps table with used = 0
    $ip = $_SERVER['REMOTE_ADDR'] ?? null;
    $ua = $_SERVER['HTTP_USER_AGENT'] ?? null;

    $stmtOtp = $pdo->prepare("
        INSERT INTO otps (user_id, email, otp_code, type, used, expiry_time, ip_address, user_agent, created_at, updated_at)
        VALUES (:uid, :email, :otp, 'registration', 0, :exp, :ip, :ua, NOW(), NOW())
    ");
    $stmtOtp->execute([
        ':uid'   => $userId,
        ':email' => $email,
        ':otp'   => $otpCode,
        ':exp'   => $expiryTimestamp,
        ':ip'    => $ip,
        ':ua'    => $ua,
    ]);

    // Store in users table
    $stmtUpdateUserOtp = $pdo->prepare("
        UPDATE users 
        SET otp_code = :otp, otp_expires_at = :exp, otp_created_at = NOW() 
        WHERE user_id = :uid
    ");
    $stmtUpdateUserOtp->execute([
        ':otp' => $otpCode,
        ':exp' => $expiryTimestamp,
        ':uid' => $userId,
    ]);

    $pdo->commit();

    // Automated dispatch of OTP via Gmail SMTP (PHPMailer: smtp.gmail.com:587 TLS) - NO MOCKS!
    $recipientName = trim("{$firstName} {$lastName}");
    $subject = "Welcome to Z-LICZ: Verify Your Account [{$otpCode}]";
    $instructions = "Welcome to Z-LICZ Furniture & Appliances Trading! Thank you for creating an account with us. To complete your registration and activate your customer dashboard, please verify your email using the 6-digit code below.";

    $htmlBody = buildZliczEmailHtml('Account Verification', 'Welcome to Z-LICZ', $otpCode, $instructions, $recipientName);
    $plainText = "Welcome to Z-LICZ Furniture & Appliances Trading!\n\nYour 6-digit verification code is: {$otpCode}\nValid for 15 minutes.\nDo not share this code.";

    $mailResult = sendPHPMailerEmail($email, $subject, $htmlBody, $plainText, $recipientName);

    // Mask email for UI
    $parts = explode('@', $email, 2);
    $maskedName = strlen($parts[0]) > 2
        ? substr($parts[0], 0, 1) . '***' . substr($parts[0], -1)
        : substr($parts[0], 0, 1) . '***';
    $maskedEmail = "{$maskedName}@{$parts[1]}";

    if (!$mailResult['success']) {
        throw new \Exception("Failed to dispatch verification email via Gmail SMTP: " . ($mailResult['message'] ?? 'Please check your email address.'));
    }

    sendJsonResponse([
        'success'            => true,
        'requires_otp'       => true,
        'user_id'            => $userId,
        'email'              => $email,
        'username'           => $email,
        'masked_email'       => $maskedEmail,
        'message'            => "Registration successful! A 6-digit verification code has been dispatched to {$maskedEmail} via Gmail.",
        'expires_in_seconds' => 900,
        'cooldown_seconds'   => 60,
    ], 201);

} catch (\Throwable $e) {
    if (isset($pdo) && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    error_log("[register.php EXCEPTION] " . $e->getMessage());
    sendJsonResponse([
        'success' => false,
        'message' => 'Registration failed: ' . $e->getMessage()
    ], 500);
}
