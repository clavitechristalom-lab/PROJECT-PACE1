<?php
/**
 * Z-LICZ Furniture & Appliances Trading
 * Admin Update of Internal User Accounts and Employee Profiles
 */

require_once __DIR__ . '/db.php';

setCORSHeaders();

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if (!in_array($_SERVER['REQUEST_METHOD'], ['POST', 'PUT', 'PATCH'], true)) {
    sendJsonResponse(['success' => false, 'message' => 'Method Not Allowed. POST, PUT, or PATCH required.'], 405);
}

try {
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true) ?: $_POST;

    $userId     = !empty($data['user_id']) ? (int)$data['user_id'] : (!empty($data['id']) ? (int)$data['id'] : null);
    $employeeId = !empty($data['employee_id']) ? (int)$data['employee_id'] : null;

    $pdo = getDbConnection();

    if (!$userId && $employeeId) {
        $stmtFind = $pdo->prepare("SELECT user_id FROM users WHERE employee_id = :eid LIMIT 1");
        $stmtFind->execute([':eid' => $employeeId]);
        $userId = $stmtFind->fetchColumn() ?: null;
    }

    if (!$userId && !$employeeId) {
        sendJsonResponse(['success' => false, 'message' => 'User ID or Employee ID is required for update.'], 422);
    }

    $currentUser = null;
    if ($userId) {
        $stmtUser = $pdo->prepare("SELECT * FROM users WHERE user_id = :uid LIMIT 1");
        $stmtUser->execute([':uid' => $userId]);
        $currentUser = $stmtUser->fetch();
    }

    if (!$currentUser && $employeeId) {
        $stmtEmpOnly = $pdo->prepare("SELECT * FROM employees WHERE employee_id = :eid LIMIT 1");
        $stmtEmpOnly->execute([':eid' => $employeeId]);
        $currentEmp = $stmtEmpOnly->fetch();
        if (!$currentEmp) {
            sendJsonResponse(['success' => false, 'message' => 'User / Employee record not found.'], 404);
        }
    } elseif (!$currentUser) {
        sendJsonResponse(['success' => false, 'message' => 'User account not found.'], 404);
    }

    $targetEmpId = $employeeId ?: ($currentUser['employee_id'] ?? null);

    $pdo->beginTransaction();

    // 1. Update Users Table if currentUser exists
    if ($currentUser) {
        $userUpdates = [];
        $userParams  = [':uid' => $userId];

        if (isset($data['username']) && trim($data['username']) !== '') {
            $newUsername = trim($data['username']);
            if (strtolower($newUsername) !== strtolower($currentUser['username'])) {
                $stmtCheckUname = $pdo->prepare("SELECT 1 FROM users WHERE LOWER(username) = LOWER(:u) AND user_id != :uid LIMIT 1");
                $stmtCheckUname->execute([':u' => $newUsername, ':uid' => $userId]);
                if ($stmtCheckUname->fetch()) {
                    $pdo->rollBack();
                    sendJsonResponse(['success' => false, 'message' => "The username '{$newUsername}' is already in use."], 422);
                }
            }
            $userUpdates[] = "username = :uname";
            $userParams[':uname'] = $newUsername;
        }

        if (isset($data['email']) && trim($data['email']) !== '') {
            $newEmail = strtolower(trim($data['email']));
            if ($newEmail !== strtolower($currentUser['email'] ?? '')) {
                $stmtCheckEmail = $pdo->prepare("SELECT 1 FROM users WHERE LOWER(email) = LOWER(:e) AND user_id != :uid LIMIT 1");
                $stmtCheckEmail->execute([':e' => $newEmail, ':uid' => $userId]);
                if ($stmtCheckEmail->fetch()) {
                    $pdo->rollBack();
                    sendJsonResponse(['success' => false, 'message' => "The email '{$newEmail}' is already associated with another user."], 422);
                }
            }
            $userUpdates[] = "email = :email";
            $userParams[':email'] = $newEmail;
        }

        if (isset($data['phone']) || isset($data['phone_number'])) {
            $newPhone = trim($data['phone'] ?? $data['phone_number']);
            $userUpdates[] = "phone_number = :phone";
            $userParams[':phone'] = $newPhone ?: null;
        }

        if (isset($data['role'])) {
            $rawRole = trim($data['role']);
            $role = match($rawRole) {
                'Store Admin' => 'Store Administrator',
                'Admin'       => 'Administrator',
                default       => $rawRole
            };
            $userUpdates[] = "role = :role";
            $userParams[':role'] = $role;
        }

        if (isset($data['is_active'])) {
            $userUpdates[] = "is_active = :active";
            $userParams[':active'] = !empty($data['is_active']) ? 1 : 0;
        }

        if (!empty($data['password'])) {
            $userUpdates[] = "password_hash = :phash";
            $userParams[':phash'] = password_hash($data['password'], PASSWORD_BCRYPT, ['cost' => 12]);
        }

        if (!empty($userUpdates)) {
            $userUpdates[] = "updated_at = NOW()";
            $sqlUser = "UPDATE users SET " . implode(', ', $userUpdates) . " WHERE user_id = :uid";
            $stmtUpUser = $pdo->prepare($sqlUser);
            $stmtUpUser->execute($userParams);
        }
    }

    // 2. Update Linked Employee Record
    if ($targetEmpId) {
        $stmtCurrentEmp = $pdo->prepare("SELECT * FROM employees WHERE employee_id = :eid LIMIT 1");
        $stmtCurrentEmp->execute([':eid' => $targetEmpId]);
        $empRecord = $stmtCurrentEmp->fetch();

        if ($empRecord) {
            $empUpdates = [];
            $empParams  = [':eid' => $targetEmpId];

            if (isset($data['first_name'])) {
                $empUpdates[] = "first_name = :fn";
                $empParams[':fn'] = trim($data['first_name']);
            }
            if (array_key_exists('middle_name', $data)) {
                $empUpdates[] = "middle_name = :mn";
                $empParams[':mn'] = trim($data['middle_name'] ?? '') ?: null;
            }
            if (isset($data['last_name'])) {
                $empUpdates[] = "last_name = :ln";
                $empParams[':ln'] = trim($data['last_name']);
            }
            if (isset($data['email'])) {
                $empUpdates[] = "email = :emp_email";
                $empParams[':emp_email'] = strtolower(trim($data['email'])) ?: null;
            }
            if (isset($data['phone']) || isset($data['phone_number'])) {
                $empUpdates[] = "phone = :emp_phone";
                $empParams[':emp_phone'] = trim($data['phone'] ?? $data['phone_number']) ?: null;
            }
            if (isset($data['address'])) {
                $empUpdates[] = "address = :addr";
                $empParams[':addr'] = trim($data['address']) ?: null;
            }
            if (isset($data['gender'])) {
                $empUpdates[] = "gender = :gender";
                $empParams[':gender'] = trim($data['gender']);
            }
            if (isset($data['date_of_birth']) || isset($data['birth_date'])) {
                $dob = trim($data['date_of_birth'] ?? $data['birth_date']);
                $empUpdates[] = "date_of_birth = :dob";
                $empUpdates[] = "birth_date = :dob_alt";
                $empParams[':dob'] = $dob ?: null;
                $empParams[':dob_alt'] = $dob ?: null;
            }
            if (isset($data['marital_status'])) {
                $empUpdates[] = "marital_status = :marital";
                $empParams[':marital'] = trim($data['marital_status']);
            }
            if (isset($data['position'])) {
                $empUpdates[] = "position = :pos";
                $empParams[':pos'] = trim($data['position']);
            }
            if (isset($data['department'])) {
                $empUpdates[] = "department = :dept";
                $empParams[':dept'] = trim($data['department']);
            }
            if (isset($data['working_hours'])) {
                $empUpdates[] = "working_hours = :whours";
                $empParams[':whours'] = trim($data['working_hours']);
            }
            if (isset($data['pay_type'])) {
                $empUpdates[] = "pay_type = :paytype";
                $empParams[':paytype'] = trim($data['pay_type']);
            }

            // Branch Field: Accepts empty or nullable values without constraint errors
            if (array_key_exists('branch_id', $data)) {
                $bId = !empty($data['branch_id']) ? (int)$data['branch_id'] : null;
                $bName = null;
                if ($bId) {
                    $stmtBranch = $pdo->prepare("SELECT name FROM branch_profiles WHERE id = :bid LIMIT 1");
                    $stmtBranch->execute([':bid' => $bId]);
                    $bName = $stmtBranch->fetchColumn() ?: null;
                }
                $empUpdates[] = "branch_id = :bid";
                $empUpdates[] = "branch = :bname";
                $empParams[':bid']   = $bId;
                $empParams[':bname'] = $bName;
            }

            // Basic Salary: Accepts empty, null, or zero values cleanly without constraint errors
            if (array_key_exists('basic_salary', $data)) {
                $sal = (isset($data['basic_salary']) && $data['basic_salary'] !== '' && $data['basic_salary'] !== null && is_numeric($data['basic_salary'])) 
                    ? (float)$data['basic_salary'] 
                    : 0.00;
                $dailyRate  = $sal > 0 ? round($sal / 26, 2) : 0.00;
                $hourlyRate = $dailyRate > 0 ? round($dailyRate / 8, 2) : 0.00;

                $empUpdates[] = "basic_salary = :salary";
                $empUpdates[] = "daily_rate = :daily";
                $empUpdates[] = "hourly_rate = :hourly";
                $empParams[':salary'] = $sal;
                $empParams[':daily']  = $dailyRate;
                $empParams[':hourly'] = $hourlyRate;
            }

            // Permanent QR Field: Converts empty strings to NULL to avoid unique index collisions
            if (array_key_exists('permanent_qr', $data) || array_key_exists('qr_token', $data)) {
                $rawQr = trim($data['permanent_qr'] ?? ($data['qr_token'] ?? ''));
                $qrToken = !empty($rawQr) ? $rawQr : null;
                $qrActive = $qrToken !== null ? 1 : 0;

                $empUpdates[] = "qr_token = :qr";
                $empUpdates[] = "qr_active = :qractive";
                $empParams[':qr']       = $qrToken;
                $empParams[':qractive'] = $qrActive;
                if ($qrToken === null) {
                    $empUpdates[] = "qr_generated_at = NULL";
                }
            }

            // PIN Field: Accepts empty or nullable values without validation failure
            if (array_key_exists('attendance_pin', $data) || array_key_exists('pin', $data)) {
                $rawPin = trim($data['attendance_pin'] ?? ($data['pin'] ?? ''));
                if ($rawPin !== '') {
                    $empUpdates[] = "attendance_pin = :pin";
                    $empParams[':pin'] = password_hash($rawPin, PASSWORD_BCRYPT);
                } else {
                    $empUpdates[] = "attendance_pin = NULL";
                }
            }

            // Strictly enforce Admin exclusions: No QR, No PIN, No Basic Salary
            $targetRole = $role ?? ($currentUser['role'] ?? '');
            $targetPos = $data['position'] ?? ($empRecord['position'] ?? '');
            $isEmpAdminAccount = in_array($targetRole, ['Administrator', 'Admin'], true) ||
                in_array($targetPos, ['System Administrator', 'Administrator', 'Main Administrator'], true) ||
                str_starts_with(strtoupper($empRecord['employee_code'] ?? ''), 'SYS-');

            if ($isEmpAdminAccount) {
                $empUpdates[] = "basic_salary = 0.00";
                $empUpdates[] = "daily_rate = 0.00";
                $empUpdates[] = "hourly_rate = 0.00";
                $empUpdates[] = "qr_token = NULL";
                $empUpdates[] = "qr_code = NULL";
                $empUpdates[] = "qr_active = 0";
                $empUpdates[] = "qr_generated_at = NULL";
                $empUpdates[] = "attendance_pin = NULL";
                $empUpdates[] = "information_verified = 1";
                $empUpdates[] = "account_verified = 1";
                unset($empParams[':salary'], $empParams[':daily'], $empParams[':hourly'], $empParams[':qr'], $empParams[':qractive'], $empParams[':pin']);
            }

            if (!empty($empUpdates)) {
                $empUpdates[] = "updated_at = NOW()";
                $sqlEmp = "UPDATE employees SET " . implode(', ', $empUpdates) . " WHERE employee_id = :eid";
                $stmtUpEmp = $pdo->prepare($sqlEmp);
                $stmtUpEmp->execute($empParams);
            }
        }
    }

    $pdo->commit();

    // Fetch refreshed user record
    $refreshedUser = null;
    if ($userId) {
        $stmtFresh = $pdo->prepare("
            SELECT u.user_id, u.username, u.email, u.phone_number, u.role, u.is_active, u.employee_id,
                   e.employee_code, e.first_name, e.last_name, e.position, e.department, e.branch_id, e.branch,
                   e.basic_salary, e.qr_token, e.qr_active, (e.attendance_pin IS NOT NULL) AS has_pin
            FROM users u
            LEFT JOIN employees e ON u.employee_id = e.employee_id
            WHERE u.user_id = :uid
            LIMIT 1
        ");
        $stmtFresh->execute([':uid' => $userId]);
        $refreshedUser = $stmtFresh->fetch();
    }

    sendJsonResponse([
        'success' => true,
        'message' => 'User account and profile updated successfully.',
        'user'    => $refreshedUser ?: ['user_id' => $userId, 'employee_id' => $targetEmpId],
    ], 200);

} catch (\Throwable $e) {
    if (isset($pdo) && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    error_log("[update_user.php EXCEPTION] " . $e->getMessage());
    sendJsonResponse([
        'success' => false,
        'message' => 'Failed to update user account: ' . $e->getMessage()
    ], 500);
}
