<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\User;
use App\Models\SystemLog;
use App\Models\BackupLog;
use App\Models\Product;
use App\Models\InstallmentAccount;
use App\Models\Payment;
use App\Models\Payroll;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use App\Services\NotificationService;
use App\Services\CategoryFramework;
use App\Models\Setting;
use App\Models\BranchProfile;
use Illuminate\Support\Facades\Cache;

class SystemController extends Controller
{
    private function resolveBranch($model)
    {
        if (!$model) return [null, null, null];
        $branchId = $model->branch_id ?? null;
        $branchName = null;

        if ($model->relationLoaded('branch') && $model->getRelation('branch') instanceof \App\Models\BranchProfile) {
            $branchObj = $model->getRelation('branch');
            $branchId = $branchObj->id;
            $branchName = $branchObj->name;
        } elseif ($model->relationLoaded('branchProfile') && $model->getRelation('branchProfile') instanceof \App\Models\BranchProfile) {
            $branchObj = $model->getRelation('branchProfile');
            $branchId = $branchObj->id;
            $branchName = $branchObj->name;
        }

        if (!$branchName && !empty($model->getAttributes()['branch'])) {
            $branchName = (string)$model->getAttributes()['branch'];
        }

        if (!$branchName && $branchId) {
            $bp = \App\Models\BranchProfile::find($branchId);
            $branchName = $bp ? $bp->name : null;
        }

        if (!$branchId && $branchName) {
            $bp = \App\Models\BranchProfile::where('name', $branchName)->first();
            $branchId = $bp ? $bp->id : null;
        }

        $branchObj = ($branchId || $branchName) ? ['id' => $branchId, 'name' => $branchName] : null;
        return [$branchId, $branchName, $branchObj];
    }

    private function resolveActingUserId(Request $request)
    {
        $user = $request->user('sanctum') ?? $request->user();
        if ($user && $user->user_id) {
            return $user->user_id;
        }

        $cand = $request->input('auth_user_id') ?? $request->input('user_id');
        if ($cand && User::where('user_id', $cand)->exists()) {
            return (int)$cand;
        }

        $adminId = User::where('role', 'Administrator')->value('user_id');
        return $adminId ?: User::first()?->user_id;
    }

    // ─── Users ──────────────────────────────────────────────────────────────────
    public function users(Request $request)
    {
        User::syncSessionStatuses($request->user(), 'users', true);

        $users = User::with(['employee.branch', 'customer.branch', 'verifiedBy'])->orderBy('user_id')->get()->map(function ($u) {
            $emp = $u->employee;
            $cust = $u->customer;
            $verifiedBy = $u->verifiedBy;
            $verifiedByName = $verifiedBy ? ($verifiedBy->employee ? trim("{$verifiedBy->employee->first_name} {$verifiedBy->employee->last_name}") : $verifiedBy->username) : ($u->account_verified ? 'Administrator' : null);

            list($branchId, $branchName, $branchObj) = $this->resolveBranch($emp ?: $cust);
            $liveStatus = $u->is_active ? 'Active' : 'Inactive';

            return [
                'user_id' => $u->user_id,
                'employee_id' => $u->employee_id,
                'customer_id' => $u->customer_id,
                'username' => $u->username,
                'role' => $u->role,
                'is_active' => (bool)$u->is_active,
                'status' => $liveStatus,
                'account_verified' => (bool)$u->account_verified,
                'account_verified_at' => $u->account_verified_at ? date('Y-m-d H:i:s', strtotime($u->account_verified_at)) : null,
                'account_verified_by' => $u->account_verified_by,
                'verified_by_name' => $verifiedByName,
                'last_login' => $u->last_login ? date('Y-m-d H:i', strtotime($u->last_login)) : '—',
                'created_date' => $u->created_at ? date('Y-m-d', strtotime($u->created_at)) : '—',
                'branch_id' => $branchId,
                'branch_name' => $branchName,
                'branch' => $branchObj,
                'employee' => $emp ? [
                    'employee_id' => $emp->employee_id,
                    'employee_code' => $emp->employee_code,
                    'first_name' => $emp->first_name,
                    'middle_name' => $emp->middle_name,
                    'last_name' => $emp->last_name,
                    'gender' => $emp->gender,
                    'date_of_birth' => $emp->date_of_birth ?: $emp->birth_date,
                    'marital_status' => $emp->marital_status,
                    'position' => $emp->position,
                    'department' => $emp->department,
                    'branch_id' => $emp->branch_id,
                    'branch' => $branchObj,
                    'branch_name' => $branchName,
                    'pay_type' => $emp->pay_type,
                    'working_hours' => $emp->working_hours,
                    'basic_salary' => $emp->basic_salary,
                    'daily_rate' => $emp->daily_rate,
                    'hourly_rate' => $emp->hourly_rate,
                    'phone' => $emp->phone,
                    'email' => $emp->email,
                    'address' => $emp->address,
                    'status' => $liveStatus,
                ] : null,
                'customer' => $cust ? [
                    'customer_id' => $cust->customer_id,
                    'customer_code' => $cust->customer_code,
                    'first_name' => $cust->first_name,
                    'last_name' => $cust->last_name,
                    'phone' => $cust->phone,
                    'email' => $cust->email,
                    'address' => $cust->address,
                    'status' => $liveStatus,
                    'branch_id' => $cust->branch_id,
                    'branch' => $branchObj,
                    'branch_name' => $branchName,
                ] : null,
            ];
        });

        return response()->json([
            'users' => $users,
            'total' => $users->count(),
        ]);
    }

    public function showUser(Request $request, $id)
    {
        User::syncSessionStatuses($request->user(), 'users', true);

        $u = User::with(['employee.branch', 'customer.branch', 'verifiedBy'])->findOrFail($id);
        $emp = $u->employee;
        $cust = $u->customer;
        $verifiedBy = $u->verifiedBy;
        $verifiedByName = $verifiedBy ? ($verifiedBy->employee ? trim("{$verifiedBy->employee->first_name} {$verifiedBy->employee->last_name}") : $verifiedBy->username) : ($u->account_verified ? 'Administrator' : null);

        list($branchId, $branchName, $branchObj) = $this->resolveBranch($emp ?: $cust);

        return response()->json([
            'user' => [
                'user_id' => $u->user_id,
                'employee_id' => $u->employee_id,
                'customer_id' => $u->customer_id,
                'username' => $u->username,
                'role' => $u->role,
                'is_active' => (bool)$u->is_active,
                'account_verified' => (bool)$u->account_verified,
                'account_verified_at' => $u->account_verified_at ? date('Y-m-d H:i:s', strtotime($u->account_verified_at)) : null,
                'account_verified_by' => $u->account_verified_by,
                'verified_by_name' => $verifiedByName,
                'last_login' => $u->last_login ? date('Y-m-d H:i', strtotime($u->last_login)) : '—',
                'created_date' => $u->created_at ? date('Y-m-d', strtotime($u->created_at)) : '—',
                'branch_id' => $branchId,
                'branch_name' => $branchName,
                'branch' => $branchObj,
                'employee' => $emp ? [
                    'employee_id' => $emp->employee_id,
                    'employee_code' => $emp->employee_code,
                    'first_name' => $emp->first_name,
                    'middle_name' => $emp->middle_name,
                    'last_name' => $emp->last_name,
                    'gender' => $emp->gender,
                    'date_of_birth' => $emp->date_of_birth ?: $emp->birth_date,
                    'marital_status' => $emp->marital_status,
                    'position' => $emp->position,
                    'department' => $emp->department,
                    'branch_id' => $emp->branch_id,
                    'branch' => $branchObj,
                    'branch_name' => $branchName,
                    'pay_type' => $emp->pay_type,
                    'working_hours' => $emp->working_hours,
                    'basic_salary' => $emp->basic_salary,
                    'daily_rate' => $emp->daily_rate,
                    'hourly_rate' => $emp->hourly_rate,
                    'phone' => $emp->phone,
                    'email' => $emp->email,
                    'address' => $emp->address,
                    'status' => $emp->status,
                ] : null,
                'customer' => $cust ? [
                    'customer_id' => $cust->customer_id,
                    'customer_code' => $cust->customer_code,
                    'first_name' => $cust->first_name,
                    'last_name' => $cust->last_name,
                    'phone' => $cust->phone,
                    'email' => $cust->email,
                    'address' => $cust->address,
                    'status' => $cust->status,
                    'branch_id' => $cust->branch_id,
                    'branch' => $branchObj,
                    'branch_name' => $branchName,
                ] : null,
            ]
        ]);
    }

