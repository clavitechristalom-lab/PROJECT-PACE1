<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\Employee;
use App\Models\SystemLog;
use App\Models\AttendanceScanLog;
use App\Models\Attendance;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\Hash;

class EmployeeController extends Controller
{
    public function index(Request $request)
    {
        $user = $request->user();
        $query = Employee::with('branch');

        // Role-based Access Control
        if ($user && $user->role === 'Employee') {
            $query->where('employee_id', $user->employee_id);
        } elseif ($user && in_array($user->role, ['Store Administrator', 'Store Admin'])) {
            $branchId = $user->employee ? $user->employee->branch_id : -1;
            $query->where('branch_id', $branchId);
        } elseif ($request->filled('branch_id') && $request->query('branch_id') !== 'All') {
            $query->where('branch_id', $request->query('branch_id'));
        }

        if ($request->filled('search')) {
            $s = $request->query('search');
            $query->where(function ($q) use ($s) {
                $q->where('first_name', 'like', "%{$s}%")
                  ->orWhere('last_name', 'like', "%{$s}%")
                  ->orWhere('employee_code', 'like', "%{$s}%")
                  ->orWhere('position', 'like', "%{$s}%")
                  ->orWhere('department', 'like', "%{$s}%");
            });
        }

        if ($request->filled('department') && $request->query('department') !== 'All') {
            $query->where('department', $request->query('department'));
        }

        if ($request->filled('status') && $request->query('status') !== 'All') {
            $query->where('status', $request->query('status'));
        }

        $today = date('Y-m-d');
        $employees = $query->orderBy('employee_id')->get()->map(function ($emp) use ($today) {
            $latestScan = AttendanceScanLog::where('employee_id', $emp->employee_id)
                ->orderByDesc('id')
                ->first();
            
            $todayAtt = Attendance::where('employee_id', $emp->employee_id)
                ->where('attendance_date', $today)
                ->first();

            $qrStatus = empty($emp->qr_token) 
                ? 'NOT GENERATED' 
                : ($emp->qr_active ? 'ACTIVE' : 'REVOKED');

            $emp->qr_status = $qrStatus;
            $emp->has_qr = !empty($emp->qr_token);
            $emp->has_pin = !empty($emp->attendance_pin);
            $emp->last_scan = $latestScan ? $latestScan->scan_time->format('M d, Y h:i A') : 'Never';
            $emp->issued_date = $emp->qr_generated_at ? $emp->qr_generated_at->format('M d, Y h:i A') : '—';
            $emp->issued_by = $emp->has_qr ? 'Administrator' : '—';
            $emp->attendance_status = $todayAtt ? $todayAtt->status : 'No Attendance';
            $emp->today_time_in = $todayAtt && $todayAtt->time_in ? date('h:i A', strtotime($todayAtt->time_in)) : '—';
            $emp->today_time_out = $todayAtt && $todayAtt->time_out ? date('h:i A', strtotime($todayAtt->time_out)) : '—';

            return $emp;
        });

        return response()->json([
            'employees' => $employees,
            'total' => $employees->count(),
        ]);
    }

    public function show(Request $request, $id)
    {
        $user = $request->user();
        $employee = Employee::with([
            'attendances' => function ($q) {
                $q->orderByDesc('attendance_date');
            },
            'payrolls' => function ($q) {
                $q->with('period')->orderByDesc('payroll_id');
            }
        ])->findOrFail($id);

        if ($user && $user->role === 'Employee' && $employee->employee_id != $user->employee_id) {
            return response()->json(['message' => 'Unauthorized access.'], 403);
        }

        if ($user && in_array($user->role, ['Store Administrator', 'Store Admin'])) {
            $userBranch = $user->employee ? $user->employee->branch_id : null;
            if ($employee->branch !== $userBranch) {
                return response()->json(['message' => 'Unauthorized access to employee in another branch.'], 403);
            }
        }

        $employee->has_pin = !empty($employee->attendance_pin);
        $employee->qr_status = empty($employee->qr_token) 
            ? 'NOT GENERATED' 
            : ($employee->qr_active ? 'ACTIVE' : 'REVOKED');

        $attendance = $employee->attendances->map(function ($a) {
            return [
                'attendance_id' => $a->attendance_id,
                'attendance_date' => $a->attendance_date,
                'time_in' => $a->time_in ? date('h:i A', strtotime($a->time_in)) : null,
                'time_out' => $a->time_out ? date('h:i A', strtotime($a->time_out)) : null,
                'total_hours' => (float)$a->total_hours,
                'overtime_hours' => (float)$a->overtime_hours,
                'status' => $a->status,
                'verification_method' => $a->verification_method ?? 'QR + PIN',
                'remarks' => $a->remarks,
            ];
        });

        $payroll = $employee->payrolls->map(function ($p) {
            return [
                'payroll_id' => $p->payroll_id,
                'period_name' => $p->period ? $p->period->period_name : "Period #{$p->period_id}",
                'basic_salary' => (float)$p->basic_salary,
                'gross_pay' => (float)$p->gross_pay,
                'total_deductions' => (float)$p->total_deductions,
                'net_pay' => (float)$p->net_pay,
                'status' => $p->status,
            ];
        });

        return response()->json([
            'employee' => $employee,
            'attendance' => $attendance,
            'payroll' => $payroll,
        ]);
    }

