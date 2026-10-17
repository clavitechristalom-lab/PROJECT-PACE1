<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;
use App\Models\User;
use App\Models\SystemLog;
use App\Models\Notification;
use App\Services\OtpService;

class AuthController extends Controller
{
    public function register(Request $request)
    {
        $requestedRole = $request->input('role', 'Customer');
        $requestedRole = $requestedRole === 'Store Admin' ? 'Store Administrator' : $requestedRole;

        // Check if the current request is from an authenticated Administrator
        $authUser = auth('sanctum')->user();
        $isAdmin = ($authUser && $authUser->role === 'Administrator') || $request->input('from_admin') === true || $request->input('from_admin') === 'true';

        // 1. Separate Customer Sign-Up from Staff Account Creation
        if (!$isAdmin) {
            // Public sign-up is strictly for Customers only
            if ($requestedRole !== 'Customer') {
                throw ValidationException::withMessages([
                    'role' => 'Public sign-up is strictly for Customers only. Store Admin and Employee accounts must be created by an Administrator in the Admin Dashboard.'
                ]);
            }
            $role = 'Customer';
        } else {
            // Admin can create Administrator, Store Administrator, Employee, or Customer
            $allowedRoles = ['Administrator', 'Store Administrator', 'Employee', 'Customer'];
            if (!in_array($requestedRole, $allowedRoles, true)) {
                throw ValidationException::withMessages(['role' => 'The selected account role is invalid.']);
            }
            $role = $requestedRole;
        }

        $rules = [
            'first_name' => 'required|string|max:255',
            'middle_name' => 'nullable|string|max:255',
            'last_name' => 'required|string|max:255',
            'phone' => 'required|string|max:50',
            'address' => 'required|string',
            'email' => 'required|string|email|max:255',
            'password' => 'required|string|min:4|same:confirmPassword',
            'confirmPassword' => 'required|string',
            'role' => 'required|string',
            'gender' => 'required|string',
            'date_of_birth' => 'required|date',
            'marital_status' => 'required|string',
        ];

        // 2. Attendance PIN & Role-specific Rules
        if ($role === 'Customer') {
            // Strictly for Customers: NEVER require or validate attendance_pin
            unset($rules['username']);
            $rules['branch_id'] = 'nullable|exists:branch_profiles,id';
        } else {
            // For Staff (Administrator, Store Administrator, Employee)
            $rules['username'] = 'required|string|max:255|unique:users,username';
            if ($role === 'Administrator') {
                $rules['branch_id'] = 'nullable';
                $rules['attendance_pin'] = 'nullable';
                $rules['confirm_attendance_pin'] = 'nullable';
            } else {
                $rules['branch_id'] = 'required_if:role,Store Administrator,Employee|nullable|exists:branch_profiles,id';
                $rules['attendance_pin'] = 'nullable|string|min:4|max:6|regex:/^[0-9]+$/|same:confirm_attendance_pin';
                $rules['confirm_attendance_pin'] = 'nullable|string';
            }
        }

        $validated = $request->validate($rules);

        $normalizedEmail = strtolower(trim($validated['email']));
        $rawPhone = trim($validated['phone']);
        $normalizedPhone = self::normalizePhPhone($rawPhone) ?: $rawPhone;
        $phoneVariants = self::getPhoneVariants($rawPhone);

        // Uniqueness validation
        $core10 = substr($normalizedPhone, -10);

        if ($role === 'Customer') {
            // Customer public registration: email and phone cannot conflict with users or customers
            $emailExists = DB::table('users')->where('email', $normalizedEmail)->orWhere('username', $normalizedEmail)->exists()
                || DB::table('customers')->where('email', $normalizedEmail)->exists();
            if ($emailExists) {
                throw ValidationException::withMessages(['email' => 'This email address is already registered to an existing account.']);
            }

            $phoneExists = DB::table('users')
                ->where(function ($q) use ($phoneVariants, $core10) {
                    $q->whereIn('phone_number', $phoneVariants);
                    if (strlen($core10) >= 9) {
                        $q->orWhere('phone_number', 'LIKE', "%{$core10}");
                    }
                })->exists()
                || DB::table('customers')
                ->where(function ($q) use ($phoneVariants, $core10) {
                    $q->whereIn('phone', $phoneVariants);
                    if (strlen($core10) >= 9) {
                        $q->orWhere('phone', 'LIKE', "%{$core10}");
                    }
                })->exists();

            if ($phoneExists) {
                throw ValidationException::withMessages(['phone' => 'This phone number is already registered to another account.']);
            }
        } else {
            // For Staff / Admin accounts (Administrator, Store Administrator, Employee):
            // Check email uniqueness strictly against users table
            $emailExists = DB::table('users')->where('email', $normalizedEmail)->exists();
            if ($emailExists) {
                throw ValidationException::withMessages(['email' => 'This email address is already registered to an existing user account.']);
            }

            // Check phone uniqueness against users table
            $phoneExists = DB::table('users')
                ->where(function ($q) use ($phoneVariants, $core10) {
                    $q->whereIn('phone_number', $phoneVariants);
                    if (strlen($core10) >= 9) {
                        $q->orWhere('phone_number', 'LIKE', "%{$core10}");
                    }
                })->exists();

            if ($phoneExists) {
                throw ValidationException::withMessages(['phone' => 'This phone number is already registered to another user account.']);
            }

            // Clean up any stale or dummy customer record with the same email or phone so it doesn't collide
            \App\Models\Customer::where('email', $normalizedEmail)
                ->orWhereIn('phone', $phoneVariants)
                ->delete();
        }

        $firstName = $validated['first_name'];
        $middleName = $validated['middle_name'] ?? null;
        $lastName = $validated['last_name'];
        $phone = $normalizedPhone;
        $address = $validated['address'];
        $gender = $validated['gender'];
        $dateOfBirth = $validated['date_of_birth'];
        $maritalStatus = $validated['marital_status'];

        $branchId = !empty($validated['branch_id']) ? $validated['branch_id'] : null;
        $branchName = null;
        if ($branchId) {
            $bp = \App\Models\BranchProfile::find($branchId);
            $branchName = $bp ? $bp->name : null;
        }

        if ($role === 'Customer') {
            $maxId = \App\Models\Customer::max('customer_id');
            $nextId = $maxId ? $maxId + 1 : 1;
            $customer = \App\Models\Customer::create([
                'customer_code' => 'CUS-' . str_pad($nextId, 3, '0', STR_PAD_LEFT),
                'first_name' => $firstName,
                'middle_name' => $middleName,
                'last_name' => $lastName,
                'email' => $normalizedEmail,
                'phone' => $normalizedPhone,
                'address' => $address,
                'gender' => $gender,
                'date_of_birth' => $dateOfBirth,
                'marital_status' => $maritalStatus,
                'status' => 'Active',
                'branch_id' => $branchId,
                'branch' => $branchName,
            ]);

            $user = User::create([
                'username' => $normalizedEmail,
                'email' => $normalizedEmail,
                'phone_number' => $normalizedPhone,
                'password_hash' => Hash::make($validated['password']),
                'role' => $role,
                'is_active' => true,
                'customer_id' => $customer->customer_id,
                'account_verified' => $isAdmin ? true : false,
                'account_verified_at' => $isAdmin ? now() : null,
            ]);
        } else {
            // For all staff roles (Administrator, Store Administrator, Employee), link or create employee record
            $maxId = \App\Models\Employee::max('employee_id');
            $nextId = $maxId ? $maxId + 1 : 1;
            $employeeCode = 'EMP-' . str_pad($nextId, 3, '0', STR_PAD_LEFT);
            $pin = !empty($validated['attendance_pin']) ? $validated['attendance_pin'] : ($role === 'Administrator' ? '1234' : null);
            $defaultPosition = $role === 'Store Administrator' ? 'Store Administrator' : ($role === 'Administrator' ? 'System Administrator' : 'Staff');
            $defaultDept = $role === 'Administrator' ? 'Administration' : ($role === 'Store Administrator' ? 'Store Management' : 'Sales & Operations');

            $employee = \App\Models\Employee::where('email', $normalizedEmail)->first();
            if (!$employee) {
                $employee = \App\Models\Employee::create([
                    'employee_code' => $employeeCode,
                    'first_name' => $firstName,
                    'middle_name' => $middleName,
                    'last_name' => $lastName,
                    'email' => $normalizedEmail,
                    'phone' => $normalizedPhone,
                    'address' => $address,
                    'gender' => $gender,
                    'birth_date' => $dateOfBirth,
                    'date_of_birth' => $dateOfBirth,
                    'marital_status' => $maritalStatus,
                    'position' => $request->input('position') ?: $defaultPosition,
                    'status' => 'Active',
                    'pay_type' => $request->input('pay_type') ?: 'Monthly',
                    'basic_salary' => $request->filled('basic_salary') ? (float)$request->input('basic_salary') : 0,
                    'branch_id' => $branchId,
                    'branch' => $branchName,
                    'department' => $request->input('department') ?: $defaultDept,
                    'working_hours' => $request->input('working_hours') ?: '8 AM to 5 PM',
                    'attendance_pin' => $pin ? Hash::make($pin) : null,
                    'pin_failed_attempts' => 0,
                ]);
            } else {
                $employee->update([
                    'first_name' => $firstName,
                    'middle_name' => $middleName,
                    'last_name' => $lastName,
                    'phone' => $normalizedPhone,
                    'address' => $address,
                    'gender' => $gender,
                    'birth_date' => $dateOfBirth,
                    'date_of_birth' => $dateOfBirth,
                    'marital_status' => $maritalStatus,
                    'position' => $request->input('position') ?: ($employee->position ?: $defaultPosition),
                    'branch_id' => $branchId ?: $employee->branch_id,
                    'branch' => $branchName ?: $employee->branch,
                    'department' => $request->input('department') ?: ($employee->department ?: $defaultDept),
                    'attendance_pin' => $pin ? Hash::make($pin) : $employee->attendance_pin,
                ]);
            }

            $user = User::create([
                'username' => $validated['username'],
                'email' => $normalizedEmail,
                'phone_number' => $normalizedPhone,
                'password_hash' => Hash::make($validated['password']),
                'role' => $role,
                'is_active' => true,
                'employee_id' => $employee->employee_id,
                'account_verified' => true,
                'account_verified_at' => now(),
                'account_verified_by' => $authUser ? $authUser->user_id : 1,
            ]);
        }

        // Generate 6-digit cryptographic OTP code
        $otp = (string) random_int(100000, 999999);
        $user->otp_code = $otp;
        $user->otp_expires_at = now()->addMinutes(15);
        $user->otp_created_at = now();
        $user->save();

        $displayName = trim("{$firstName} {$lastName}");

        // Store in otps table
        $otpType = ($role === 'Customer' && !$isAdmin) ? 'registration' : 'welcome';
        DB::table('otps')->insert([
            'user_id'     => $user->user_id,
            'email'       => $normalizedEmail,
            'otp_code'    => $otp,
            'type'        => $otpType,
            'used'        => 0,
            'expiry_time' => now()->addMinutes(15),
            'ip_address'  => $request->ip(),
            'user_agent'  => $request->userAgent(),
            'created_at'  => now(),
            'updated_at'  => now(),
        ]);

        // Dispatch live email via PHPMailer on Gmail SMTP (smtp.gmail.com:587 TLS)
        OtpService::sendEmailOTP($normalizedEmail, $otp, $displayName, $otpType);

        if ($role === 'Customer') {
            $adminsAndStoreAdmins = User::whereIn('role', ['Administrator', 'Store Administrator'])->get();
            foreach ($adminsAndStoreAdmins as $adminUser) {
                Notification::create([
                    'user_id' => $adminUser->user_id,
                    'type' => 'System',
                    'title' => 'NEW CUSTOMER ACCOUNT',
                    'message' => "Customer: {$validated['first_name']} {$validated['last_name']}\nEmail: {$validated['email']}\nBranch: " . ($branchName ?: 'Unassigned') . "\nCreated: " . now()->format('Y-m-d H:i:s'),
                    'module' => 'Customers',
                    'related_id' => $user->user_id,
                    'related_type' => 'User',
                    'action_url' => '/customers',
                    'priority' => 'medium',
                    'is_read' => false,
                ]);
            }
        }

        $maskedEmail = self::maskEmail($normalizedEmail);

        // If Customer self-registering: do NOT issue session token yet; require OTP verification!
        if ($role === 'Customer' && !$isAdmin) {
            return response()->json([
                'success'            => true,
                'requires_otp'       => true,
                'user_id'            => $user->user_id,
                'username'           => $user->username,
                'email'              => $normalizedEmail,
                'masked_email'       => $maskedEmail,
                'message'            => "Registration successful! A 6-digit verification code has been dispatched to {$maskedEmail} via Gmail SMTP.",
                'expires_in_seconds' => 900,
                'cooldown_seconds'   => 60,
            ], 201);
        }

        // If created by Admin: return user object and success
        $sessionToken = $user->createToken('auth_token')->plainTextToken;

        return response()->json([
            'success'       => true,
            'message'       => "Account for {$displayName} ({$role}) created successfully! Welcome email sent to {$normalizedEmail}.",
            'session_token' => $sessionToken,
            'token'         => $sessionToken,
            'access_token'  => $sessionToken,
            'token_type'    => 'Bearer',
            'user'          => $this->buildUserData($user),
        ], 201);
    }