    public function verifyUser(Request $request, $id)
    {
        $admin = $request->user();
        if (!$admin || $admin->role !== 'Administrator') {
            return response()->json([
                'success' => false,
                'message' => 'Unauthorized. Only administrators can verify user accounts.',
            ], 403);
        }

        $user = User::with(['employee', 'customer'])->findOrFail($id);

        if (!$user->employee_id && !$user->customer_id) {
            return response()->json([
                'success' => false,
                'message' => 'This user account is not linked to an employee or customer record.',
            ], 422);
        }

        $now = now();
        $user->account_verified = true;
        $user->account_verified_at = $now;
        $user->account_verified_by = $admin->user_id;
        $user->save();

        if ($user->employee) {
            $user->employee->account_verified = true;
            $user->employee->account_verified_at = $now;
            $user->employee->information_verified = true;
            $user->employee->information_verified_at = $now;
            $user->employee->save();
        }

        if ($user->customer) {
            $user->customer->status = 'Active';
            $user->customer->save();
        }

        $personName = $user->employee
            ? trim("{$user->employee->first_name} {$user->employee->last_name}")
            : ($user->customer ? trim("{$user->customer->first_name} {$user->customer->last_name}") : $user->username);
        $empCode = $user->employee ? $user->employee->employee_code : ($user->customer ? $user->customer->customer_code : 'N/A');

        SystemLog::create([
            'user_id' => $admin->user_id,
            'action' => 'VERIFY_ACCOUNT',
            'module' => 'Users',
            'description' => "Administrator {$admin->username} verified account for {$user->username} ({$user->role}) - Profile: {$personName} ({$empCode})",
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
        ]);

        // Send real notification to the verified user
        NotificationService::sendToUser($user->user_id, [
            'type' => 'employee_account_verification',
            'title' => 'Account Verified',
            'message' => "Your {$user->role} account has been verified by Administrator {$admin->username}.",
            'module' => 'Account',
            'related_id' => $user->user_id,
            'related_type' => 'App\Models\User',
            'action_url' => '/profile',
            'priority' => 'normal',
        ]);

        return response()->json([
            'success' => true,
            'message' => "User account for {$user->username} successfully verified by Administrator.",
            'user' => [
                'user_id' => $user->user_id,
                'username' => $user->username,
                'role' => $user->role,
                'is_active' => (bool)$user->is_active,
                'account_verified' => true,
                'account_verified_at' => $now->toIso8601String(),
                'account_verified_by' => $admin->user_id,
                'verified_by_name' => $admin->employee ? trim("{$admin->employee->first_name} {$admin->employee->last_name}") : $admin->username,
            ]
        ]);
    }

    public function revokeUserVerification(Request $request, $id)
    {
        $admin = $request->user();
        if (!$admin || $admin->role !== 'Administrator') {
            return response()->json([
                'success' => false,
                'message' => 'Unauthorized. Only administrators can revoke account verification.',
            ], 403);
        }

        $user = User::with('employee')->findOrFail($id);

        $user->account_verified = false;
        $user->account_verified_at = null;
        $user->account_verified_by = null;
        $user->save();

        if ($user->employee) {
            $user->employee->account_verified = false;
            $user->employee->account_verified_at = null;
            $user->employee->information_verified = false;
            $user->employee->information_verified_at = null;
            $user->employee->save();
        }

        SystemLog::create([
            'user_id' => $admin->user_id,
            'action' => 'REVOKE_VERIFICATION',
            'module' => 'Users',
            'description' => "Administrator {$admin->username} revoked account verification for {$user->username} ({$user->role})",
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
        ]);

        // Send real notification to user regarding revocation
        NotificationService::sendToUser($user->user_id, [
            'type' => 'employee_account_verification',
            'title' => 'Account Verification Revoked',
            'message' => "Your account verification has been revoked by Administrator {$admin->username}. Please contact HR or System Administrator.",
            'module' => 'Account',
            'related_id' => $user->user_id,
            'related_type' => 'App\Models\User',
            'action_url' => '/profile',
            'priority' => 'high',
        ]);

        return response()->json([
            'success' => true,
            'message' => "Account verification revoked for {$user->username}.",
            'user' => [
                'user_id' => $user->user_id,
                'username' => $user->username,
                'role' => $user->role,
                'is_active' => (bool)$user->is_active,
                'account_verified' => false,
                'account_verified_at' => null,
                'account_verified_by' => null,
                'verified_by_name' => null,
            ]
        ]);
    }

    public function storeUser(Request $request)
    {
        $role = $request->input('role');
        if (in_array($role, ['Store Admin', 'Manager (Store Admin)'])) {
            $request->merge(['role' => 'Store Administrator']);
            if (!$request->filled('position')) {
                $request->merge(['position' => 'Manager (Store Admin)']);
            }
        } elseif (in_array($role, ['Cashier (Employee)', 'Collector (Employee)', 'Utility (Employee)'])) {
            if (!$request->filled('position')) {
                $request->merge(['position' => $role]);
            }
            $request->merge(['role' => 'Employee']);
        }

        $validated = $request->validate([
            'username' => 'required|string|unique:users,username|max:100',
            'password' => 'required|string|min:4',
            'role' => 'required|string|in:Administrator,Store Administrator,Employee,Customer',
            'is_active' => 'nullable|boolean',
            'employee_id' => 'nullable|exists:employees,employee_id',
            'customer_id' => 'nullable|exists:customers,customer_id',
        ]);

        if (in_array($validated['role'], ['Store Administrator', 'Store Admin']) && !empty($validated['employee_id']) && ($validated['is_active'] ?? true)) {
            $employee = \App\Models\Employee::find($validated['employee_id']);
            if ($employee && $employee->branch_id) {
                $existing = User::whereIn('role', ['Store Administrator', 'Store Admin'])
                    ->where('is_active', true)
                    ->whereHas('employee', function ($q) use ($employee) {
                        $q->where('branch_id', $employee->branch_id);
                    })
                    ->first();
                if ($existing) {
                    return response()->json([
                        'message' => 'This branch already has an active Store Admin.'
                    ], 422);
                }
            }
        }

        $user = User::create([
            'username' => $validated['username'],
            'password_hash' => Hash::make($validated['password']),
            'role' => $validated['role'],
            'is_active' => $validated['is_active'] ?? true,
            'employee_id' => $validated['role'] === 'Customer' ? null : ($validated['employee_id'] ?? null),
            'customer_id' => $validated['role'] === 'Customer' ? ($validated['customer_id'] ?? null) : null,
        ]);

        SystemLog::create([
            'user_id' => $this->resolveActingUserId($request),
            'action' => 'CREATE',
            'module' => 'System',
            'description' => "Created user account: {$user->username} ({$user->role})",
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
        ]);

        SyncController::invalidateFingerprint(['users', 'system', 'employees', 'customers']);

        $u = User::with(['employee.branch', 'customer.branch'])->find($user->user_id);
        list($branchId, $branchName, $branchObj) = $this->resolveBranch($u ? ($u->employee ?: $u->customer) : null);

        return response()->json([
            'message' => 'User created successfully',
            'user' => [
                'user_id' => $user->user_id,
                'username' => $user->username,
                'role' => $user->role,
                'is_active' => (bool)$user->is_active,
                'employee_id' => $user->employee_id,
                'customer_id' => $user->customer_id,
                'branch_id' => $branchId,
                'branch_name' => $branchName,
                'branch' => $branchObj,
                'last_login' => '—',
                'created_date' => date('Y-m-d'),
            ]
        ], 201);
    }

    public function updateUserDirect(Request $request)
    {
        $acting = $request->user() ?? auth('sanctum')->user();
        if (!$acting || !in_array($acting->role, ['Administrator', 'Admin'], true)) {
            return response()->json(['success' => false, 'message' => '403 Forbidden: Only Administrators can update user accounts.'], 403);
        }

        $id = $request->input('user_id') ?: $request->input('id');
        if (!$id && $request->input('employee_id')) {
            $u = User::where('employee_id', $request->input('employee_id'))->first();
            if ($u) {
                $id = $u->user_id;
            }
        }
        if (!$id) {
            return response()->json(['success' => false, 'message' => 'User ID is required for update.'], 422);
        }
        return $this->updateUser($request, $id);
    }

