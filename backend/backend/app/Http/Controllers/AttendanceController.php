<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\Attendance;
use App\Models\AttendanceScanLog;
use App\Models\Employee;
use App\Models\SystemLog;
use Illuminate\Support\Facades\Hash;
use App\Services\NotificationService;

class AttendanceController extends Controller
{
    /**
     * List attendance records with role-based scoping and filters.
     */
    public function index(Request $request)
    {
        $user = $request->user();
        $query = Attendance::with(['employee', 'scannedBy.employee']);

        // Role-based scoping
        if ($user && $user->role === 'Employee') {
            $query->where('employee_id', $user->employee_id);
        } elseif ($user && in_array($user->role, ['Store Administrator', 'Store Admin'])) {
            $branch = $user->employee ? $user->employee->branch : 'Main Branch';
            $query->whereHas('employee', function ($eq) use ($branch) {
                $eq->where('branch', $branch);
            });
        } elseif ($request->filled('branch') && $request->query('branch') !== 'All') {
            $branch = $request->query('branch');
            $query->whereHas('employee', function ($eq) use ($branch) {
                $eq->where('branch', $branch);
            });
        }

        if ($request->filled('employee_id')) {
            $query->where('employee_id', $request->query('employee_id'));
        }

        if ($request->filled('date')) {
            $query->where('attendance_date', $request->query('date'));
        }

        if ($request->filled('date_from')) {
            $query->where('attendance_date', '>=', $request->query('date_from'));
        }

        if ($request->filled('date_to')) {
            $query->where('attendance_date', '<=', $request->query('date_to'));
        }

        if ($request->filled('search')) {
            $s = $request->query('search');
            $query->whereHas('employee', function ($eq) use ($s) {
                $eq->where('first_name', 'like', "%{$s}%")
                   ->orWhere('last_name', 'like', "%{$s}%")
                   ->orWhere('employee_code', 'like', "%{$s}%");
            });
        }

        if ($request->filled('department') && $request->query('department') !== 'All') {
            $query->whereHas('employee', function ($eq) use ($request) {
                $eq->where('department', $request->query('department'));
            });
        }

        if ($request->filled('status') && $request->query('status') !== 'All') {
            $query->where('status', $request->query('status'));
        }

        if ($request->boolean('export_csv')) {
            SystemLog::create([
                'user_id' => $user ? $user->user_id : null,
                'action' => 'EXPORT',
                'module' => 'Attendance',
                'description' => 'Exported Attendance Logs to CSV',
                'ip_address' => $request->ip(),
                'user_agent' => $request->userAgent(),
            ]);

            return $this->exportCsv(
                'attendance_logs_export_' . date('Y-m-d') . '.csv',
                ['Attendance ID', 'Employee ID', 'Employee Name', 'Department', 'Branch', 'Date', 'Time In', 'Break Out', 'Break In', 'Lunch Out', 'Lunch In', 'Time Out', 'Regular Hours', 'Overtime Hours', 'Total Hours', 'Status', 'Verification', 'Verified By'],
                $query->orderByDesc('attendance_date')->orderBy('employee_id'),
                function ($a) {
                    $emp = $a->employee;
                    $regularHours = max(0, (float)$a->total_hours - (float)$a->overtime_hours);
                    $scanner = $a->scannedBy;
                    $verifiedBy = $a->verified_by_name ?: ($scanner ? "Store Administrator ({$scanner->username})" : 'Store Administrator');

                    return [
                        $a->attendance_id,
                        $a->employee_id,
                        $emp ? "{$emp->first_name} {$emp->last_name}" : 'Employee',
                        $emp ? $emp->department : '',
                        $emp ? $emp->branch : '',
                        $a->attendance_date,
                        $a->time_in,
                        $a->break_out,
                        $a->break_in,
                        $a->lunch_out,
                        $a->lunch_in,
                        $a->time_out,
                        round($regularHours, 2),
                        $a->overtime_hours,
                        $a->total_hours,
                        $a->status,
                        $a->verification_method ?? 'QR + PIN',
                        $verifiedBy
                    ];
                }
            );
        }

        $records = $query->orderByDesc('attendance_date')->orderBy('employee_id')->get()->map(function ($a) {
            $emp = $a->employee;
            $regularHours = max(0, (float)$a->total_hours - (float)$a->overtime_hours);
            $scanner = $a->scannedBy;
            $verifiedBy = $a->verified_by_name ?: ($scanner ? "Store Administrator ({$scanner->username})" : 'Store Administrator');

            return [
                'attendance_id' => $a->attendance_id,
                'employee_id' => $a->employee_id,
                'employee_name' => $emp ? "{$emp->first_name} {$emp->last_name}" : 'Employee',
                'employee_code' => $emp ? $emp->employee_code : '',
                'department' => $emp ? $emp->department : '',
                'position' => $emp ? $emp->position : '',
                'branch' => $emp ? $emp->branch : '',
                'attendance_date' => $a->attendance_date,
                'time_in' => $a->time_in ? date('h:i A', strtotime($a->time_in)) : '',
                'time_out' => $a->time_out ? date('h:i A', strtotime($a->time_out)) : '',
                'time_in_raw' => $a->time_in ? date('H:i', strtotime($a->time_in)) : '',
                'time_out_raw' => $a->time_out ? date('H:i', strtotime($a->time_out)) : '',
                'regular_hours' => round($regularHours, 2),
                'total_hours' => (float)$a->total_hours,
                'overtime_hours' => (float)$a->overtime_hours,
                'status' => $a->status,
                'verification_method' => $a->verification_method ?? 'QR + PIN',
                'verified_by' => $verifiedBy,
                'remarks' => $a->remarks ?? '',
            ];
        });

        return response()->json([
            'attendance' => $records,
            'total' => $records->count(),
        ]);
    }

