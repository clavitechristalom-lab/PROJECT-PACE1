<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\EmployeeLetter;
use App\Models\Employee;
use App\Models\Attendance;
use App\Models\User;
use App\Models\SystemLog;
use App\Services\NotificationService;
use Carbon\Carbon;
use Illuminate\Support\Facades\Storage;

class EmployeeLetterController extends Controller
{
    /**
     * Get a list of employee excuse and leave letters with filters and stats.
     */
    public function index(Request $request)
    {
        // 1. Automatically archive letters older than 24 hours
        EmployeeLetter::autoArchiveOldLetters();

        $user = $request->user();
        $query = EmployeeLetter::with([
            'employee.branch',
            'user',
            'reviewer.employee',
        ])->orderBy('created_at', 'desc');

        // Role-based scoping
        if ($user) {
            if ($user->role === 'Employee') {
                $query->where(function ($q) use ($user) {
                    if ($user->employee_id) {
                        $q->where('employee_id', $user->employee_id);
                    } else {
                        $q->where('user_id', $user->user_id);
                    }
                });
            } elseif ($user->role === 'Store Administrator' && $user->employee && $user->employee->branch_id) {
                $branchId = $user->employee->branch_id;
                $query->whereHas('employee', function ($q) use ($branchId) {
                    $q->where('branch_id', $branchId);
                });
            }
        }

        // Category filter
        if ($request->filled('category') && $request->category !== 'All') {
            $query->where('category', $request->category);
        }

        // Status & Archive filtering
        $statusReq = $request->input('status', 'All');
        if ($statusReq === 'Archived' || $request->boolean('archived')) {
            $query->where('is_archived', true);
        } else {
            // Active views strictly show unarchived letters
            $query->where('is_archived', false);
            if ($statusReq !== 'All') {
                $query->where('status', $statusReq);
            }
        }

        // Search filter
        if ($request->filled('search')) {
            $s = trim($request->search);
            $query->where(function ($q) use ($s) {
                $q->where('title', 'like', "%{$s}%")
                  ->orWhere('reason', 'like', "%{$s}%")
                  ->orWhere('category', 'like', "%{$s}%")
                  ->orWhereHas('employee', function ($empQ) use ($s) {
                      $empQ->where('first_name', 'like', "%{$s}%")
                           ->orWhere('last_name', 'like', "%{$s}%")
                           ->orWhere('employee_code', 'like', "%{$s}%");
                  });
            });
        }

        // Date range filters
        if ($request->filled('from_date')) {
            $query->where('start_date', '>=', $request->from_date);
        }
        if ($request->filled('to_date')) {
            $query->where('end_date', '<=', $request->to_date);
        }

        $letters = $query->get();

        // Calculate summary counts for tabs based on current role scoping
        $countsQuery = EmployeeLetter::query();
        if ($user) {
            if ($user->role === 'Employee') {
                $countsQuery->where(function ($q) use ($user) {
                    if ($user->employee_id) {
                        $q->where('employee_id', $user->employee_id);
                    } else {
                        $q->where('user_id', $user->user_id);
                    }
                });
            } elseif ($user->role === 'Store Administrator' && $user->employee && $user->employee->branch_id) {
                $branchId = $user->employee->branch_id;
                $countsQuery->whereHas('employee', function ($q) use ($branchId) {
                    $q->where('branch_id', $branchId);
                });
            }
        }
        $allForCounts = $countsQuery->get();
        $activeLetters = $allForCounts->where('is_archived', false);
        $archivedLetters = $allForCounts->where('is_archived', true);

        $categoriesPool = ($statusReq === 'Archived' || $request->boolean('archived')) ? $archivedLetters : $activeLetters;

        $categories = [
            'Excuse Letter' => $categoriesPool->where('category', 'Excuse Letter')->count(),
            'Sick Leave' => $categoriesPool->where('category', 'Sick Leave')->count(),
            'Important Matter' => $categoriesPool->where('category', 'Important Matter')->count(),
            'Maternity Leave' => $categoriesPool->where('category', 'Maternity Leave')->count(),
            'Vacation Leave' => $categoriesPool->where('category', 'Vacation Leave')->count(),
        ];

        $statusCounts = [
            'all' => $activeLetters->count(),
            'pending' => $activeLetters->where('status', 'Pending')->count(),
            'approved' => $activeLetters->where('status', 'Approved')->count(),
            'rejected' => $activeLetters->where('status', 'Rejected')->count(),
            'archived' => $archivedLetters->count(),
        ];

        return response()->json([
            'success' => true,
            'letters' => $letters,
            'counts' => [
                'categories' => $categories,
                'statuses' => $statusCounts,
            ],
        ]);
    }