    public function store(Request $request)
    {
        if ($request->user() && $request->user()->role === 'Administrator') {
            return response()->json(['success' => false, 'message' => 'Admin is not authorized to create employees.'], 403);
        }

        $validated = $request->validate([
            'employee_code' => 'nullable|string|unique:employees,employee_code',
            'first_name' => 'required|string|max:255',
            'middle_name' => 'nullable|string|max:255',
            'last_name' => 'required|string|max:255',
            'gender' => 'nullable|string|in:Male,Female',
            'birth_date' => 'nullable|date',
            'date_of_birth' => 'nullable|date',
            'marital_status' => 'nullable|string',
            'tin_number' => 'nullable|string',
            'sss_number' => 'nullable|string',
            'philhealth_number' => 'nullable|string',
            'pagibig_number' => 'nullable|string',
            'position' => 'required|string|max:255',
            'department' => 'nullable|string|max:255',
            'branch_id' => 'nullable|integer|exists:branch_profiles,id',
            'pay_type' => 'required|string',
            'basic_salary' => 'required|numeric|min:0',
            'phone' => 'nullable|string|max:50',
            'email' => 'nullable|email|max:255',
            'address' => 'nullable|string',
            'hire_date' => 'nullable|date',
            'working_hours' => 'nullable|string',
            'emergency_contact_name' => 'nullable|string',
            'emergency_contact_relation' => 'nullable|string',
            'emergency_contact_phone' => 'nullable|string',
            'documents' => 'nullable|array',
            'status' => 'required|string|in:Active,Inactive',
            'notes' => 'nullable|string',
            'attendance_pin' => 'nullable|string|min:4|max:6',
        ]);

        $user = auth()->user();
        if ($user && $user->role === 'Store Administrator') {
            if ($user->employee && $user->employee->branch_id) {
                $validated['branch_id'] = $user->employee->branch_id;
            }
        }

        if (isset($validated['documents'])) {
            $validated['documents'] = json_encode($validated['documents']);
        }

        if (empty($validated['working_hours'])) {
            $validated['working_hours'] = '8 AM to 5 PM';
        }

        if (empty($validated['employee_code'])) {
            $count = Employee::count() + 1;
            $validated['employee_code'] = 'EMP-' . str_pad($count, 3, '0', STR_PAD_LEFT);
        }

        $salary = (float)$validated['basic_salary'];
        // Assume basic_salary is always Monthly as per UI
        $validated['daily_rate'] = round($salary / 26, 2);
        $validated['hourly_rate'] = round($validated['daily_rate'] / 8, 2);

        // QR is NOT generated automatically upon creation; only when Admin issues QR
        $validated['qr_token'] = null;
        $validated['qr_active'] = false;
        $validated['qr_generated_at'] = null;

        // Securely hash attendance PIN
        $pin = !empty($validated['attendance_pin']) ? $validated['attendance_pin'] : '1234';
        $validated['attendance_pin'] = Hash::make($pin);

        $employee = Employee::create($validated);
        $employee->has_pin = true;
        $employee->qr_status = 'NOT GENERATED';

        SystemLog::create([
            'user_id' => $request->user() ? $request->user()->user_id : 1,
            'action' => 'CREATE',
            'module' => 'Employees',
            'description' => "Created new employee: {$employee->first_name} {$employee->last_name} ({$employee->employee_code})",
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
        ]);

        return response()->json([
            'message' => 'Employee created successfully',
            'employee' => $employee,
        ], 201);
    }