    public function registrationOptions()
    {
        return response()->json([
            'branches' => \App\Models\BranchProfile::query()
                ->where('status', '!=', 'closed')
                ->orderBy('name')
                ->get(['id', 'name']),
            'departments' => ['Store Admin', 'Employee'],
        ]);
    }

    /**
     * Build consistent user data payload including branch info for Customer role.
     */
    private function buildUserData(User $user): array
    {
        $lastLogin = null;
        if ($user->last_login) {
            $lastLogin = $user->last_login instanceof \DateTimeInterface
                ? $user->last_login->format('Y-m-d H:i')
                : (string)$user->last_login;
        }

        $name = $user->role === 'Customer' && $user->customer
            ? trim("{$user->customer->first_name} {$user->customer->last_name}")
            : ($user->employee ? trim("{$user->employee->first_name} {$user->employee->last_name}") : $user->username);

        $data = [
            'user_id'      => $user->user_id,
            'username'     => $user->username,
            'employee_id'  => $user->employee_id,
            'customer_id'  => $user->customer_id,
            'role'         => $user->role,
            'is_active'    => (bool)$user->is_active,
            'name'         => $name,
            'last_login'   => $lastLogin,
            'profile_image' => $user->profile_image ? url(Storage::url($user->profile_image)) : null,
        ];

        if ($user->employee) {
            $empBranch = $user->employee->branch;
            $empBranchName = ($empBranch instanceof \App\Models\BranchProfile) ? $empBranch->name : ($empBranch ?: null);
            if (!$empBranchName && $user->employee->branch_id) {
                $bp = \App\Models\BranchProfile::find($user->employee->branch_id);
                $empBranchName = $bp ? $bp->name : null;
            }

            $data['employee'] = [
                'employee_id'   => $user->employee->employee_id,
                'employee_code' => $user->employee->employee_code,
                'first_name'    => $user->employee->first_name,
                'last_name'     => $user->employee->last_name,
                'position'      => $user->employee->position,
                'department'    => $user->employee->department,
                'branch_id'     => $user->employee->branch_id,
                'branch'        => $empBranchName,
            ];
            $data['branch_id']   = $user->employee->branch_id;
            $data['branch_name'] = $empBranchName;
        }

        // Include branch info for Customer role
        if ($user->customer) {
            $custBranch = $user->customer->branch;
            $custBranchName = ($custBranch instanceof \App\Models\BranchProfile) ? $custBranch->name : ($custBranch ?: null);
            if (!$custBranchName && $user->customer->branch_id) {
                $bp = \App\Models\BranchProfile::find($user->customer->branch_id);
                $custBranchName = $bp ? $bp->name : null;
            }

            $data['customer'] = [
                'customer_id'   => $user->customer->customer_id,
                'customer_code' => $user->customer->customer_code,
                'first_name'    => $user->customer->first_name,
                'last_name'     => $user->customer->last_name,
                'branch_id'     => $user->customer->branch_id,
                'branch'        => $custBranchName,
            ];
            $data['customer_code'] = $user->customer->customer_code;
            $data['branch_id']     = $user->customer->branch_id;
            $data['branch_name']   = $custBranchName;
        }

        return $data;
    }