    /**
     * Quick summary metrics for dashboard cards and navigation badges.
     */
    public function summary(Request $request)
    {
        // Automatically archive letters older than 24 hours
        EmployeeLetter::autoArchiveOldLetters();

        $user = $request->user();
        $query = EmployeeLetter::query();

        if ($user) {
            if ($user->role === 'Employee') {
                $query->where(function ($q) use ($user) {
                    if ($user->employee_id) {
                        $q->where('employee_id', $user->employee_id);
                    } else {
                        $q->where('user_id', $user->user_id);
                    }
                });
            } elseif ($user->role === 'Store Administrator' && $user->employee && $user->employee->branch_id) {
                $branchId = $user->employee->branch_id;
                $query->whereHas('employee', function ($q) use ($branchId) {
                    $q->where('branch_id', $branchId);
                });
            }
        }

        $letters = $query->get();
        $activeLetters = $letters->where('is_archived', false);

        return response()->json([
            'success' => true,
            'pending_count' => $activeLetters->where('status', 'Pending')->count(),
            'approved_count' => $activeLetters->where('status', 'Approved')->count(),
            'rejected_count' => $activeLetters->where('status', 'Rejected')->count(),
            'archived_count' => $letters->where('is_archived', true)->count(),
            'total_count' => $activeLetters->count(),
            'categories' => [
                'excuse_letter' => $activeLetters->where('category', 'Excuse Letter')->count(),
                'sick_leave' => $activeLetters->where('category', 'Sick Leave')->count(),
                'important_matter' => $activeLetters->where('category', 'Important Matter')->count(),
                'maternity_leave' => $activeLetters->where('category', 'Maternity Leave')->count(),
                'vacation_leave' => $activeLetters->where('category', 'Vacation Leave')->count(),
            ],
        ]);
    }

    /**
     * Show a single excuse/leave letter.
     */
    public function show(Request $request, $id)
    {
        $user = $request->user();
        $letter = EmployeeLetter::with([
            'employee.branch',
            'user',
            'reviewer.employee',
        ])->findOrFail($id);

        // Security check
        if ($user && $user->role === 'Employee') {
            if ($letter->employee_id != $user->employee_id && $letter->user_id != $user->user_id) {
                return response()->json(['error' => 'Unauthorized access to this letter'], 403);
            }
        }

        // Mark as read if admin/store admin
        if ($user && in_array($user->role, ['Administrator', 'Store Administrator']) && !$letter->is_read) {
            $letter->update([
                'is_read' => true,
                'read_at' => Carbon::now(),
            ]);
        }

        return response()->json([
            'success' => true,
            'letter' => $letter,
        ]);
    }

