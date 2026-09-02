<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Str;
use App\Models\QrRequest;
use App\Models\Employee;
use App\Models\User;
use App\Models\SystemLog;
use App\Services\NotificationService;

class QrRequestController extends Controller
{
    /**
     * Submit a QR request by Employee or Store Administrator
     */
    public function store(Request $request)
    {
        $user = $request->user();
        if (!$user) {
            return response()->json([
                'success' => false,
                'message' => 'Unauthenticated session. Please log in again.',
            ], 401);
        }

        // Auto-resolve employee profile
        $employee = ($user->employee_id ? Employee::find($user->employee_id) : null)
            ?: ($user->employee ?: Employee::where('email', $user->username)->first());

        if (!$employee) {
            return response()->json([
                'success' => false,
                'message' => 'Employee profile not found for this user account.',
            ], 404);
        }

        // Prevent request if already active
        if ($employee->qr_active && !empty($employee->qr_token)) {
            return response()->json([
                'success' => false,
                'message' => 'Your account already has an active permanent attendance QR code.',
            ], 422);
        }

        // Prevent duplicate pending requests
        $existing = QrRequest::where('user_id', $user->user_id)
            ->whereIn('status', ['PENDING', 'UNDER_REVIEW'])
            ->first();

        if ($existing) {
            return response()->json([
                'success' => false,
                'message' => "You already have a pending QR request ({$existing->request_code}) currently waiting for Administrator verification.",
                'request' => $existing,
            ], 422);
        }

        // Generate unique request code e.g. REQ-0001
        $count = QrRequest::count() + 1;
        $requestCode = 'REQ-' . str_pad($count, 4, '0', STR_PAD_LEFT);
        while (QrRequest::where('request_code', $requestCode)->exists()) {
            $count++;
            $requestCode = 'REQ-' . str_pad($count, 4, '0', STR_PAD_LEFT);
        }

        $qrRequest = QrRequest::create([
            'request_code' => $requestCode,
            'user_id' => $user->user_id,
            'employee_id' => $employee->employee_id,
            'role' => $user->role,
            'branch' => $employee->branch ?: 'Main Branch',
            'department' => $employee->department ?: 'Operations',
            'position' => $employee->position ?: $user->role,
            'status' => 'PENDING',
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
        ]);

        // Update employee statuses
        // Columns qr_request_status, account_status, qr_rejection_reason no longer exist
        // $employee->save();

        // System Audit Log
        SystemLog::create([
            'user_id' => $user->user_id,
            'action' => 'QR_REQUESTED',
            'module' => 'QR Attendance',
            'description' => "{$user->role} ({$employee->first_name} {$employee->last_name} - {$employee->employee_code}) submitted attendance QR request {$requestCode}",
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
        ]);

        // Notify Administrators
        $isStoreAdmin = in_array($user->role, ['Store Administrator', 'Store Admin']);
        if ($isStoreAdmin) {
            NotificationService::sendToAdmins([
                'type' => 'new_qr_request',
                'title' => '🔔 NEW STORE ADMIN QR REQUEST',
                'message' => "Name: {$employee->first_name} {$employee->last_name}, Role: Store Administrator, Branch: " . ($employee->branch ?: 'Main Branch') . ", Status: PENDING VERIFICATION",
                'action_url' => '/admin/qr-requests',
                'priority' => 'high',
            ]);
        } else {
            NotificationService::sendToAdmins([
                'type' => 'new_qr_request',
                'title' => '🔔 NEW QR REQUEST',
                'message' => "Employee: {$employee->first_name} {$employee->last_name} ({$employee->employee_code}), Branch: " . ($employee->branch ?: 'Main Branch') . ", Request Date: " . now()->format('F j, Y') . ", Status: PENDING VERIFICATION",
                'action_url' => '/admin/qr-requests',
                'priority' => 'high',
            ]);
        }

        return response()->json([
            'success' => true,
            'message' => 'Your QR code request has been submitted to the Administrator. Your account is currently waiting for verification.',
            'request' => $qrRequest,
            'qr_status' => 'REQUESTED',
        ], 201);
    }