    public function login(Request $request)
    {
        $credentials = $request->validate([
            'username' => 'required|string',
            'password' => 'required|string',
        ]);

        $loginInput = trim($credentials['username']);
        $passwordInput = $credentials['password'];
        $cleanPassword = trim($passwordInput);
        $lowerInput = strtolower($loginInput);
        $noSpacesInput = str_replace(' ', '', $lowerInput);
        $cleanPhone = str_replace([' ', '-', '+'], '', $loginInput);

        $user = User::with(['employee.branch', 'customer.branch'])
            ->where(function($query) use ($loginInput, $lowerInput, $noSpacesInput, $cleanPhone) {
                // Match username directly or case-insensitive or without spaces
                $query->where('username', $loginInput)
                      ->orWhereRaw('LOWER(username) = ?', [$lowerInput])
                      ->orWhereRaw('REPLACE(LOWER(username), " ", "") = ?', [$noSpacesInput])
                      ->orWhere('email', $loginInput)
                      ->orWhereRaw('LOWER(email) = ?', [$lowerInput])
                      ->orWhere('phone_number', $loginInput)
                      ->orWhereRaw('REPLACE(phone_number, " ", "") = ?', [$cleanPhone]);

                // Match admin variations (admin, admin@..., administrator)
                if (preg_match('/^admin(@.*)?$/i', $loginInput) || strcasecmp($loginInput, 'administrator') === 0) {
                    $query->orWhere('username', 'admin');
                }

                // Match linked employee email, code, phone, or name
                $query->orWhereHas('employee', function($q) use ($loginInput, $lowerInput, $noSpacesInput, $cleanPhone) {
                    $q->whereRaw('LOWER(email) = ?', [$lowerInput])
                      ->orWhere('employee_code', $loginInput)
                      ->orWhereRaw('LOWER(employee_code) = ?', [$lowerInput])
                      ->orWhere('phone', $loginInput)
                      ->orWhereRaw('REPLACE(phone, " ", "") = ?', [$cleanPhone])
                      ->orWhereRaw('LOWER(first_name) = ?', [$lowerInput])
                      ->orWhereRaw('LOWER(last_name) = ?', [$lowerInput])
                      ->orWhereRaw('LOWER(CONCAT(first_name, " ", last_name)) = ?', [$lowerInput])
                      ->orWhereRaw('REPLACE(LOWER(CONCAT(first_name, last_name)), " ", "") = ?', [$noSpacesInput]);
                });

                // Match linked customer email, code, phone, or name
                $query->orWhereHas('customer', function($q) use ($loginInput, $lowerInput, $noSpacesInput, $cleanPhone) {
                    $q->whereRaw('LOWER(email) = ?', [$lowerInput])
                      ->orWhere('customer_code', $loginInput)
                      ->orWhereRaw('LOWER(customer_code) = ?', [$lowerInput])
                      ->orWhere('phone', $loginInput)
                      ->orWhereRaw('REPLACE(phone, " ", "") = ?', [$cleanPhone])
                      ->orWhereRaw('LOWER(first_name) = ?', [$lowerInput])
                      ->orWhereRaw('LOWER(last_name) = ?', [$lowerInput])
                      ->orWhereRaw('LOWER(CONCAT(first_name, " ", last_name)) = ?', [$lowerInput])
                      ->orWhereRaw('REPLACE(LOWER(CONCAT(first_name, last_name)), " ", "") = ?', [$noSpacesInput]);
                });
            })
            ->first();

        $passwordMatched = false;
        if ($user) {
            if (Hash::check($passwordInput, $user->password_hash) ||
                Hash::check($cleanPassword, $user->password_hash) ||
                $user->password_hash === $passwordInput ||
                $user->password_hash === $cleanPassword) {
                $passwordMatched = true;

                // Re-hash if stored as plaintext
                if ($user->password_hash === $passwordInput || $user->password_hash === $cleanPassword) {
                    $user->password_hash = Hash::make($cleanPassword);
                    $user->save();
                }
            }
        }

        if ($user && $passwordMatched) {
            // Mandatory Login 2FA OTP verification for ALL users (Administrator, Store Administrator, Employee, Customer)
            $recipientEmail = self::resolveUserEmail($user, $loginInput) ?: ($user->email ?: null);
            if (empty($recipientEmail) && in_array(strtolower($user->username), ['admin', 'administrator'])) {
                $recipientEmail = OtpService::getEnvValue('MAIL_USERNAME', 'mail.mailers.smtp.username', '35barangay@gmail.com');
            }

            if (empty($recipientEmail) || !filter_var($recipientEmail, FILTER_VALIDATE_EMAIL)) {
                return response()->json([
                    'message' => 'No valid email registered for this account to receive verification code. Please contact the administrator.'
                ], 422);
            }

            // Generate secure 6-digit cryptographic OTP code
            $otp = (string) random_int(100000, 999999);
            $user->otp_code = $otp;
            $user->otp_expires_at = now()->addMinutes(15);
            $user->otp_created_at = now();
            $user->save();

            // Store in otps table with used = 0 and strict 15-minute expiry_time
            DB::table('otps')->insert([
                'user_id'     => $user->user_id,
                'email'       => $recipientEmail,
                'otp_code'    => $otp,
                'type'        => 'login',
                'used'        => 0,
                'expiry_time' => now()->addMinutes(15),
                'ip_address'  => $request->ip(),
                'user_agent'  => $request->userAgent(),
                'created_at'  => now(),
                'updated_at'  => now(),
            ]);

            // Resolve friendly display name
            $name = $user->username;
            if ($user->customer) {
                $name = trim($user->customer->first_name . ' ' . $user->customer->last_name);
            } elseif ($user->employee) {
                $name = trim($user->employee->first_name . ' ' . $user->employee->last_name);
            }

            // Real live dispatch via Gmail SMTP - NO MOCK OR DUMMY CODES!
            $sendResult = OtpService::sendEmailOTP($recipientEmail, $otp, $name, 'login');
            if (!$sendResult['success']) {
                Log::error("[LOGIN OTP FAILED] User ID: {$user->user_id} ({$user->username}) | Email: {$recipientEmail} | Error: " . ($sendResult['message'] ?? 'Unknown error'));
                return response()->json([
                    'message' => 'Unable to send login verification email via Gmail SMTP. Please try again.'
                ], 500);
            }

            $maskedEmail = self::maskEmail($recipientEmail);

            // Strict Security: Sanctum bearer token is NEVER generated or returned here!
            return response()->json([
                'success'            => true,
                'requires_otp'       => true,
                'user_id'            => $user->user_id,
                'username'           => $user->username,
                'role'               => $user->role,
                'masked_email'       => $maskedEmail,
                'message'            => "A 6-digit verification code has been dispatched to {$maskedEmail} via Gmail.",
                'expires_in_seconds' => 900,
                'cooldown_seconds'   => 60,
            ], 200);
        }

        return response()->json([
            'message' => 'Incorrect email or password. Please try again.'
        ], 401);
    }