    public function updateUser(Request $request, $id)
    {
        $acting = $request->user() ?? auth('sanctum')->user();
        if (!$acting || !in_array($acting->role, ['Administrator', 'Admin'], true)) {
            return response()->json(['success' => false, 'message' => '403 Forbidden: Only Administrators can update user accounts.'], 403);
        }

        $user = User::findOrFail($id);

        $role = $request->input('role');
        if (in_array($role, ['Store Admin', 'Manager (Store Admin)'])) {
            $request->merge(['role' => 'Store Administrator']);
            if (!$request->filled('position')) {
                $request->merge(['position' => 'Manager (Store Admin)']);
            }
        } elseif (in_array($role, ['Cashier (Employee)', 'Collector (Employee)', 'Utility (Employee)'])) {
            if (!$request->filled('position')) {
                $request->merge(['position' => $role]);
            }
            $request->merge(['role' => 'Employee']);
        }

        $validated = $request->validate([
            'username' => "required|string|unique:users,username,{$id},user_id|max:100",
            'password' => 'nullable|string|min:4',
            'role' => 'required|string|in:Administrator,Store Administrator,Store Admin,Employee,Customer',
            'is_active' => 'nullable|boolean',
            'employee_id' => 'nullable|exists:employees,employee_id',
            'customer_id' => 'nullable|exists:customers,customer_id',
            'basic_salary' => 'nullable|numeric|min:0',
        ]);

        if (in_array($validated['role'], ['Store Administrator', 'Store Admin']) && !empty($validated['employee_id']) && ($validated['is_active'] ?? $user->is_active)) {
            $employee = \App\Models\Employee::find($validated['employee_id']);
            if ($employee && $employee->branch_id) {
                $existing = User::whereIn('role', ['Store Administrator', 'Store Admin'])
                    ->where('is_active', true)
                    ->where('user_id', '!=', $id)
                    ->whereHas('employee', function ($q) use ($employee) {
                        $q->where('branch_id', $employee->branch_id);
                    })
                    ->first();
                if ($existing) {
                    return response()->json([
                        'message' => 'This branch already has an active Store Admin.'
                    ], 422);
                }
            }
        }

        $data = [
            'username' => $validated['username'],
            'role' => $validated['role'],
            'is_active' => $validated['is_active'] ?? $user->is_active,
            'employee_id' => $validated['role'] === 'Customer' ? null : ($validated['employee_id'] ?? $user->employee_id),
            'customer_id' => $validated['role'] === 'Customer' ? ($validated['customer_id'] ?? $user->customer_id) : null,
        ];

        if (!empty($validated['password'])) {
            $data['password_hash'] = Hash::make($validated['password']);
        }

        $user->update($data);

        if (!$user->is_active) {
            try {
                $user->tokens()->delete();
            } catch (\Throwable $e) {}
        }
        User::clearSessionSyncCache();
        SyncController::invalidateFingerprint(['users', 'system', 'employees', 'customers']);

        // Update linked Employee profile details if present
        if ($user->employee_id) {
            $employee = \App\Models\Employee::find($user->employee_id);
            if ($employee) {
                $empData = [];
                if ($request->has('gender')) $empData['gender'] = $request->input('gender');
                if ($request->filled('date_of_birth')) {
                    $dob = $request->input('date_of_birth');
                    $empData['date_of_birth'] = $dob;
                    $empData['birth_date'] = $dob;
                } elseif ($request->filled('birth_date')) {
                    $dob = $request->input('birth_date');
                    $empData['date_of_birth'] = $dob;
                    $empData['birth_date'] = $dob;
                }
                if ($request->has('position')) {
                    $pos = $request->input('position');
                    $empData['position'] = $pos;
                    if (!$request->filled('department')) {
                        $empData['department'] = ($pos === 'Manager (Store Admin)') ? 'Store Admin' : 'Employee';
                    }
                }
                if ($request->has('department')) $empData['department'] = $request->input('department');
                if ($request->has('branch_id')) {
                    $bId = $request->input('branch_id') ?: null;
                    $empData['branch_id'] = $bId;
                    $bp = $bId ? \App\Models\BranchProfile::find($bId) : null;
                    $empData['branch'] = $bp ? $bp->name : null;
                }
                if ($request->has('pay_type')) $empData['pay_type'] = $request->input('pay_type');
                if ($request->has('phone')) {
                    $normPhone = \App\Http\Controllers\AuthController::normalizePhPhone($request->input('phone')) ?: $request->input('phone');
                    $empData['phone'] = $normPhone;
                    $user->phone_number = $normPhone;
                    $user->save();
                }
                if ($request->has('email')) $empData['email'] = $request->input('email');
                if ($request->has('address')) $empData['address'] = $request->input('address');
                if ($request->has('first_name')) $empData['first_name'] = $request->input('first_name');
                if ($request->has('last_name')) $empData['last_name'] = $request->input('last_name');

                // Basic Salary & Daily Rate: accepts empty or nullable values cleanly without DB errors
                if ($request->has('daily_rate') || $request->has('basic_salary')) {
                    $dailyInput = $request->input('daily_rate');
                    $salInput = $request->input('basic_salary');

                    if ($dailyInput !== null && $dailyInput !== '' && is_numeric($dailyInput) && (float)$dailyInput > 0) {
                        $dailyVal = (float)$dailyInput;
                        $salVal = round($dailyVal * 26, 2);
                    } elseif ($salInput !== null && $salInput !== '' && is_numeric($salInput) && (float)$salInput > 0) {
                        $val = (float)$salInput;
                        if ($val >= 2600) {
                            $salVal = $val;
                            $dailyVal = round($val / 26, 2);
                        } else {
                            $dailyVal = $val;
                            $salVal = round($val * 26, 2);
                        }
                    } else {
                        $dailyVal = 0.00;
                        $salVal = 0.00;
                    }

                    $empData['basic_salary'] = $salVal;
                    $empData['daily_rate'] = $dailyVal;
                    $empData['hourly_rate'] = $dailyVal > 0 ? round($dailyVal / 8, 2) : 0.00;
                }

                // Permanent QR: converts empty/null to NULL to avoid unique index violation
                if ($request->has('permanent_qr') || $request->has('qr_token')) {
                    $rawQr = trim($request->input('permanent_qr') ?? ($request->input('qr_token') ?? ''));
                    $empData['qr_token'] = !empty($rawQr) ? $rawQr : null;
                    $empData['qr_active'] = !empty($rawQr) ? true : false;
                    if (empty($rawQr)) {
                        $empData['qr_generated_at'] = null;
                    }
                }

                // PIN: accepts empty or nullable values without error
                if ($request->has('attendance_pin') || $request->has('pin')) {
                    $rawPin = trim($request->input('attendance_pin') ?? ($request->input('pin') ?? ''));
                    if ($rawPin !== '') {
                        $empData['attendance_pin'] = Hash::make($rawPin);
                    } else {
                        $empData['attendance_pin'] = null;
                    }
                }

                if (!empty($empData)) {
                    $employee->update($empData);
                }
            }
        } elseif ($user->customer_id) {
            $customer = \App\Models\Customer::find($user->customer_id);
            if ($customer) {
                $custData = [];
                if ($request->has('gender')) $custData['gender'] = $request->input('gender');
                if ($request->filled('date_of_birth')) {
                    $dob = $request->input('date_of_birth');
                    $custData['date_of_birth'] = $dob;
                    $custData['birth_date'] = $dob;
                }
                if ($request->has('marital_status')) $custData['marital_status'] = $request->input('marital_status');
                if ($request->has('phone')) {
                    $normPhone = \App\Http\Controllers\AuthController::normalizePhPhone($request->input('phone')) ?: $request->input('phone');
                    $custData['phone'] = $normPhone;
                    $user->phone_number = $normPhone;
                    $user->save();
                }
                if ($request->has('email')) $custData['email'] = $request->input('email');
                if ($request->has('address')) $custData['address'] = $request->input('address');
                if ($request->has('branch_id')) {
                    $bId = $request->input('branch_id') ?: null;
                    $custData['branch_id'] = $bId;
                    $bp = $bId ? \App\Models\BranchProfile::find($bId) : null;
                    $custData['branch'] = $bp ? $bp->name : null;
                }
                if (!empty($custData)) {
                    $customer->update($custData);
                }
            }
        }

        SystemLog::create([
            'user_id' => $this->resolveActingUserId($request),
            'action' => 'UPDATE',
            'module' => 'System',
            'description' => "Updated user account: {$user->username} ({$user->role})",
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
        ]);

        $u = User::with(['employee.branch', 'customer.branch', 'verifiedBy'])->find($id);
        $emp = $u->employee;
        $cust = $u->customer;
        list($branchId, $branchName, $branchObj) = $this->resolveBranch($emp ?: $cust);

        return response()->json([
            'message' => 'User updated successfully',
            'user' => [
                'user_id' => $u->user_id,
                'username' => $u->username,
                'role' => $u->role,
                'is_active' => (bool)$u->is_active,
                'employee_id' => $u->employee_id,
                'customer_id' => $u->customer_id,
                'account_verified' => (bool)$u->account_verified,
                'account_verified_at' => $u->account_verified_at ? date('Y-m-d H:i:s', strtotime($u->account_verified_at)) : null,
                'account_verified_by' => $u->account_verified_by,
                'verified_by_name' => $u->verifiedBy ? ($u->verifiedBy->employee ? trim("{$u->verifiedBy->employee->first_name} {$u->verifiedBy->employee->last_name}") : $u->verifiedBy->username) : ($u->account_verified ? 'Administrator' : null),
                'last_login' => $u->last_login ? date('Y-m-d H:i', strtotime($u->last_login)) : '—',
                'created_date' => date('Y-m-d', strtotime($u->created_at)),
                'branch_id' => $branchId,
                'branch_name' => $branchName,
                'branch' => $branchObj,
                'employee' => $emp ? [
                    'employee_id' => $emp->employee_id,
                    'employee_code' => $emp->employee_code,
                    'first_name' => $emp->first_name,
                    'middle_name' => $emp->middle_name,
                    'last_name' => $emp->last_name,
                    'gender' => $emp->gender,
                    'date_of_birth' => $emp->date_of_birth ?: $emp->birth_date,
                    'marital_status' => $emp->marital_status,
                    'position' => $emp->position,
                    'department' => $emp->department,
                    'branch_id' => $emp->branch_id,
                    'branch' => $branchObj,
                    'branch_name' => $branchName,
                    'pay_type' => $emp->pay_type,
                    'working_hours' => $emp->working_hours,
                    'basic_salary' => $emp->basic_salary,
                    'phone' => $emp->phone,
                    'email' => $emp->email,
                    'address' => $emp->address,
                    'status' => $emp->status,
                ] : null,
                'customer' => $cust ? [
                    'customer_id' => $cust->customer_id,
                    'customer_code' => $cust->customer_code,
                    'first_name' => $cust->first_name,
                    'last_name' => $cust->last_name,
                    'phone' => $cust->phone,
                    'email' => $cust->email,
                    'address' => $cust->address,
                    'status' => $cust->status,
                    'branch_id' => $cust->branch_id,
                    'branch' => $branchObj,
                    'branch_name' => $branchName,
                ] : null,
            ]
        ]);
    }