    /**
     * Get current user's active QR request status
     */
    public function myRequest(Request $request)
    {
        $user = $request->user();
        if (!$user) {
            return response()->json([
                'success' => false,
                'message' => 'Unauthenticated',
            ], 401);
        }

        $employee = ($user->employee_id ? Employee::find($user->employee_id) : null)
            ?: ($user->employee ?: Employee::where('email', $user->username)->first());

        $qrRequest = QrRequest::where('user_id', $user->user_id)
            ->latest('request_id')
            ->first();

        $accountStatus = 'UNVERIFIED';
        $qrStatus = 'NOT_GENERATED';
        $rejectionReason = null;

        if ($employee) {
            $accountStatus = $employee->account_verified ? 'VERIFIED' : 'UNVERIFIED';
            if ($employee->qr_active && !empty($employee->qr_token)) {
                $qrStatus = 'ACTIVE';
            } elseif ($qrRequest) {
                if ($qrRequest->status === 'PENDING') {
                    $qrStatus = 'REQUESTED';
                } elseif ($qrRequest->status === 'UNDER_REVIEW') {
                    $qrStatus = 'UNDER_REVIEW';
                } elseif ($qrRequest->status === 'APPROVED') {
                    $qrStatus = $employee->qr_active ? 'ACTIVE' : 'APPROVED';
                } elseif ($qrRequest->status === 'REJECTED') {
                    $qrStatus = 'REJECTED';
                    $rejectionReason = $qrRequest->rejection_reason;
                }
            }
        }

        return response()->json([
            'success' => true,
            'has_request' => (bool)$qrRequest,
            'request' => $qrRequest,
            'account_status' => $accountStatus,
            'qr_status' => $qrStatus,
            'rejection_reason' => $rejectionReason,
            'employee' => $employee ? [
                'employee_id' => $employee->employee_id,
                'employee_code' => $employee->employee_code,
                'name' => "{$employee->first_name} {$employee->last_name}",
                'position' => $employee->position,
                'department' => $employee->department,
                'branch' => $employee->branch,
                'email' => $employee->email,
                'phone' => $employee->phone,
            ] : null,
        ]);
    }