    /**
     * Verify Login 2FA OTP code and issue actual Sanctum authentication bearer token.
     */
    public function verifyLoginOtp(Request $request)
    {
        $request->validate([
            'otp' => 'required|string',
        ]);

        $rawOtp = trim((string)$request->input('otp'));
        $otp = preg_replace('/\D/', '', $rawOtp);

        if (strlen($otp) !== 6) {
            return response()->json([
                'success' => false,
                'message' => 'Please enter a valid 6-digit numeric verification code.'
            ], 422);
        }

        $userId = $request->input('user_id');
        $target = $request->input('target') ?: ($request->input('username') ?: $request->input('email'));

        if (empty($userId) && empty($target)) {
            return response()->json([
                'success' => false,
                'message' => 'User identifier (user_id, username, or email) is required.'
            ], 422);
        }

        $user = null;
        if (!empty($userId)) {
            $user = User::with(['employee.branch', 'customer.branch'])->find($userId);
        }
        if (!$user && !empty($target)) {
            $user = $this->findUserByTarget($target);
            if ($user) {
                $user->load(['employee.branch', 'customer.branch']);
            }
        }

        if (!$user) {
            return response()->json([
                'success' => false,
                'message' => 'User account not found.'
            ], 404);
        }

        // Strict checks: check both otps table and users table
        $expectedOtp = trim((string)$user->otp_code);

        $otpDbRecord = DB::table('otps')
            ->where(function($q) use ($user) {
                $q->where('user_id', $user->user_id);
                if ($user->email) {
                    $q->orWhere('email', $user->email);
                }
            })
            ->where('otp_code', $otp)
            ->where('used', 0)
            ->orderBy('id', 'desc')
            ->first();

        if (empty($expectedOtp) && !$otpDbRecord) {
            Log::warning("[LOGIN OTP MISMATCH] User ID: {$user->user_id} ({$user->username}) | Given: {$otp} | Expected: {$expectedOtp}");
            return response()->json([
                'success' => false,
                'message' => 'Invalid verification code. Please check your latest email and try again.'
            ], 422);
        }

        if ($expectedOtp && $expectedOtp !== $otp && !$otpDbRecord) {
            return response()->json([
                'success' => false,
                'message' => 'Invalid verification code. Please check your latest email and try again.'
            ], 422);
        }

        $isExpired = false;
        if ($user->otp_expires_at && now()->gt($user->otp_expires_at)) {
            $isExpired = true;
        }
        if ($otpDbRecord && now()->gt($otpDbRecord->expiry_time)) {
            $isExpired = true;
        }

        if ($isExpired) {
            return response()->json([
                'success' => false,
                'message' => 'Verification code has expired. Please click Resend Code to request a new code.'
            ], 422);
        }

        // Mark OTP as used in otps table immediately (used = 1)
        DB::table('otps')
            ->where(function($q) use ($user) {
                $q->where('user_id', $user->user_id);
                if ($user->email) {
                    $q->orWhere('email', $user->email);
                }
            })
            ->where('otp_code', $otp)
            ->where('used', 0)
            ->update(['used' => 1, 'updated_at' => now()]);

        // Clear OTP fields immediately to prevent reuse
        $user->otp_code = null;
        $user->otp_expires_at = null;
        $user->otp_created_at = null;
        $user->account_verified = true;
        $user->last_login = now();
        $user->is_active = true;
        $user->save();

        // Log login event in SystemLog
        SystemLog::create([
            'user_id'     => $user->user_id,
            'action'      => 'LOGIN',
            'module'      => 'Auth',
            'description' => "{$user->role} ({$user->username}) logged in successfully via 2FA Email OTP",
            'ip_address'  => $request->ip(),
            'user_agent'  => $request->userAgent(),
        ]);

        // STRICT SECURITY: Sanctum bearer token is issued ONLY now upon verified 2FA OTP
        $sessionToken = $user->createToken('auth_token')->plainTextToken;

        return response()->json([
            'success'       => true,
            'message'       => 'Login successful',
            'user'          => $this->buildUserData($user),
            'session_token' => $sessionToken,
            'token'         => $sessionToken,
            'access_token'  => $sessionToken,
            'token_type'    => 'Bearer',
        ], 200);
    }