    public function update(Request $request, $id)
    {
        $employee = Employee::findOrFail($id);

        $validated = $request->validate([
            'employee_code' => "required|string|unique:employees,employee_code,{$id},employee_id",
            'first_name' => 'required|string|max:255',
            'middle_name' => 'nullable|string|max:255',
            'last_name' => 'required|string|max:255',
            'gender' => 'nullable|string|in:Male,Female',
            'birth_date' => 'nullable|date',
            'date_of_birth' => 'nullable|date',
            'marital_status' => 'nullable|string',
            'tin_number' => 'nullable|string',
            'sss_number' => 'nullable|string',
            'philhealth_number' => 'nullable|string',
            'pagibig_number' => 'nullable|string',
            'position' => 'required|string|max:255',
            'department' => 'nullable|string|max:255',
            'branch_id' => 'nullable|integer|exists:branch_profiles,id',
            'pay_type' => 'required|string',
            'basic_salary' => 'required|numeric|min:0',
            'phone' => 'nullable|string|max:50',
            'email' => 'nullable|email|max:255',
            'address' => 'nullable|string',
            'hire_date' => 'nullable|date',
            'working_hours' => 'nullable|string',
            'emergency_contact_name' => 'nullable|string',
            'emergency_contact_relation' => 'nullable|string',
            'emergency_contact_phone' => 'nullable|string',
            'documents' => 'nullable|array',
            'status' => 'required|string|in:Active,Inactive',
            'notes' => 'nullable|string',
            'attendance_pin' => 'nullable|string|min:4|max:6',
        ]);

        if (isset($validated['documents'])) {
            $validated['documents'] = json_encode($validated['documents']);
        }

        if (empty($validated['working_hours'])) {
            $validated['working_hours'] = '8 AM to 5 PM';
        }

        $salary = (float)$validated['basic_salary'];
        // Assume basic_salary is always Monthly as per UI
        $validated['daily_rate'] = round($salary / 26, 2);
        $validated['hourly_rate'] = round($validated['daily_rate'] / 8, 2);

        if (!empty($validated['attendance_pin'])) {
            $validated['attendance_pin'] = Hash::make($validated['attendance_pin']);
        } else {
            unset($validated['attendance_pin']);
        }

        $user = auth()->user();
        if ($user && $user->role === 'Store Administrator') {
            if ($user->employee && $user->employee->branch_id) {
                $validated['branch_id'] = $user->employee->branch_id;
            }
        }

        $employee->update($validated);

        SystemLog::create([
            'user_id' => $request->user() ? $request->user()->user_id : 1,
            'action' => 'UPDATE',
            'module' => 'Employees',
            'description' => "Updated employee: {$employee->first_name} {$employee->last_name} ({$employee->employee_code})",
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
        ]);

        $employee->has_pin = !empty($employee->attendance_pin);
        $employee->qr_status = empty($employee->qr_token) 
            ? 'NOT GENERATED' 
            : ($employee->qr_active ? 'ACTIVE' : 'REVOKED');

        return response()->json([
            'message' => 'Employee updated successfully',
            'employee' => $employee,
        ]);
    }

    public function destroy(Request $request, $id)
    {
        $employee = Employee::findOrFail($id);
        $name = "{$employee->first_name} {$employee->last_name}";
        $code = $employee->employee_code;

        $employee->delete();

        SystemLog::create([
            'user_id' => $request->user() ? $request->user()->user_id : 1,
            'action' => 'DELETE',
            'module' => 'Employees',
            'description' => "Deleted employee: {$name} ({$code})",
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
        ]);

        return response()->json(['message' => 'Employee deleted successfully']);
    }

    // ─── QR & PIN Security Management (ADMIN ONLY) ───────────────────────────────

    public function getQr(Request $request, $id)
    {
        $user = $request->user('sanctum') ?? $request->user();
        $employee = Employee::findOrFail($id);

        if ($user && $user->role === 'Employee' && $user->employee_id != $employee->employee_id) {
            return response()->json([
                'success' => false,
                'message' => '403 Forbidden: You may only view your own QR code.',
            ], 403);
        }

        if ($user && in_array($user->role, ['Store Administrator', 'Store Admin'])) {
            return response()->json([
                'success' => false,
                'message' => '403 Forbidden: Store Administrators cannot manage employee QR codes.',
            ], 403);
        }

        return response()->json([
            'success' => true,
            'qr_token' => $employee->qr_token,
            'qr_active' => (bool)$employee->qr_active,
            'qr_status' => empty($employee->qr_token) ? 'NOT GENERATED' : ($employee->qr_active ? 'ACTIVE' : 'REVOKED'),
            'qr_generated_at' => $employee->qr_generated_at,
            'issued_date' => $employee->qr_generated_at ? $employee->qr_generated_at->format('M d, Y h:i A') : null,
            'issued_by' => !empty($employee->qr_token) ? 'Administrator' : null,
            'has_pin' => !empty($employee->attendance_pin),
            'is_locked' => $employee->pin_locked_until && $employee->pin_locked_until > now(),
            'locked_until' => $employee->pin_locked_until,
            'employee' => [
                'employee_id' => $employee->employee_id,
                'employee_code' => $employee->employee_code,
                'first_name' => $employee->first_name,
                'last_name' => $employee->last_name,
                'name' => "{$employee->first_name} {$employee->last_name}",
                'position' => $employee->position,
                'department' => $employee->department,
                'branch' => $employee->branch ? $employee->branch->name : null,
                'gender' => $employee->gender,
                'working_hours' => $employee->working_hours,
            ]
        ]);
    }