    /**
     * Store a new excuse/leave letter submitted by an employee.
     */
    public function store(Request $request)
    {
        $user = $request->user();

        $validated = $request->validate([
            'category' => 'required|string|in:Excuse Letter,Sick Leave,Important Matter,Maternity Leave,Vacation Leave',
            'start_date' => 'required|date',
            'end_date' => 'required|date|after_or_equal:start_date',
            'reason' => 'nullable|string|max:1000',
            'letter_body' => 'required|string',
            'title' => 'nullable|string|max:255',
            'attachment' => 'nullable|file|max:10240|mimes:pdf,jpg,jpeg,png,webp,doc,docx',
            'employee_id' => 'nullable|integer',
        ]);

        // Resolve employee ID
        $employeeId = $validated['employee_id'] ?? null;
        if (!$employeeId && $user) {
            $employeeId = $user->employee_id;
            if (!$employeeId && $user->employee) {
                $employeeId = $user->employee->employee_id;
            }
        }

        if (!$employeeId) {
            return response()->json([
                'error' => 'Unable to determine employee record. Please ensure your employee profile is linked.',
            ], 422);
        }

        $employee = Employee::find($employeeId);
        if (!$employee) {
            return response()->json(['error' => 'Employee profile not found.'], 404);
        }

        // Handle attachment upload
        $attachmentPath = null;
        $attachmentName = null;

        if ($request->hasFile('attachment')) {
            $file = $request->file('attachment');
            $attachmentName = $file->getClientOriginalName();
            $attachmentPath = $file->store('letters', 'public');
        }

        $title = $validated['title'] ?? ($validated['category'] . ' - ' . Carbon::parse($validated['start_date'])->format('M d, Y'));

        $letter = EmployeeLetter::create([
            'employee_id' => $employeeId,
            'user_id' => $user ? $user->user_id : null,
            'category' => $validated['category'],
            'title' => $title,
            'start_date' => $validated['start_date'],
            'end_date' => $validated['end_date'],
            'reason' => $validated['reason'] ?? $validated['category'],
            'letter_body' => $validated['letter_body'],
            'attachment_path' => $attachmentPath,
            'attachment_name' => $attachmentName,
            'status' => 'Pending',
            'is_read' => false,
        ]);

        $letter->load(['employee.branch', 'user']);

        // System Log
        SystemLog::create([
            'user_id' => $user ? $user->user_id : null,
            'action' => 'SUBMIT_EXCUSE_LETTER',
            'module' => 'Excuse Letters',
            'details' => "Employee {$employee->first_name} {$employee->last_name} submitted {$letter->category} for {$letter->start_date->format('Y-m-d')} to {$letter->end_date->format('Y-m-d')}",
        ]);

        // Notify Admins & Store Admins
        $empFullName = trim("{$employee->first_name} {$employee->last_name}");
        $notifData = [
            'type' => 'excuse_letter_submission',
            'title' => "New {$letter->category} Submitted",
            'message' => "{$empFullName} submitted a {$letter->category} from {$letter->start_date->format('M d')} to {$letter->end_date->format('M d, Y')}.",
            'module' => 'Excuse Letters',
            'related_id' => (string)$letter->letter_id,
            'related_type' => 'EmployeeLetter',
            'action_url' => '/admin/excuse-letters',
            'priority' => 'high',
        ];

        NotificationService::sendToAdmins($notifData);
        if ($employee->branch_id) {
            NotificationService::sendToStoreAdmins($notifData, $employee->branch_id);
        } else {
            NotificationService::sendToStoreAdmins($notifData);
        }

        SyncController::invalidateFingerprint();
        if ($letter->employee) {
            \App\Http\Controllers\PayrollController::recalculateDraftPayrollForEmployee($letter->employee);
        }

        return response()->json([
            'success' => true,
            'message' => "{$letter->category} submitted successfully and sent to Management for review.",
            'letter' => $letter,
        ], 201);
    }