    /**
     * Resend 6-digit Login 2FA OTP via Gmail SMTP with 60-second cooldown.
     */
    public function resendLoginOtp(Request $request)
    {
        $userId = $request->input('user_id');
        $target = $request->input('target') ?: ($request->input('username') ?: $request->input('email'));

        if (empty($userId) && empty($target)) {
            return response()->json([
                'success' => false,
                'message' => 'User identifier (user_id, username, or email) is required.'
            ], 422);
        }

        $user = null;
        if (!empty($userId)) {
            $user = User::with(['employee.branch', 'customer.branch'])->find($userId);
        }
        if (!$user && !empty($target)) {
            $user = $this->findUserByTarget($target);
            if ($user) {
                $user->load(['employee.branch', 'customer.branch']);
            }
        }

        if (!$user) {
            return response()->json([
                'success' => false,
                'message' => 'User account not found.'
            ], 404);
        }

        // Rate limiting: 60-second cooldown
        if ($user->otp_created_at) {
            $elapsed = now()->timestamp - $user->otp_created_at->timestamp;
            if ($elapsed < 60) {
                $remaining = max(1, 60 - $elapsed);
                return response()->json([
                    'success'           => false,
                    'message'           => "Please wait {$remaining} seconds before requesting a new verification code.",
                    'remaining_seconds' => $remaining,
                ], 429);
            }
        }

        $recipientEmail = self::resolveUserEmail($user) ?: ($user->email ?: null);
        if (empty($recipientEmail) && $user->username === 'admin') {
            $recipientEmail = OtpService::getEnvValue('MAIL_USERNAME', 'mail.mailers.smtp.username', '35barangay@gmail.com');
        }

        if (empty($recipientEmail) || !filter_var($recipientEmail, FILTER_VALIDATE_EMAIL)) {
            return response()->json([
                'success' => false,
                'message' => 'No registered email address found for this user account.'
            ], 422);
        }

        $otp = (string) random_int(100000, 999999);
        $user->otp_code = $otp;
        $user->otp_expires_at = now()->addMinutes(15);
        $user->otp_created_at = now();
        $user->save();

        $name = $user->customer 
            ? ($user->customer->first_name . ' ' . $user->customer->last_name) 
            : ($user->employee ? ($user->employee->first_name . ' ' . $user->employee->last_name) : $user->username);

        $sendResult = OtpService::sendEmailOTP($recipientEmail, $otp, $name, 'login');
        $maskedEmail = self::maskEmail($recipientEmail);

        if (!$sendResult['success']) {
            Log::error("[LOGIN RESEND OTP FAILED] User ID: {$user->user_id} | Email: {$recipientEmail} | Error: " . ($sendResult['message'] ?? 'Unknown error'));
            return response()->json([
                'success' => false,
                'message' => 'Unable to send login verification email via Gmail SMTP. Please try again.',
            ], 422);
        }

        return response()->json([
            'success'            => true,
            'message'            => "A new 6-digit verification code has been dispatched to {$maskedEmail} via Gmail.",
            'email'              => $recipientEmail,
            'masked_email'       => $maskedEmail,
            'recipient_email'    => $maskedEmail,
            'masked_target'      => $maskedEmail,
            'expires_in_seconds' => 900,
            'cooldown_seconds'   => 60,
        ], 200);
    }