    public function destroyUser(Request $request, $id)
    {
        $targetUser = User::findOrFail($id);
        $username = $targetUser->username;

        $targetUser->delete();

        SystemLog::create([
            'user_id' => $this->resolveActingUserId($request),
            'action' => 'DELETE',
            'module' => 'System',
            'description' => "Deleted user account: {$username}",
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
        ]);

        SyncController::invalidateFingerprint(['users', 'system', 'employees', 'customers']);

        return response()->json(['message' => 'User deleted successfully']);
    }

    // ─── System Logs ────────────────────────────────────────────────────────────
    public function logs(Request $request)
    {
        $query = SystemLog::with(['user.employee', 'user.customer']);

        if ($request->filled('user') && $request->query('user') !== 'All') {
            $u = $request->query('user');
            $query->whereHas('user', function ($uq) use ($u) {
                $uq->where('username', $u);
            });
        }

        if ($request->filled('module') && $request->query('module') !== 'All') {
            $query->where('module', $request->query('module'));
        }

        if ($request->filled('date')) {
            $query->whereDate('created_at', $request->query('date'));
        }

        if ($request->filled('search')) {
            $search = '%' . $request->query('search') . '%';
            $query->where(function ($q) use ($search) {
                $q->where('description', 'like', $search)
                  ->orWhere('action', 'like', $search)
                  ->orWhere('module', 'like', $search)
                  ->orWhere('ip_address', 'like', $search)
                  ->orWhereHas('user', function ($uq) use ($search) {
                      $uq->where('username', 'like', $search)
                         ->orWhereHas('employee', function ($eq) use ($search) {
                             $eq->where('first_name', 'like', $search)
                                ->orWhere('last_name', 'like', $search)
                                ->orWhere('employee_code', 'like', $search);
                         })
                         ->orWhereHas('customer', function ($cq) use ($search) {
                             $cq->where('first_name', 'like', $search)
                                ->orWhere('last_name', 'like', $search)
                                ->orWhere('customer_code', 'like', $search);
                         });
                  });
            });
        }

        $limit = (int)$request->query('limit', 300);
        $limit = max(20, min(500, $limit));

        $logs = $query->orderByDesc('id')->limit($limit)->get()->map(function ($l) {
            $userTitle = 'System';
            $userRole = null;
            if ($l->user) {
                $userRole = $l->user->role;
                if ($l->user->employee) {
                    $userTitle = trim("{$l->user->employee->first_name} {$l->user->employee->last_name}") . " (@{$l->user->username})";
                } elseif ($l->user->customer) {
                    $userTitle = trim("{$l->user->customer->first_name} {$l->user->customer->last_name}") . " (@{$l->user->username})";
                } else {
                    $userTitle = "@{$l->user->username}";
                }
            }

            return [
                'log_id' => $l->id,
                'user' => $userTitle,
                'user_username' => $l->user?->username,
                'user_role' => $userRole,
                'action' => $l->action,
                'module' => $l->module,
                'description' => $l->description,
                'ip_address' => $l->ip_address,
                'datetime' => $l->created_at ? date('Y-m-d H:i:s', strtotime($l->created_at)) : '',
                'created_at' => $l->created_at ? $l->created_at->toIso8601String() : null,
            ];
        });

        return response()->json([
            'logs' => $logs,
            'total' => $logs->count(),
        ]);
    }

    public function clearLogs(Request $request)
    {
        $user = $request->user();
        if ($user && $user->role !== 'Administrator') {
            return response()->json([
                'success' => false,
                'message' => 'Unauthorized: Only Administrator can clear audit logs.'
            ], 403);
        }

        SystemLog::query()->delete();
        SyncController::invalidateFingerprint('system');

        return response()->json([
            'success' => true,
            'message' => 'All system audit logs have been successfully cleared.'
        ]);
    }

    // ─── Backups ────────────────────────────────────────────────────────────────
    public function backups()
    {
        $backups = BackupLog::with('createdBy')->orderByDesc('id')->get()->map(function ($b) {
            return [
                'backup_id' => $b->id,
                'backup_name' => $b->backup_name,
                'backup_type' => $b->backup_type,
                'file_size' => $b->file_size,
                'status' => $b->status,
                'started_at' => $b->started_at ? date('Y-m-d H:i:s', strtotime($b->started_at)) : '—',
                'completed_at' => $b->completed_at ? date('Y-m-d H:i:s', strtotime($b->completed_at)) : '—',
                'created_by' => $b->createdBy ? $b->createdBy->username : 'System (Auto)',
                'notes' => $b->notes,
            ];
        });

        return response()->json([
            'backups' => $backups,
            'last_backup' => $backups->first(),
        ]);
    }

    public function createBackup(Request $request)
    {
        $timestamp = date('Ymd_His');
        $backupName = "pace_backup_{$timestamp}";
        $started = now();
        $actingUserId = $this->resolveActingUserId($request);

        // Generate full SQL dump from real database
        $tables = DB::select('SHOW TABLES');
        $dbName = DB::getDatabaseName();
        $colName = 'Tables_in_' . $dbName;

        $sql = "-- ========================================================\n";
        $sql .= "-- PROJECT PACE DATABASE BACKUP\n";
        $sql .= "-- Generated: " . now()->toIso8601String() . "\n";
        $sql .= "-- Database: {$dbName}\n";
        $sql .= "-- ========================================================\n\n";
        $sql .= "SET FOREIGN_KEY_CHECKS=0;\n\n";

        foreach ($tables as $t) {
            $table = $t->$colName;
            $createRes = DB::select("SHOW CREATE TABLE `{$table}`");
            if (!empty($createRes[0]->{'Create Table'})) {
                $sql .= "DROP TABLE IF EXISTS `{$table}`;\n";
                $sql .= $createRes[0]->{'Create Table'} . ";\n\n";
            }

            $rows = DB::table($table)->get();
            if ($rows->isNotEmpty()) {
                foreach ($rows as $row) {
                    $rowArray = (array)$row;
                    $cols = array_map(fn($c) => "`{$c}`", array_keys($rowArray));
                    $vals = array_map(function($v) {
                        if ($v === null) return 'NULL';
                        return "'" . addslashes((string)$v) . "'";
                    }, array_values($rowArray));

                    $sql .= "INSERT INTO `{$table}` (" . implode(', ', $cols) . ") VALUES (" . implode(', ', $vals) . ");\n";
                }
                $sql .= "\n";
            }
        }

        $sql .= "SET FOREIGN_KEY_CHECKS=1;\n";

        // Save backup file to disk
        $filePath = "backups/{$backupName}.sql";
        Storage::disk('local')->put($filePath, $sql);
        $fullPath = Storage::disk('local')->path($filePath);
        $bytes = file_exists($fullPath) ? filesize($fullPath) : strlen($sql);

        if ($bytes >= 1048576) {
            $formattedSize = round($bytes / 1048576, 2) . ' MB';
        } else {
            $formattedSize = max(0.1, round($bytes / 1024, 2)) . ' KB';
        }

        $completed = now();

        $backup = BackupLog::create([
            'backup_name' => $backupName,
            'file_path' => $filePath,
            'backup_type' => 'Manual',
            'file_size' => $formattedSize,
            'status' => 'Completed',
            'started_at' => $started,
            'completed_at' => $completed,
            'created_by' => $actingUserId,
            'notes' => 'Live database snapshot via System Management',
        ]);

        SystemLog::create([
            'user_id' => $actingUserId,
            'action' => 'BACKUP',
            'module' => 'System',
            'description' => "Created database backup: {$backupName} ({$formattedSize})",
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
        ]);

        NotificationService::sendToAdmins([
            'type' => 'backup_completed',
            'title' => 'Database Backup Created',
            'message' => "Snapshot '{$backupName}' ({$formattedSize}) successfully generated and archived.",
            'module' => 'System',
            'action_url' => '/system',
            'priority' => 'normal',
        ]);

        return response()->json([
            'message' => 'Backup created successfully',
            'backup' => [
                'backup_id' => $backup->id,
                'backup_name' => $backup->backup_name,
                'backup_type' => $backup->backup_type,
                'file_size' => $backup->file_size,
                'status' => $backup->status,
                'started_at' => $backup->started_at ? date('Y-m-d H:i:s', strtotime($backup->started_at)) : '—',
                'completed_at' => $backup->completed_at ? date('Y-m-d H:i:s', strtotime($backup->completed_at)) : '—',
                'created_by' => $backup->createdBy ? $backup->createdBy->username : 'System',
                'notes' => $backup->notes,
            ],
        ]);
    }

