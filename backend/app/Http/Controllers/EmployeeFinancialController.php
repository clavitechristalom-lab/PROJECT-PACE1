<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\EmployeeAllowance;
use App\Models\EmployeeBonus;
use App\Models\EmployeeDeduction;
use App\Models\EmployeeLoan;
use App\Models\Employee;

class EmployeeFinancialController extends Controller
{
    private function authorizeEmployeeFinancialAccess(Request $request, ?int $employeeId, bool $write = false)
    {
        $user = $request->user();
        if (!$user) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        if (in_array($user->role, ['Administrator', 'Admin'], true)) {
            return null;
        }

        $targetEmployee = $employeeId ? Employee::find($employeeId) : null;
        if (!$targetEmployee) {
            return response()->json(['message' => 'Employee not found.'], 404);
        }

        if (in_array($user->role, ['Store Administrator', 'Store Admin'], true)) {
            $userBranchId = $user->employee?->branch_id;
            if (!$userBranchId || (int) $targetEmployee->branch_id !== (int) $userBranchId) {
                return response()->json(['message' => 'Unauthorized access to employee in another branch.'], 403);
            }
            return null;
        }

        if ($user->role === 'Employee' && !$write && $user->employee_id && (int) $user->employee_id === (int) $targetEmployee->employee_id) {
            return null;
        }

        return response()->json(['message' => 'Unauthorized to access employee financial records.'], 403);
    }

    public function getFinancials(Request $request, $employee_id)
    {
        if ($denied = $this->authorizeEmployeeFinancialAccess($request, (int) $employee_id, false)) {
            return $denied;
        }

        return response()->json([
            'allowances' => EmployeeAllowance::where('employee_id', $employee_id)->get(),
            'bonuses' => EmployeeBonus::where('employee_id', $employee_id)->get(),
            'deductions' => EmployeeDeduction::where('employee_id', $employee_id)->get(),
            'loans' => EmployeeLoan::where('employee_id', $employee_id)->get(),
        ]);
    }

    public function addAllowance(Request $request, $employee_id)
    {
        if ($denied = $this->authorizeEmployeeFinancialAccess($request, (int) $employee_id, true)) {
            return $denied;
        }

        $data = $request->validate([
            'name' => 'required|string',
            'amount' => 'required|numeric|min:0',
            'is_active' => 'boolean'
        ]);
        $data['employee_id'] = $employee_id;

        $item = EmployeeAllowance::create($data);
        SyncController::invalidateFingerprint(['employees', 'payroll', 'dashboard']);
        return response()->json($item);
    }

    public function addDeduction(Request $request, $employee_id)
    {
        if ($denied = $this->authorizeEmployeeFinancialAccess($request, (int) $employee_id, true)) {
            return $denied;
        }

        $data = $request->validate([
            'name' => 'required|string',
            'amount' => 'required|numeric|min:0',
            'is_active' => 'boolean'
        ]);
        $data['employee_id'] = $employee_id;

        $item = EmployeeDeduction::create($data);
        SyncController::invalidateFingerprint(['employees', 'payroll', 'dashboard']);
        return response()->json($item);
    }

    public function addLoan(Request $request, $employee_id)
    {
        if ($denied = $this->authorizeEmployeeFinancialAccess($request, (int) $employee_id, true)) {
            return $denied;
        }

        $data = $request->validate([
            'name' => 'required|string',
            'total_amount' => 'required|numeric|min:0',
            'monthly_deduction' => 'required|numeric|min:0',
        ]);
        $data['employee_id'] = $employee_id;
        $data['status'] = 'Active';
        $data['amount_paid'] = 0;

        $item = EmployeeLoan::create($data);
        SyncController::invalidateFingerprint(['employees', 'payroll', 'dashboard']);
        return response()->json($item);
    }

    public function deleteAllowance(Request $request, $id)
    {
        $item = EmployeeAllowance::findOrFail($id);
        if ($denied = $this->authorizeEmployeeFinancialAccess($request, (int) $item->employee_id, true)) {
            return $denied;
        }
        $item->delete();
        SyncController::invalidateFingerprint(['employees', 'payroll', 'dashboard']);
        return response()->json(['success' => true]);
    }

    public function deleteDeduction(Request $request, $id)
    {
        $item = EmployeeDeduction::findOrFail($id);
        if ($denied = $this->authorizeEmployeeFinancialAccess($request, (int) $item->employee_id, true)) {
            return $denied;
        }
        $item->delete();
        SyncController::invalidateFingerprint(['employees', 'payroll', 'dashboard']);
        return response()->json(['success' => true]);
    }

    public function deleteLoan(Request $request, $id)
    {
        $item = EmployeeLoan::findOrFail($id);
        if ($denied = $this->authorizeEmployeeFinancialAccess($request, (int) $item->employee_id, true)) {
            return $denied;
        }
        $item->delete();
        SyncController::invalidateFingerprint(['employees', 'payroll', 'dashboard']);
        return response()->json(['success' => true]);
    }
}