    /**
     * Dedicated personal attendance endpoint for logged-in employee.
     */
    public function meAttendance(Request $request)
    {
        $user = $request->user();
        if (!$user || !$user->employee_id) {
            return response()->json(['attendance' => [], 'today' => null, 'total' => 0, 'stats' => null]);
        }

        $empId = $user->employee_id;
        $today = date('Y-m-d');

        $todayRecord = Attendance::where('employee_id', $empId)
            ->where('attendance_date', $today)
            ->first();

        $history = Attendance::where('employee_id', $empId)
            ->orderByDesc('attendance_date')
            ->get()
            ->map(function ($a) {
                $regular = max(0, (float)$a->total_hours - (float)$a->overtime_hours);
                return [
                    'attendance_id' => $a->attendance_id,
                    'attendance_date' => $a->attendance_date,
                    'time_in' => $a->time_in ? date('h:i A', strtotime($a->time_in)) : '—',
                    'time_out' => $a->time_out ? date('h:i A', strtotime($a->time_out)) : '—',
                    'regular_hours' => round($regular, 2),
                    'overtime_hours' => (float)$a->overtime_hours,
                    'total_hours' => (float)$a->total_hours,
                    'status' => $a->status,
                    'verification_method' => $a->verification_method ?? 'QR + PIN',
                    'verified_by' => $a->verified_by_name ?? 'Store Administrator',
                    'remarks' => $a->remarks ?? '',
                ];
            });

        $presentCount = $history->whereIn('status', ['Present', 'Late', 'COMPLETE'])->count();
        $lateCount = $history->where('status', 'Late')->count();
        $totalHours = (float)$history->sum('total_hours');
        $totalOT = (float)$history->sum('overtime_hours');

        return response()->json([
            'today' => $todayRecord ? [
                'attendance_id' => $todayRecord->attendance_id,
                'attendance_date' => $todayRecord->attendance_date,
                'time_in' => $todayRecord->time_in ? date('h:i A', strtotime($todayRecord->time_in)) : '—',
                'time_out' => $todayRecord->time_out ? date('h:i A', strtotime($todayRecord->time_out)) : '—',
                'regular_hours' => round(max(0, (float)$todayRecord->total_hours - (float)$todayRecord->overtime_hours), 2),
                'overtime_hours' => (float)$todayRecord->overtime_hours,
                'total_hours' => (float)$todayRecord->total_hours,
                'status' => $todayRecord->status,
                'verification_method' => $todayRecord->verification_method ?? 'QR + PIN',
            ] : null,
            'attendance' => $history,
            'total' => $history->count(),
            'stats' => [
                'present_count' => $presentCount,
                'late_count' => $lateCount,
                'total_hours' => round($totalHours, 2),
                'overtime_hours' => round($totalOT, 2),
            ],
        ]);
    }

