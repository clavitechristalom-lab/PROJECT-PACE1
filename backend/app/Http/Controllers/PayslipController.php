<?php

namespace App\Http\Controllers;

use App\Models\Payslip;
use App\Models\Payroll;
use App\Models\Employee;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

class PayslipController extends Controller
{
    /**
     * Display a listing of payslips with all 13 UI table columns.
     */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        if ($user && $user->role === 'Customer') {
            return response()->json(['success' => false, 'message' => 'Customers cannot access employee payslips.'], 403);
        }

        // Ensure any existing payroll records are synchronized into payslips
        if (Payslip::count() < Payroll::count()) {
            Payslip::syncAllFromPayroll();
        }

        $query = Payslip::with(['employee.branchProfile', 'payroll.period']);

        // Role-based Relationship Scoping:
        // 1. Employee: strictly own payslips
        // 2. Store Admin: strictly employees within assigned branch
        // 3. Administrator: global access with optional branch filter
        if ($user && $user->role === 'Employee') {
            $query->where('employee_id', $user->employee_id);
        } elseif ($user && in_array($user->role, ['Store Administrator', 'Store Admin'])) {
            $branchId = $user->employee ? $user->employee->branch_id : null;
            $branchName = $user->employee ? ($user->employee->branch_name ?? $user->employee->branch) : null;
            $query->whereHas('employee', function ($eq) use ($branchId, $branchName) {
                $eq->where(function ($sub) use ($branchId, $branchName) {
                    if ($branchId) $sub->where('branch_id', $branchId);
                    if ($branchName) {
                        $sub->orWhere('branch', $branchName)
                            ->orWhereHas('branchProfile', fn($bq) => $bq->where('name', $branchName));
                    }
                });
            });
        }

        // Filter by employee
        if ($request->filled('employee_id')) {
            $query->where('employee_id', $request->employee_id);
        }

        // Filter by branch
        if ($request->filled('branch') && $request->branch !== 'All' && $request->branch !== 'all') {
            $query->where('branch', $request->branch);
        }

        // Filter by status
        if ($request->filled('status') && $request->status !== 'All' && $request->status !== 'all') {
            $query->where('status', $request->status);
        }

        // Filter by pay period range
        if ($request->filled('from_date')) {
            $query->where('pay_period_start', '>=', $request->from_date);
        }
        if ($request->filled('to_date')) {
            $query->where('pay_period_end', '<=', $request->to_date);
        }