    public function restoreBackup(Request $request, $id)
    {
        $backup = BackupLog::findOrFail($id);
        $actingUserId = $this->resolveActingUserId($request);

        if (empty($backup->file_path) || !Storage::disk('local')->exists($backup->file_path)) {
            return response()->json([
                'success' => false,
                'message' => "Backup file for '{$backup->backup_name}' was not found on disk. Restore aborted.",
            ], 404);
        }

        $sql = Storage::disk('local')->get($backup->file_path);
        DB::unprepared($sql);

        SystemLog::create([
            'user_id' => $actingUserId,
            'action' => 'RESTORE',
            'module' => 'System',
            'description' => "Restored database from backup: {$backup->backup_name}",
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
        ]);

        NotificationService::sendToAdmins([
            'type' => 'backup_restored',
            'title' => 'Database Restored',
            'message' => "System database was restored from snapshot '{$backup->backup_name}'.",
            'module' => 'System',
            'action_url' => '/system',
            'priority' => 'critical',
        ]);

        return response()->json([
            'message' => "Database restored successfully from {$backup->backup_name}",
        ]);
    }

    // ─── Notifications (Dynamically computed from DB state) ─────────────────────
    public function notifications()
    {
        $notifs = [];
        $id = 1;

        // 1. Overdue installment alerts
        $overdues = InstallmentAccount::with('customer')->where('status', 'Overdue')->take(3)->get();
        foreach ($overdues as $ov) {
            $custName = $ov->customer ? "{$ov->customer->first_name} {$ov->customer->last_name}" : 'Customer';
            $notifs[] = [
                'id' => $id++,
                'type' => 'warning',
                'title' => 'Overdue Installment',
                'message' => "{$custName} ({$ov->account_no}) payment is overdue",
                'time' => date('Y-m-d H:i', strtotime($ov->updated_at ?? now())),
                'read' => false,
            ];
        }

        // 2. Low stock alert
        $lowStock = Product::where('stock_quantity', 1)->take(2)->get();
        foreach ($lowStock as $lp) {
            $notifs[] = [
                'id' => $id++,
                'type' => 'warning',
                'title' => 'Low Stock Alert',
                'message' => "{$lp->product_name} is below reorder level ({$lp->stock_quantity} {$lp->unit} left)",
                'time' => date('Y-m-d H:i', strtotime($lp->updated_at ?? now())),
                'read' => false,
            ];
        }

        // 3. Pending / Draft Payroll
        $draftPayroll = Payroll::with('period')->where('status', 'Draft')->first();
        if ($draftPayroll) {
            $periodName = $draftPayroll->period ? $draftPayroll->period->period_name : 'Current Period';
            $notifs[] = [
                'id' => $id++,
                'type' => 'info',
                'title' => 'Payroll Generated',
                'message' => "{$periodName} payroll has been generated and awaits approval",
                'time' => date('Y-m-d H:i', strtotime($draftPayroll->created_at ?? now())),
                'read' => false,
            ];
        }

        // 4. Recent Payment
        $latestPayment = Payment::with('installmentAccount.customer')->latest('payment_id')->first();
        if ($latestPayment) {
            $cust = $latestPayment->installmentAccount ? $latestPayment->installmentAccount->customer : null;
            $custName = $cust ? "{$cust->first_name} {$cust->last_name}" : 'Customer';
            $accNo = $latestPayment->installmentAccount ? $latestPayment->installmentAccount->account_no : '';
            $notifs[] = [
                'id' => $id++,
                'type' => 'success',
                'title' => 'Payment Received',
                'message' => "{$custName} paid ₱" . number_format($latestPayment->amount, 2) . " for {$accNo}",
                'time' => date('Y-m-d H:i', strtotime($latestPayment->payment_date)),
                'read' => true,
            ];
        }

        // 5. Recent Backup
        $latestBackup = BackupLog::latest('id')->first();
        if ($latestBackup) {
            $notifs[] = [
                'id' => $id++,
                'type' => 'success',
                'title' => 'Backup Completed',
                'message' => "Backup {$latestBackup->backup_name} completed successfully — {$latestBackup->file_size}",
                'time' => date('Y-m-d H:i', strtotime($latestBackup->completed_at ?? now())),
                'read' => true,
            ];
        }

        return response()->json(['notifications' => $notifs]);
    }

    // ─── Settings ───────────────────────────────────────────────────────────────
    public function getMergedSettings(): array
    {
        return \Illuminate\Support\Facades\Cache::remember('pace_merged_settings', 60, function () {
            return $this->buildMergedSettings();
        });
    }

