<?php
/**
 * Z-LICZ Furniture & Appliances Trading
 * Admin Creation of Internal User Accounts with Automated Welcome/Verification Email
 */

require_once __DIR__ . '/db.php';

setCORSHeaders();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendJsonResponse(['success' => false, 'message' => 'Method Not Allowed. POST required.'], 405);
}

try {
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true) ?: $_POST;

    // Validate role
    $rawRole = trim($data['role'] ?? 'Employee');
    $role = match($rawRole) {
        'Store Admin' => 'Store Administrator',
        'Admin'       => 'Administrator',
        default       => $rawRole
    };

    $allowedRoles = ['Administrator', 'Store Administrator', 'Employee'];
    if (!in_array($role, $allowedRoles, true)) {
        sendJsonResponse([
            'success' => false,
            'message' => 'Invalid account role. Allowed internal roles: Administrator, Store Administrator, Employee.'
        ], 422);
    }

    $username    = trim($data['username'] ?? '');
    $rawEmail    = trim($data['email'] ?? '');
    $rawPhone    = trim($data['phone'] ?? ($data['phone_number'] ?? ''));
    $password    = $data['password'] ?? '';
    $confirmPass = $data['confirmPassword'] ?? ($data['confirm_password'] ?? '');

    $firstName   = trim($data['first_name'] ?? '');
    $middleName  = trim($data['middle_name'] ?? '');
    $lastName    = trim($data['last_name'] ?? '');
    $gender      = trim($data['gender'] ?? 'Male');
    $dob         = trim($data['date_of_birth'] ?? ($data['birth_date'] ?? ''));
    $marital     = trim($data['marital_status'] ?? 'Single');
    $address     = trim($data['address'] ?? '');

    $branchId    = !empty($data['branch_id']) ? (int)$data['branch_id'] : null;
    $department  = trim($data['department'] ?? '');
    $position    = trim($data['position'] ?? '');
    $workHours   = trim($data['working_hours'] ?? '8 AM to 5 PM');
    $salary      = !empty($data['basic_salary']) ? (float)$data['basic_salary'] : 0.00;
    $payType     = trim($data['pay_type'] ?? 'Monthly');
    $attendancePin = trim($data['attendance_pin'] ?? '');

    if (empty($username)) {
        sendJsonResponse(['success' => false, 'message' => 'Username is required.'], 422);
    }

    if (empty($rawEmail) || !filter_var($rawEmail, FILTER_VALIDATE_EMAIL)) {
        sendJsonResponse(['success' => false, 'message' => 'A valid Gmail or email address is required.'], 422);
    }

    if (empty($firstName) || empty($lastName)) {
        sendJsonResponse(['success' => false, 'message' => 'First and last name are required.'], 422);
    }

    if (empty($password)) {
        sendJsonResponse(['success' => false, 'message' => 'Password is required.'], 422);
    }

    if ($password !== $confirmPass) {
        sendJsonResponse(['success' => false, 'message' => 'Passwords do not match.'], 422);
    }

    if (in_array($role, ['Store Administrator', 'Employee']) && empty($branchId)) {
        sendJsonResponse(['success' => false, 'message' => 'Please select a branch for this staff account.'], 422);
    }

    $email = strtolower($rawEmail);
    $pdo = getDbConnection();

    // Check username uniqueness
    $stmtCheckUname = $pdo->prepare("SELECT 1 FROM users WHERE LOWER(username) = LOWER(:u) LIMIT 1");
    $stmtCheckUname->execute([':u' => $username]);
    if ($stmtCheckUname->fetch()) {
        sendJsonResponse(['success' => false, 'message' => "The username '{$username}' is already in use."], 422);
    }

    // Check email uniqueness
    $stmtCheckEmail = $pdo->prepare("SELECT 1 FROM users WHERE LOWER(email) = LOWER(:e) LIMIT 1");
    $stmtCheckEmail->execute([':e' => $email]);
    if ($stmtCheckEmail->fetch()) {
        sendJsonResponse(['success' => false, 'message' => "The email '{$email}' is already associated with an existing user."], 422);
    }

    // Resolve branch name
    $branchName = null;
    if ($branchId) {
        $stmtBranch = $pdo->prepare("SELECT name FROM branch_profiles WHERE id = :bid LIMIT 1");
        $stmtBranch->execute([':bid' => $branchId]);
        $branchName = $stmtBranch->fetchColumn() ?: null;
    }

    // Generate Employee Code (e.g. EMP-001)
    $maxEmpId = (int)$pdo->query("SELECT MAX(employee_id) FROM employees")->fetchColumn();
    $nextEmpId = $maxEmpId + 1;
    $employeeCode = 'EMP-' . str_pad($nextEmpId, 3, '0', STR_PAD_LEFT);

    // Hash password using bcrypt
    $passwordHash = password_hash($password, PASSWORD_BCRYPT, ['cost' => 12]);
    $pinHash = !empty($attendancePin) ? password_hash($attendancePin, PASSWORD_BCRYPT) : null;

    $defaultPosition = $position ?: ($role === 'Store Administrator' ? 'Store Administrator' : ($role === 'Administrator' ? 'System Administrator' : 'Staff'));
    $defaultDept = $department ?: ($role === 'Administrator' ? 'Administration' : ($role === 'Store Administrator' ? 'Store Management' : 'Sales & Operations'));

    $pdo->beginTransaction();

    // Insert into employees table
    $stmtEmp = $pdo->prepare("
        INSERT INTO employees (
            employee_code, first_name, middle_name, last_name, email, phone, 
            address, gender, birth_date, date_of_birth, marital_status, position, 
            status, pay_type, basic_salary, branch_id, branch, department, 
            working_hours, attendance_pin, pin_failed_attempts, created_at, updated_at
        ) VALUES (
            :code, :fn, :mn, :ln, :email, :phone, 
            :address, :gender, :dob, :dob, :marital, :position, 
            'Active', :paytype, :salary, :bid, :bname, :dept, 
            :whours, :pin, 0, NOW(), NOW()
        )
    ");
    $stmtEmp->execute([
        ':code'     => $employeeCode,
        ':fn'       => $firstName,
        ':mn'       => $middleName ?: null,
        ':ln'       => $lastName,
        ':email'    => $email,
        ':phone'    => $rawPhone,
        ':address'  => $address,
        ':gender'   => $gender,
        ':dob'      => $dob ?: date('Y-m-d'),
        ':marital'  => $marital,
        ':position' => $defaultPosition,
        ':paytype'  => $payType,
        ':salary'   => $salary,
        ':bid'      => $branchId,
        ':bname'    => $branchName,
        ':dept'     => $defaultDept,
        ':whours'   => $workHours,
        ':pin'      => $pinHash,
    ]);

    $employeeId = (int)$pdo->lastInsertId();

    // Insert into users table
    $stmtUser = $pdo->prepare("
        INSERT INTO users (
            username, email, phone_number, password_hash, role, is_active, 
            employee_id, account_verified, account_verified_at, created_at, updated_at
        ) VALUES (
            :uname, :email, :phone, :phash, :role, 1, 
            :eid, 1, NOW(), NOW(), NOW()
        )
    ");
    $stmtUser->execute([
        ':uname' => $username,
        ':email' => $email,
        ':phone' => $rawPhone,
        ':phash' => $passwordHash,
        ':role'  => $role,
        ':eid'   => $employeeId,
    ]);

    $userId = (int)$pdo->lastInsertId();

    // Generate a secure 6-digit initial verification OTP for their records
    $otpCode = (string) random_int(100000, 999999);
    $expiryTimestamp = date('Y-m-d H:i:s', time() + (15 * 60));

    // Store in otps table with used = 0
    $ip = $_SERVER['REMOTE_ADDR'] ?? null;
    $ua = $_SERVER['HTTP_USER_AGENT'] ?? null;

    $stmtOtp = $pdo->prepare("
        INSERT INTO otps (user_id, email, otp_code, type, used, expiry_time, ip_address, user_agent, created_at, updated_at)
        VALUES (:uid, :email, :otp, 'welcome', 0, :exp, :ip, :ua, NOW(), NOW())
    ");
    $stmtOtp->execute([
        ':uid'   => $userId,
        ':email' => $email,
        ':otp'   => $otpCode,
        ':exp'   => $expiryTimestamp,
        ':ip'    => $ip,
        ':ua'    => $ua,
    ]);

    $stmtUpdateUser = $pdo->prepare("
        UPDATE users 
        SET otp_code = :otp, otp_expires_at = :exp, otp_created_at = NOW() 
        WHERE user_id = :uid
    ");
    $stmtUpdateUser->execute([
        ':otp' => $otpCode,
        ':exp' => $expiryTimestamp,
        ':uid' => $userId,
    ]);

    $pdo->commit();

    // Automated dispatch of Welcome & Verification Email via Gmail SMTP (smtp.gmail.com:587, TLS)
    $recipientName = trim("{$firstName} {$lastName}");
    $subject = "Welcome to Z-LICZ: Your Account Details & Verification Code";
    $instructions = "An internal account ({$role}) has been created for you at Z-LICZ Furniture & Appliances Trading. Your username is: <strong>" . htmlspecialchars($username) . "</strong> and your branch assignment is: <strong>" . htmlspecialchars($branchName ?: 'Main Office') . "</strong>.<br><br>When logging in for the first time, you can use the verification OTP code below:";

    $htmlBody = buildZliczEmailHtml('Staff Account Created', "Role: {$role}", $otpCode, $instructions, $recipientName);
    $plainText = "Welcome to Z-LICZ Furniture & Appliances Trading!\n\nYour internal account ({$role}) has been created.\nUsername: {$username}\nBranch: " . ($branchName ?: 'Main Office') . "\nFirst-time Login OTP: {$otpCode}\nValid for 15 minutes.\nDo not share your credentials.";

    $mailResult = sendPHPMailerEmail($email, $subject, $htmlBody, $plainText, $recipientName);

    sendJsonResponse([
        'success' => true,
        'message' => "Internal user account for {$recipientName} ({$role}) created successfully! Welcome email sent to {$email}.",
        'user'    => [
            'user_id'       => $userId,
            'username'      => $username,
            'email'         => $email,
            'role'          => $role,
            'employee_id'   => $employeeId,
            'employee_code' => $employeeCode,
            'name'          => $recipientName,
            'branch_name'   => $branchName,
        ],
        'mail_sent' => $mailResult['success'],
    ], 201);

} catch (\Throwable $e) {
    if (isset($pdo) && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    error_log("[create_user.php EXCEPTION] " . $e->getMessage());
    sendJsonResponse([
        'success' => false,
        'message' => 'Failed to create user account: ' . $e->getMessage()
    ], 500);
}