    /**
     * Attendance Summary stats for dashboard & cards.
     */
    public function summary(Request $request)
    {
        $user = $request->user();
        $date = $request->query('date', date('Y-m-d'));
        
        $query = Attendance::query();
        if ($user && in_array($user->role, ['Store Administrator', 'Store Admin'])) {
            $branch = $user->employee ? $user->employee->branch : 'Main Branch';
            $query->whereHas('employee', function ($eq) use ($branch) {
                $eq->where('branch', $branch);
            });
        } elseif ($request->filled('branch') && $request->query('branch') !== 'All') {
            $branch = $request->query('branch');
            $query->whereHas('employee', function ($eq) use ($branch) {
                $eq->where('branch', $branch);
            });
        }

        $records = (clone $query)->where('attendance_date', $date)->get();
        if ($records->isEmpty()) {
            $latestDate = (clone $query)->max('attendance_date') ?? $date;
            $records = (clone $query)->where('attendance_date', $latestDate)->get();
            $date = $latestDate;
        }

        $present = $records->whereIn('status', ['Present', 'COMPLETE'])->count();
        $late = $records->where('status', 'Late')->count();
        $absent = $records->where('status', 'Absent')->count();
        $halfDay = $records->where('status', 'Half Day')->count();

        return response()->json([
            'date' => $date,
            'present' => $present,
            'late' => $late,
            'absent' => $absent,
            'half_day' => $halfDay,
            'summary' => [
                ['status' => 'Present', 'count' => $present, 'color' => '#16a34a'],
                ['status' => 'Late', 'count' => $late, 'color' => '#f59e0b'],
                ['status' => 'Absent', 'count' => $absent, 'color' => '#dc2626'],
                ['status' => 'Half Day', 'count' => $halfDay, 'color' => '#6366f1'],
            ],
        ]);
    }

    /**
     * Step 1: Scan & Verify QR Code Token & Identify Employee
     * STRICT: ONLY Store Administrator can access.
     */
    public function scan(Request $request)
    {
        return $this->verifyQr($request);
    }