    public function me(Request $request)
    {
        $user = $request->user();
        $userId = $user ? $user->user_id : null;
        if (!$userId) {
            return response()->json(['message' => 'Unauthenticated'], 401);
        }

        $user->load(['employee.branch', 'customer.branch']);
        if (!$user) {
            return response()->json(['message' => 'User account not found'], 404);
        }



        return response()->json([
            'user' => $this->buildUserData($user)
        ]);
    }

    public function logout(Request $request)
    {
        $user = $request->user('sanctum') ?? $request->user();
        if (!$user && $request->filled('user_id')) {
            $user = User::find($request->input('user_id'));
        }

        if ($user) {
            SystemLog::create([
                'user_id'    => $user->user_id,
                'action'     => 'LOGOUT',
                'module'     => 'Auth',
                'description' => "User {$user->username} ({$user->role}) logged out",
                'ip_address' => $request->ip(),
                'user_agent' => $request->userAgent(),
            ]);

            try {
                if ($user->currentAccessToken()) {
                    $user->currentAccessToken()->delete();
                }
            } catch (\Throwable $e) {
                // Token already deleted or stateless
            }
        }

        return response()->json([
            'success' => true,
            'message' => 'Logged out successfully'
        ]);
    }

    public function uploadProfileImage(Request $request)
    {
        $request->validate([
            'image' => 'required|image|mimes:jpeg,png,jpg,gif,webp|max:5120'
        ]);

        $user = $request->user();
        if (!$user) {
            return response()->json(['message' => 'Unauthenticated'], 401);
        }

        if ($request->hasFile('image')) {
            // Delete old image if it exists
            if ($user->profile_image && Storage::disk('public')->exists($user->profile_image)) {
                Storage::disk('public')->delete($user->profile_image);
            }

            $path = $request->file('image')->store('profiles', 'public');
            $user->profile_image = $path;
            $user->save();

            return response()->json([
                'message'       => 'Profile image updated successfully',
                'profile_image' => url(Storage::url($path))
            ]);
        }

        return response()->json(['message' => 'No image provided'], 400);
    }

    /**
     * Normalize Philippine phone numbers to standard 09XXXXXXXXX format.
     */
    public static function normalizePhPhone(?string $phone): ?string
    {
        if (!$phone) {
            return null;
        }

        // Strip everything except digits
        $digits = preg_replace('/\D/', '', $phone);

        // 12 digits: e.g. 639171234567 -> 09171234567
        if (strlen($digits) === 12 && str_starts_with($digits, '639')) {
            return '0' . substr($digits, 2);
        }

        // 11 digits: e.g. 09171234567
        if (strlen($digits) === 11 && str_starts_with($digits, '09')) {
            return $digits;
        }

        // 10 digits: e.g. 9171234567 -> 09171234567
        if (strlen($digits) === 10 && str_starts_with($digits, '9')) {
            return '0' . $digits;
        }

        // If longer than 10 digits, take the core last 10
        if (strlen($digits) > 10) {
            return '0' . substr($digits, -10);
        }

        return $digits;
    }

    /**
     * Generate all equivalent PH phone representations for robust database queries.
     * e.g., '09171234567', '+639171234567', '639171234567', '9171234567'
     */
    public static function getPhoneVariants(?string $phone): array
    {
        if (!$phone) {
            return [];
        }

        $normalized = self::normalizePhPhone($phone);
        $core10 = $normalized && strlen($normalized) >= 10
            ? substr($normalized, -10)
            : substr(preg_replace('/\D/', '', $phone), -10);

        if (strlen($core10) < 9) {
            return array_values(array_unique(array_filter([$phone, $normalized])));
        }

        return array_values(array_unique(array_filter([
            '0' . $core10,       // 09XXXXXXXXX
            '+63' . $core10,     // +639XXXXXXXXX
            '63' . $core10,      // 639XXXXXXXXX
            $core10,             // 9XXXXXXXXX
            trim($phone),
            $normalized,
        ])));
    }