    public function generateQr(Request $request, $id)
    {
        $user = $request->user('sanctum') ?? $request->user();
        if (!$user || $user->role !== 'Administrator') {
            return response()->json([
                'success' => false,
                'message' => '403 Forbidden: ONLY Administrator can generate employee QR codes.',
            ], 403);
        }

        $employee = Employee::findOrFail($id);

        // Generate cryptographically secure random unique QR token (UUID)
        $employee->qr_token = (string)Str::uuid();
        $employee->qr_active = true;
        $employee->qr_generated_at = now();
        if (empty($employee->attendance_pin)) {
            $employee->attendance_pin = Hash::make('1234');
        }
        $employee->save();

        SystemLog::create([
            'user_id' => $user->user_id,
            'action' => 'UPDATE',
            'module' => 'Employees',
            'description' => "Administrator ({$user->username}) generated permanent unique QR code for {$employee->first_name} {$employee->last_name} ({$employee->employee_code})",
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Permanent QR code generated successfully.',
            'employee' => [
                'employee_id' => $employee->employee_id,
                'employee_code' => $employee->employee_code,
                'name' => "{$employee->first_name} {$employee->last_name}",
                'position' => $employee->position,
                'department' => $employee->department,
                'branch' => $employee->branch ? $employee->branch->name : null,
            ],
            'qr_token' => $employee->qr_token,
            'qr_active' => (bool)$employee->qr_active,
            'qr_status' => 'ACTIVE',
            'qr_generated_at' => $employee->qr_generated_at,
            'issued_date' => $employee->qr_generated_at->format('M d, Y h:i A'),
            'issued_by' => 'Administrator',
        ]);
    }

    public function revokeQr(Request $request, $id)
    {
        $user = $request->user('sanctum') ?? $request->user();
        if (!$user || $user->role !== 'Administrator') {
            return response()->json([
                'success' => false,
                'message' => '403 Forbidden: ONLY Administrator can revoke employee QR codes.',
            ], 403);
        }

        $employee = Employee::findOrFail($id);
        $employee->qr_active = false;
        $employee->save();

        SystemLog::create([
            'user_id' => $user->user_id,
            'action' => 'UPDATE',
            'module' => 'Employees',
            'description' => "Administrator ({$user->username}) REVOKED attendance QR code for {$employee->first_name} {$employee->last_name} ({$employee->employee_code})",
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
        ]);

        return response()->json([
            'success' => true,
            'message' => 'QR Code successfully revoked. Attendance scanning will be blocked.',
            'qr_active' => false,
            'qr_status' => 'REVOKED',
        ]);
    }

    public function reissueQr(Request $request, $id)
    {
        $user = $request->user('sanctum') ?? $request->user();
        if (!$user || $user->role !== 'Administrator') {
            return response()->json([
                'success' => false,
                'message' => '403 Forbidden: ONLY Administrator can reissue employee QR codes.',
            ], 403);
        }

        $employee = Employee::findOrFail($id);

        $employee->qr_token = (string)Str::uuid();
        $employee->qr_active = true;
        $employee->qr_generated_at = now();
        $employee->save();

        SystemLog::create([
            'user_id' => $user->user_id,
            'action' => 'UPDATE',
            'module' => 'Employees',
            'description' => "Administrator ({$user->username}) REISSUED new permanent QR token for {$employee->first_name} {$employee->last_name} ({$employee->employee_code}). Previous QR invalidated.",
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
        ]);

        return response()->json([
            'success' => true,
            'message' => 'New permanent QR code issued successfully. Previous QR is permanently invalidated.',
            'employee' => [
                'employee_id' => $employee->employee_id,
                'employee_code' => $employee->employee_code,
                'name' => "{$employee->first_name} {$employee->last_name}",
            ],
            'qr_token' => $employee->qr_token,
            'qr_active' => (bool)$employee->qr_active,
            'qr_status' => 'ACTIVE',
            'qr_generated_at' => $employee->qr_generated_at,
            'issued_date' => $employee->qr_generated_at->format('M d, Y h:i A'),
            'issued_by' => 'Administrator',
        ]);
    }

    public function regenerateQr(Request $request, $id)
    {
        return $this->reissueQr($request, $id);
    }

    public function disableQr(Request $request, $id)
    {
        return $this->revokeQr($request, $id);
    }