    public function verifyQr(Request $request)
    {
        $user = $request->user('sanctum') ?? $request->user();
        if (!$user || !in_array($user->role, ['Store Administrator', 'Store Admin'])) {
            return response()->json([
                'success' => false,
                'message' => '403 Forbidden: Only authorized Store Administrators can access the QR Attendance Scanner.',
            ], 403);
        }

        $validated = $request->validate([
            'qr_token' => 'required|string',
            'device_info' => 'nullable|string',
        ]);

        $token = trim($validated['qr_token']);
        $deviceInfo = $request->input('device_info', $request->userAgent());
        $storeAdminBranch = $user->employee && !empty($user->employee->branch) ? trim($user->employee->branch) : 'Main Branch';

        $employee = Employee::where('qr_token', $token)->first();

        // 1. Validate QR Token exists
        if (!$employee) {
            AttendanceScanLog::create([
                'scanned_by' => $user->user_id,
                'branch' => $storeAdminBranch,
                'qr_token_scanned' => substr($token, 0, 50),
                'qr_verified' => false,
                'pin_verified' => false,
                'action_type' => 'INVALID_QR',
                'status' => 'FAILED',
                'failure_reason' => 'Invalid or unrecognized QR code token',
                'device_info' => $deviceInfo,
                'ip_address' => $request->ip(),
            ]);

            return response()->json([
                'success' => false,
                'message' => 'Invalid or unrecognized QR code.',
            ], 404);
        }

        // 2. Validate QR Token is Active
        if (!$employee->qr_active) {
            AttendanceScanLog::create([
                'employee_id' => $employee->employee_id,
                'scanned_by' => $user->user_id,
                'branch' => $storeAdminBranch,
                'qr_token_scanned' => substr($token, 0, 50),
                'qr_verified' => false,
                'pin_verified' => false,
                'action_type' => 'REVOKED_QR_SCAN',
                'status' => 'FAILED',
                'failure_reason' => 'QR code has been revoked or is inactive',
                'device_info' => $deviceInfo,
                'ip_address' => $request->ip(),
            ]);

            return response()->json([
                'success' => false,
                'message' => 'This employee QR code is currently inactive or revoked. Please contact an Administrator.',
            ], 403);
        }

        // 3. Validate Employee is Active
        if ($employee->status !== 'Active') {
            AttendanceScanLog::create([
                'employee_id' => $employee->employee_id,
                'scanned_by' => $user->user_id,
                'branch' => $storeAdminBranch,
                'qr_token_scanned' => substr($token, 0, 50),
                'qr_verified' => true,
                'pin_verified' => false,
                'action_type' => 'REJECTED',
                'status' => 'FAILED',
                'failure_reason' => "Employee account is {$employee->status}",
                'device_info' => $deviceInfo,
                'ip_address' => $request->ip(),
            ]);

            return response()->json([
                'success' => false,
                'message' => "Employee account is currently {$employee->status}.",
            ], 403);
        }

        // 4. Branch Security: Verify employee belongs to Store Admin's authorized branch
        $employeeBranch = !empty($employee->branch) ? trim($employee->branch) : 'Main Branch';
        if (strcasecmp($employeeBranch, $storeAdminBranch) !== 0) {
            AttendanceScanLog::create([
                'employee_id' => $employee->employee_id,
                'scanned_by' => $user->user_id,
                'branch' => $storeAdminBranch,
                'qr_token_scanned' => substr($token, 0, 50),
                'qr_verified' => true,
                'pin_verified' => false,
                'action_type' => 'UNAUTHORIZED_BRANCH_SCAN',
                'status' => 'FAILED',
                'failure_reason' => "This employee belongs to {$employee->branch}, but your authorized branch is {$storeAdminBranch}",
                'device_info' => $deviceInfo,
                'ip_address' => $request->ip(),
            ]);

            return response()->json([
                'success' => false,
                'message' => 'This employee does not belong to your authorized branch.',
                'employee_branch' => $employee->branch,
                'authorized_branch' => $storeAdminBranch,
            ], 403);
        }

        // 5. Check if account is locked out from PIN guessing
        if ($employee->pin_locked_until && $employee->pin_locked_until > now()) {
            $minutesRemaining = max(1, now()->diffInMinutes($employee->pin_locked_until));
            return response()->json([
                'success' => false,
                'is_locked' => true,
                'message' => "Too many failed PIN attempts. Account is locked for {$minutesRemaining} more minute(s). Please contact an Administrator.",
            ], 423);
        }

        // Log successful initial QR token scan
        AttendanceScanLog::create([
            'employee_id' => $employee->employee_id,
            'scanned_by' => $user->user_id,
            'branch' => $storeAdminBranch,
            'qr_token_scanned' => substr($token, 0, 50),
            'qr_verified' => true,
            'pin_verified' => false,
            'action_type' => 'QR_SCAN_SUCCESS',
            'status' => 'PENDING_PIN',
            'failure_reason' => null,
            'device_info' => $deviceInfo,
            'ip_address' => $request->ip(),
        ]);

        // Determine available actions
        $todayRecord = \App\Models\Attendance::where('employee_id', $employee->employee_id)
            ->where('attendance_date', date('Y-m-d'))
            ->first();

        $availableActions = [];
        if (!$todayRecord) {
            $availableActions = ['TIME_IN'];
        } else if (empty($todayRecord->time_out)) {
            if (!empty($todayRecord->break_out) && empty($todayRecord->break_in)) {
                $availableActions = ['BREAK_IN'];
            } else if (!empty($todayRecord->lunch_out) && empty($todayRecord->lunch_in)) {
                $availableActions = ['LUNCH_IN'];
            } else {
                $availableActions = ['BREAK_OUT', 'LUNCH_OUT', 'TIME_OUT'];
            }
        } else {
            $availableActions = ['COMPLETED'];
        }

        return response()->json([
            'success' => true,
            'employee' => [
                'employee_id' => $employee->employee_id,
                'employee_code' => $employee->employee_code,
                'name' => "{$employee->first_name} {$employee->last_name}",
                'first_name' => $employee->first_name,
                'last_name' => $employee->last_name,
                'position' => $employee->position,
                'department' => $employee->department,
                'branch' => $employee->branch ?: $storeAdminBranch,
                'gender' => $employee->gender,
                'working_hours' => $employee->working_hours,
                'qr_status' => 'ACTIVE',
            ],
            'available_actions' => $availableActions,
            'requires_pin' => true,
            'has_pin' => !empty($employee->attendance_pin),
        ]);
    }