    private function buildMergedSettings(): array
    {
        $settings = Setting::all()->pluck('value', 'key')->toArray();
        
        $defaults = [
            'company_name'      => 'PROJECT: PACE Z-LICZ',
            'name'              => 'PROJECT: PACE Z-LICZ',
            'site_name'         => 'Z-LICZ Appliances',
            'branch_name'       => '',
            'address'           => '',
            'phone'             => '',
            'email'             => '',
            'currency'          => 'PHP',
            'date_format'       => 'YYYY-MM-DD',
            'timezone'          => 'Asia/Manila (GMT+8)',
            'attendance_cutoff' => '08:00',
            'cutoff_time'       => '08:00',
            'tax_id'            => '',
            'web_links'         => '',
            'logo'              => '',
            'maintenance_mode'  => false,
            'debug_mode'        => false,
            'default_language'  => 'EN',
        ];

        $branches = \App\Models\BranchProfile::query()
            ->orderBy('id')
            ->get(['id', 'name', 'location', 'contact_number', 'status', 'color', 'image_url']);

        $adminUsers = \App\Models\User::with(['employee.branch'])
            ->whereIn('role', ['Administrator', 'Store Administrator', 'Store Admin'])
            ->orderByRaw("CASE WHEN role = 'Administrator' THEN 0 ELSE 1 END")
            ->orderByRaw("CASE WHEN username = 'admin' THEN 1 ELSE 0 END")
            ->orderBy('user_id')
            ->get();

        $adminContacts = $adminUsers->map(function ($u) {
            $emp = $u->employee;
            $fullName = $emp ? trim("{$emp->first_name} {$emp->middle_name} {$emp->last_name}") : '';
            $fullName = preg_replace('/\s+/', ' ', $fullName) ?: ($u->username === 'admin' ? 'System Administrator' : $u->username);
            $rawPhone = $u->phone_number ?: ($emp ? $emp->phone : '');
            $phone = ($rawPhone && $rawPhone !== '00000000000') ? $rawPhone : '';
            $email = $u->email ?: ($emp ? $emp->email : '');
            $branchObj = ($emp && $emp->branch && is_object($emp->branch)) ? $emp->branch : null;
            $branchName = $branchObj ? $branchObj->name : ($emp && is_string($emp->branch) && $emp->branch !== '' ? $emp->branch : 'Head Office (Main)');

            return [
                'user_id' => $u->user_id,
                'username' => $u->username,
                'name' => $fullName,
                'role' => $u->role,
                'position' => ($emp && $emp->position) ? $emp->position : ($u->role === 'Administrator' ? 'System Administrator' : 'Manager (Store Admin)'),
                'department' => ($emp && $emp->department) ? $emp->department : ($u->role === 'Administrator' ? 'Administration' : 'Store Admin'),
                'email' => $email,
                'phone' => $phone,
                'branch_name' => $branchName,
                'working_hours' => ($emp && $emp->working_hours) ? $emp->working_hours : '8:00 AM – 5:00 PM (Mon–Sat)',
            ];
        })->values();

        $dynamic = [
            'total_products'    => \App\Models\Product::count(),
            'total_customers'   => \App\Models\Customer::count(),
            'total_branches'    => $branches->count(),
            'branches'          => $branches,
            'admin_contacts'    => $adminContacts,
            'total_appliances'  => \App\Models\Product::whereIn('category', CategoryFramework::matchingCategories('Appliances'))->count(),
            'total_furniture'   => \App\Models\Product::whereIn('category', CategoryFramework::matchingCategories('Furniture'))->count(),
            'total_electronics' => \App\Models\Product::whereIn('category', array_unique(array_merge(
                CategoryFramework::matchingCategories('Home Entertainment & Audio Systems'),
                CategoryFramework::matchingCategories('Home Entertainment & Display'),
                CategoryFramework::matchingCategories('Audio Systems'),
                CategoryFramework::matchingCategories('Media & Mounting Accessories')
            )))->count(),
        ];

        $merged = array_merge($defaults, $settings, $dynamic);

        if (empty($merged['email'])) {
            $firstAdminEmail = $adminContacts->first(fn ($a) => !empty($a['email']))['email'] ?? null;
            $merged['email'] = $firstAdminEmail ?: 'z.licz2000@gmail.com';
        }

        // Alias synchronization
        if (!empty($merged['company_name'])) {
            $merged['name'] = $merged['company_name'];
        } elseif (!empty($merged['name'])) {
            $merged['company_name'] = $merged['name'];
        }

        if (empty($settings['site_name'])) {
            $merged['site_name'] = !empty($merged['company_name']) ? $merged['company_name'] : 'Z-LICZ Appliances';
        } else {
            $merged['site_name'] = $settings['site_name'];
        }

        if (!empty($merged['attendance_cutoff'])) {
            $merged['cutoff_time'] = $merged['attendance_cutoff'];
        } elseif (!empty($merged['cutoff_time'])) {
            $merged['attendance_cutoff'] = $merged['cutoff_time'];
        }

        if (!empty($merged['logo'])) {
            $logoVal = $merged['logo'];
            if (!str_starts_with($logoVal, 'http://') && !str_starts_with($logoVal, 'https://')) {
                $merged['logo_url'] = url($logoVal);
            } else {
                $merged['logo_url'] = $logoVal;
            }
        } else {
            $merged['logo_url'] = null;
        }

        $merged['maintenance_mode'] = filter_var($merged['maintenance_mode'] ?? false, FILTER_VALIDATE_BOOLEAN);
        $merged['debug_mode'] = filter_var($merged['debug_mode'] ?? false, FILTER_VALIDATE_BOOLEAN);

        return $merged;
    }

    public function settings()
    {
        return response()->json($this->getMergedSettings());
    }

    public function publicBootstrap()
    {
        $payload = Cache::remember('pace_public_bootstrap', 15, function () {
            $prodCtrl = app(ProductController::class);
            $catCtrl = app(CategoryController::class);

            $appData = $prodCtrl->indexPublic(new Request(['category' => 'Appliances']))->getData(true);
            $furnData = $prodCtrl->indexPublic(new Request(['category' => 'Furniture']))->getData(true);
            $catData = $catCtrl->index(new Request())->getData(true);

            return [
                'appliances' => $appData['products'] ?? [],
                'furniture' => $furnData['products'] ?? [],
                'categories' => $catData,
                'settings' => $this->getMergedSettings(),
            ];
        });

        return response()->json($payload);
    }

    public function saveSettings(Request $request)
    {
        // Support field aliases (site_name <-> company_name <-> name)
        if ($request->has('site_name') && !$request->has('company_name')) {
            $request->merge(['company_name' => $request->input('site_name')]);
        }
        if ($request->has('name') && !$request->has('company_name')) {
            $request->merge(['company_name' => $request->input('name')]);
        }
        if ($request->has('company_name') && !$request->has('name')) {
            $request->merge(['name' => $request->input('company_name')]);
        }
        if ($request->has('company_name') && !$request->has('site_name')) {
            $request->merge(['site_name' => $request->input('company_name')]);
        }
        if ($request->has('cutoff_time') && !$request->has('attendance_cutoff')) {
            $request->merge(['attendance_cutoff' => $request->input('cutoff_time')]);
        }
        if ($request->has('attendance_cutoff') && !$request->has('cutoff_time')) {
            $request->merge(['cutoff_time' => $request->input('attendance_cutoff')]);
        }

        // Clean empty email string so nullable passes
        if ($request->has('email') && trim((string)$request->input('email')) === '') {
            $request->merge(['email' => null]);
        }

        $validated = $request->validate([
            'company_name'      => 'nullable|string|max:255',
            'name'              => 'nullable|string|max:255',
            'site_name'         => 'nullable|string|max:255',
            'branch_name'       => 'nullable|string|max:255',
            'tax_id'            => 'nullable|string|max:100',
            'address'           => 'nullable|string|max:500',
            'phone'             => 'nullable|string|max:50',
            'email'             => 'nullable|email|max:255',
            'currency'          => 'nullable|string|max:10',
            'date_format'       => 'nullable|string|max:50',
            'timezone'          => 'nullable|string|max:100',
            'attendance_cutoff' => 'nullable|string|max:20',
            'cutoff_time'       => 'nullable|string|max:20',
            'web_links'         => 'nullable|string|max:500',
            'maintenance_mode'  => 'nullable|boolean',
            'debug_mode'        => 'nullable|boolean',
            'default_language'  => 'nullable|string|max:20',
            'logo'              => $request->hasFile('logo')
                ? 'image|mimes:jpeg,png,jpg,gif,webp,svg|max:5120'
                : 'nullable',
        ]);

        $fillableKeys = [
            'company_name',
            'name',
            'site_name',
            'branch_name',
            'tax_id',
            'address',
            'phone',
            'email',
            'currency',
            'date_format',
            'timezone',
            'attendance_cutoff',
            'cutoff_time',
            'web_links',
            'maintenance_mode',
            'debug_mode',
            'default_language',
        ];

        foreach ($fillableKeys as $key) {
            if ($request->has($key)) {
                $val = $request->input($key);
                if (in_array($key, ['maintenance_mode', 'debug_mode'], true)) {
                    $storedVal = filter_var($val, FILTER_VALIDATE_BOOLEAN) ? '1' : '0';
                } else {
                    $storedVal = $val !== null ? trim((string)$val) : '';
                }
                Setting::updateOrCreate(['key' => $key], ['value' => $storedVal]);
            }
        }

        // Keep company_name, name, and site_name strictly in sync
        $syncedName = null;
        if ($request->has('site_name')) {
            $syncedName = trim((string)$request->input('site_name'));
        } elseif ($request->has('company_name')) {
            $syncedName = trim((string)$request->input('company_name'));
        } elseif ($request->has('name')) {
            $syncedName = trim((string)$request->input('name'));
        }
        if ($syncedName !== null && $syncedName !== '') {
            Setting::updateOrCreate(['key' => 'site_name'], ['value' => $syncedName]);
            Setting::updateOrCreate(['key' => 'company_name'], ['value' => $syncedName]);
            Setting::updateOrCreate(['key' => 'name'], ['value' => $syncedName]);
        }

        if ($request->has('attendance_cutoff')) {
            Setting::updateOrCreate(['key' => 'cutoff_time'], ['value' => trim((string)$request->input('attendance_cutoff'))]);
        } elseif ($request->has('cutoff_time')) {
            Setting::updateOrCreate(['key' => 'attendance_cutoff'], ['value' => trim((string)$request->input('cutoff_time'))]);
        }

        // Process logo image upload if present
        if ($request->hasFile('logo')) {
            $oldLogo = Setting::where('key', 'logo')->value('value');
            if ($oldLogo) {
                $relPath = Str::after($oldLogo, '/storage/');
                if ($relPath && Storage::disk('public')->exists($relPath)) {
                    Storage::disk('public')->delete($relPath);
                }
            }

            $path = $request->file('logo')->store('company', 'public');
            Setting::updateOrCreate(['key' => 'logo'], ['value' => '/storage/' . $path]);
        }

        // Handle Store Administrator branch profile sync if applicable
        $user = $request->user();
        if ($user && ($user->role === 'Store Administrator' || $user->role === 'Store Admin')) {
            $branchId = $user->employee?->branch_id ?? $request->input('branch_id');
            if ($branchId) {
                $branch = BranchProfile::find($branchId);
                if ($branch) {
                    if ($request->has('branch_name') && $request->filled('branch_name')) {
                        $branch->name = trim($request->input('branch_name'));
                    }
                    if ($request->has('address')) {
                        $branch->location = trim((string)$request->input('address'));
                    }
                    if ($request->has('phone')) {
                        $branch->contact_number = trim((string)$request->input('phone'));
                    }
                    $branch->save();
                }
            }
        }

        // Audit log in SystemLog
        $actingUserId = $this->resolveActingUserId($request);
        $roleName = $user?->role ?? 'Administrator';
        SystemLog::create([
            'user_id'     => $actingUserId,
            'action'      => 'UPDATE',
            'module'      => 'System',
            'description' => "{$roleName} updated system company configuration settings",
            'ip_address'  => $request->ip(),
            'user_agent'  => $request->userAgent(),
        ]);

        \Illuminate\Support\Facades\Cache::forget('pace_merged_settings');
        \Illuminate\Support\Facades\Cache::forget('pace_public_bootstrap');
        \Illuminate\Support\Facades\Cache::forget(\App\Http\Middleware\ApplyGlobalSystemSettings::CACHE_KEY);
        SyncController::invalidateFingerprint(['system', 'settings', 'branches']);

        $updated = $this->getMergedSettings();

        return response()->json([
            'success'  => true,
            'message'  => 'Settings saved successfully',
            'settings' => $updated,
            'data'     => $updated,
        ], 200);
    }

