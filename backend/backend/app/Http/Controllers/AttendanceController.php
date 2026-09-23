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
            $branch = $user->employee ? $user->employee->branch_id : null;
            $query->whereHas('employee', function ($eq) use ($branch) {
                $eq->where('branch_id', $branch);
            });
        } elseif ($request->filled('branch') && $request->query('branch') !== 'All') {
            $branch = $request->query('branch');
            $query->whereHas('employee', function ($eq) use ($branch) {
                $eq->where('branch_id', $branch);
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
                        $emp && $emp->branch ? $emp->branch->name : '',
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
                'branch' => $emp && $emp->branch ? $emp->branch->name : '',
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
            $branch = $user->employee ? $user->employee->branch_id : null;
            $query->whereHas('employee', function ($eq) use ($branch) {
                $eq->where('branch_id', $branch);
            });
        } elseif ($request->filled('branch') && $request->query('branch') !== 'All') {
            $branch = $request->query('branch');
            $query->whereHas('employee', function ($eq) use ($branch) {
                $eq->where('branch_id', $branch);
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
        $storeAdminBranch = $user->employee && !empty($user->employee->branch_id) ? trim($user->employee->branch_id) : null;

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
        $employeeBranch = !empty($employee->branch_id) ? trim((string)$employee->branch_id) : null;
        if (strcasecmp((string)$employeeBranch, (string)$storeAdminBranch) !== 0) {
            AttendanceScanLog::create([
                'employee_id' => $employee->employee_id,
                'scanned_by' => $user->user_id,
                'branch' => $storeAdminBranch,
                'qr_token_scanned' => substr($token, 0, 50),
                'qr_verified' => true,
                'pin_verified' => false,
                'action_type' => 'UNAUTHORIZED_BRANCH_SCAN',
                'status' => 'FAILED',
                'failure_reason' => "This employee belongs to '" . ($employee->branch ? $employee->branch->name : 'Unassigned') . "', but your authorized branch is {$storeAdminBranch}",
                'device_info' => $deviceInfo,
                'ip_address' => $request->ip(),
            ]);

            return response()->json([
                'success' => false,
                'message' => 'This employee does not belong to your authorized branch.',
                'employee_branch' => $employee->branch ? $employee->branch->name : null,
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

        // Log successful initial QR token scan and set as PENDING_VERIFICATION
        $log = AttendanceScanLog::create([
            'employee_id' => $employee->employee_id,
            'scanned_by' => $user->user_id,
            'branch' => $storeAdminBranch,
            'qr_token_scanned' => substr($token, 0, 50),
            'qr_verified' => true,
            'pin_verified' => false,
            'action_type' => 'PENDING_VERIFICATION',
            'status' => 'PENDING',
            'failure_reason' => null,
            'device_info' => $deviceInfo,
            'ip_address' => $request->ip(),
        ]);

        // Trigger Notification to Employee
        if ($employee->user) {
            $storeAdminName = $user->employee ? trim("{$user->employee->first_name} {$user->employee->last_name}") : $user->username;
            \App\Services\NotificationService::sendToUser($employee->user->user_id, [
                'type' => 'attendance_verification',
                'title' => 'Attendance Verification Request',
                'message' => "Store Admin {$storeAdminName} is requesting your PIN to authorize their attendance.",
                'module' => 'Attendance',
                'related_id' => $log->scan_id ?? $log->id, // Use whatever primary key it generates
                'related_type' => 'App\Models\AttendanceScanLog',
                'action_url' => '/dashboard',
                'priority' => 'high',
            ]);
        }

        $today = date('Y-m-d');
        $record = \App\Models\Attendance::where('employee_id', $employee->employee_id)
            ->where('attendance_date', $today)
            ->first();

        // Auto-determine next action for Employee
        if (!$record) {
            $action = 'TIME_IN';
        } elseif ($record->time_out) {
            $action = 'COMPLETED';
        } elseif ($record->lunch_out && !$record->lunch_in) {
            $action = 'LUNCH_IN';
        } else {
            if (!$record->lunch_out) $action = 'LUNCH_OUT';
            else $action = 'TIME_OUT';
        }

        return response()->json([
            'success' => true,
            'status' => 'PENDING',
            'scan_log_id' => $log->scan_id ?? $log->id, // AttendanceScanLog primary key
            'employee' => [
                'employee_id' => $employee->employee_id,
                'employee_code' => $employee->employee_code,
                'name' => "{$employee->first_name} {$employee->last_name}",
                'department' => $employee->department,
                'branch' => $employee->branch ? $employee->branch->name : $storeAdminBranch,
            ],
            'available_actions' => [$action],
            'message' => 'Waiting for Employee verification...',
        ]);
    }

    public function verifyPin(Request $request)
    {
        $user = $request->user('sanctum') ?? $request->user();
        if (!$user || !in_array($user->role, ['Store Administrator', 'Store Admin'])) {
            return response()->json([
                'success' => false,
                'message' => '403 Forbidden: Only authorized Store Administrators can access this endpoint.',
            ], 403);
        }

        $validated = $request->validate([
            'qr_token' => 'required|string',
            'pin' => 'required|string',
            'device_info' => 'nullable|string',
        ]);

        $token = trim($validated['qr_token']);
        $pin = $validated['pin'];
        $deviceInfo = $request->input('device_info', $request->userAgent());
        $storeAdminBranch = $user->employee && !empty($user->employee->branch_id) ? trim($user->employee->branch_id) : null;

        $employee = Employee::where('qr_token', $token)->first();

        if (!$employee) {
            return response()->json(['success' => false, 'message' => 'Invalid or unrecognized QR code.'], 404);
        }

        // Branch Validation
        $employeeBranch = !empty($employee->branch_id) ? trim((string)$employee->branch_id) : null;
        if (strcasecmp((string)$employeeBranch, (string)$storeAdminBranch) !== 0) {
            return response()->json([
                'success' => false,
                'message' => 'This employee does not belong to your authorized branch.'
            ], 403);
        }

        // Lockout Check
        if ($employee->pin_locked_until && $employee->pin_locked_until > now()) {
            return response()->json([
                'success' => false,
                'is_locked' => true,
                'message' => 'Account is currently locked due to too many failed attempts.',
            ], 423);
        }

        if (empty($employee->attendance_pin)) {
            $employee->attendance_pin = \Illuminate\Support\Facades\Hash::make('1234');
            $employee->save();
        }

        // Find the pending scan log
        $log = AttendanceScanLog::where('employee_id', $employee->employee_id)
            ->where('qr_token_scanned', substr($token, 0, 50))
            ->where('status', 'PENDING')
            ->orderBy('id', 'desc')
            ->first();

        if (!$log) {
            $log = AttendanceScanLog::create([
                'employee_id' => $employee->employee_id,
                'scanned_by' => $user->user_id,
                'branch' => $storeAdminBranch,
                'qr_token_scanned' => substr($token, 0, 50),
                'qr_verified' => true,
                'pin_verified' => false,
                'action_type' => 'PIN_VERIFICATION',
                'status' => 'PENDING',
                'device_info' => $deviceInfo,
                'ip_address' => $request->ip(),
            ]);
        }

        // Verify PIN
        if (!\Illuminate\Support\Facades\Hash::check($pin, $employee->attendance_pin)) {
            $employee->pin_failed_attempts = ($employee->pin_failed_attempts ?? 0) + 1;
            if ($employee->pin_failed_attempts >= 5) {
                $employee->pin_locked_until = now()->addMinutes(15);
                $employee->save();
                
                $log->update(['status' => 'FAILED', 'failure_reason' => 'PIN lockout']);
                return response()->json(['success' => false, 'is_locked' => true, 'message' => 'Too many failed attempts. Account locked.'], 423);
            }
            $employee->save();
            $log->update(['status' => 'FAILED', 'failure_reason' => 'Incorrect PIN']);
            return response()->json(['success' => false, 'message' => 'Incorrect PIN. Please enter your correct Personal PIN.'], 422);
        }

        // PIN is valid!
        $employee->pin_failed_attempts = 0;
        $employee->pin_locked_until = null;
        $employee->save();

        $today = date('Y-m-d');
        $now = date('H:i:s');
        $timeStr = date('h:i A');

        $record = \App\Models\Attendance::where('employee_id', $employee->employee_id)
            ->where('attendance_date', $today)
            ->first();

        // Auto-determine next action for Employee
        if (!$record) {
            $action = 'TIME_IN';
        } elseif ($record->time_out) {
            $log->update(['status' => 'FAILED', 'failure_reason' => 'Attendance already completed today.']);
            return response()->json(['success' => false, 'message' => 'TIME IN ALREADY RECORDED. Attendance already completed for today.'], 400);
        } elseif ($record->lunch_out && !$record->lunch_in) {
            $action = 'LUNCH_IN';
        } else {
            if (!$record->lunch_out) $action = 'LUNCH_OUT';
            else $action = 'TIME_OUT';
        }
        
        \Illuminate\Support\Facades\DB::beginTransaction();
        try {
            // Apply Action
            if ($action === 'TIME_IN') {
                $record = new \App\Models\Attendance();
                $record->employee_id = $employee->employee_id;
                $record->scanned_by = $user->user_id;
                $record->attendance_date = $today;
                $record->time_in = $now;
                $record->qr_scan_in = 'QR_PIN_VERIFIED';
                $record->verification_method = 'QR + PIN';
                $record->verified_by_name = "Store Administrator";
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
            } else if ($action === 'LUNCH_OUT') {
                $record->lunch_out = $now;
                $record->save();
            } else if ($action === 'LUNCH_IN') {
                $record->lunch_in = $now;
                $record->save();
            } else if ($action === 'TIME_OUT') {
                $record->time_out = $now;
                $record->qr_scan_out = 'QR_PIN_VERIFIED';
                $record->verified_by_name = "Store Administrator";
                
                // Calc hours
                $inDateTime = strtotime($record->attendance_date . ' ' . $record->time_in);
                $outDateTime = strtotime($today . ' ' . $now);
                $totalSeconds = max(0, $outDateTime - $inDateTime);
                
                $lunchSeconds = 0;
                if ($record->lunch_out && $record->lunch_in) {
                    $lunchSeconds = max(0, strtotime($record->attendance_date.' '.$record->lunch_in) - strtotime($record->attendance_date.' '.$record->lunch_out));
                }
                
                $workedSeconds = $totalSeconds - $lunchSeconds;
                $diffHours = round(max(0, $workedSeconds / 3600), 2);
                $record->total_hours = $diffHours;
                $record->overtime_hours = max(0, round($diffHours - 8, 2));
                $record->status = 'COMPLETE';
                $record->save();
            }

            // Update Log
            $log->update([
                'status' => 'SUCCESS',
                'action_type' => 'ATTENDANCE_' . $action,
                'pin_verified' => true
            ]);
            
            \Illuminate\Support\Facades\DB::commit();

            return response()->json([
                'success' => true,
                'action' => $action,
                'time' => $timeStr,
                'employee' => [
                    'name' => "{$employee->first_name} {$employee->last_name}",
                    'employee_code' => $employee->employee_code
                ],
                'branch' => $storeAdminBranch,
                'total_hours' => $record->total_hours ?? 0,
                'overtime_hours' => $record->overtime_hours ?? 0,
                'message' => "Attendance recorded. Action: " . str_replace('_', ' ', $action),
            ]);
        } catch (\Exception $e) {
            \Illuminate\Support\Facades\DB::rollBack();
            $log->update(['status' => 'FAILED', 'failure_reason' => 'Database error']);
            return response()->json(['success' => false, 'message' => 'Failed to save attendance.'], 500);
        }
    }



    /**
     * Get Security Scan & PIN Verification Logs
     */
    public function scanLogs(Request $request)
    {
        $user = $request->user();
        $query = AttendanceScanLog::with(['employee', 'scannedBy.employee']);

        if ($user && in_array($user->role, ['Store Administrator', 'Store Admin'])) {
            $branch = $user->employee ? $user->employee->branch_id : null;
            $query->where('branch_id', $branch);
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
                  ->orwhere('branch_id', 'like', "%{$s}%");
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
                'branch' => $l->branch ?: ($emp && $emp->branch ? $emp->branch->name : null),
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

    // ─── NEW FLOW: Employee Approves Verification ───────────────────────────────
    public function checkVerification(Request $request, $id)
    {
        $log = AttendanceScanLog::with('employee')->findOrFail($id);
        return response()->json([
            'status' => $log->status,
            'action' => $log->action_type,
            'log' => $log
        ]);
    }

    public function pendingVerifications(Request $request)
    {
        $user = $request->user();
        if (!$user || !$user->employee) {
            return response()->json(['pending' => []]);
        }

        $pending = AttendanceScanLog::with('scannedBy.employee')
            ->where('employee_id', $user->employee_id)
            ->where('status', 'PENDING')
            ->where('created_at', '>=', now()->subMinutes(5)) // Only look at recent ones
            ->orderBy('created_at', 'desc')
            ->get();

        return response()->json(['pending' => $pending]);
    }

    public function approveVerification(Request $request)
    {
        $user = $request->user();
        if (!$user || !$user->employee) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        }

        $validated = $request->validate([
            'scan_log_id' => 'required|integer',
            'pin' => 'required|string',
        ]);

        $log = AttendanceScanLog::where('id', $validated['scan_log_id'])
            ->where('employee_id', $user->employee_id)
            ->where('status', 'PENDING')
            ->first();

        if (!$log) {
            return response()->json(['success' => false, 'message' => 'Pending request not found or expired.'], 404);
        }

        $employee = $user->employee;

        // Check Lockout
        if ($employee->pin_locked_until && $employee->pin_locked_until > now()) {
            return response()->json([
                'success' => false,
                'is_locked' => true,
                'message' => 'Account is currently locked due to too many failed attempts.',
            ], 423);
        }

        if (empty($employee->attendance_pin)) {
            $employee->attendance_pin = \Illuminate\Support\Facades\Hash::make('1234');
            $employee->save();
        }

        // Verify PIN
        if (!\Illuminate\Support\Facades\Hash::check($validated['pin'], $employee->attendance_pin)) {
            $employee->pin_failed_attempts = ($employee->pin_failed_attempts ?? 0) + 1;
            if ($employee->pin_failed_attempts >= 5) {
                $employee->pin_locked_until = now()->addMinutes(15);
                $employee->save();
                
                $log->update(['status' => 'FAILED', 'failure_reason' => 'PIN lockout']);
                return response()->json(['success' => false, 'is_locked' => true, 'message' => 'Too many failed attempts. Account locked.'], 423);
            }
            $employee->save();
            return response()->json(['success' => false, 'message' => 'Incorrect PIN.'], 422);
        }

        // PIN is valid!
        $employee->pin_failed_attempts = 0;
        $employee->pin_locked_until = null;
        $employee->save();

        // ─── ATTENDANCE BELONGS TO THE SCANNED EMPLOYEE ───
        $storeAdminUser = \App\Models\User::with('employee')->find($log->scanned_by);
        
        $today = date('Y-m-d');
        $now = date('H:i:s');
        $timeStr = date('h:i A');

        $record = \App\Models\Attendance::where('employee_id', $employee->employee_id)
            ->where('attendance_date', $today)
            ->first();

        // Auto-determine next action for Employee
        if (!$record) {
            $action = 'TIME_IN';
        } elseif ($record->time_out) {
            $log->update(['status' => 'FAILED', 'failure_reason' => 'Attendance already completed today.']);
            return response()->json(['success' => false, 'message' => 'Attendance already completed for today.'], 400);
        } elseif ($record->lunch_out && !$record->lunch_in) {
            $action = 'LUNCH_IN';
        } else {
            // Default to TIME_OUT or next logical break
            if (!$record->lunch_out) $action = 'LUNCH_OUT';
            else $action = 'TIME_OUT';
        }

        // Apply Action
        if ($action === 'TIME_IN') {
            $record = new \App\Models\Attendance();
            $record->employee_id = $employee->employee_id;
            $record->scanned_by = $log->scanned_by;
            $record->attendance_date = $today;
            $record->time_in = $now;
            $record->qr_scan_in = 'QR_PIN_VERIFIED';
            $record->verification_method = 'QR + PIN (Authorized by Employee)';
            $record->verified_by_name = "{$employee->first_name} {$employee->last_name}";
            $record->device_info = $log->device_info;
            $record->ip_address = $log->ip_address;
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
        } else if ($action === 'LUNCH_OUT') {
            $record->lunch_out = $now;
            $record->save();
        } else if ($action === 'LUNCH_IN') {
            $record->lunch_in = $now;
            $record->save();
        } else if ($action === 'TIME_OUT') {
            $record->time_out = $now;
            $record->qr_scan_out = 'QR_PIN_VERIFIED';
            $record->verified_by_name = "{$employee->first_name} {$employee->last_name}";
            
            // Calc hours
            $inDateTime = strtotime($record->attendance_date . ' ' . $record->time_in);
            $outDateTime = strtotime($today . ' ' . $now);
            $totalSeconds = max(0, $outDateTime - $inDateTime);
            
            $lunchSeconds = 0;
            if ($record->lunch_out && $record->lunch_in) {
                $lunchSeconds = max(0, strtotime($record->attendance_date.' '.$record->lunch_in) - strtotime($record->attendance_date.' '.$record->lunch_out));
            }
            
            $workedSeconds = $totalSeconds - $lunchSeconds;
            $diffHours = round(max(0, $workedSeconds / 3600), 2);
            $record->total_hours = $diffHours;
            $record->overtime_hours = max(0, round($diffHours - 8, 2));
            $record->status = 'COMPLETE';
            $record->save();
        }

        // Update Log
        $log->update([
            'status' => 'SUCCESS',
            'action_type' => 'ATTENDANCE_' . $action,
            'pin_verified' => true
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Attendance authorized successfully.'
        ]);
    }
}