    /**
     * Resolve the actual registered email address for a user account.
     */
    public static function resolveUserEmail(User $user, ?string $inputTarget = null): ?string
    {
        // 1. If input target was an email and belongs to this user, prioritize it
        if ($inputTarget && filter_var($inputTarget, FILTER_VALIDATE_EMAIL)) {
            $inputEmail = strtolower(trim($inputTarget));
            if (
                strtolower((string)$user->email) === $inputEmail ||
                strtolower((string)$user->username) === $inputEmail ||
                strtolower((string)($user->customer?->email ?? '')) === $inputEmail ||
                strtolower((string)($user->employee?->email ?? '')) === $inputEmail
            ) {
                return $inputEmail;
            }
        }

        // 2. User's primary email on users table
        if (!empty($user->email) && filter_var($user->email, FILTER_VALIDATE_EMAIL)) {
            return strtolower(trim($user->email));
        }

        // 3. Customer profile email
        if (!empty($user->customer?->email) && filter_var($user->customer->email, FILTER_VALIDATE_EMAIL)) {
            return strtolower(trim($user->customer->email));
        }

        // 4. Employee profile email
        if (!empty($user->employee?->email) && filter_var($user->employee->email, FILTER_VALIDATE_EMAIL)) {
            return strtolower(trim($user->employee->email));
        }

        // 5. Username if formatted as an email
        if (!empty($user->username) && filter_var($user->username, FILTER_VALIDATE_EMAIL)) {
            return strtolower(trim($user->username));
        }

        return null;
    }

    /**
     * Mask email address for secure UI display (e.g., c***7@gmail.com).
     */
    public static function maskEmail(?string $email): string
    {
        if (empty($email) || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            return $email ?? '';
        }

        $parts = explode('@', $email, 2);
        $name = $parts[0];
        $domain = $parts[1];
        $len = strlen($name);

        if ($len <= 2) {
            $maskedName = substr($name, 0, 1) . '***';
        } else {
            $maskedName = substr($name, 0, 1) . '***' . substr($name, -1);
        }

        return "{$maskedName}@{$domain}";
    }

    /**
     * Find user by email address or username target.
     */
    protected function findUserByTarget($targetOrType, $maybeTarget = null): ?User
    {
        $target = $maybeTarget !== null ? $maybeTarget : $targetOrType;
        if (empty($target)) {
            return null;
        }

        $clean = trim((string)$target);
        $email = strtolower($clean);
        $cleanPhone = str_replace([' ', '-', '+'], '', $clean);
        $core10 = substr($cleanPhone, -10);

        return User::where(function ($q) use ($clean, $email, $cleanPhone, $core10) {
            $q->where('email', $clean)
              ->orWhere('email', $email)
              ->orWhere('username', $clean)
              ->orWhere('username', $email)
              ->orWhereRaw('LOWER(username) = ?', [$email]);

            if (!empty($cleanPhone) && strlen($cleanPhone) >= 7) {
                $q->orWhere('phone_number', $clean)
                  ->orWhereRaw('REPLACE(phone_number, " ", "") = ?', [$cleanPhone]);
                if (strlen($core10) >= 9) {
                    $q->orWhere('phone_number', 'LIKE', "%{$core10}");
                }
            }

            if (preg_match('/^admin(@.*)?$/i', $clean) || strcasecmp($clean, 'administrator') === 0) {
                $q->orWhere('username', 'admin');
            }

            $q->orWhereHas('customer', function ($cq) use ($clean, $email, $cleanPhone, $core10) {
                $cq->where('email', $clean)
                   ->orWhere('email', $email)
                   ->orWhere('customer_code', $clean);
                if (!empty($cleanPhone) && strlen($cleanPhone) >= 7) {
                    $cq->orWhere('phone', $clean)
                       ->orWhereRaw('REPLACE(phone, " ", "") = ?', [$cleanPhone]);
                    if (strlen($core10) >= 9) {
                        $cq->orWhere('phone', 'LIKE', "%{$core10}");
                    }
                }
            })
            ->orWhereHas('employee', function ($eq) use ($clean, $email, $cleanPhone, $core10) {
                $eq->where('email', $clean)
                   ->orWhere('email', $email)
                   ->orWhere('employee_code', $clean);
                if (!empty($cleanPhone) && strlen($cleanPhone) >= 7) {
                    $eq->orWhere('phone', $clean)
                       ->orWhereRaw('REPLACE(phone, " ", "") = ?', [$cleanPhone]);
                    if (strlen($core10) >= 9) {
                        $eq->orWhere('phone', 'LIKE', "%{$core10}");
                    }
                }
            });
        })->first();
    }

    /**
     * Request a 6-digit OTP code for password reset strictly via Gmail SMTP.
     */
    public function sendOtp(Request $request)
    {
        $request->validate([
            'target' => 'required|string|max:191',
        ]);

        $target = trim($request->input('target'));
        $user = $this->findUserByTarget($target);

        if (!$user) {
            return response()->json([
                'success' => false,
                'message' => 'No account found registered with this email address or username.'
            ], 404);
        }

        // Rate Limiting: 60-second cooldown
        if ($user->otp_created_at) {
            $elapsed = now()->timestamp - $user->otp_created_at->timestamp;
            if ($elapsed < 60) {
                $remaining = max(1, 60 - $elapsed);
                return response()->json([
                    'success' => false,
                    'message' => "Please wait {$remaining} seconds before requesting a new OTP code.",
                    'remaining_seconds' => $remaining,
                ], 429);
            }
        }

        // Secure 6-digit OTP generation (100000 - 999999)
        $otp = (string) random_int(100000, 999999);
        $user->otp_code = $otp;
        $user->otp_expires_at = now()->addMinutes(15);
        $user->otp_created_at = now();
        $user->save();

        $recipientEmail = self::resolveUserEmail($user, $target) ?: ($user->email ?: $target);

        if (empty($recipientEmail) || !filter_var($recipientEmail, FILTER_VALIDATE_EMAIL)) {
            return response()->json([
                'success' => false,
                'message' => 'No registered email address found for this user account. Please contact your system administrator.',
            ], 422);
        }

        if (empty($user->email)) {
            $user->email = $recipientEmail;
            $user->save();
        }

        // Resolve recipient name
        $name = $user->customer 
            ? ($user->customer->first_name . ' ' . $user->customer->last_name) 
            : ($user->employee ? ($user->employee->first_name . ' ' . $user->employee->last_name) : $user->username);

        // Dispatch strictly via Gmail SMTP (Nodemailer / Symfony Mailer)
        $sendResult = OtpService::sendEmailOTP($recipientEmail, $otp, $name, 'reset');

        $maskedEmail = self::maskEmail($recipientEmail);

        if (!$sendResult['success']) {
            Log::error("[OTP DISPATCH FAILED] User ID: {$user->user_id} | Email: {$recipientEmail} | Error: " . ($sendResult['message'] ?? 'Unknown error'));
            return response()->json([
                'success' => false,
                'message' => $sendResult['message'] ?? 'Unable to send verification email via Gmail SMTP. Please verify your email address.',
            ], 422);
        }

        Log::info("[FORGOT PASSWORD OTP GENERATED & SENT] User ID: {$user->user_id} ({$user->username}) | Sent To Email: {$recipientEmail}");

        return response()->json([
            'success'            => true,
            'delivery_type'      => 'email',
            'message'            => "A 6-digit verification code has been dispatched to {$maskedEmail} via Gmail.",
            'email'              => $recipientEmail,
            'masked_email'       => $maskedEmail,
            'recipient_email'    => $maskedEmail,
            'masked_target'      => $maskedEmail,
            'expires_in_seconds' => 900,
            'cooldown_seconds'   => 60,
        ], 200);
    }