    public function qrMonitoring(Request $request)
    {
        return app(EmployeeController::class)->getQrMonitoringStats($request);
    }

    public function storage(Request $request)
    {
        $force = $request->boolean('refresh', false) || $request->has('force');
        $overview = \App\Services\StorageService::getStorageOverview($force);
        
        return response()->json(array_merge([
            'total' => $overview['disk']['total'],
            'used' => $overview['disk']['used'],
            'free' => $overview['disk']['free'],
            'percentage' => $overview['disk']['percentage'],
        ], $overview));
    }

    public function cleanStorage(Request $request)
    {
        $user = $request->user();
        if ($user && $user->role !== 'Administrator') {
            return response()->json(['message' => 'Unauthorized. Storage maintenance is strictly restricted to Administrators.'], 403);
        }

        $action = $request->input('action', 'cache');
        $result = match($action) {
            'logs' => \App\Services\StorageService::purgeLogs(),
            'temp' => \App\Services\StorageService::cleanTempFiles(),
            default => \App\Services\StorageService::clearApplicationCache(),
        };

        $actingUserId = $this->resolveActingUserId($request);
        SystemLog::create([
            'user_id' => $actingUserId,
            'action' => 'STORAGE_CLEAN',
            'module' => 'System',
            'description' => "Storage Maintenance ({$action}): {$result['message']} Reclaimed: {$result['reclaimed_formatted']}",
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
        ]);

        \App\Services\NotificationService::sendToAdmins([
            'type' => 'storage_cleaned',
            'title' => 'System Storage Maintenance',
            'message' => "Completed storage cleanup ({$action}). Reclaimed {$result['reclaimed_formatted']} of disk space.",
            'module' => 'System',
            'action_url' => '/system?tab=storage',
            'priority' => 'normal',
        ]);

        $overview = \App\Services\StorageService::getStorageOverview(true);

        return response()->json([
            'success' => true,
            'action' => $action,
            'result' => $result,
            'storage' => array_merge([
                'total' => $overview['disk']['total'],
                'used' => $overview['disk']['used'],
                'free' => $overview['disk']['free'],
                'percentage' => $overview['disk']['percentage'],
            ], $overview),
        ]);
    }

    public function deleteStorageFile(Request $request)
    {
        $user = $request->user();
        if ($user && $user->role !== 'Administrator') {
            return response()->json(['message' => 'Unauthorized. Media file deletion is strictly restricted to Administrators.'], 403);
        }

        $validated = $request->validate([
            'relative_path' => 'nullable|string|max:500',
            'relative_paths' => 'nullable|array|min:1',
            'relative_paths.*' => 'required|string|max:500',
        ]);

        if (empty($validated['relative_path']) && empty($validated['relative_paths'])) {
            return response()->json([
                'success' => false,
                'message' => 'No media file path specified for deletion.',
            ], 422);
        }

        try {
            if (!empty($validated['relative_paths'])) {
                $result = \App\Services\StorageService::deleteMediaFilesBatch($validated['relative_paths']);
                $logDesc = "Bulk deleted {$result['deleted_count']} uploaded media file(s) ({$result['reclaimed_formatted']})";
            } else {
                $result = \App\Services\StorageService::deleteMediaFile($validated['relative_path']);
                $logDesc = "Deleted uploaded media file: {$result['relative_path']} ({$result['reclaimed_formatted']})";
            }
        } catch (\Throwable $e) {
            return response()->json([
                'success' => false,
                'message' => $e->getMessage() ?: 'Failed to delete media file.',
            ], 422);
        }

        $actingUserId = $this->resolveActingUserId($request);
        SystemLog::create([
            'user_id' => $actingUserId,
            'action' => 'STORAGE_FILE_DELETE',
            'module' => 'System',
            'description' => $logDesc,
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
        ]);

        $overview = \App\Services\StorageService::getStorageOverview(true);

        return response()->json([
            'success' => true,
            'result' => $result,
            'storage' => array_merge([
                'total' => $overview['disk']['total'],
                'used' => $overview['disk']['used'],
                'free' => $overview['disk']['free'],
                'percentage' => $overview['disk']['percentage'],
            ], $overview),
        ]);
    }