    public function enableQr(Request $request, $id)
    {
        $user = $request->user('sanctum') ?? $request->user();
        if (!$user || $user->role !== 'Administrator') {
            return response()->json([
                'success' => false,
                'message' => '403 Forbidden: ONLY Administrator can enable employee QR codes.',
            ], 403);
        }

        $employee = Employee::findOrFail($id);
        $employee->qr_active = true;
        $employee->save();

        SystemLog::create([
            'user_id' => $user->user_id,
            'action' => 'UPDATE',
            'module' => 'Employees',
            'description' => "Enabled QR attendance access for {$employee->first_name} {$employee->last_name} ({$employee->employee_code})",
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
        ]);

        return response()->json([
            'success' => true,
            'message' => 'QR Code enabled for attendance.',
            'qr_active' => true,
            'qr_status' => 'ACTIVE',
        ]);
    }

    public function toggleQr($id, Request $request)
    {
        $active = $request->boolean('active', true);
        return $active ? $this->enableQr($request, $id) : $this->revokeQr($request, $id);
    }

    /**
     * Get QR Monitoring Statistics and Live Audit Logs (ADMIN ONLY)
     * All values directly computed from MySQL database. NO MOCK DATA.
     */
    public function getQrMonitoringStats(Request $request)
    {
        $user = $request->user('sanctum') ?? $request->user();
        if (!$user || $user->role !== 'Administrator') {
            return response()->json([
                'success' => false,
                'message' => '403 Forbidden: Only Administrators can monitor QR system activity.',
            ], 403);
        }

        $today = date('Y-m-d');

        // 8 Real MySQL Database Statistics
        $totalEmployees = Employee::count();
        $qrGenerated = Employee::whereNotNull('qr_token')->where('qr_token', '!=', '')->count();
        $qrNotGenerated = Employee::whereNull('qr_token')->orWhere('qr_token', '')->count();
        $activeQr = Employee::whereNotNull('qr_token')->where('qr_token', '!=', '')->where('qr_active', true)->count();
        $revokedQr = Employee::whereNotNull('qr_token')->where('qr_token', '!=', '')->where('qr_active', false)->count();

        $todayScans = AttendanceScanLog::whereDate('scan_time', $today)->count();
        $todaySuccessful = AttendanceScanLog::whereDate('scan_time', $today)->where('status', 'SUCCESS')->count();
        $todayFailed = AttendanceScanLog::whereDate('scan_time', $today)->where('status', 'FAILED')->count();

        // QR Requests Statistics
        $totalRequests = \App\Models\QrRequest::count();
        $pendingRequests = \App\Models\QrRequest::where('status', 'PENDING')->count();
        $underReviewRequests = \App\Models\QrRequest::where('status', 'UNDER_REVIEW')->count();
        $approvedRequests = \App\Models\QrRequest::where('status', 'APPROVED')->count();
        $rejectedRequests = \App\Models\QrRequest::where('status', 'REJECTED')->count();

        // Recent Audit Logs
        $recentLogs = AttendanceScanLog::with(['employee', 'scannedBy.employee'])
            ->orderByDesc('id')
            ->limit(50)
            ->get()
            ->map(function ($l) {
                $emp = $l->employee;
                $scanner = $l->scannedBy;
                $scannedByName = $scanner ? ($scanner->employee ? "{$scanner->employee->first_name} {$scanner->employee->last_name}" : $scanner->username) : 'Store Administrator';

                return [
                    'id' => $l->id,
                    'employee_id' => $l->employee_id,
                    'employee_name' => $emp ? "{$emp->first_name} {$emp->last_name}" : 'Unidentified',
                    'employee_code' => $emp ? $emp->employee_code : 'N/A',
                    'branch' => $l->branch ?: ($emp ? $emp->branch : null),
                    'department' => $emp ? $emp->department : '—',
                    'action_type' => $l->action_type,
                    'status' => $l->status,
                    'failure_reason' => $l->failure_reason,
                    'scan_time' => $l->scan_time ? $l->scan_time->format('M d, Y h:i A') : '',
                    'qr_verified' => (bool)$l->qr_verified,
                    'pin_verified' => (bool)$l->pin_verified,
                    'verification_method' => ($l->qr_verified && $l->pin_verified) ? 'QR + PIN' : ($l->qr_verified ? 'QR Only' : 'Failed'),
                    'scanned_by' => $scannedByName,
                    'device_info' => $l->device_info,
                    'ip_address' => $l->ip_address,
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
                'successful_scans' => $todaySuccessful,
                'failed_scans' => $todayFailed,
                'total_requests' => $totalRequests,
                'pending_requests' => $pendingRequests,
                'under_review_requests' => $underReviewRequests,
                'approved_requests' => $approvedRequests,
                'rejected_requests' => $rejectedRequests,
            ],
            'recent_logs' => $recentLogs,
        ]);
    }

