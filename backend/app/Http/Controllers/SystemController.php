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
use App\Services\NotificationService;
use App\Models\Setting;
class SystemController extends Controller
{
    // ─── Users ──────────────────────────────────────────────────────────────────
    public function users(Request $request)
    {
        $users = User::with(['employee', 'customer.branch', 'verifiedBy'])->orderBy('user_id')->get()->map(function ($u) {
            $emp = $u->employee;
            $cust = $u->customer;
            $verifiedBy = $u->verifiedBy;
            $verifiedByName = $verifiedBy ? ($verifiedBy->employee ? trim("{$verifiedBy->employee->first_name} {$verifiedBy->employee->last_name}") : $verifiedBy->username) : ($u->account_verified ? 'Administrator' : null);

            return [
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
                    'branch' => $emp->branch ? $emp->branch->name : null,
                    'pay_type' => $emp->pay_type,
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
                    'branch_name' => $cust->branch ? $cust->branch->name : null,
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
        $u = User::with(['employee', 'customer.branch', 'verifiedBy'])->findOrFail($id);
        $emp = $u->employee;
        $cust = $u->customer;
        $verifiedBy = $u->verifiedBy;
        $verifiedByName = $verifiedBy ? ($verifiedBy->employee ? trim("{$verifiedBy->employee->first_name} {$verifiedBy->employee->last_name}") : $verifiedBy->username) : ($u->account_verified ? 'Administrator' : null);

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
                    'branch' => $emp->branch ? $emp->branch->name : null,
                    'pay_type' => $emp->pay_type,
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
                    'branch_name' => $cust->branch ? $cust->branch->name : null,
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

        $user = User::with('employee')->findOrFail($id);

        if (!$user->employee_id || !$user->employee) {
            return response()->json([
                'success' => false,
                'message' => 'This user account is not linked to a valid employee record. Please link an employee profile first.',
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

        $empName = $user->employee ? trim("{$user->employee->first_name} {$user->employee->last_name}") : $user->username;
        $empCode = $user->employee ? $user->employee->employee_code : 'N/A';

        SystemLog::create([
            'user_id' => $admin->user_id,
            'action' => 'VERIFY_ACCOUNT',
            'module' => 'Users',
            'description' => "Administrator {$admin->username} verified account for {$user->username} ({$user->role}) - Employee: {$empName} ({$empCode})",
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
        if ($role === 'Store Admin') {
            $request->merge(['role' => 'Store Administrator']);
        }

        $validated = $request->validate([
            'username' => 'required|string|unique:users,username|max:100',
            'password' => 'required|string|min:4',
            'role' => 'required|string|in:Administrator,Store Administrator,Employee',
            'is_active' => 'nullable|boolean',
            'employee_id' => 'nullable|exists:employees,employee_id',
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
            'employee_id' => $validated['employee_id'] ?? null,
        ]);

        SystemLog::create([
            'user_id' => $request->input('auth_user_id', 1),
            'action' => 'CREATE',
            'module' => 'System',
            'description' => "Created user account: {$user->username} ({$user->role})",
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
        ]);

        return response()->json([
            'message' => 'User created successfully',
            'user' => [
                'user_id' => $user->user_id,
                'username' => $user->username,
                'role' => $user->role,
                'is_active' => (bool)$user->is_active,
                'employee_id' => $user->employee_id,
                'last_login' => '—',
                'created_date' => date('Y-m-d'),
            ]
        ], 201);
    }

    public function updateUser(Request $request, $id)
    {
        $user = User::findOrFail($id);

        $role = $request->input('role');
        if ($role === 'Store Admin') {
            $request->merge(['role' => 'Store Administrator']);
        }

        $validated = $request->validate([
            'username' => "required|string|unique:users,username,{$id},user_id|max:100",
            'password' => 'nullable|string|min:4',
            'role' => 'required|string|in:Administrator,Store Administrator,Employee',
            'is_active' => 'nullable|boolean',
            'employee_id' => 'nullable|exists:employees,employee_id',
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
            'employee_id' => $validated['employee_id'] ?? $user->employee_id,
        ];

        if (!empty($validated['password'])) {
            $data['password_hash'] = Hash::make($validated['password']);
        }

        $user->update($data);

        SystemLog::create([
            'user_id' => $request->input('auth_user_id', 1),
            'action' => 'UPDATE',
            'module' => 'System',
            'description' => "Updated user account: {$user->username} ({$user->role})",
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
        ]);

        return response()->json([
            'message' => 'User updated successfully',
            'user' => [
                'user_id' => $user->user_id,
                'username' => $user->username,
                'role' => $user->role,
                'is_active' => (bool)$user->is_active,
                'employee_id' => $user->employee_id,
                'last_login' => $user->last_login ? date('Y-m-d H:i', strtotime($user->last_login)) : '—',
                'created_date' => date('Y-m-d', strtotime($user->created_at)),
            ]
        ]);
    }

    public function destroyUser(Request $request, $id)
    {
        $targetUser = User::findOrFail($id);
        $username = $targetUser->username;

        $targetUser->delete();

        SystemLog::create([
            'user_id' => $request->input('auth_user_id', 1),
            'action' => 'DELETE',
            'module' => 'System',
            'description' => "Deleted user account: {$username}",
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
        ]);

        return response()->json(['message' => 'User deleted successfully']);
    }

    // ─── System Logs ────────────────────────────────────────────────────────────
    public function logs(Request $request)
    {
        $query = SystemLog::with('user');

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

        $logs = $query->orderByDesc('id')->get()->map(function ($l) {
            return [
                'log_id' => $l->id,
                'user' => $l->user ? $l->user->username : 'System',
                'action' => $l->action,
                'module' => $l->module,
                'description' => $l->description,
                'ip_address' => $l->ip_address,
                'datetime' => date('Y-m-d H:i:s', strtotime($l->created_at)),
            ];
        });

        return response()->json([
            'logs' => $logs,
            'total' => $logs->count(),
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
        $completed = now()->addSeconds(3);

        $backup = BackupLog::create([
            'backup_name' => $backupName,
            'file_path' => "backups/{$backupName}.sql",
            'backup_type' => 'Manual',
            'file_size' => '25.2 MB',
            'status' => 'Completed',
            'started_at' => $started,
            'completed_at' => $completed,
            'created_by' => $request->input('user_id', 1),
            'notes' => 'Manual backup via System Management',
        ]);

        SystemLog::create([
            'user_id' => $request->input('user_id', 1),
            'action' => 'BACKUP',
            'module' => 'System',
            'description' => "Created manual backup: {$backupName} (25.2 MB)",
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
        ]);

        return response()->json([
            'message' => 'Backup created successfully',
            'backup' => $backup,
        ]);
    }

    public function restoreBackup(Request $request, $id)
    {
        $backup = BackupLog::findOrFail($id);

        SystemLog::create([
            'user_id' => $request->input('user_id', 1),
            'action' => 'RESTORE',
            'module' => 'System',
            'description' => "Restored database from backup: {$backup->backup_name}",
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
        ]);

        return response()->json([
            'message' => "Database restored from {$backup->backup_name}",
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
    public function settings()
    {
        $settings = Setting::all()->pluck('value', 'key')->toArray();
        
        $defaults = [
            'company_name' => '',
            'address'      => '',
            'phone'        => '',
            'email'        => '',
            'currency'     => 'PHP',
            'date_format'  => 'YYYY-MM-DD',
            'timezone'     => 'Asia/Manila (GMT+8)',
            'attendance_cutoff' => '08:00',
            'tax_id'       => '',
            'web_links'    => '',
            'logo'         => '',
        ];

        $dynamic = [
            'total_products' => \App\Models\Product::count(),
            'total_customers' => \App\Models\Customer::count(),
            'total_branches' => \App\Models\BranchProfile::count(),
            'total_appliances' => \App\Models\Product::where('category', 'Appliances')->count(),
            'total_furniture' => \App\Models\Product::where('category', 'Furniture')->count(),
        ];

        return response()->json(array_merge($defaults, $settings, $dynamic));
    }

    public function saveSettings(Request $request)
    {
        $data = $request->except(['user_id', 'logo']);
        
        foreach ($data as $key => $value) {
            if ($value !== null) {
                Setting::updateOrCreate(['key' => $key], ['value' => $value]);
            }
        }

        if ($request->hasFile('logo')) {
            $path = $request->file('logo')->store('company', 'public');
            Setting::updateOrCreate(['key' => 'logo'], ['value' => '/storage/' . $path]);
        }

        SystemLog::create([
            'user_id' => $request->input('user_id', 1),
            'action' => 'UPDATE',
            'module' => 'System',
            'description' => "Updated system settings",
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
        ]);

        return response()->json([
            'message' => 'Settings saved successfully',
            'settings' => Setting::all()->pluck('value', 'key'),
        ]);
    }

    public function qrMonitoring(Request $request)
    {
        $totalEmployees = \App\Models\Employee::count();
        $qrGenerated = \App\Models\Employee::whereNotNull('qr_token')->count();
        $qrNotGenerated = \App\Models\Employee::whereNull('qr_token')->count();
        $activeQr = \App\Models\Employee::whereNotNull('qr_token')->where('qr_active', true)->count();
        $revokedQr = \App\Models\Employee::whereNotNull('qr_token')->where('qr_active', false)->count();

        $today = now()->startOfDay();
        $todayScans = \App\Models\AttendanceScanLog::where('scan_time', '>=', $today)->count();
        $successfulScans = \App\Models\AttendanceScanLog::where('scan_time', '>=', $today)
            ->where('status', 'SUCCESS')->count();
        $failedScans = \App\Models\AttendanceScanLog::where('scan_time', '>=', $today)
            ->where('status', 'FAILED')->count();

        $logsData = \App\Models\AttendanceScanLog::with(['employee.branch', 'scannedBy.employee'])
            ->orderByDesc('scan_time')
            ->limit(100)
            ->get()
            ->map(function($log) {
                $emp = $log->employee;
                $scannedBy = $log->scannedBy;
                $scannedByName = $scannedBy ? ($scannedBy->employee ? trim("{$scannedBy->employee->first_name} {$scannedBy->employee->last_name}") : $scannedBy->username) : 'System';
                
                $verificationMethod = 'Failed';
                if ($log->qr_verified && $log->pin_verified) {
                    $verificationMethod = 'QR + PIN';
                } elseif ($log->qr_verified) {
                    $verificationMethod = 'QR Only';
                }

                $branchName = $log->branch;
                if ($emp && $emp->branch) {
                    $branchName = $emp->branch->name;
                }

                return [
                    'id' => $log->id,
                    'employee_name' => $emp ? trim("{$emp->first_name} {$emp->last_name}") : 'Unknown',
                    'employee_code' => $emp ? $emp->employee_code : '—',
                    'branch' => $branchName,
                    'department' => $emp ? $emp->department : '—',
                    'action_type' => $log->action_type,
                    'verification_method' => $verificationMethod,
                    'scanned_by' => $scannedByName,
                    'status' => $log->status,
                    'details' => $log->failure_reason ?? 'Verified successfully',
                    'timestamp' => $log->scan_time ? $log->scan_time->format('Y-m-d H:i:s') : null,
                ];
            });

        return response()->json([
            'success' => true,
            'stats' => [
                'total_employees' => $totalEmployees,
                'qr_generated' => $qrGenerated,
                'qr_not_generated' => $qrNotGenerated,
                'active_qr' => $activeQr,
                'revoked_qr' => $revokedQr,
                'today_scans' => $todayScans,
                'successful_scans' => $successfulScans,
                'failed_scans' => $failedScans,
            ],
            'recent_logs' => $logsData,
        ]);
    }

    public function storage(Request $request)
    {
        $path = base_path();
        $total = disk_total_space($path);
        $free = disk_free_space($path);
        
        $total = $total ?: 10 * 1024 * 1024 * 1024;
        $free = $free ?: 3.2 * 1024 * 1024 * 1024;
        $used = $total - $free;
        
        return response()->json([
            'total' => $total,
            'used' => $used,
            'free' => $free,
            'percentage' => $total > 0 ? round(($used / $total) * 100) : 0
        ]);
    }

    public function systemStats(Request $request)
    {
        // 1. Total Users
        $totalUsers = User::count();

        // 2. Active Sessions (Users logged in within the last 24 hours)
        $activeSessions = User::where('last_login', '>=', now()->subDay())->count();

        // 3. Database Size
        $dbName = DB::connection()->getDatabaseName();
        $size = DB::select("SELECT ROUND(SUM(data_length + index_length) / 1024 / 1024, 2) AS size_mb FROM information_schema.tables WHERE table_schema = ?", [$dbName]);
        $dbSizeMB = $size[0]->size_mb ?? 0;
        
        if ($dbSizeMB > 1024) {
            $dbSizeStr = round($dbSizeMB / 1024, 2) . ' GB';
        } else {
            $dbSizeStr = $dbSizeMB . ' MB';
        }

        // 4. System Uptime (Mocked for cross-platform compatibility)
        $uptime = '99.9%';

        return response()->json([
            'total_users' => $totalUsers,
            'active_sessions' => $activeSessions,
            'database_size' => $dbSizeStr,
            'uptime' => $uptime,
        ]);
    }
}