    /**
     * List QR requests for Administrator
     */
    public function index(Request $request)
    {
        $user = $request->user();
        if (!$user || $user->role !== 'Administrator') {
            return response()->json([
                'success' => false,
                'message' => '403 Forbidden: Only Administrators can view QR requests.',
            ], 403);
        }

        $query = QrRequest::with(['employee', 'user', 'reviewedBy', 'approvedBy', 'rejectedBy'])
            ->latest('request_id');

        // Status Filter
        if ($request->filled('status') && $request->status !== 'All') {
            $query->where('status', $request->status);
        }

        // Role Filter
        if ($request->filled('role') && $request->role !== 'All') {
            if ($request->role === 'Store Admin' || $request->role === 'Store Administrator') {
                $query->whereIn('role', ['Store Admin', 'Store Administrator']);
            } else {
                $query->where('role', $request->role);
            }
        }

        // Search Filter
        if ($request->filled('search')) {
            $s = '%' . trim($request->search) . '%';
            $query->where(function ($q) use ($s) {
                $q->where('request_code', 'like', $s)
                  ->orWhere('branch', 'like', $s)
                  ->orWhere('department', 'like', $s)
                  ->orWhere('position', 'like', $s)
                  ->orWhereHas('employee', function ($eq) use ($s) {
                      $eq->where('first_name', 'like', $s)
                         ->orWhere('last_name', 'like', $s)
                         ->orWhere('employee_code', 'like', $s)
                         ->orWhere('email', 'like', $s);
                  });
            });
        }

        // Real Database Counts Summary
        $counts = [
            'total' => QrRequest::count(),
            'pending' => QrRequest::where('status', 'PENDING')->count(),
            'under_review' => QrRequest::where('status', 'UNDER_REVIEW')->count(),
            'approved' => QrRequest::where('status', 'APPROVED')->count(),
            'rejected' => QrRequest::where('status', 'REJECTED')->count(),
        ];

        $page = (int)$request->input('page', 1);
        $perPage = (int)$request->input('per_page', 15);
        $requests = $query->paginate($perPage, ['*'], 'page', $page);

        $formatted = $requests->getCollection()->map(function ($r) {
            $emp = $r->employee;
            return [
                'request_id' => $r->request_id,
                'request_code' => $r->request_code,
                'user_id' => $r->user_id,
                'name' => $emp ? "{$emp->first_name} {$emp->last_name}" : ($r->user ? $r->user->username : 'Unknown'),
                'role' => $r->role,
                'employee_id' => $emp ? $emp->employee_code : "EMP{$r->employee_id}",
                'position' => $r->position ?: ($emp ? $emp->position : 'Staff'),
                'department' => $r->department ?: ($emp ? $emp->department : 'Operations'),
                'branch' => $r->branch ?: ($emp ? $emp->branch : 'Main Branch'),
                'phone' => $emp ? $emp->phone : '',
                'email' => $emp ? $emp->email : ($r->user ? $r->user->username : ''),
                'address' => $emp ? $emp->address : '',
                'account_status' => $emp ? ($emp->account_verified ? 'VERIFIED' : 'UNVERIFIED') : 'UNVERIFIED',
                'request_date' => $r->created_at ? $r->created_at->format('M d, Y') : '',
                'request_time' => $r->created_at ? $r->created_at->format('h:i A') : '',
                'status' => $r->status,
                'checklist' => $r->checklist,
                'reviewed_by' => $r->reviewedBy ? $r->reviewedBy->username : null,
                'reviewed_at' => $r->reviewed_at ? $r->reviewed_at->format('M d, Y h:i A') : null,
                'approved_by' => $r->approvedBy ? $r->approvedBy->username : null,
                'approved_at' => $r->approved_at ? $r->approved_at->format('M d, Y h:i A') : null,
                'rejected_by' => $r->rejectedBy ? $r->rejectedBy->username : null,
                'rejected_at' => $r->rejected_at ? $r->rejected_at->format('M d, Y h:i A') : null,
                'rejection_reason' => $r->rejection_reason,
            ];
        });

        return response()->json([
            'success' => true,
            'summary' => $counts,
            'requests' => $formatted,
            'pagination' => [
                'current_page' => $requests->currentPage(),
                'last_page' => $requests->lastPage(),
                'per_page' => $requests->perPage(),
                'total' => $requests->total(),
            ]
        ]);
    }

    /**
     * Get specific request details for review
     */
    public function show(Request $request, $id)
    {
        $user = $request->user();
        if (!$user || $user->role !== 'Administrator') {
            return response()->json([
                'success' => false,
                'message' => '403 Forbidden: Only Administrators can review QR requests.',
            ], 403);
        }

        $qrRequest = QrRequest::with(['employee', 'user', 'reviewedBy', 'approvedBy', 'rejectedBy'])
            ->findOrFail($id);

        $emp = $qrRequest->employee;

        return response()->json([
            'success' => true,
            'request' => [
                'request_id' => $qrRequest->request_id,
                'request_code' => $qrRequest->request_code,
                'user_id' => $emp ? $emp->employee_code : "EMP{$qrRequest->employee_id}",
                'name' => $emp ? "{$emp->first_name} {$emp->last_name}" : ($qrRequest->user ? $qrRequest->user->username : 'Unknown'),
                'role' => $qrRequest->role,
                'position' => $qrRequest->position ?: ($emp ? $emp->position : 'Staff'),
                'department' => $qrRequest->department ?: ($emp ? $emp->department : 'Operations'),
                'branch' => $qrRequest->branch ?: ($emp ? $emp->branch : 'Main Branch'),
                'phone' => $emp ? ($emp->phone ?: '09XXXXXXXXX') : '09XXXXXXXXX',
                'email' => $emp ? $emp->email : ($qrRequest->user ? $qrRequest->user->username : 'employee@email.com'),
                'address' => $emp ? ($emp->address ?: 'No registered address') : 'No registered address',
                'account_status' => $emp ? ($emp->account_verified ? 'VERIFIED' : 'UNVERIFIED') : 'ACTIVE',
                'status' => $qrRequest->status,
                'checklist' => $qrRequest->checklist,
                'rejection_reason' => $qrRequest->rejection_reason,
                'request_date' => $qrRequest->created_at ? $qrRequest->created_at->format('M d, Y h:i A') : '',
            ]
        ]);
    }

