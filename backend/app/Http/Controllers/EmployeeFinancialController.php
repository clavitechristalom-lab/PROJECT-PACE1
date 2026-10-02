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
    public function getFinancials($employee_id)
    {
        $employee = Employee::findOrFail($employee_id);
        
        return response()->json([
            'allowances' => EmployeeAllowance::where('employee_id', $employee_id)->get(),
            'bonuses' => EmployeeBonus::where('employee_id', $employee_id)->get(),
            'deductions' => EmployeeDeduction::where('employee_id', $employee_id)->get(),
            'loans' => EmployeeLoan::where('employee_id', $employee_id)->get(),
        ]);
    }

    public function addAllowance(Request $request, $employee_id)
    {
        $data = $request->validate([
            'name' => 'required|string',
            'amount' => 'required|numeric|min:0',
            'is_active' => 'boolean'
        ]);
        $data['employee_id'] = $employee_id;
        
        $item = EmployeeAllowance::create($data);
        return response()->json($item);
    }

    public function addDeduction(Request $request, $employee_id)
    {
        $data = $request->validate([
            'name' => 'required|string',
            'amount' => 'required|numeric|min:0',
            'is_active' => 'boolean'
        ]);
        $data['employee_id'] = $employee_id;
        
        $item = EmployeeDeduction::create($data);
        return response()->json($item);
    }

    public function addLoan(Request $request, $employee_id)
    {
        $data = $request->validate([
            'name' => 'required|string',
            'total_amount' => 'required|numeric|min:0',
            'monthly_deduction' => 'required|numeric|min:0',
        ]);
        $data['employee_id'] = $employee_id;
        $data['status'] = 'Active';
        $data['amount_paid'] = 0;
        
        $item = EmployeeLoan::create($data);
        return response()->json($item);
    }

    public function deleteAllowance($id)
    {
        EmployeeAllowance::destroy($id);
        return response()->json(['success' => true]);
    }

    public function deleteDeduction($id)
    {
        EmployeeDeduction::destroy($id);
        return response()->json(['success' => true]);
    }

    public function deleteLoan($id)
    {
        EmployeeLoan::destroy($id);
        return response()->json(['success' => true]);
    }
}