    /**
     * Review / Approve / Reject an excuse/leave letter.
     * When Approved, automatically flags those dates as Absent in the Attendance / Payroll records.
     */
    public function update(Request $request, $id)
    {
        $user = $request->user();
        if (!$user || !in_array($user->role, ['Administrator', 'Store Administrator'])) {
            return response()->json(['error' => 'Unauthorized to review excuse letters.'], 403);
        }

        $letter = EmployeeLetter::with('employee')->findOrFail($id);

        $validated = $request->validate([
            'status' => 'required|string|in:Pending,Approved,Rejected',
            'leave_type' => 'nullable|string',
            'admin_remarks' => 'nullable|string|max:1000',
        ]);

        $prevStatus = $letter->status;
        $newStatus = $validated['status'];

        $rawLeaveType = $request->input('leave_type', $letter->leave_type ?? 'without_pay');
        $canonicalLeaveType = in_array(strtolower(trim($rawLeaveType)), ['with_pay', 'leave with pay', 'paid'], true)
            ? 'with_pay'
            : 'without_pay';
        $leaveTypeLabel = $canonicalLeaveType === 'with_pay' ? 'Leave with Pay' : 'Leave without Pay';

        $letter->update([
            'status' => $newStatus,
            'leave_type' => $canonicalLeaveType,
            'admin_remarks' => $validated['admin_remarks'] ?? $letter->admin_remarks,
            'reviewed_by' => $user->user_id,
            'reviewed_at' => Carbon::now(),
            'is_read' => true,
        ]);

        $reviewerName = trim(($user->employee ? "{$user->employee->first_name} {$user->employee->last_name}" : '') ?: $user->username);

        // =========================================================================
        // AUTOMATED ATTENDANCE & PAYROLL INTEGRATION:
        // Automatically mark/flag the specific dates as Absent in the Attendance module
        // calculating correctly whether it spans days or weeks (excluding Sundays),
        // and synchronizing Leave with Pay vs Leave without Pay.
        // =========================================================================
        if ($newStatus === 'Approved') {
            $start = Carbon::parse($letter->start_date)->startOfDay();
            $end = Carbon::parse($letter->end_date)->startOfDay();

            $curr = $start->copy();
            while ($curr->lte($end)) {
                // Skip Sundays as standard rest day
                if (!$curr->isSunday()) {
                    $dStr = $curr->format('Y-m-d');

                    Attendance::updateOrCreate(
                        [
                            'employee_id' => $letter->employee_id,
                            'attendance_date' => $dStr,
                        ],
                        [
                            'status' => 'Absent',
                            'leave_type' => $canonicalLeaveType,
                            'total_hours' => 0.00,
                            'overtime_hours' => 0.00,
                            'remarks' => "Excused Leave ({$letter->category} - {$leaveTypeLabel}): " . ($validated['admin_remarks'] ?: ($letter->reason ?: 'Approved Excuse Letter')),
                            'verified_by_name' => $reviewerName,
                        ]
                    );
                }
                $curr->addDay();
            }
        } elseif ($prevStatus === 'Approved' && $newStatus !== 'Approved') {
            // If it was previously approved and now rejected/pending, clean up auto-flagged absent attendances
            $start = Carbon::parse($letter->start_date)->startOfDay();
            $end = Carbon::parse($letter->end_date)->startOfDay();

            Attendance::where('employee_id', $letter->employee_id)
                ->whereBetween('attendance_date', [$start->format('Y-m-d'), $end->format('Y-m-d')])
                ->where('status', 'Absent')
                ->where('remarks', 'like', "Excused Leave ({$letter->category})%")
                ->delete();
        }

        // System Log
        SystemLog::create([
            'user_id' => $user->user_id,
            'action' => 'REVIEW_EXCUSE_LETTER',
            'module' => 'Excuse Letters',
            'details' => "{$reviewerName} marked {$letter->category} #{$letter->letter_id} as {$newStatus} ({$leaveTypeLabel})",
        ]);

        // Send notification to the employee
        $targetUserId = $letter->user_id;
        if (!$targetUserId && $letter->employee) {
            $empUser = User::where('employee_id', $letter->employee_id)->first();
            $targetUserId = $empUser ? $empUser->user_id : null;
        }

        if ($targetUserId) {
            $notifTitle = $newStatus === 'Approved' ? "{$letter->category} Approved ({$leaveTypeLabel})" : "{$letter->category} {$newStatus}";
            $notifMessage = $newStatus === 'Approved'
                ? "Your {$letter->category} from {$letter->start_date->format('M d')} to {$letter->end_date->format('M d, Y')} has been approved by Management as {$leaveTypeLabel}."
                : "Your {$letter->category} has been {$newStatus}. " . ($letter->admin_remarks ? "Remarks: {$letter->admin_remarks}" : '');

            NotificationService::sendToUser($targetUserId, [
                'type' => 'excuse_letter_reviewed',
                'title' => $notifTitle,
                'message' => $notifMessage,
                'module' => 'Excuse Letters',
                'related_id' => (string)$letter->letter_id,
                'related_type' => 'EmployeeLetter',
                'action_url' => '/employee/excuse-letter',
                'priority' => 'high',
            ]);
        }

        SyncController::invalidateFingerprint();
        if ($letter->employee) {
            \App\Http\Controllers\PayrollController::recalculateDraftPayrollForEmployee($letter->employee);
        }

        $letter->load(['employee.branch', 'user', 'reviewer.employee']);

        return response()->json([
            'success' => true,
            'message' => "Letter #{$letter->letter_id} has been marked as {$newStatus}.",
            'letter' => $letter,
        ]);
    }