    /**
     * Mark request as UNDER_REVIEW when Admin opens the review modal
     */
    public function review(Request $request, $id)
    {
        $user = $request->user();
        if (!$user || $user->role !== 'Administrator') {
            return response()->json([
                'success' => false,
                'message' => '403 Forbidden: Only Administrators can review QR requests.',
            ], 403);
        }

        $qrRequest = QrRequest::with('employee')->findOrFail($id);

        if ($qrRequest->status === 'PENDING') {
            $qrRequest->status = 'UNDER_REVIEW';
            $qrRequest->reviewed_by = $user->user_id;
            $qrRequest->reviewed_at = now();
            $qrRequest->save();

            if ($qrRequest->employee) {
                // qr_request_status no longer exists
                // $qrRequest->employee->save();
            }

            SystemLog::create([
                'user_id' => $user->user_id,
                'action' => 'QR_REQUEST_REVIEWED',
                'module' => 'QR Attendance',
                'description' => "Administrator ({$user->username}) started review of QR request {$qrRequest->request_code}",
                'ip_address' => $request->ip(),
                'user_agent' => $request->userAgent(),
            ]);
        }

        return response()->json([
            'success' => true,
            'message' => 'Request marked under review.',
            'request' => $qrRequest,
        ]);
    }

    /**
     * Approve QR request and generate permanent cryptographic QR badge
     */
    public function approve(Request $request, $id)
    {
        $user = $request->user();
        if (!$user || $user->role !== 'Administrator') {
            return response()->json([
                'success' => false,
                'message' => '403 Forbidden: Only Administrators can approve QR requests and issue QR badges.',
            ], 403);
        }

        $qrRequest = QrRequest::with(['employee', 'user'])->findOrFail($id);

        // Security rule: Prevent self-approval
        if ($qrRequest->user_id === $user->user_id) {
            return response()->json([
                'success' => false,
                'message' => 'Security Error: You cannot approve your own QR request.',
            ], 403);
        }

        // Validate 7-point Verification Checklist
        $validated = $request->validate([
            'identity_verified' => 'required|boolean|accepted',
            'employee_info_verified' => 'required|boolean|accepted',
            'position_verified' => 'required|boolean|accepted',
            'department_verified' => 'required|boolean|accepted',
            'branch_verified' => 'required|boolean|accepted',
            'account_active' => 'required|boolean|accepted',
            'attendance_authorized' => 'required|boolean|accepted',
        ], [
            'accepted' => 'All 7 items on the Administrator verification checklist must be verified before approval.',
        ]);

        $employee = $qrRequest->employee;
        if (!$employee) {
            return response()->json([
                'success' => false,
                'message' => 'Linked employee record not found.',
            ], 404);
        }

        // Generate cryptographically secure UUID token
        $qrToken = (string)Str::uuid();

        \Illuminate\Support\Facades\DB::transaction(function () use ($qrRequest, $validated, $user, $employee, $qrToken, $request) {
            // 1. Mark request as APPROVED
            $qrRequest->status = 'APPROVED';
            $qrRequest->checklist = $validated;
            $qrRequest->approved_by = $user->user_id;
            $qrRequest->approved_at = now();
            $qrRequest->rejected_by = null;
            $qrRequest->rejected_at = null;
            $qrRequest->rejection_reason = null;
            $qrRequest->save();

            // 2. Update Employee account & QR fields
            $employee->account_verified = true;
            $employee->account_verified_at = now();
            $employee->information_verified = true;
            $employee->information_verified_at = now();
            $employee->qr_token = $qrToken;
            $employee->qr_active = true;
            $employee->qr_generated_at = now();
            // qr_issued_by column does not exist in the database
            $employee->save();

            // 3. Update User account verified status
            if ($qrRequest->user) {
                $qrRequest->user->account_verified = true;
                $qrRequest->user->account_verified_at = now();
                $qrRequest->user->account_verified_by = $user->user_id;
                $qrRequest->user->save();
            }

            // 4. Audit Logging
            SystemLog::create([
                'user_id' => $user->user_id,
                'action' => 'ACCOUNT_VERIFIED',
                'module' => 'QR Attendance',
                'description' => "Administrator ({$user->username}) VERIFIED account for {$employee->first_name} {$employee->last_name} ({$employee->employee_code})",
                'ip_address' => $request->ip(),
                'user_agent' => $request->userAgent(),
            ]);

            SystemLog::create([
                'user_id' => $user->user_id,
                'action' => 'QR_REQUEST_APPROVED',
                'module' => 'QR Attendance',
                'description' => "Administrator ({$user->username}) APPROVED QR request {$qrRequest->request_code} and generated permanent QR token",
                'ip_address' => $request->ip(),
                'user_agent' => $request->userAgent(),
            ]);
        });

        // 5. Send Notification to User (Outside transaction)
        NotificationService::sendToUser($qrRequest->user_id, [
            'type' => 'qr_approved',
            'title' => '🔔 QR CODE APPROVED',
            'message' => 'Your account has been verified and your permanent attendance QR code has been issued by the Administrator.',
            'action_url' => '/attendance',
            'priority' => 'high',
        ]);

        return response()->json([
            'success' => true,
            'message' => 'QR request approved successfully. Permanent QR code is now ACTIVE.',
            'request' => $qrRequest,
            'employee' => [
                'employee_id' => $employee->employee_id,
                'employee_code' => $employee->employee_code,
                'name' => "{$employee->first_name} {$employee->last_name}",
            ],
            'qr_token' => $qrToken,
            'qr_active' => true,
            'qr_status' => 'ACTIVE',
            'account_status' => 'VERIFIED',
        ]);
    }