        // Search by Code, Employee Name, or Branch
        if ($request->filled('search')) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->where('code', 'like', "%{$search}%")
                  ->orWhere('employee_name', 'like', "%{$search}%")
                  ->orWhere('branch', 'like', "%{$search}%");
            });
        }

        $perPage = (int)$request->input('per_page', 15);
        $payslips = $query->orderByDesc('id')->paginate($perPage);

        return response()->json([
            'success'  => true,
            'payslips' => $payslips->items(),
            'data'     => $payslips->items(),
            'meta'     => [
                'current_page' => $payslips->currentPage(),
                'last_page'    => $payslips->lastPage(),
                'per_page'     => $payslips->perPage(),
                'total'        => $payslips->total(),
            ],
        ]);
    }

    /**
     * Store a newly created payslip in the database.
     */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'payroll_id'          => 'nullable|exists:payroll,payroll_id',
            'employee_id'         => 'required|exists:employees,employee_id',
            'code'                => 'nullable|string|max:50',
            'employee_name'       => 'nullable|string|max:255',
            'branch'              => 'nullable|string|max:255',
            'payout_method'       => 'nullable|string|max:100',
            'weekly_base_pay'     => 'nullable|numeric|min:0',
            'total_work_hours'    => 'nullable|numeric|min:0',
            'total_absences'      => 'nullable|numeric|min:0',
            'total_late'          => 'nullable|integer|min:0',
            'total_undertime'     => 'nullable|numeric|min:0',
            'total_deductions'    => 'nullable|numeric|min:0',
            'final_take_home_pay' => 'nullable|numeric|min:0',
            'status'              => 'nullable|string|max:30',
            'actions'             => 'nullable|string|max:255',
            'absence_deduction'   => 'nullable|numeric|min:0',
            'late_deduction'      => 'nullable|numeric|min:0',
            'undertime_deduction' => 'nullable|numeric|min:0',
            'pay_period_start'    => 'nullable|date',
            'pay_period_end'      => 'nullable|date|after_or_equal:pay_period_start',
            'basic_salary'        => 'nullable|numeric|min:0',
            'allowances'          => 'nullable|numeric|min:0',
            'deductions'          => 'nullable|numeric|min:0',
            'net_pay'             => 'nullable|numeric',
            'proof_of_payment'    => 'nullable|string|max:255',
        ]);

        return DB::transaction(function () use ($validated) {
            $emp = Employee::with('branchProfile')->find($validated['employee_id']);

            $rawDaily = $emp ? (float)$emp->daily_rate : 0.0;
            $defaultDaily = ($rawDaily >= 100 && $rawDaily <= 500) ? $rawDaily : 500.00;
            $defaultWeeklyBase = round($defaultDaily * 6, 2);

            $totalWorkHours = (float)($validated['total_work_hours'] ?? 48.00);
            if ($totalWorkHours <= 0) {
                $weeklyBase = 0.00;
                $allowances = 0.00;
                $absDed = 0.00;
                $lateDed = 0.00;
                $underDed = 0.00;
                $totalDed = 0.00;
                $takeHome = 0.00;
            } else {
                $weeklyBase = (float)($validated['weekly_base_pay'] ?? $validated['basic_salary'] ?? $defaultWeeklyBase);
                $allowances = (float)($validated['allowances'] ?? 0.00);
                $absDed     = (float)($validated['absence_deduction'] ?? 0.00);
                $lateDed    = (float)($validated['late_deduction'] ?? 0.00);
                $underDed   = (float)($validated['undertime_deduction'] ?? 0.00);
                $totalDed   = (float)($validated['total_deductions'] ?? $validated['deductions'] ?? round($absDed + $lateDed + $underDed, 2));
                $takeHome   = (float)($validated['final_take_home_pay'] ?? $validated['net_pay'] ?? max(0, round($weeklyBase + $allowances - $totalDed, 2)));
            }

            $payslip = Payslip::create([
                'payroll_id'          => $validated['payroll_id'] ?? null,
                'employee_id'         => $validated['employee_id'],
                'code'                => $validated['code'] ?? ($emp ? $emp->employee_code : null),
                'employee_name'       => $validated['employee_name'] ?? ($emp ? trim("{$emp->first_name} {$emp->last_name}") : null),
                'branch'              => $validated['branch'] ?? ($emp ? ($emp->branch_name ?: ($emp->branchProfile ? $emp->branchProfile->name : ((string)$emp->branch ?: 'Unassigned'))) : 'Unassigned'),
                'payout_method'       => $validated['payout_method'] ?? ($emp ? ($emp->pay_type ?: 'Cash') : 'Cash'),
                'weekly_base_pay'     => $weeklyBase,
                'total_work_hours'    => (float)($validated['total_work_hours'] ?? 48.00),
                'total_absences'      => (float)($validated['total_absences'] ?? 0.00),
                'total_late'          => (int)($validated['total_late'] ?? 0),
                'total_undertime'     => (float)($validated['total_undertime'] ?? 0.00),
                'total_deductions'    => $totalDed,
                'final_take_home_pay' => $takeHome,
                'status'              => $validated['status'] ?? 'Draft',
                'actions'             => $validated['actions'] ?? null,
                'absence_deduction'   => $absDed,
                'late_deduction'      => $lateDed,
                'undertime_deduction' => $underDed,
                'pay_period_start'    => $validated['pay_period_start'] ?? now()->startOfWeek()->toDateString(),
                'pay_period_end'      => $validated['pay_period_end'] ?? now()->endOfWeek()->subDay()->toDateString(),
                'basic_salary'        => $weeklyBase,
                'allowances'          => $allowances,
                'deductions'          => $totalDed,
                'net_pay'             => $takeHome,
                'proof_of_payment'    => $validated['proof_of_payment'] ?? null,
            ]);

            $payslip->load(['employee']);

            return response()->json([
                'success' => true,
                'message' => 'Payslip created successfully.',
                'data'    => $payslip,
            ], 201);
        });
    }

    /**
     * Display the specified payslip.
     */
    public function show(int $id): JsonResponse
    {
        $payslip = Payslip::with(['employee', 'payroll.period', 'payroll.deductions'])->find($id);

        if (!$payslip) {
            $payslip = Payslip::with(['employee', 'payroll.period', 'payroll.deductions'])
                ->where('payroll_id', $id)
                ->first();
        }

        if (!$payslip) {
            return response()->json([
                'success' => false,
                'message' => 'Payslip not found.',
            ], 404);
        }

        return response()->json([
            'success' => true,
            'data'    => $payslip,
        ]);
    }

    /**
     * Update the specified payslip in the database.
     */
    public function update(Request $request, int $id): JsonResponse
    {
        $payslip = Payslip::find($id) ?: Payslip::where('payroll_id', $id)->first();

        if (!$payslip) {
            return response()->json([
                'success' => false,
                'message' => 'Payslip not found.',
            ], 404);
        }

        $validated = $request->validate([
            'employee_id'         => 'sometimes|required|exists:employees,employee_id',
            'code'                => 'nullable|string|max:50',
            'employee_name'       => 'nullable|string|max:255',
            'branch'              => 'nullable|string|max:255',
            'payout_method'       => 'nullable|string|max:100',
            'weekly_base_pay'     => 'nullable|numeric|min:0',
            'total_work_hours'    => 'nullable|numeric|min:0',
            'total_absences'      => 'nullable|numeric|min:0',
            'total_late'          => 'nullable|integer|min:0',
            'total_undertime'     => 'nullable|numeric|min:0',
            'total_deductions'    => 'nullable|numeric|min:0',
            'final_take_home_pay' => 'nullable|numeric|min:0',
            'status'              => 'nullable|string|max:30',
            'actions'             => 'nullable|string|max:255',
            'absence_deduction'   => 'nullable|numeric|min:0',
            'late_deduction'      => 'nullable|numeric|min:0',
            'undertime_deduction' => 'nullable|numeric|min:0',
            'pay_period_start'    => 'nullable|date',
            'pay_period_end'      => 'nullable|date|after_or_equal:pay_period_start',
            'basic_salary'        => 'nullable|numeric|min:0',
            'allowances'          => 'nullable|numeric|min:0',
            'deductions'          => 'nullable|numeric|min:0',
            'net_pay'             => 'nullable|numeric',
            'proof_of_payment'    => 'nullable|string|max:255',
        ]);

        return DB::transaction(function () use ($payslip, $validated) {
            $payslip->update($validated);

            // Sync updates back to parent Payroll if linked
            if ($payslip->payroll_id) {
                $payroll = Payroll::find($payslip->payroll_id);
                if ($payroll) {
                    $payroll->updateQuietly([
                        'basic_salary'     => $payslip->weekly_base_pay,
                        'regular_hours'    => $payslip->total_work_hours,
                        'total_deductions' => $payslip->total_deductions,
                        'net_pay'          => $payslip->final_take_home_pay,
                        'status'           => $payslip->status,
                    ]);
                }
            }

            $payslip->load(['employee']);

            return response()->json([
                'success' => true,
                'message' => 'Payslip updated successfully.',
                'data'    => $payslip,
            ]);
        });
    }

    /**
     * Remove the specified payslip from the database.
     */
    public function destroy(int $id): JsonResponse
    {
        $payslip = Payslip::find($id) ?: Payslip::where('payroll_id', $id)->first();

        if (!$payslip) {
            return response()->json([
                'success' => false,
                'message' => 'Payslip not found.',
            ], 404);
        }

        $payslip->delete();

        return response()->json([
            'success' => true,
            'message' => 'Payslip deleted successfully.',
        ]);
    }
}
