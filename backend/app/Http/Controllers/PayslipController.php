<?php

namespace App\Http\Controllers;

use App\Models\Payslip;
use App\Models\Employee;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class PayslipController extends Controller
{
    /**
     * Display a listing of payslips with optional filtering and pagination.
     */
    public function index(Request $request): JsonResponse
    {
        $query = Payslip::with(['employee:employee_id,employee_code,first_name,middle_name,last_name,department,position,basic_salary']);

        // Filter by employee
        if ($request->filled('employee_id')) {
            $query->where('employee_id', $request->employee_id);
        }

        // Filter by status (draft, issued, paid)
        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        // Filter by pay period range
        if ($request->filled('from_date')) {
            $query->where('pay_period_start', '>=', $request->from_date);
        }
        if ($request->filled('to_date')) {
            $query->where('pay_period_end', '<=', $request->to_date);
        }

        // Search by employee name or code
        if ($request->filled('search')) {
            $search = $request->search;
            $query->whereHas('employee', function ($q) use ($search) {
                $q->where('employee_code', 'like', "%{$search}%")
                  ->orWhere('first_name', 'like', "%{$search}%")
                  ->orWhere('last_name', 'like', "%{$search}%");
            });
        }

        $perPage = (int)$request->input('per_page', 15);
        $payslips = $query->orderBy('pay_period_end', 'desc')
                          ->orderBy('id', 'desc')
                          ->paginate($perPage);

        return response()->json([
            'success' => true,
            'data'    => $payslips->items(),
            'meta'    => [
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
            'employee_id'      => 'required|exists:employees,employee_id',
            'pay_period_start' => 'required|date',
            'pay_period_end'   => 'required|date|after_or_equal:pay_period_start',
            'basic_salary'     => 'required|numeric|min:0',
            'allowances'       => 'nullable|numeric|min:0',
            'deductions'       => 'nullable|numeric|min:0',
            'net_pay'          => 'nullable|numeric',
            'status'           => 'nullable|string|in:draft,issued,paid',
        ]);

        return DB::transaction(function () use ($validated) {
            $basicSalary = (float)$validated['basic_salary'];
            $allowances  = (float)($validated['allowances'] ?? 0.00);
            $deductions  = (float)($validated['deductions'] ?? 0.00);

            // Compute net pay if not explicitly supplied
            $netPay = isset($validated['net_pay']) && $validated['net_pay'] !== null
                ? (float)$validated['net_pay']
                : round($basicSalary + $allowances - $deductions, 2);

            $payslip = Payslip::create([
                'employee_id'      => $validated['employee_id'],
                'pay_period_start' => $validated['pay_period_start'],
                'pay_period_end'   => $validated['pay_period_end'],
                'basic_salary'     => $basicSalary,
                'allowances'       => $allowances,
                'deductions'       => $deductions,
                'net_pay'          => $netPay,
                'status'           => $validated['status'] ?? 'draft',
            ]);

            $payslip->load(['employee:employee_id,employee_code,first_name,middle_name,last_name,department,position']);

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
        $payslip = Payslip::with(['employee'])->find($id);

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
        $payslip = Payslip::find($id);

        if (!$payslip) {
            return response()->json([
                'success' => false,
                'message' => 'Payslip not found.',
            ], 404);
        }

        $validated = $request->validate([
            'employee_id'      => 'sometimes|required|exists:employees,employee_id',
            'pay_period_start' => 'sometimes|required|date',
            'pay_period_end'   => 'sometimes|required|date|after_or_equal:pay_period_start',
            'basic_salary'     => 'sometimes|required|numeric|min:0',
            'allowances'       => 'nullable|numeric|min:0',
            'deductions'       => 'nullable|numeric|min:0',
            'net_pay'          => 'nullable|numeric',
            'status'           => 'sometimes|required|string|in:draft,issued,paid',
        ]);

        return DB::transaction(function () use ($payslip, $validated) {
            $basicSalary = isset($validated['basic_salary']) ? (float)$validated['basic_salary'] : (float)$payslip->basic_salary;
            $allowances  = array_key_exists('allowances', $validated) ? (float)($validated['allowances'] ?? 0) : (float)$payslip->allowances;
            $deductions  = array_key_exists('deductions', $validated) ? (float)($validated['deductions'] ?? 0) : (float)$payslip->deductions;

            $netPay = isset($validated['net_pay']) && $validated['net_pay'] !== null
                ? (float)$validated['net_pay']
                : round($basicSalary + $allowances - $deductions, 2);

            $payslip->update(array_merge($validated, [
                'allowances' => $allowances,
                'deductions' => $deductions,
                'net_pay'    => $netPay,
            ]));

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
        $payslip = Payslip::find($id);

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