    /**
     * Step 2: Verify Personal Attendance PIN & Record Time In / Time Out
     * STRICT: ONLY Store Administrator can record attendance.
     */
    public function verifyPinAndRecord(Request $request)
    {
        $user = $request->user('sanctum') ?? $request->user();
        if (!$user || !in_array($user->role, ['Store Administrator', 'Store Admin'])) {
            return response()->json([
                'success' => false,
                'message' => '403 Forbidden: Only authorized Store Administrators can record attendance.',
            ], 403);
        }

        $validated = $request->validate([
            'qr_token' => 'required|string',
            'pin' => 'required|string',
            'device_info' => 'nullable|string',
        ]);

        $token = trim($validated['qr_token']);
        $pin = trim($validated['pin']);
        $deviceInfo = $request->input('device_info', $request->userAgent());
        $storeAdminBranch = $user->employee && !empty($user->employee->branch) ? trim($user->employee->branch) : 'Main Branch';

        $employee = Employee::where('qr_token', $token)->first();

        if (!$employee || !$employee->qr_active || $employee->status !== 'Active') {
            return response()->json([
                'success' => false,
                'message' => 'Invalid, inactive, or unauthorized employee record.',
            ], 403);
        }

        // Branch Security check
        $employeeBranch = !empty($employee->branch) ? trim($employee->branch) : 'Main Branch';
        if (strcasecmp($employeeBranch, $storeAdminBranch) !== 0) {
            AttendanceScanLog::create([
                'employee_id' => $employee->employee_id,
                'scanned_by' => $user->user_id,
                'branch' => $storeAdminBranch,
                'qr_token_scanned' => substr($token, 0, 50),
                'qr_verified' => true,
                'pin_verified' => false,
                'action_type' => 'UNAUTHORIZED_BRANCH_SCAN',
                'status' => 'FAILED',
                'failure_reason' => "This employee belongs to {$employee->branch}, but your authorized branch is {$storeAdminBranch}",
                'device_info' => $deviceInfo,
                'ip_address' => $request->ip(),
            ]);

            return response()->json([
                'success' => false,
                'message' => 'This employee does not belong to your authorized branch.',
            ], 403);
        }

        // Check Lockout
        if ($employee->pin_locked_until && $employee->pin_locked_until > now()) {
            $minutes = max(1, now()->diffInMinutes($employee->pin_locked_until));
            return response()->json([
                'success' => false,
                'is_locked' => true,
                'message' => "Too many failed PIN attempts. Account is locked for {$minutes} more minute(s).",
            ], 423);
        }

        // If no PIN is configured, default to '1234'
        if (empty($employee->attendance_pin)) {
            $employee->attendance_pin = Hash::make('1234');
            $employee->save();
        }

        // Verify PIN securely using Hash::check
        if (!Hash::check($pin, $employee->attendance_pin)) {
            $employee->pin_failed_attempts = ($employee->pin_failed_attempts ?? 0) + 1;
            $attemptsLeft = max(0, 5 - $employee->pin_failed_attempts);

            if ($employee->pin_failed_attempts >= 5) {
                $employee->pin_locked_until = now()->addMinutes(15);
                $employee->save();

                AttendanceScanLog::create([
                    'employee_id' => $employee->employee_id,
                    'scanned_by' => $user->user_id,
                    'branch' => $storeAdminBranch,
                    'qr_token_scanned' => substr($token, 0, 50),
                    'qr_verified' => true,
                    'pin_verified' => false,
                    'action_type' => 'PIN_VERIFICATION_FAILED',
                    'status' => 'FAILED',
                    'failure_reason' => 'PIN verification failed 5 times - Account locked for 15 minutes',
                    'device_info' => $deviceInfo,
                    'ip_address' => $request->ip(),
                ]);

                // Security Alert Notification to Admins
                NotificationService::sendToAdmins([
                    'type' => 'attendance_failed_verification',
                    'title' => 'Security Alert: PIN Lockout',
                    'message' => "Employee {$employee->first_name} {$employee->last_name} ({$employee->employee_code}) account locked after 5 failed PIN attempts at {$storeAdminBranch}.",
                    'module' => 'Security',
                    'related_id' => $employee->employee_id,
                    'related_type' => 'App\Models\Employee',
                    'action_url' => '/attendance',
                    'priority' => 'critical',
                ]);

                return response()->json([
                    'success' => false,
                    'is_locked' => true,
                    'message' => 'Too many failed attempts. Account has been locked for 15 minutes for security.',
                ], 423);
            }

            $employee->save();

            AttendanceScanLog::create([
                'employee_id' => $employee->employee_id,
                'scanned_by' => $user->user_id,
                'branch' => $storeAdminBranch,
                'qr_token_scanned' => substr($token, 0, 50),
                'qr_verified' => true,
                'pin_verified' => false,
                'action_type' => 'PIN_VERIFICATION_FAILED',
                'status' => 'FAILED',
                'failure_reason' => "Incorrect PIN attempt ({$employee->pin_failed_attempts}/5)",
                'device_info' => $deviceInfo,
                'ip_address' => $request->ip(),
            ]);

            return response()->json([
                'success' => false,
                'message' => "PIN verification failed. Attendance was not recorded. ({$attemptsLeft} attempt(s) remaining)",
                'attempts_left' => $attemptsLeft,
            ], 422);
        }

        // PIN is valid! Reset failed attempts and lockout
        $employee->pin_failed_attempts = 0;
        $employee->pin_locked_until = null;
        $employee->save();

        // ─── Attendance Business Rules ──────────────────────────────────────────────
        $action = strtoupper($request->input('action'));
        if (!in_array($action, ['TIME_IN', 'BREAK_OUT', 'BREAK_IN', 'LUNCH_OUT', 'LUNCH_IN', 'TIME_OUT'])) {
            return response()->json(['success' => false, 'message' => 'Invalid action requested.'], 400);
        }

        $today = date('Y-m-d');
        $now = date('H:i:s');
        $timeStr = date('h:i A');
        $verifiedByName = "Store Administrator ({$user->username})";

        $record = Attendance::where('employee_id', $employee->employee_id)
            ->where('attendance_date', $today)
            ->first();

        // Prevent invalid flows
        if ($action !== 'TIME_IN' && !$record) {
            return response()->json(['success' => false, 'message' => 'Cannot perform this action without Time In.'], 400);
        }
        if ($record && $record->time_out) {
            return response()->json(['success' => false, 'message' => 'Attendance already completed for today.'], 400);
        }

        if ($action === 'TIME_IN') {
            if ($record) return response()->json(['success' => false, 'message' => 'Already timed in.'], 400);
            
            $record = new Attendance();
            $record->employee_id = $employee->employee_id;
            $record->scanned_by = $user->user_id;
            $record->attendance_date = $today;
            $record->time_in = $now;
            $record->qr_scan_in = 'QR_PIN_VERIFIED';
            $record->verification_method = 'QR + PIN';
            $record->verified_by_name = $verifiedByName;
            $record->device_info = $deviceInfo;
            $record->ip_address = $request->ip();
            $record->total_hours = 0;
            $record->overtime_hours = 0;

            $hour = (int)date('H');
            $min = (int)date('i');
            if ($hour > 8 || ($hour === 8 && $min > 15)) {
                $record->status = 'Late';
            } else {
                $record->status = 'Present';
            }
            $record->save();
        } else if ($action === 'BREAK_OUT') {
            if ($record->break_out) return response()->json(['success' => false, 'message' => 'Already took a break.'], 400);
            $record->break_out = $now;
            $record->save();
        } else if ($action === 'BREAK_IN') {
            if (!$record->break_out || $record->break_in) return response()->json(['success' => false, 'message' => 'Invalid action.'], 400);
            $record->break_in = $now;
            $record->save();
        } else if ($action === 'LUNCH_OUT') {
            if ($record->lunch_out) return response()->json(['success' => false, 'message' => 'Already took lunch.'], 400);
            $record->lunch_out = $now;
            $record->save();
        } else if ($action === 'LUNCH_IN') {
            if (!$record->lunch_out || $record->lunch_in) return response()->json(['success' => false, 'message' => 'Invalid action.'], 400);
            $record->lunch_in = $now;
            $record->save();
        } else if ($action === 'TIME_OUT') {
            if (($record->break_out && !$record->break_in) || ($record->lunch_out && !$record->lunch_in)) {
                return response()->json(['success' => false, 'message' => 'Cannot time out while on break or lunch.'], 400);
            }
            $record->time_out = $now;
            $record->qr_scan_out = 'QR_PIN_VERIFIED';
            $record->verified_by_name = $verifiedByName;

            // Calculate actual worked hours
            $inDateTime = strtotime($record->attendance_date . ' ' . $record->time_in);
            $outDateTime = strtotime($today . ' ' . $now);
            if ($outDateTime < $inDateTime) {
                $outDateTime += 86400; // overnight
            }
            $totalShiftSeconds = max(0, $outDateTime - $inDateTime);

            $breakSeconds = 0;
            if ($record->break_out && $record->break_in) {
                $breakOut = strtotime($record->attendance_date . ' ' . $record->break_out);
                $breakIn = strtotime($record->attendance_date . ' ' . $record->break_in);
                if ($breakIn < $breakOut) $breakIn += 86400;
                $breakSeconds = max(0, $breakIn - $breakOut);
            }

            $lunchSeconds = 0;
            if ($record->lunch_out && $record->lunch_in) {
                $lunchOut = strtotime($record->attendance_date . ' ' . $record->lunch_out);
                $lunchIn = strtotime($record->attendance_date . ' ' . $record->lunch_in);
                if ($lunchIn < $lunchOut) $lunchIn += 86400;
                $lunchSeconds = max(0, $lunchIn - $lunchOut);
            }

            $workedSeconds = $totalShiftSeconds - $breakSeconds - $lunchSeconds;
            $diffHours = round(max(0, $workedSeconds / 3600), 2);

            $record->total_hours = $diffHours;
            $record->overtime_hours = max(0, round($diffHours - 8, 2));
            $record->status = 'COMPLETE';
            $record->save();
        }

        // Shared Logs and Notifications for all actions
        AttendanceScanLog::create([
            'employee_id' => $employee->employee_id,
            'scanned_by' => $user->user_id,
            'branch' => $storeAdminBranch,
            'qr_token_scanned' => substr($token, 0, 50),
            'qr_verified' => true,
            'pin_verified' => true,
            'action_type' => 'ATTENDANCE_' . $action,
            'status' => 'SUCCESS',
            'failure_reason' => null,
            'device_info' => $deviceInfo,
            'ip_address' => $request->ip(),
        ]);

        SystemLog::create([
            'user_id' => $user->user_id,
            'action' => 'UPDATE',
            'module' => 'Attendance',
            'description' => "{$action} recorded via QR + PIN for {$employee->first_name} {$employee->last_name} at {$timeStr} by {$user->username}",
            'ip_address' => $request->ip(),
            'user_agent' => $deviceInfo,
        ]);

        $friendlyAction = str_replace('_', ' ', $action);

        NotificationService::sendToAdmins([
            'type' => 'attendance_recorded',
            'title' => 'Attendance Action',
            'message' => "Employee: {$employee->first_name} {$employee->last_name}, Branch: {$employee->branch}, Action: {$friendlyAction} ({$timeStr})",
            'module' => 'Attendance',
            'related_id' => $record->attendance_id,
            'related_type' => 'App\Models\Attendance',
            'action_url' => '/attendance',
            'priority' => 'normal',
        ]);

        return response()->json([
            'success' => true,
            'action' => $action,
            'message' => "{$friendlyAction} SUCCESSFUL — Time: {$timeStr}" . ($action === 'TIME_OUT' ? " (Total: {$record->total_hours} hrs)" : ""),
            'time' => $timeStr,
            'date' => $today,
            'status' => $record->status,
            'record' => $record,
            'verified_by' => $verifiedByName,
            'branch' => $employee->branch ?: $storeAdminBranch,
            'employee' => [
                'employee_id' => $employee->employee_id,
                'employee_code' => $employee->employee_code,
                'name' => "{$employee->first_name} {$employee->last_name}",
                'department' => $employee->department,
                'position' => $employee->position,
                'branch' => $employee->branch ?: $storeAdminBranch,
            ],
        ]);
    }