    /**
     * Reject QR request with mandatory rejection reason
     */
    public function reject(Request $request, $id)
    {
        $user = $request->user();
        if (!$user || $user->role !== 'Administrator') {
            return response()->json([
                'success' => false,
                'message' => '403 Forbidden: Only Administrators can reject QR requests.',
            ], 403);
        }

        $qrRequest = QrRequest::with(['employee', 'user'])->findOrFail($id);

        $validated = $request->validate([
            'rejection_reason' => 'required|string|min:5|max:1000',
        ], [
            'rejection_reason.required' => 'Please provide a reason for rejecting this QR request.',
            'rejection_reason.min' => 'Rejection reason must be at least 5 characters.',
        ]);

        $reason = trim($validated['rejection_reason']);

        // Update QrRequest
        $qrRequest->status = 'REJECTED';
        $qrRequest->rejected_by = $user->user_id;
        $qrRequest->rejected_at = now();
        $qrRequest->rejection_reason = $reason;
        $qrRequest->save();

        // Update Employee
        if ($qrRequest->employee) {
            $qrRequest->employee->account_verified = false;
            $qrRequest->employee->qr_active = false;
            $qrRequest->employee->save();
        }

        // Audit Logging
        SystemLog::create([
            'user_id' => $user->user_id,
            'action' => 'QR_REQUEST_REJECTED',
            'module' => 'QR Attendance',
            'description' => "Administrator ({$user->username}) REJECTED QR request {$qrRequest->request_code}. Reason: {$reason}",
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
        ]);

        // Send Notification to User
        NotificationService::sendToUser($qrRequest->user_id, [
            'type' => 'qr_rejected',
            'title' => '🔔 QR REQUEST REJECTED',
            'message' => "Reason: \"{$reason}\" - Please contact the Administrator.",
            'action_url' => '/attendance',
            'priority' => 'high',
        ]);

        return response()->json([
            'success' => true,
            'message' => 'QR request has been rejected.',
            'request' => $qrRequest,
            'account_status' => 'REJECTED',
            'qr_status' => 'REJECTED',
            'rejection_reason' => $reason,
        ]);
    }
}