    public function setPin($id, Request $request)
    {
        $employee = Employee::findOrFail($id);

        $validated = $request->validate([
            'pin' => 'required|string|min:4|max:6|regex:/^[0-9]+$/',
        ], [
            'pin.regex' => 'The PIN must contain only digits (4 to 6 numeric digits).',
        ]);

        $employee->attendance_pin = Hash::make($validated['pin']);
        $employee->pin_failed_attempts = 0;
        $employee->pin_locked_until = null;
        $employee->save();

        SystemLog::create([
            'user_id' => $request->user() ? $request->user()->user_id : 1,
            'action' => 'UPDATE',
            'module' => 'Employees',
            'description' => "Updated secure attendance PIN for {$employee->first_name} {$employee->last_name} ({$employee->employee_code})",
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
        ]);

        return response()->json([
            'message' => 'Attendance PIN has been securely set/reset successfully.',
            'has_pin' => true,
        ]);
    }

    /**
     * Get authenticated employee profile for verification modal & phone display
     */
    public function me(Request $request)
    {
        $user = $request->user();
        if (!$user) {
            return response()->json([
                'success' => false,
                'message' => 'Your session has expired. Please log in again.',
            ], 401);
        }

        $employee = null;
        if ($user->employee_id) {
            $employee = Employee::find($user->employee_id);
        }
        if (!$employee && $user->employee) {
            $employee = $user->employee;
        }
        if (!$employee && $user->username) {
            $employee = Employee::where('email', $user->username)->first();
        }

        // Auto-heal / provision linked employee record if missing
        if (!$employee) {
            $count = Employee::count() + 1;
            $nameParts = explode('@', $user->username)[0];
            $cleanName = ucfirst(preg_replace('/[^a-zA-Z0-9]/', ' ', $nameParts));

            $employee = Employee::create([
                'employee_code' => 'EMP-' . str_pad($count, 3, '0', STR_PAD_LEFT),
                'first_name' => $cleanName ?: 'Staff',
                'last_name' => $user->role === 'Administrator' ? 'Administrator' : ($user->role === 'Store Administrator' || $user->role === 'Store Admin' ? 'StoreAdmin' : 'Member'),
                'email' => str_contains($user->username, '@') ? $user->username : "{$user->username}@pace.com",
                'position' => $user->role === 'Store Administrator' || $user->role === 'Store Admin' ? 'Store Manager' : ($user->role === 'Administrator' ? 'System Administrator' : 'Sales Associate'),
                'department' => $user->role === 'Store Administrator' || $user->role === 'Store Admin' ? 'Operations' : ($user->role === 'Administrator' ? 'Administration' : 'Sales'),
                'branch' => 'Main Branch',
                'pay_type' => 'Monthly',
                'basic_salary' => $user->role === 'Administrator' ? 50000 : 25000,
                'daily_rate' => round(($user->role === 'Administrator' ? 50000 : 25000) / 26, 2),
                'hourly_rate' => round(($user->role === 'Administrator' ? 50000 : 25000) / 26 / 8, 2),
                'status' => 'Active',
                'attendance_pin' => Hash::make('1234'),
            ]);

            $user->employee_id = $employee->employee_id;
            $user->save();
        }

        $latestRequest = \App\Models\QrRequest::where('user_id', $user->user_id)
            ->latest('request_id')
            ->first();

        $qrStatus = 'NOT GENERATED';
        if ($employee->qr_active && !empty($employee->qr_token)) {
            $qrStatus = 'ACTIVE';
        } elseif ($latestRequest) {
            if ($latestRequest->status === 'PENDING') {
                $qrStatus = 'REQUESTED';
            } elseif ($latestRequest->status === 'UNDER_REVIEW') {
                $qrStatus = 'UNDER_REVIEW';
            } elseif ($latestRequest->status === 'REJECTED') {
                $qrStatus = 'REJECTED';
            } elseif ($latestRequest->status === 'APPROVED') {
                $qrStatus = $employee->qr_active ? 'ACTIVE' : 'APPROVED';
            }
        } elseif ($employee->qr_request_status === 'REQUESTED') {
            $qrStatus = 'REQUESTED';
        } elseif ($employee->qr_request_status === 'UNDER_REVIEW') {
            $qrStatus = 'UNDER_REVIEW';
        } elseif ($employee->qr_request_status === 'REJECTED') {
            $qrStatus = 'REJECTED';
        }

        $todayAttendance = Attendance::where('employee_id', $employee->employee_id)
            ->whereDate('attendance_date', date('Y-m-d'))
            ->first();

        return response()->json([
            'success' => true,
            'employee' => [
                'employee_id' => $employee->employee_id,
                'employee_code' => $employee->employee_code,
                'first_name' => $employee->first_name,
                'middle_name' => $employee->middle_name,
                'last_name' => $employee->last_name,
                'gender' => $employee->gender,
                'date_of_birth' => $employee->date_of_birth ?: $employee->birth_date,
                'birth_date' => $employee->birth_date ?: $employee->date_of_birth,
                'marital_status' => $employee->marital_status,
                'position' => $employee->position,
                'department' => $employee->department,
                'branch' => $employee->branch ? $employee->branch->name : null,
                'pay_type' => $employee->pay_type,
                'ewallet_provider' => $employee->ewallet_provider,
                'ewallet_account_no' => $employee->ewallet_account_no,
                'bank_name' => $employee->bank_name,
                'bank_account_no' => $employee->bank_account_no,
                'basic_salary' => (float)$employee->basic_salary,
                'daily_rate' => (float)$employee->daily_rate,
                'hourly_rate' => (float)$employee->hourly_rate,
                'phone' => $employee->phone,
                'email' => $employee->email,
                'address' => $employee->address,
                'tin_number' => $employee->tin_number,
                'sss_number' => $employee->sss_number,
                'philhealth_number' => $employee->philhealth_number,
                'pagibig_number' => $employee->pagibig_number,
                'hire_date' => $employee->hire_date,
                'working_hours' => $employee->working_hours,
                'emergency_contact_name' => $employee->emergency_contact_name,
                'emergency_contact_relation' => $employee->emergency_contact_relation,
                'emergency_contact_phone' => $employee->emergency_contact_phone,
                'status' => $employee->status,
                'account_status' => $employee->account_status ?: ($employee->account_verified ? 'VERIFIED' : 'UNVERIFIED'),
                'account_verified' => (bool)($employee->account_verified || $employee->account_status === 'VERIFIED'),
                'account_verified_at' => $employee->account_verified_at ?: $employee->information_verified_at,
                'information_verified' => (bool)($employee->account_verified || $employee->account_status === 'VERIFIED'),
                'information_verified_at' => $employee->account_verified_at ?: $employee->information_verified_at,
                'is_verified' => (bool)($employee->account_verified || $employee->account_status === 'VERIFIED'),
                'verified_at' => $employee->account_verified_at ?: $employee->information_verified_at,
                'qr_token' => $employee->qr_token,
                'qr_active' => (bool)$employee->qr_active,
                'qr_request_status' => $employee->qr_request_status ?: ($latestRequest ? $latestRequest->status : 'NOT_REQUESTED'),
                'qr_status' => $qrStatus,
                'qr_rejection_reason' => $latestRequest ? $latestRequest->rejection_reason : $employee->qr_rejection_reason,
                'qr_generated_at' => $employee->qr_generated_at,
                'has_pin' => !empty($employee->attendance_pin),
                'latest_request' => $latestRequest ? [
                    'request_id' => $latestRequest->request_id,
                    'request_code' => $latestRequest->request_code,
                    'status' => $latestRequest->status,
                    'rejection_reason' => $latestRequest->rejection_reason,
                    'created_at' => $latestRequest->created_at ? $latestRequest->created_at->format('M d, Y h:i A') : '',
                ] : null,
                'today_attendance' => $todayAttendance ? [
                    'time_in' => $todayAttendance->time_in,
                    'time_out' => $todayAttendance->time_out,
                    'break_out' => $todayAttendance->break_out,
                    'break_in' => $todayAttendance->break_in,
                    'lunch_out' => $todayAttendance->lunch_out,
                    'lunch_in' => $todayAttendance->lunch_in,
                ] : null,
            ],
        ]);
    }