    /**
     * Get Security Scan & PIN Verification Logs
     */
    public function scanLogs(Request $request)
    {
        $user = $request->user();
        $query = AttendanceScanLog::with(['employee', 'scannedBy.employee']);

        if ($user && in_array($user->role, ['Store Administrator', 'Store Admin'])) {
            $branch = $user->employee ? $user->employee->branch : 'Main Branch';
            $query->where('branch', $branch);
        }

        if ($request->filled('date')) {
            $query->whereDate('scan_time', $request->query('date'));
        }

        if ($request->filled('status') && $request->query('status') !== 'All') {
            $query->where('status', $request->query('status'));
        }

        if ($request->filled('action_type') && $request->query('action_type') !== 'All') {
            $query->where('action_type', $request->query('action_type'));
        }

        if ($request->filled('search')) {
            $s = $request->query('search');
            $query->where(function ($q) use ($s) {
                $q->whereHas('employee', function ($eq) use ($s) {
                    $eq->where('first_name', 'like', "%{$s}%")
                       ->orWhere('last_name', 'like', "%{$s}%")
                       ->orWhere('employee_code', 'like', "%{$s}%");
                })->orWhere('qr_token_scanned', 'like', "%{$s}%")
                  ->orWhere('failure_reason', 'like', "%{$s}%")
                  ->orWhere('branch', 'like', "%{$s}%");
            });
        }

        $logs = $query->orderByDesc('id')->paginate($request->query('per_page', 20));

        $mapped = $logs->getCollection()->map(function ($l) {
            $emp = $l->employee;
            $scanner = $l->scannedBy;
            $scannedByName = $scanner ? ($scanner->employee ? "{$scanner->employee->first_name} {$scanner->employee->last_name}" : $scanner->username) : 'Store Administrator';

            return [
                'id' => $l->id,
                'employee_id' => $l->employee_id,
                'employee_name' => $emp ? "{$emp->first_name} {$emp->last_name}" : 'Unidentified',
                'employee_code' => $emp ? $emp->employee_code : 'N/A',
                'department' => $emp ? $emp->department : '—',
                'branch' => $l->branch ?: ($emp ? $emp->branch : 'Main Branch'),
                'qr_token_scanned' => $l->qr_token_scanned ? substr($l->qr_token_scanned, 0, 8) . '...' : '—',
                'scan_time' => $l->scan_time ? $l->scan_time->format('Y-m-d H:i:s') : '',
                'qr_verified' => (bool)$l->qr_verified,
                'pin_verified' => (bool)$l->pin_verified,
                'action_type' => $l->action_type,
                'status' => $l->status,
                'failure_reason' => $l->failure_reason,
                'scanned_by' => $scannedByName,
                'device_info' => $l->device_info,
                'ip_address' => $l->ip_address,
            ];
        });

        return response()->json([
            'logs' => $mapped,
            'total' => $logs->total(),
            'current_page' => $logs->currentPage(),
            'last_page' => $logs->lastPage(),
        ]);
    }
}