    /**
     * Delete an excuse letter.
     */
    public function destroy(Request $request, $id)
    {
        $user = $request->user();
        $letter = EmployeeLetter::findOrFail($id);

        // Security check: Only Admin, or Employee if letter is still Pending
        if ($user->role === 'Employee') {
            if ($letter->employee_id != $user->employee_id && $letter->user_id != $user->user_id) {
                return response()->json(['error' => 'Unauthorized'], 403);
            }
            if ($letter->status !== 'Pending') {
                return response()->json(['error' => 'Cannot delete letter that has already been reviewed.'], 422);
            }
        } elseif (!in_array($user->role, ['Administrator', 'Store Administrator'])) {
            return response()->json(['error' => 'Unauthorized'], 403);
        }

        // Delete attachment if stored
        if ($letter->attachment_path && Storage::disk('public')->exists($letter->attachment_path)) {
            Storage::disk('public')->delete($letter->attachment_path);
        }

        // If letter was approved, remove the attendance flags
        if ($letter->status === 'Approved') {
            $start = Carbon::parse($letter->start_date)->startOfDay();
            $end = Carbon::parse($letter->end_date)->startOfDay();

            Attendance::where('employee_id', $letter->employee_id)
                ->whereBetween('attendance_date', [$start->format('Y-m-d'), $end->format('Y-m-d')])
                ->where('status', 'Absent')
                ->where('remarks', 'like', "Excused Leave ({$letter->category})%")
                ->delete();
        }

        $letter->delete();
        SyncController::invalidateFingerprint();
        if ($letter->employee) {
            \App\Http\Controllers\PayrollController::recalculateDraftPayrollForEmployee($letter->employee);
        }

        return response()->json([
            'success' => true,
            'message' => 'Excuse letter deleted successfully.',
        ]);
    }

    /**
     * Archive an excuse letter manually.
     */
    public function archive(Request $request, $id)
    {
        $user = $request->user();
        if (!$user || !in_array($user->role, ['Administrator', 'Store Administrator'])) {
            return response()->json(['error' => 'Unauthorized to archive excuse letters.'], 403);
        }

        $letter = EmployeeLetter::findOrFail($id);
        $letter->update([
            'is_archived' => true,
            'archived_at' => Carbon::now(),
            'archived_by' => $user->user_id,
        ]);

        $reviewerName = trim(($user->employee ? "{$user->employee->first_name} {$user->employee->last_name}" : '') ?: $user->username);

        SystemLog::create([
            'user_id' => $user->user_id,
            'action' => 'ARCHIVE_EXCUSE_LETTER',
            'module' => 'Excuse Letters',
            'details' => "{$reviewerName} moved {$letter->category} #{$letter->letter_id} to archive",
        ]);

        SyncController::invalidateFingerprint();

        return response()->json([
            'success' => true,
            'message' => "Letter #{$letter->letter_id} has been moved to archive.",
            'letter' => $letter,
        ]);
    }

    /**
     * Restore an archived excuse letter.
     */
    public function unarchive(Request $request, $id)
    {
        $user = $request->user();
        if (!$user || !in_array($user->role, ['Administrator', 'Store Administrator'])) {
            return response()->json(['error' => 'Unauthorized to restore excuse letters.'], 403);
        }

        $letter = EmployeeLetter::findOrFail($id);
        $letter->update([
            'is_archived' => false,
            'archived_at' => null,
            'archived_by' => null,
        ]);

        $reviewerName = trim(($user->employee ? "{$user->employee->first_name} {$user->employee->last_name}" : '') ?: $user->username);

        SystemLog::create([
            'user_id' => $user->user_id,
            'action' => 'RESTORE_EXCUSE_LETTER',
            'module' => 'Excuse Letters',
            'details' => "{$reviewerName} restored {$letter->category} #{$letter->letter_id} from archive",
        ]);

        SyncController::invalidateFingerprint();

        return response()->json([
            'success' => true,
            'message' => "Letter #{$letter->letter_id} has been restored from archive.",
            'letter' => $letter,
        ]);
    }
}