    public function systemStats(Request $request)
    {
        User::syncSessionStatuses($request->user(), 'users');

        // 1. Total Users & Role Breakdown
        $totalUsers = User::count();
        $onlineSessions = User::where('is_active', true)->count();
        $active24h = User::where('last_login', '>=', now()->subDay())->count();
        $activeSessions = max($onlineSessions, $active24h, $request->user() ? 1 : 0);
        $verifiedUsers = User::where('account_verified', true)->count();

        $roleCounts = User::selectRaw('role, COUNT(*) as cnt')
            ->groupBy('role')
            ->pluck('cnt', 'role');

        $userBreakdown = [
            'administrators' => (int) ($roleCounts['Administrator'] ?? 0),
            'store_admins' => (int) (($roleCounts['Store Administrator'] ?? 0) + ($roleCounts['Store Admin'] ?? 0)),
            'employees' => (int) ($roleCounts['Employee'] ?? 0),
            'customers' => (int) ($roleCounts['Customer'] ?? 0),
            'verified' => $verifiedUsers,
            'online' => $onlineSessions,
            'active_24h' => $active24h,
        ];

        // 2. Database Size & Table Distribution
        $dbName = DB::connection()->getDatabaseName();
        $size = DB::select("SELECT ROUND(SUM(data_length + index_length) / 1024 / 1024, 2) AS size_mb, COUNT(*) AS table_count FROM information_schema.tables WHERE table_schema = ?", [$dbName]);
        $dbSizeMB = (float) ($size[0]->size_mb ?? 0);
        $tableCount = (int) ($size[0]->table_count ?? 0);

        if ($dbSizeMB > 1024) {
            $dbSizeStr = round($dbSizeMB / 1024, 2) . ' GB';
        } else {
            $dbSizeStr = number_format($dbSizeMB, 2) . ' MB';
        }

        $tableRowsRaw = DB::select("
            SELECT table_name AS name,
                   ROUND((data_length + index_length) / 1024, 1) AS size_kb,
                   table_rows AS approx_rows
            FROM information_schema.tables
            WHERE table_schema = ?
            ORDER BY (data_length + index_length) DESC
            LIMIT 8
        ", [$dbName]);

        $totalTopKb = collect($tableRowsRaw)->sum(fn($t) => (float) ($t->size_kb ?? 0)) ?: 1;
        $databaseTables = collect($tableRowsRaw)->map(function ($t) use ($totalTopKb) {
            $tName = $t->name;
            $exactRows = (int) ($t->approx_rows ?? 0);
            try {
                if (\Illuminate\Support\Facades\Schema::hasTable($tName)) {
                    $exactRows = DB::table($tName)->count();
                }
            } catch (\Throwable $e) {}
            $kb = (float) ($t->size_kb ?? 0);
            return [
                'name' => $tName,
                'rows' => $exactRows,
                'size_kb' => $kb,
                'size_label' => $kb >= 1024 ? round($kb / 1024, 2) . ' MB' : $kb . ' KB',
                'share_pct' => min(100, max(3, (int) round(($kb / $totalTopKb) * 100))),
            ];
        })->values()->all();

        // 3. Live Server / Database Uptime & Runtime Health
        $uptime = 'Active';
        $uptimeSeconds = 0;
        $mysqlVersion = 'MySQL 8.x';
        try {
            $uptimeQuery = DB::select("SHOW GLOBAL STATUS LIKE 'Uptime'");
            if (!empty($uptimeQuery[0]->Value)) {
                $uptimeSeconds = (int) $uptimeQuery[0]->Value;
                $days = floor($uptimeSeconds / 86400);
                $hours = floor(($uptimeSeconds % 86400) / 3600);
                $mins = floor(($uptimeSeconds % 3600) / 60);
                $uptime = $days > 0 ? "{$days}d {$hours}h {$mins}m" : "{$hours}h {$mins}m";
            }
            $verQuery = DB::select("SELECT VERSION() AS ver");
            if (!empty($verQuery[0]->ver)) {
                $mysqlVersion = (string) $verQuery[0]->ver;
            }
        } catch (\Throwable $e) {}

        // 4. Catalog & Operational Metrics
        $totalProducts = Product::count();
        $inStockProducts = Product::where('stock_quantity', '>', 0)->count();
        $lowStockProducts = Product::where('stock_quantity', 1)->count();
        $outOfStockProducts = Product::where('stock_quantity', '<=', 0)->count();
        $totalCategories = \Illuminate\Support\Facades\Schema::hasTable('categories')
            ? \App\Models\Category::count()
            : 44;
        $totalBranches = BranchProfile::count();
        $totalEmployees = \App\Models\Employee::count();
        $totalCustomers = \App\Models\Customer::count();

        $todayStr = today()->toDateString();
        $totalSales = \App\Models\SaleTransaction::count();
        $salesToday = \App\Models\SaleTransaction::whereRaw('DATE(COALESCE(sale_date, created_at)) = ?', [$todayStr])->count();
        $activeInstallments = InstallmentAccount::whereIn('status', ['Active', 'Overdue', 'ACTIVE', 'OVERDUE'])->count();
        $totalPayments = Payment::count();
        $totalLogs = SystemLog::count();
        $logsToday = SystemLog::whereRaw('DATE(COALESCE(created_at, updated_at)) = ?', [$todayStr])->count();
        $totalBackups = BackupLog::count();
        $latestBackupObj = BackupLog::latest('created_at')->first();
        $latestBackup = $latestBackupObj && $latestBackupObj->created_at
            ? date('M d, Y h:i A', strtotime($latestBackupObj->created_at))
            : 'No backups recorded';

        $startDate = now()->subDays(6)->toDateString();
        $endDate = $todayStr;

        $auditByDate = DB::table('system_logs')
            ->selectRaw('DATE(COALESCE(created_at, updated_at)) as d, COUNT(*) as cnt')
            ->whereRaw('DATE(COALESCE(created_at, updated_at)) BETWEEN ? AND ?', [$startDate, $endDate])
            ->groupBy('d')
            ->pluck('cnt', 'd');

        $salesByDate = DB::table('sale_transactions')
            ->selectRaw('DATE(COALESCE(sale_date, created_at)) as d, COUNT(*) as cnt')
            ->whereRaw('DATE(COALESCE(sale_date, created_at)) BETWEEN ? AND ?', [$startDate, $endDate])
            ->groupBy('d')
            ->pluck('cnt', 'd');

        $paymentsByDate = DB::table('payments')
            ->selectRaw('DATE(COALESCE(payment_date, created_at, confirmed_at)) as d, COUNT(*) as cnt')
            ->whereRaw('DATE(COALESCE(payment_date, created_at, confirmed_at)) BETWEEN ? AND ?', [$startDate, $endDate])
            ->groupBy('d')
            ->pluck('cnt', 'd');

        $attendanceByDate = collect();
        if (\Illuminate\Support\Facades\Schema::hasTable('attendance')) {
            $attendanceByDate = DB::table('attendance')
                ->selectRaw('DATE(COALESCE(attendance_date, created_at)) as d, COUNT(*) as cnt')
                ->whereRaw('DATE(COALESCE(attendance_date, created_at)) BETWEEN ? AND ?', [$startDate, $endDate])
                ->groupBy('d')
                ->pluck('cnt', 'd');
        } elseif (\Illuminate\Support\Facades\Schema::hasTable('attendances')) {
            $attCol = \Illuminate\Support\Facades\Schema::hasColumn('attendances', 'attendance_date') ? 'attendance_date' : 'date';
            $attendanceByDate = DB::table('attendances')
                ->selectRaw("DATE(COALESCE({$attCol}, created_at)) as d, COUNT(*) as cnt")
                ->whereRaw("DATE(COALESCE({$attCol}, created_at)) BETWEEN ? AND ?", [$startDate, $endDate])
                ->groupBy('d')
                ->pluck('cnt', 'd');
        }

        $activityTrend = [];
        for ($i = 6; $i >= 0; $i--) {
            $day = now()->subDays($i);
            $dateStr = $day->toDateString();
            $auditCnt = (int) ($auditByDate[$dateStr] ?? 0);
            $salesCnt = (int) ($salesByDate[$dateStr] ?? 0);
            $payCnt = (int) ($paymentsByDate[$dateStr] ?? 0);
            $attCnt = (int) ($attendanceByDate[$dateStr] ?? 0);
            $activityTrend[] = [
                'date' => $dateStr,
                'label' => $day->format('M d'),
                'day_short' => $day->format('D'),
                'audit_events' => $auditCnt,
                'sales' => $salesCnt,
                'payments' => $payCnt,
                'attendance' => $attCnt,
                'total_ops' => $auditCnt + $salesCnt + $payCnt + $attCnt,
            ];
        }

        // 6. Branch Telemetry
        $globalProducts = Product::whereNull('branch_id')->count();
        $branchMetrics = BranchProfile::withCount(['employees', 'customers', 'products', 'sales'])
            ->get()
            ->map(fn($b) => [
                'id' => $b->id,
                'name' => $b->name,
                'location' => $b->location ?: ($b->city ?: '—'),
                'status' => $b->status === 'open' ? 'Active' : 'Inactive',
                'color' => $b->color ?: '#2b5ce6',
                'employees_count' => (int) ($b->employees_count ?? 0),
                'customers_count' => (int) ($b->customers_count ?? 0),
                'products_count' => (int) ($b->products_count ?? 0) + $globalProducts,
                'sales_count' => (int) ($b->sales_count ?? 0),
            ])->values()->all();

        // 7. Server & Storage Health
        $storageOverview = [];
        try {
            $storageOverview = \App\Services\StorageService::getStorageOverview();
        } catch (\Throwable $e) {}

        $memUsageMb = round(memory_get_usage(true) / 1024 / 1024, 1);
        $memPeakMb = round(memory_get_peak_usage(true) / 1024 / 1024, 1);
        $memLimit = ini_get('memory_limit') ?: '512M';

        return response()->json([
            'total_users' => $totalUsers,
            'active_sessions' => $activeSessions,
            'online_sessions' => $onlineSessions,
            'active_24h' => $active24h,
            'verified_users' => $verifiedUsers,
            'database_size' => $dbSizeStr,
            'database_size_mb' => $dbSizeMB,
            'table_count' => $tableCount,
            'uptime' => $uptime,
            'uptime_seconds' => $uptimeSeconds,
            'user_breakdown' => $userBreakdown,
            'catalog_stats' => [
                'total_products' => $totalProducts,
                'in_stock_products' => $inStockProducts,
                'low_stock_products' => $lowStockProducts,
                'out_of_stock_products' => $outOfStockProducts,
                'total_categories' => $totalCategories,
                'total_branches' => $totalBranches,
                'total_employees' => $totalEmployees,
                'total_customers' => $totalCustomers,
            ],
            'transaction_stats' => [
                'total_sales' => $totalSales,
                'sales_today' => $salesToday,
                'active_installments' => $activeInstallments,
                'total_payments' => $totalPayments,
                'audit_logs_total' => $totalLogs,
                'audit_logs_today' => $logsToday,
                'total_backups' => $totalBackups,
                'latest_backup' => $latestBackup,
            ],
            'activity_trend' => $activityTrend,
            'database_tables' => $databaseTables,
            'branch_metrics' => $branchMetrics,
            'server_health' => [
                'php_version' => PHP_VERSION,
                'mysql_version' => $mysqlVersion,
                'laravel_version' => app()->version(),
                'environment' => config('app.env', 'production'),
                'memory_usage_mb' => $memUsageMb,
                'memory_peak_mb' => $memPeakMb,
                'memory_limit' => $memLimit,
                'disk_total' => $storageOverview['disk']['total'] ?? 'N/A',
                'disk_used' => $storageOverview['disk']['used'] ?? 'N/A',
                'disk_free' => $storageOverview['disk']['free'] ?? 'N/A',
                'disk_percentage' => $storageOverview['disk']['percentage'] ?? 0,
            ],
        ]);
    }
}