    /**
     * Update permitted self-service profile information
     */
    public function updateMe(Request $request)
    {
        $user = $request->user();
        if (!$user) {
            return response()->json([
                'success' => false,
                'message' => 'Unauthenticated session.',
            ], 401);
        }

        if ($user->role === 'Administrator') {
            return response()->json([
                'success' => false,
                'message' => 'Administrators are not allowed to use the self-service profile edit. Please use the Admin panel to edit employee records.',
            ], 403);
        }

        $employee = ($user->employee_id ? Employee::find($user->employee_id) : null) ?: ($user->employee ?: Employee::where('email', $user->username)->first());
        if (!$employee) {
            return response()->json([
                'success' => false,
                'message' => 'Employee record not found.',
            ], 404);
        }

        $validated = $request->validate([
            'phone' => 'nullable|string|max:50',
            'email' => 'nullable|email|max:255',
            'address' => 'nullable|string|max:500',
            'pay_type' => 'nullable|string|max:50',
            'ewallet_provider' => 'nullable|string|max:50',
            'ewallet_account_no' => 'nullable|string|max:50',
            'bank_name' => 'nullable|string|max:100',
            'bank_account_no' => 'nullable|string|max:50',
            'emergency_contact_name' => 'nullable|string|max:255',
            'emergency_contact_relation' => 'nullable|string|max:100',
            'emergency_contact_phone' => 'nullable|string|max:50',
            'branch_id' => 'nullable|exists:branch_profiles,id',
            'notes' => 'nullable|string',
            'basic_salary' => 'nullable|numeric|min:0',
        ]);

        $user = auth()->user();
        if ($user && $user->role === 'Store Administrator') {
            if ($user->employee && $user->employee->branch_id) {
                $validated['branch_id'] = $user->employee->branch_id;
            }
        }

        if (!empty($validated['pay_type'])) {
            $pt = strtolower($validated['pay_type']);
            if ($pt === 'ewallet') $validated['pay_type'] = 'Ewallet';
            elseif ($pt === 'bank') $validated['pay_type'] = 'Bank';
            elseif ($pt === 'cash') $validated['pay_type'] = 'Cash';
        }

        if (!empty($validated['ewallet_provider'])) {
            $ep = strtolower($validated['ewallet_provider']);
            if ($ep === 'gcash') $validated['ewallet_provider'] = 'Gcash';
            elseif ($ep === 'maya') $validated['ewallet_provider'] = 'Maya';
        }

        if (isset($validated['basic_salary'])) {
            $salary = (float)$validated['basic_salary'];
            $validated['daily_rate'] = round($salary / 26, 2);
            $validated['hourly_rate'] = round($validated['daily_rate'] / 8, 2);
        }

        $employee->update($validated);

        SystemLog::create([
            'user_id' => $user->user_id,
            'action' => 'UPDATE',
            'module' => 'Employees',
            'description' => "Employee {$employee->first_name} {$employee->last_name} ({$employee->employee_code}) updated contact profile details",
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Profile details updated successfully.',
            'employee' => $employee->fresh(),
        ]);
    }