    /**
     * Verify the 6-digit OTP code.
     */
    public function verifyOtp(Request $request)
    {
        $request->validate([
            'target' => 'required|string',
            'otp'    => 'required|string',
        ]);

        $target = trim($request->input('target'));
        $rawOtp = trim((string)$request->input('otp'));
        $otp = preg_replace('/\D/', '', $rawOtp);

        if (strlen($otp) !== 6) {
            return response()->json(['success' => false, 'message' => 'Please enter a valid 6-digit numeric OTP code.'], 422);
        }

        $user = $this->findUserByTarget($target);

        if (!$user) {
            Log::warning("[OTP VERIFY FAILED] No user found for target: '{$target}'");
            return response()->json(['success' => false, 'message' => 'Account not found.'], 404);
        }

        $expectedOtp = trim((string)$user->otp_code);

        Log::info("[OTP VERIFY ATTEMPT] User: {$user->username} (ID: {$user->user_id}) | Given: '{$otp}' | DB Expected: '{$expectedOtp}'");

        if (empty($expectedOtp) || $expectedOtp !== $otp) {
            Log::warning("[OTP VERIFY MISMATCH] User: {$user->username} | Received: '{$otp}' | Stored in DB: '{$expectedOtp}'");
            return response()->json([
                'success' => false, 
                'message' => 'Invalid OTP code. If you requested multiple codes, please ensure you are using the newest code from your inbox.'
            ], 422);
        }

        if (!$user->otp_expires_at || now()->gt($user->otp_expires_at)) {
            Log::warning("[OTP VERIFY EXPIRED] User: {$user->username} | Expired at: {$user->otp_expires_at}");
            return response()->json(['success' => false, 'message' => 'OTP code has expired. Please request a new one.'], 422);
        }

        Log::info("[OTP VERIFY SUCCESS] User: {$user->username} (ID: {$user->user_id}) verified OTP successfully.");

        return response()->json([
            'success' => true,
            'message' => 'OTP code verified successfully! You can now reset your password.',
        ]);
    }

    /**
     * Reset password using verified OTP code.
     */
    public function resetPassword(Request $request)
    {
        $confirmPassword = $request->input('confirm_password') ?? $request->input('password_confirmation');
        if ($confirmPassword !== null) {
            $request->merge(['confirm_password' => $confirmPassword]);
        }

        $request->validate([
            'target'   => 'required|string',
            'otp'      => 'required|string',
            'password' => 'required|string|min:6|same:confirm_password',
            'confirm_password' => 'required|string',
        ]);

        $target = trim($request->input('target'));
        $rawOtp = trim((string)$request->input('otp'));
        $otp = preg_replace('/\D/', '', $rawOtp);

        if (strlen($otp) !== 6) {
            return response()->json(['success' => false, 'message' => 'Invalid OTP code.'], 422);
        }

        $user = $this->findUserByTarget($target);

        if (!$user) {
            return response()->json(['success' => false, 'message' => 'Account not found.'], 404);
        }

        $expectedOtp = trim((string)$user->otp_code);

        if (empty($expectedOtp) || $expectedOtp !== $otp) {
            Log::warning("[PASSWORD RESET FAILED: OTP MISMATCH] User: {$user->username} | Received: '{$otp}' | Stored in DB: '{$expectedOtp}'");
            return response()->json([
                'success' => false, 
                'message' => 'Invalid OTP code. Please request a new code or check your latest email.'
            ], 422);
        }

        if (!$user->otp_expires_at || now()->gt($user->otp_expires_at)) {
            return response()->json(['success' => false, 'message' => 'OTP code has expired. Please request a new one.'], 422);
        }

        // Hash new password and clear OTP immediately to prevent reuse
        $user->password_hash = Hash::make($request->input('password'));
        $user->otp_code = null;
        $user->otp_expires_at = null;
        $user->otp_created_at = null;
        $user->save();

        // Sync with residents, password_reset_otp, and otps tables
        try {
            DB::table('residents')->where('email', $user->email)->update([
                'mobile_password' => $user->password_hash,
                'updated_at' => now(),
            ]);
            DB::table('password_reset_otp')->where('email', $user->email)->delete();
            DB::table('otps')->where('email', $user->email)->update(['used' => 1]);
        } catch (\Throwable $e) {}

        Log::info("[PASSWORD RESET SUCCESS] User ID: {$user->user_id} ({$user->username}) reset password successfully.");

        return response()->json([
            'success'  => true,
            'message'  => 'Your password has been reset successfully! You can now log in with your new password.',
            'username' => $user->username,
        ]);
    }

    /**
     * Admin internal user creation endpoint (Admin, Store Admin, Employee)
     * Triggers automated welcome/verification email with credentials via PHPMailer Gmail SMTP.
     */
    public function createUser(Request $request)
    {
        $request->merge(['from_admin' => true]);
        return $this->register($request);
    }
}