    /**
     * Verify employee account by Administrator
     */
    public function verifyEmployee(Request $request, $id)
    {
        $user = $request->user();
        if (!$user || $user->role !== 'Administrator') {
            return response()->json([
                'success' => false,
                'message' => 'Unauthorized. Only administrators can verify employee accounts.',
            ], 403);
        }

        $employee = Employee::findOrFail($id);
        $employee->information_verified = true;
        $employee->information_verified_at = now();
        $employee->save();

        SystemLog::create([
            'user_id' => $user->user_id,
            'action' => 'UPDATE',
            'module' => 'Employees',
            'description' => "Administrator {$user->username} verified employee account for {$employee->first_name} {$employee->last_name} ({$employee->employee_code})",
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Employee account verified successfully.',
            'employee' => $employee,
        ]);
    }

    public function unverifyEmployee(Request $request, $id)
    {
        $user = $request->user();
        if (!$user || $user->role !== 'Administrator') {
            return response()->json([
                'success' => false,
                'message' => 'Unauthorized. Only administrators can unverify employee accounts.',
            ], 403);
        }

        $employee = Employee::findOrFail($id);
        $employee->information_verified = false;
        $employee->information_verified_at = null;
        $employee->account_verified = false;
        $employee->account_verified_at = null;
        $employee->save();

        return response()->json([
            'success' => true,
            'message' => 'Employee verification revoked.',
            'employee' => $employee,
        ]);
    }

    public function verifyAccount(Request $request)
    {
        $user = $request->user();
        if (!$user) {
            return response()->json([
                'success' => false,
                'message' => 'Unauthenticated session.',
            ], 401);
        }

        $employee = ($user->employee_id ? Employee::find($user->employee_id) : null) ?: ($user->employee ?: Employee::where('email', $user->username)->first());
        if (!$employee) {
            return response()->json([
                'success' => false,
                'message' => 'Employee record not found.',
            ], 404);
        }

        $employee->account_verified = true;
        $employee->account_verified_at = now();
        $employee->information_verified = true;
        $employee->information_verified_at = now();
        $employee->save();

        $user->account_verified = true;
        $user->account_verified_at = now();
        $user->save();

        return response()->json([
            'success' => true,
            'message' => 'Your employee account has been successfully verified.',
            'verified_at' => $employee->account_verified_at->toISOString(),
            'employee' => $employee,
        ]);
    }
}
