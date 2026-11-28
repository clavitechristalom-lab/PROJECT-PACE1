<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\InstallmentAccount;
use App\Models\PaymentSchedule;
use App\Models\Payment;
use App\Models\SaleTransaction;
use App\Models\SaleItem;
use App\Models\Customer;
use App\Models\Product;
use App\Models\SystemLog;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Cache;
use Illuminate\Validation\ValidationException;
use App\Services\AgentContributionService;
use App\Services\NotificationService;

class InstallmentController extends Controller
{
    /**
     * Resolve branch ID and human-readable branch name for an InstallmentAccount.
     */
    private function resolveBranchInfo($inst): array
    {
        $branchId = $inst->customer?->branch_id
            ?? $inst->sale?->branch_id
            ?? $inst->sale?->processedBy?->employee?->branch_id
            ?? null;

        $branchName = $inst->customer?->branch?->name
            ?? (is_string($inst->customer?->branch) ? $inst->customer->branch : null)
            ?? $inst->sale?->branch?->name
            ?? $inst->sale?->processedBy?->employee?->branch?->name
            ?? (is_string($inst->sale?->processedBy?->employee?->branch) ? $inst->sale->processedBy->employee->branch : null);

        if (!$branchName && $branchId) {
            $branchName = \App\Models\BranchProfile::where('id', $branchId)->value('name');
        }

        return [
            'branch_id' => $branchId ? (int) $branchId : null,
            'branch_name' => $branchName ?: 'Main Branch',
        ];
    }

    /**
     * Apply role-based or requested branch filter consistently across endpoints.
     */
    private function applyBranchFilter($query, $user, $requestedBranch): void
    {
        if ($user && in_array($user->role, ['Store Administrator', 'Store Admin'], true)) {
            $userBranch = $user->employee ? $user->employee->branch_id : null;
            if ($userBranch) {
                $query->where(function ($q) use ($userBranch) {
                    $q->whereHas('customer', fn($cq) => $cq->where('branch_id', $userBranch))
                      ->orWhereHas('sale', fn($sq) => $sq->where('branch_id', $userBranch))
                      ->orWhereHas('sale.processedBy.employee', fn($eq) => $eq->where('branch_id', $userBranch));
                });
            } else {
                $query->where('installment_id', -1);
            }
            return;
        }

        if ($requestedBranch !== null && $requestedBranch !== '' && $requestedBranch !== 'All') {
            $query->where(function ($q) use ($requestedBranch) {
                if (is_numeric($requestedBranch)) {
                    $branchId = (int) $requestedBranch;
                    $q->whereHas('customer', fn($cq) => $cq->where('branch_id', $branchId))
                      ->orWhereHas('sale', fn($sq) => $sq->where('branch_id', $branchId))
                      ->orWhereHas('sale.processedBy.employee', fn($eq) => $eq->where('branch_id', $branchId));
                } else {
                    $q->whereHas('customer', function ($cq) use ($requestedBranch) {
                        $cq->where('branch', $requestedBranch)
                           ->orWhereHas('branch', fn($bq) => $bq->where('name', $requestedBranch));
                    })->orWhereHas('sale', function ($sq) use ($requestedBranch) {
                        $sq->whereHas('branch', fn($bq) => $bq->where('name', $requestedBranch))
                           ->orWhereHas('processedBy.employee.branch', fn($bq) => $bq->where('name', $requestedBranch));
                    });
                }
            });
        }
    }

    /**
     * Unified financial breakdown via model helper (excludes pending/rejected,
     * prevents double-counting down payments).
     */
    private function computeFinancials($inst): array
    {
        return $inst->financialBreakdown();
    }

    /**
     * Helper to format an InstallmentAccount instance consistently.
     */
    private function formatAccount($inst, $today)
    {
        $fin = $this->computeFinancials($inst);
        $paid = $fin['paid'];
        $totalPayable = (float)$inst->total_payable;
        $balance = $fin['balance'];

        $branchInfo = $this->resolveBranchInfo($inst);

        $isFullyPaid = $inst->isFullyPaid() || $balance <= 0.0;
        if ($isFullyPaid) {
            $balance = 0.0;
        }

        $nextSchedule = $isFullyPaid
            ? null
            : $inst->paymentSchedules
                ->where('balance_due', '>', 0)
                ->sortBy('due_date')
                ->first();

        $hasOverdue = !$isFullyPaid && $balance > 0 && $inst->paymentSchedules
            ->where('due_date', '<', $today)
            ->where('balance_due', '>', 0)
            ->isNotEmpty();

        $computedStatus = $inst->status;
        if ($isFullyPaid) {
            $computedStatus = InstallmentAccount::STATUS_FULLY_PAID;
        } elseif ($hasOverdue) {
            $computedStatus = 'Overdue';
        } elseif ($computedStatus === 'Overdue' && !$hasOverdue) {
            $computedStatus = 'Active';
        }

        // Product name & category extraction
        $productName = 'Multiple / Custom Items';
        $productCategory = '';
        $itemsCount = 0;
        $saleItemsSummary = [];
        if ($inst->sale && $inst->sale->items && $inst->sale->items->isNotEmpty()) {
            $itemsCount = $inst->sale->items->count();
            $firstItem = $inst->sale->items->first();
            $productName = $firstItem->product ? $firstItem->product->product_name : 'Appliance / Furniture';
            $productCategory = $firstItem->product ? ($firstItem->product->category ?: ($firstItem->product->category_group ?: ($firstItem->product->main_category ?: ''))) : ($firstItem->category_domain ?: '');
            if ($itemsCount > 1) {
                $productName .= ' (+' . ($itemsCount - 1) . ' more)';
            }
            $saleItemsSummary = $inst->sale->items->map(function ($it) {
                return [
                    'category_domain' => $it->category_domain ?: AgentContributionService::resolveCategoryDomain($it->product?->category),
                    'category' => $it->product?->category ?: ($it->category_domain ?: ''),
                    'line_total' => (float) $it->line_total,
                ];
            })->values()->all();
        }

        // Schedule progress counts
        $paidTermsCount = $inst->paymentSchedules->where('balance_due', '<=', 0)->count();
        $totalTermsCount = max((int) $inst->number_of_installments, $inst->paymentSchedules->count());

        // Days overdue calculation
        $daysOverdue = 0;
        if ($hasOverdue) {
            $earliestOverdue = $inst->paymentSchedules
                ->where('due_date', '<', $today)
                ->where('balance_due', '>', 0)
                ->sortBy('due_date')
                ->first();
            if ($earliestOverdue) {
                $dueTime = strtotime($earliestOverdue->due_date);
                $nowTime = strtotime($today);
                $daysOverdue = max(0, (int)(($nowTime - $dueTime) / 86400));
            }
        }

        $isOpenContract = strtolower(trim((string) $inst->frequency)) === 'open contract';

        $verifierUser = $inst->relationLoaded('completedVerifiedBy') ? $inst->completedVerifiedBy : null;
        $finalVerifiedAt = $inst->completed_at;
        if ($isFullyPaid && !$verifierUser && $inst->relationLoaded('payments')) {
            $lastSettled = $inst->payments
                ->filter(fn ($p) => Payment::isSettledStatus($p->status))
                ->sortByDesc('payment_id')
                ->first();
            if ($lastSettled) {
                $verifierUser = ($lastSettled->relationLoaded('confirmedBy') ? $lastSettled->confirmedBy : null)
                    ?: ($lastSettled->relationLoaded('receivedBy') ? $lastSettled->receivedBy : null);
                if (!$finalVerifiedAt) {
                    $finalVerifiedAt = $lastSettled->confirmed_at ?: ($lastSettled->payment_date ?: $inst->updated_at);
                }
            }
        }
        $finalVerifierName = $verifierUser
            ? ($verifierUser->employee
                ? trim("{$verifierUser->employee->first_name} {$verifierUser->employee->last_name}")
                : $verifierUser->username)
            : null;
        $finalVerifierRole = $verifierUser?->role ?: null;

        return [
            'installment_id' => $inst->installment_id,
            'account_no' => $inst->account_no,
            'customer_id' => $inst->customer_id,
            'customer_code' => $inst->customer ? ($inst->customer->customer_code ?: '') : '',
            'customer_name' => $inst->customer ? trim("{$inst->customer->first_name} {$inst->customer->last_name}") : 'Customer',
            'customer_phone' => $inst->customer ? $inst->customer->phone : '',
            'customer_email' => $inst->customer ? $inst->customer->email : '',
            'customer_address' => $inst->customer ? $inst->customer->address : '',
            'product_name' => $productName,
            'product_category' => $productCategory,
            'sale_items_summary' => $saleItemsSummary,
            'items_count' => $itemsCount,
            'branch_id' => $branchInfo['branch_id'],
            'branch' => $branchInfo['branch_name'],
            'branch_name' => $branchInfo['branch_name'],
            'sale_id' => $inst->sale_id,
            'invoice_no' => $inst->sale ? $inst->sale->invoice_no : 'N/A',
            'has_agent' => (bool) ($inst->has_agent ?? $inst->sale?->has_agent ?? false),
            'agent_id' => ($inst->agent_id ?? $inst->sale?->agent_id) ? (int) ($inst->agent_id ?? $inst->sale?->agent_id) : null,
            'assigned_agent_id' => ($inst->agent_id ?? $inst->sale?->agent_id) ? (int) ($inst->agent_id ?? $inst->sale?->agent_id) : null,
            'agent_name' => ($agentModel = $inst->agent ?: $inst->sale?->agent) ? trim("{$agentModel->first_name} {$agentModel->last_name}") : null,
            'agent_code' => $agentModel?->employee_code ?? null,
            'appliances_agent_contribution' => (float) ($inst->appliances_agent_contribution ?? $inst->sale?->appliances_agent_contribution ?? 0),
            'furniture_agent_contribution' => (float) ($inst->furniture_agent_contribution ?? $inst->sale?->furniture_agent_contribution ?? 0),
            'total_agent_contribution' => (float) ($inst->total_agent_contribution ?? $inst->sale?->total_agent_contribution ?? 0),
            'agent_contribution_status' => ($inst->has_agent ?? $inst->sale?->has_agent ?? false)
                ? ($isFullyPaid ? ($inst->agent_contribution_status ?: InstallmentAccount::AGENT_CONTRIBUTION_SETTLED) : ($inst->agent_contribution_status ?: 'Pending'))
                : null,
            'start_date' => $inst->start_date,
            'principal_amount' => (float) $inst->principal_amount,
            'down_payment' => (float) $inst->down_payment,
            'financed_amount' => max(0, (float) $inst->principal_amount - (float) $inst->down_payment),
            'interest_rate' => (float) $inst->interest_rate,
            'interest_amount' => (float) $inst->interest_amount,
            'total_payable' => $totalPayable,
            'installment_amount' => (float) $inst->installment_amount,
            'number_of_installments' => (int) $inst->number_of_installments,
            'is_open_contract' => $isOpenContract,
            'paid_installments' => $isFullyPaid ? $totalTermsCount : $paidTermsCount,
            'total_terms' => $totalTermsCount,
            'frequency' => $inst->frequency ?: 'Monthly',
            'paid' => round($paid, 2),
            'balance' => $balance,
            'remaining_balance' => $balance,
            'pending_payments_amount' => $fin['pending_amount'],
            'pending_payments_count' => $fin['pending_count'],
            'progress_percentage' => $isFullyPaid ? 100 : ($totalPayable > 0 ? min(100, round(($paid / $totalPayable) * 100, 1)) : 0),
            'next_due_date' => $isFullyPaid ? null : ($nextSchedule ? $nextSchedule->due_date : null),
            'next_amount_due' => $isFullyPaid ? 0 : ($nextSchedule ? (float) $nextSchedule->balance_due : 0),
            'days_overdue' => $isFullyPaid ? 0 : $daysOverdue,
            'payment_status' => $isFullyPaid ? 'Paid in Full' : ($hasOverdue ? 'Overdue' : ($paid > 0 ? 'Partially Paid' : 'Unpaid')),
            'status' => $computedStatus,
            'completed_at' => $isFullyPaid
                ? ($inst->completed_at instanceof \Carbon\CarbonInterface
                    ? $inst->completed_at->toIso8601String()
                    : ($finalVerifiedAt instanceof \Carbon\CarbonInterface
                        ? $finalVerifiedAt->toIso8601String()
                        : ($finalVerifiedAt ? (string) $finalVerifiedAt : ($inst->updated_at ? $inst->updated_at->toIso8601String() : null))))
                : null,
            'customer_standing' => $isFullyPaid ? ($inst->customer_standing ?: InstallmentAccount::STANDING_CLEARED) : ($inst->customer_standing ?: null),
            'final_verifier_name' => $finalVerifierName,
            'final_verifier_role' => $finalVerifierRole,
            'notes' => $inst->notes,
        ];
    }

    /**
     * List all installment with role/branch scoping and real-time balance calculations.
     */
    public function index(Request $request)
    {
        $user = $request->user();
        $today = date('Y-m-d');

        // 1-2s Performance Cache: bypass if exporting CSV
        if (!$request->boolean('export_csv')) {
            $cacheKey = 'pace_inst_idx_' . md5(json_encode([
                'u' => $user ? $user->user_id : 0,
                'r' => $user ? $user->role : '',
                'b' => $request->query('branch', ''),
                's' => $request->query('search', ''),
                'st' => $request->query('status', ''),
                'd' => $today,
                'v' => Cache::get('pace_inst_cache_v', 0),
            ]));

            $cached = \Illuminate\Support\Facades\Cache::get($cacheKey);
            if ($cached !== null) {
                return response()->json($cached);
            }
        }

        if (\Illuminate\Support\Facades\Cache::add('sync_overdue_schedules_global', true, 300)) {
            PaymentSchedule::where('due_date', '<', $today)
                ->where('balance_due', '>', 0)
                ->whereIn('status', ['Pending', 'Partially Paid'])
                ->whereHas('installmentAccount', function ($q) {
                    $q->whereNotIn('status', InstallmentAccount::COMPLETED_STATUSES);
                })
                ->update(['status' => 'Overdue']);
        }

        $query = InstallmentAccount::with([
            'customer:customer_id,customer_code,first_name,last_name,phone,email,address,branch_id,branch,allow_installment',
            'customer.branch:id,name',
            'agent:employee_id,employee_code,first_name,last_name,position',
            'completedVerifiedBy:user_id,username,role,employee_id',
            'completedVerifiedBy.employee:employee_id,first_name,last_name',
            'sale:sale_id,invoice_no,processed_by,branch_id,has_agent,agent_id,appliances_agent_contribution,furniture_agent_contribution,total_agent_contribution',
            'sale.branch:id,name',
            'sale.agent:employee_id,employee_code,first_name,last_name,position',
            'sale.processedBy:user_id,username,employee_id',
            'sale.processedBy.employee:employee_id,branch_id',
            'sale.processedBy.employee.branch:id,name',
            'sale.items:sale_item_id,sale_id,product_id,quantity,unit_price,discount_amount,line_total,category_domain,agent_commission_rate,agent_contribution',
            'sale.items.product:product_id,product_name,product_code,category,image_url',
            'payments:payment_id,installment_id,amount,status,reference_no,payment_date,confirmed_by,received_by,confirmed_at,notes',
            'payments.confirmedBy:user_id,username,role,employee_id',
            'payments.confirmedBy.employee:employee_id,first_name,last_name',
            'payments.receivedBy:user_id,username,role,employee_id',
            'payments.receivedBy.employee:employee_id,first_name,last_name',
            'paymentSchedules:schedule_id,installment_id,due_date,balance_due,amount_due,amount_paid,status'
        ])->where(function ($q) {
            $q->where('number_of_installments', '>', 0)
              ->orWhere('frequency', 'Open Contract')
              ->orWhereIn('status', InstallmentAccount::COMPLETED_STATUSES)
              ->orWhere('status', '!=', 'Completed');
        });

        $this->applyBranchFilter($query, $user, $request->query('branch'));

        if ($request->filled('search')) {
            $s = trim($request->query('search'));
            $query->where(function ($q) use ($s) {
                $q->where('account_no', 'like', "%{$s}%")
                  ->orWhereHas('customer', function ($cq) use ($s) {
                      $cq->where('first_name', 'like', "%{$s}%")
                         ->orWhere('last_name', 'like', "%{$s}%")
                         ->orWhere('customer_code', 'like', "%{$s}%")
                         ->orWhere('phone', 'like', "%{$s}%");
                  })
                  ->orWhereHas('sale', function ($sq) use ($s) {
                      $sq->where('invoice_no', 'like', "%{$s}%");
                  })
                  ->orWhereHas('sale.items.product', function ($pq) use ($s) {
                      $pq->where('product_name', 'like', "%{$s}%")
                         ->orWhere('product_code', 'like', "%{$s}%");
                  });
            });
        }

        if ($request->filled('status') && $request->query('status') !== 'All') {
            $query->where('status', $request->query('status'));
        }

        if ($request->filled('date_from')) {
            $query->where('start_date', '>=', $request->query('date_from'));
        }
        if ($request->filled('date_to')) {
            $query->where('start_date', '<=', $request->query('date_to'));
        }

        if ($request->boolean('export_csv')) {
            SystemLog::create([
                'user_id' => $user ? $user->user_id : null,
                'action' => 'EXPORT',
                'module' => 'Installments',
                'description' => 'Exported Installment to CSV',
                'ip_address' => $request->ip(),
                'user_agent' => $request->userAgent(),
            ]);

            return $this->exportCsv(
                'installments_export_' . date('Y-m-d') . '.csv',
                ['Installment ID', 'Account No', 'Customer Name', 'Transaction ID', 'Principal Amount', 'Down Payment', 'Financed Amount', 'Interest Rate', 'Interest Amount', 'Total Payable', 'Installment Amount', 'Frequency', 'Paid', 'Balance', 'Status', 'Branch', 'Created Date'],
                $query->orderByDesc('installment_id'),
                function ($inst) use ($today) {
                    $f = $this->formatAccount($inst, $today);
                    return [
                        $f['installment_id'],
                        $f['account_no'],
                        $f['customer_name'],
                        $f['invoice_no'],
                        $f['principal_amount'],
                        $f['down_payment'],
                        $f['financed_amount'],
                        $f['interest_rate'],
                        $f['interest_amount'],
                        $f['total_payable'],
                        $f['installment_amount'],
                        $f['frequency'],
                        $f['paid'],
                        $f['balance'],
                        $f['status'],
                        $f['branch'],
                        $inst->created_at ? $inst->created_at->format('Y-m-d H:i:s') : ''
                    ];
                }
            );
        }

        $allAccounts = $query->orderByDesc('installment_id')->get();
        $installments = $allAccounts->map(function ($inst) use ($today) {
            return $this->formatAccount($inst, $today);
        });

        // Compute summary metrics for Installment Monitoring
        $totalFinanced = (float)$installments->sum('total_payable');
        $totalPaid = (float)$installments->sum('paid');
        $totalOutstanding = (float)$installments->sum('balance');
        $activeCount = $installments->where('status', 'Active')->count();
        $overdueCount = $installments->where('status', 'Overdue')->count();
        $completedCount = $installments->whereIn('status', InstallmentAccount::COMPLETED_STATUSES)->count();
        $pendingCount = $installments->where('status', 'Pending')->count();

        $payload = [
            'installments' => $installments,
            'total' => $installments->count(),
            'summary' => [
                'total_financed' => $totalFinanced,
                'total_paid' => $totalPaid,
                'total_outstanding' => $totalOutstanding,
                'active_accounts' => $activeCount,
                'overdue_accounts' => $overdueCount,
                'completed_accounts' => $completedCount,
                'pending_accounts' => $pendingCount,
            ]
        ];

        if (isset($cacheKey)) {
            \Illuminate\Support\Facades\Cache::put($cacheKey, $payload, 30);
        }

        return response()->json($payload);
    }

    /**
     * Create a new Customer Installment.
     */
    public function store(Request $request)
    {
        $user = $request->user();
        if ($user && $user->role === 'Administrator') {
            return response()->json(['success' => false, 'message' => 'Admin is not authorized to create installment.'], 403);
        }
        if ($user && $user->role === 'Customer') {
            return response()->json(['success' => false, 'message' => 'Unauthorized: Customers cannot create installment accounts directly.'], 403);
        }
        if ($user && $user->role === 'Employee') {
            $pos = strtolower((string) ($user->employee?->position ?? ''));
            $dept = strtolower((string) ($user->employee?->department ?? ''));
            $isCashier = str_contains($pos, 'cashier') || str_contains($dept, 'cashier') || str_contains($pos, 'store admin');
            if (!$isCashier) {
                return response()->json(['success' => false, 'message' => 'Unauthorized: Only branch Cashiers or Store Admins can create installments.'], 403);
            }
        }
        $today = date('Y-m-d');

        $validated = $request->validate([
            'customer_id' => 'nullable|exists:customers,customer_id',
            'first_name' => 'required_without:customer_id|nullable|string|max:100',
            'last_name' => 'required_without:customer_id|nullable|string|max:100',
            'phone' => 'nullable|string|max:20',
            'email' => 'nullable|email|max:100',
            'address' => 'nullable|string|max:255',

            'product_id' => 'nullable|exists:products,product_id',
            'product_name' => 'nullable|string|max:255',
            'product_category' => 'nullable|string|max:120',
            'quantity' => 'nullable|integer|min:1',
            'unit_price' => 'nullable|numeric|min:0',
            'discount' => 'nullable|numeric|min:0',
            'discount_amount' => 'nullable|numeric|min:0',
            'has_agent' => 'nullable|boolean',
            'agent_id' => 'nullable|integer',
            'assigned_agent_id' => 'nullable|integer',
            'principal_amount' => 'required|numeric|min:1',
            'down_payment' => 'nullable|numeric|min:0',
            'interest_rate' => 'nullable|numeric|min:0',
            'interest_amount' => 'nullable|numeric|min:0',
            'total_payable' => 'required|numeric|min:1',
            'installment_amount' => 'nullable|numeric|min:0',
            'number_of_installments' => 'required|integer|min:0|max:60',
            'is_open_contract' => 'nullable|boolean',
            'frequency' => 'nullable|string|in:Monthly,Bi-weekly,Weekly,Open Contract',
            'start_date' => 'required|date',
            'due_date' => 'nullable|date',
            'status' => 'nullable|string|in:Active,Pending,Completed,Overdue,Cancelled',
            'notes' => 'nullable|string',
        ]);

        $qty = max(1, (int) ($validated['quantity'] ?? 1));
        $hasUnitPrice = isset($validated['unit_price']) && (float) $validated['unit_price'] > 0;
        $grossLineTotal = $hasUnitPrice
            ? round((float) $validated['unit_price'] * $qty, 2)
            : round((float) $validated['principal_amount'], 2);
        $rawItemDiscount = (float) ($validated['discount_amount'] ?? ($validated['discount'] ?? 0));
        $itemDiscountCheck = round(min($grossLineTotal, max(0, $rawItemDiscount)), 2);
        $principalCheck = max(0, round($grossLineTotal - $itemDiscountCheck, 2));
        if ($principalCheck < 1) {
            return response()->json([
                'message' => 'Net product amount after discount must be at least ₱1.00.'
            ], 422);
        }

        $downCheck = isset($validated['down_payment']) ? (float) $validated['down_payment'] : 0.0;
        if ($downCheck >= $principalCheck) {
            return response()->json([
                'message' => 'Down payment must be less than the product price for an installment agreement.'
            ], 422);
        }

        return DB::transaction(function () use ($validated, $request, $user, $today, $qty, $grossLineTotal, $itemDiscountCheck, $principalCheck, $hasUnitPrice) {
            $userBranch = $user && $user->employee ? $user->employee->branch_id : null;
            $userBranchName = $userBranch
                ? (\App\Models\BranchProfile::where('id', $userBranch)->value('name') ?: null)
                : null;

            $customerId = $validated['customer_id'] ?? null;
            if (!$customerId) {
                $custCount = (Customer::max('customer_id') ?? 0) + 1;
                $custCode = 'CUS-' . str_pad($custCount, 3, '0', STR_PAD_LEFT);
                while (Customer::where('customer_code', $custCode)->exists()) {
                    $custCount++;
                    $custCode = 'CUS-' . str_pad($custCount, 3, '0', STR_PAD_LEFT);
                }
                $customer = Customer::create([
                    'customer_code' => $custCode,
                    'first_name' => $validated['first_name'],
                    'last_name' => $validated['last_name'],
                    'phone' => $validated['phone'] ?? '',
                    'email' => $validated['email'] ?? '',
                    'address' => $validated['address'] ?? '',
                    'branch_id' => $userBranch,
                    'branch' => $userBranchName,
                    'allow_installment' => true,
                    'status' => 'Active',
                ]);
                $customerId = $customer->customer_id;
            } else {
                $customer = Customer::findOrFail($customerId);
                if ($user && in_array($user->role, ['Store Administrator', 'Store Admin'], true) && $userBranch && $customer->branch_id && (int) $customer->branch_id !== (int) $userBranch) {
                    return response()->json([
                        'message' => 'Unauthorized: Selected customer belongs to another branch.'
                    ], 403);
                }
                if (!empty($validated['phone']) || !empty($validated['address']) || !empty($validated['email'])) {
                    $customer->update(array_filter([
                        'phone' => $validated['phone'] ?? null,
                        'address' => $validated['address'] ?? null,
                        'email' => $validated['email'] ?? null,
                    ]));
                }
            }

            $principal = $principalCheck;
            $unitPrice = $hasUnitPrice
                ? round((float) $validated['unit_price'], 2)
                : round($grossLineTotal / $qty, 2);
            $downPayment = isset($validated['down_payment']) ? (float)$validated['down_payment'] : 0.00;
            $interestRate = isset($validated['interest_rate']) ? (float)$validated['interest_rate'] : 0.00;
            $financedBase = max(0, $principal - $downPayment);
            $interestAmount = round($financedBase * ($interestRate / 100), 2);
            $totalPayable = round($principal + $interestAmount, 2);
            $rawNumInstallments = (int)$validated['number_of_installments'];
            $isOpenContract = filter_var($validated['is_open_contract'] ?? false, FILTER_VALIDATE_BOOLEAN)
                || strtolower(trim((string) ($validated['frequency'] ?? ''))) === 'open contract'
                || $rawNumInstallments === 0;
            $numInstallments = $isOpenContract ? 0 : max(1, $rawNumInstallments);
            $frequency = $isOpenContract ? 'Open Contract' : ($validated['frequency'] ?? 'Monthly');
            $startDate = $validated['start_date'] ?? $today;
            $status = $validated['status'] ?? 'Active';
            $notes = $validated['notes'] ?? '';
            $installmentAmount = (!$isOpenContract && $numInstallments > 0)
                ? round(max(0, $totalPayable - $downPayment) / $numInstallments, 2)
                : 0.00;

            $effectiveBranchId = $customer->branch_id ?? $userBranch;
            $agentSelection = AgentContributionService::resolveAgentSelection(
                $request->all(),
                $user,
                $effectiveBranchId ? (int) $effectiveBranchId : null
            );
            $hasAgent = $agentSelection['has_agent'];

            $productId = $validated['product_id'] ?? null;
            $product = null;
            if ($productId) {
                $product = Product::lockForUpdate()->find($productId);
                if ($user && in_array($user->role, ['Store Administrator', 'Store Admin'], true)) {
                    if ($product && $product->branch_id && (int) $product->branch_id !== (int) $userBranch) {
                        return response()->json([
                            'message' => "Unauthorized: Product does not belong to your branch."
                        ], 403);
                    }
                }
            }

            $resolvedCategory = ($product?->category) ?: ($validated['product_category'] ?? null);
            $lineContrib = AgentContributionService::calculateLine($principal, $resolvedCategory, $hasAgent);
            if ($hasAgent && $lineContrib['category_domain'] === null) {
                throw ValidationException::withMessages([
                    'product_category' => ['Please select an Appliances or Furniture category to calculate agent contribution.'],
                ]);
            }
            $contribSummary = AgentContributionService::summarize([$lineContrib], $hasAgent);

            $saleCount = (SaleTransaction::max('sale_id') ?? 0) + 1;
            $invoiceNo = 'INV-' . date('Y') . '-' . str_pad($saleCount, 5, '0', STR_PAD_LEFT);
            while (SaleTransaction::where('invoice_no', $invoiceNo)->exists()) {
                $saleCount++;
                $invoiceNo = 'INV-' . date('Y') . '-' . str_pad($saleCount, 5, '0', STR_PAD_LEFT);
            }

            $sale = SaleTransaction::create([
                'invoice_no' => $invoiceNo,
                'customer_id' => $customerId,
                'branch_id' => $effectiveBranchId,
                'processed_by' => $user ? $user->user_id : ($request->input('user_id') && \App\Models\User::where('user_id', $request->input('user_id'))->exists() ? $request->input('user_id') : \App\Models\User::value('user_id')),
                'has_agent' => $hasAgent,
                'agent_id' => $agentSelection['agent_id'],
                'appliances_agent_contribution' => $contribSummary['appliances_agent_contribution'],
                'furniture_agent_contribution' => $contribSummary['furniture_agent_contribution'],
                'total_agent_contribution' => $contribSummary['total_agent_contribution'],
                'sale_date' => $startDate . ' ' . date('H:i:s'),
                'payment_method' => (!$isOpenContract && $numInstallments === 0) ? 'Cash' : 'Installment',
                'subtotal' => $grossLineTotal,
                'discount_amount' => $itemDiscountCheck,
                'total_amount' => $totalPayable,
                'amount_paid' => $downPayment,
                'balance_due' => max(0, $totalPayable - $downPayment),
                'status' => ($downPayment >= $totalPayable) ? 'completed' : 'partially_paid',
                'notes' => $isOpenContract
                    ? trim('Open Contract installment agreement (Flexible term). ' . $notes)
                    : ($numInstallments === 0 ? "Full Cash Payment. " . $notes : "Installment financing agreement ({$numInstallments} {$frequency} terms). " . $notes),
            ]);

            $targetProductId = $product ? $product->product_id : Product::value('product_id');
            if ($targetProductId) {
                SaleItem::create([
                    'sale_id' => $sale->sale_id,
                    'product_id' => $targetProductId,
                    'quantity' => $qty,
                    'unit_price' => $unitPrice,
                    'discount_amount' => $itemDiscountCheck,
                    'line_total' => $principal,
                    'category_domain' => $lineContrib['category_domain'],
                    'agent_commission_rate' => $lineContrib['agent_commission_rate'],
                    'agent_contribution' => $lineContrib['agent_contribution'],
                ]);
                if ($product && $product->stock_quantity > 0) {
                    $product->decrement('stock_quantity', min($product->stock_quantity, $qty));
                }
            }

            $accountCount = (InstallmentAccount::max('installment_id') ?? 0) + 1;
            $accountNo = 'ACC-' . date('Y') . '-' . str_pad($accountCount, 5, '0', STR_PAD_LEFT);
            while (InstallmentAccount::where('account_no', $accountNo)->exists()) {
                $accountCount++;
                $accountNo = 'ACC-' . date('Y') . '-' . str_pad($accountCount, 5, '0', STR_PAD_LEFT);
            }

            $account = InstallmentAccount::create([
                'account_no' => $accountNo,
                'customer_id' => $customerId,
                'sale_id' => $sale->sale_id,
                'has_agent' => $hasAgent,
                'agent_id' => $agentSelection['agent_id'],
                'appliances_agent_contribution' => $contribSummary['appliances_agent_contribution'],
                'furniture_agent_contribution' => $contribSummary['furniture_agent_contribution'],
                'total_agent_contribution' => $contribSummary['total_agent_contribution'],
                'start_date' => $startDate,
                'principal_amount' => $principal,
                'down_payment' => $downPayment,
                'interest_rate' => $interestRate,
                'interest_amount' => $interestAmount,
                'total_payable' => $totalPayable,
                'installment_amount' => $installmentAmount,
                'number_of_installments' => $numInstallments,
                'frequency' => $frequency,
                'status' => $status,
                'notes' => $notes,
            ]);

            // 5. Generate Payment Schedule entries
            $firstDueDate = $validated['due_date'] ?? date('Y-m-d', strtotime($startDate . ' +1 month'));
            for ($i = 1; $i <= $numInstallments; $i++) {
                if ($i === 1) {
                    $schedDueDate = $firstDueDate;
                } elseif ($frequency === 'Weekly') {
                    $schedDueDate = date('Y-m-d', strtotime($firstDueDate . ' +' . (($i - 1) * 7) . ' days'));
                } elseif ($frequency === 'Bi-weekly' || $frequency === 'Biweekly') {
                    $schedDueDate = date('Y-m-d', strtotime($firstDueDate . ' +' . (($i - 1) * 14) . ' days'));
                } else {
                    $schedDueDate = date('Y-m-d', strtotime($firstDueDate . ' +' . ($i - 1) . ' months'));
                }

                PaymentSchedule::create([
                    'installment_id' => $account->installment_id,
                    'installment_no' => $i,
                    'due_date' => $schedDueDate,
                    'amount_due' => $installmentAmount,
                    'amount_paid' => 0.00,
                    'balance_due' => $installmentAmount,
                    'status' => 'Pending',
                ]);
            }

            // 6. Record Down Payment Receipt if paid upfront
            if ($downPayment > 0) {
                $payCount = (Payment::max('payment_id') ?? 0) + 1;
                $receiptNo = 'REC-' . date('Y') . '-' . str_pad($payCount, 5, '0', STR_PAD_LEFT);
                while (Payment::where('receipt_no', $receiptNo)->exists()) {
                    $payCount++;
                    $receiptNo = 'REC-' . date('Y') . '-' . str_pad($payCount, 5, '0', STR_PAD_LEFT);
                }

                Payment::create([
                    'installment_id' => $account->installment_id,
                    'schedule_id' => null,
                    'receipt_no' => $receiptNo,
                    'payment_date' => $startDate,
                    'amount' => $downPayment,
                    'payment_method' => 'Cash',
                    'reference_no' => 'DOWNPAYMENT-' . $accountNo,
                    'received_by' => $user ? $user->user_id : User::value('user_id'),
                    'status' => 'Completed',
                    'notes' => 'Initial down payment collected upon account activation',
                    'created_at' => now(),
                ]);
            }

            // 7. System Audit Log
            $custFullName = trim("{$customer->first_name} {$customer->last_name}");
            SystemLog::create([
                'user_id' => $user ? $user->user_id : $request->input('user_id'),
                'action' => 'CREATE',
                'module' => 'Installments',
                'description' => "Created new customer installment {$accountNo} for {$custFullName} (Total: ₱" . number_format($totalPayable, 2) . ", Down: ₱" . number_format($downPayment, 2) . ", " . ($isOpenContract ? 'Open Contract' : "{$numInstallments} Mos") . ")",
                'ip_address' => $request->ip(),
                'user_agent' => $request->userAgent(),
            ]);

            // 8. Notification
            NotificationService::sendToAdmins([
                'type' => 'installment_created',
                'title' => 'New Installment Created',
                'message' => "Account {$accountNo} created for {$custFullName} — ₱" . number_format($totalPayable, 2) . " ({$numInstallments} {$frequency} terms).",
                'module' => 'Installments',
                'related_id' => $account->installment_id,
                'related_type' => 'App\Models\InstallmentAccount',
                'action_url' => "/installments?id={$account->installment_id}",
                'priority' => 'normal',
            ]);

            Cache::increment('pace_inst_cache_v');
            Cache::increment('pace_sales_cache_v');
            SyncController::invalidateFingerprint(['installments', 'sales', 'payments', 'products', 'customers']);

            $account->load([
                'customer',
                'customer.branch:id,name',
                'agent:employee_id,employee_code,first_name,last_name,position',
                'sale.branch:id,name',
                'sale.agent:employee_id,employee_code,first_name,last_name,position',
                'sale.processedBy.employee',
                'sale.processedBy.employee.branch:id,name',
                'sale.items.product',
                'payments',
                'paymentSchedules'
            ]);

            $formatted = $this->formatAccount($account, $today);
            $resolvedBranchId = $formatted['branch_id'] ?? ($account->sale?->branch_id ?? $customer->branch_id ?? null);

            \App\Services\RealtimeBroadcaster::dispatch(new \App\Events\InstallmentContractCreated([
                'installment_id' => $account->installment_id,
                'account_no' => $accountNo,
                'customer_name' => $custFullName,
                'total_payable' => (float) $totalPayable,
                'status' => $account->status,
                'actor_user_id' => $user ? (int) $user->user_id : null,
                'toast_title' => 'New Installment Contract',
                'toast_message' => "Account {$accountNo} created for {$custFullName} (₱" . number_format($totalPayable, 2) . ").",
            ], $resolvedBranchId ? (int) $resolvedBranchId : null, $account->customer_id ? (int) $account->customer_id : null));

            if (!empty($product)) {
                \App\Services\RealtimeBroadcaster::dispatch(new \App\Events\InventoryStockUpdated([
                    'product_id' => $product->product_id ?? null,
                    'action' => 'stock_decremented',
                    'actor_user_id' => $user ? (int) $user->user_id : null,
                ], $resolvedBranchId ? [(int) $resolvedBranchId] : []));
            }

            return response()->json([
                'message' => "Customer Installment {$accountNo} created successfully",
                'account' => $formatted,
            ], 201);
        });
    }

    /**
     * Dedicated Overdue Installment Monitoring endpoint.
     */
    public function overdue(Request $request)
    {
        $user = $request->user();
        $today = date('Y-m-d');

        PaymentSchedule::where('due_date', '<', $today)
            ->where('balance_due', '>', 0)
            ->whereIn('status', ['Pending', 'Partially Paid'])
            ->whereHas('installmentAccount', function ($q) {
                $q->whereNotIn('status', InstallmentAccount::COMPLETED_STATUSES);
            })
            ->update(['status' => 'Overdue']);

        $query = InstallmentAccount::with([
            'customer',
            'customer.branch:id,name',
            'sale.branch:id,name',
            'sale.processedBy.employee',
            'sale.processedBy.employee.branch:id,name',
            'sale.items.product',
            'payments',
            'paymentSchedules' => function ($q) use ($today) {
                $q->where('due_date', '<', $today)->where('balance_due', '>', 0)->orderBy('due_date');
            }
        ])->whereNotIn('status', InstallmentAccount::COMPLETED_STATUSES)
            ->whereHas('paymentSchedules', function ($q) use ($today) {
                $q->where('due_date', '<', $today)->where('balance_due', '>', 0);
            });

        $this->applyBranchFilter($query, $user, $request->query('branch'));

        if ($request->filled('search')) {
            $s = trim($request->query('search'));
            $query->where(function ($q) use ($s) {
                $q->where('account_no', 'like', "%{$s}%")
                  ->orWhereHas('customer', function ($cq) use ($s) {
                      $cq->where('first_name', 'like', "%{$s}%")
                         ->orWhere('last_name', 'like', "%{$s}%")
                         ->orWhere('customer_code', 'like', "%{$s}%")
                         ->orWhere('phone', 'like', "%{$s}%");
                  });
            });
        }

        $overdueList = $query->get()->map(function ($inst) use ($today) {
            $fin = $this->computeFinancials($inst);
            $balance = $fin['balance'];
            $branchInfo = $this->resolveBranchInfo($inst);

            $earliestOverdue = $inst->paymentSchedules->first();
            $dueTime = $earliestOverdue ? strtotime($earliestOverdue->due_date) : strtotime($today);
            $nowTime = strtotime($today);
            $daysOverdue = max(1, (int)(($nowTime - $dueTime) / 86400));

            $totalOverdueAmount = (float)$inst->paymentSchedules->sum('balance_due');

            $productName = 'Appliance / Furniture';
            if ($inst->sale && $inst->sale->items && $inst->sale->items->isNotEmpty()) {
                $firstItem = $inst->sale->items->first();
                $productName = $firstItem->product ? $firstItem->product->product_name : 'Appliance / Furniture';
                if ($inst->sale->items->count() > 1) {
                    $productName .= ' (+' . ($inst->sale->items->count() - 1) . ' more)';
                }
            }

            return [
                'installment_id' => $inst->installment_id,
                'account_no' => $inst->account_no,
                'customer_code' => $inst->customer ? ($inst->customer->customer_code ?: '') : '',
                'customer_name' => $inst->customer ? trim("{$inst->customer->first_name} {$inst->customer->last_name}") : 'Customer',
                'customer_phone' => $inst->customer ? $inst->customer->phone : '—',
                'customer_address' => $inst->customer ? $inst->customer->address : '—',
                'product_name' => $productName,
                'branch_id' => $branchInfo['branch_id'],
                'branch' => $branchInfo['branch_name'],
                'branch_name' => $branchInfo['branch_name'],
                'due_date' => $earliestOverdue ? $earliestOverdue->due_date : $today,
                'amount_due' => $earliestOverdue ? (float)$earliestOverdue->amount_due : 0,
                'amount_paid' => $earliestOverdue ? (float)$earliestOverdue->amount_paid : 0,
                'overdue_balance' => $totalOverdueAmount,
                'total_payable' => (float)$inst->total_payable,
                'paid' => $fin['paid'],
                'total_outstanding' => $balance,
                'pending_payments_amount' => $fin['pending_amount'],
                'pending_payments_count' => $fin['pending_count'],
                'days_overdue' => $daysOverdue,
                'status' => 'Overdue',
            ];
        })->sortByDesc('days_overdue')->values();

        $totalOverdueSum = (float)$overdueList->sum('overdue_balance');

        return response()->json([
            'overdue_accounts' => $overdueList,
            'total_count' => $overdueList->count(),
            'total_overdue_amount' => $totalOverdueSum,
        ]);
    }

    /**
     * Show single installment with purchase details, items, schedules, and payment history.
     */
    public function show(Request $request, $id)
    {
        $user = $request->user();
        $today = date('Y-m-d');

        $relations = [
            'customer',
            'customer.branch:id,name',
            'agent:employee_id,employee_code,first_name,last_name,position',
            'completedVerifiedBy.employee',
            'sale.branch:id,name',
            'sale.agent:employee_id,employee_code,first_name,last_name,position',
            'sale.processedBy.employee',
            'sale.processedBy.employee.branch:id,name',
            'sale.items.product',
            'paymentSchedules' => function ($q) {
                $q->orderBy('installment_no');
            },
            'payments' => function ($q) {
                $q->orderByDesc('payment_date')->orderByDesc('payment_id');
            },
            'payments.receivedBy.employee',
            'payments.confirmedBy.employee',
            'payments.collector.employee',
        ];

        $account = InstallmentAccount::with($relations)->find($id);

        // Fallback 1: check if ID is actually a sale_id
        if (!$account && is_numeric($id)) {
            $account = InstallmentAccount::with($relations)->where('sale_id', $id)->first();
        }

        // Fallback 2: check if ID matches account_no
        if (!$account) {
            $account = InstallmentAccount::with($relations)->where('account_no', $id)->first();
        }

        // Fallback 3: check if ID was referenced in notifications (e.g., replaced or migrated account)
        if (!$account && is_numeric($id)) {
            $notification = \App\Models\Notification::where('related_type', 'App\\Models\\InstallmentAccount')
                ->where('related_id', (string)$id)
                ->first();
            if ($notification) {
                $notifText = $notification->message ?? '';
                if (preg_match('/ACC-\d{4}-\d+/', $notifText, $matches)) {
                    $account = InstallmentAccount::with($relations)->where('account_no', $matches[0])->first();
                }
            }
        }

        if (!$account) {
            return response()->json([
                'success' => false,
                'message' => "Installment account #{$id} was not found or has been removed.",
                'account' => null,
            ], 404);
        }

        // Security check for Customer
        if ($user && $user->role === 'Customer') {
            $customerId = $user->customer_id ?? ($user->customer ? $user->customer->customer_id : null);
            if (!$customerId) {
                $cust = Customer::where('email', $user->username)->first();
                $customerId = $cust ? $cust->customer_id : null;
            }
            if ($account->customer_id != $customerId) {
                return response()->json(['message' => 'Unauthorized access to installment.'], 403);
            }
        }

        // Security check for Store Administrator
        $branchInfo = $this->resolveBranchInfo($account);
        if ($user && in_array($user->role, ['Store Administrator', 'Store Admin'])) {
            $userBranch = $user->employee ? (int) $user->employee->branch_id : null;
            if (!$userBranch || $userBranch !== $branchInfo['branch_id']) {
                return response()->json(['message' => 'Unauthorized access to installment in another branch.'], 403);
            }
        }

        $fin = $this->computeFinancials($account);
        $paid = $fin['paid'];
        $totalPayable = (float)$account->total_payable;
        $balance = $fin['balance'];

        // Branch and Store Admin
        $branch = $branchInfo['branch_name'];
        $storeAdmin = 'System/Admin';

        if ($account->sale && $account->sale->processedBy) {
            $adminUser = $account->sale->processedBy;
            $storeAdmin = $adminUser->employee
                ? trim("{$adminUser->employee->first_name} {$adminUser->employee->last_name}")
                : $adminUser->username;
        }

        // Sale Items
        $saleItems = [];
        if ($account->sale && $account->sale->items) {
            $saleItems = $account->sale->items->map(function ($item) {
                return [
                    'product_id' => $item->product_id,
                    'product_code' => $item->product ? $item->product->product_code : 'SKU',
                    'product_name' => $item->product ? $item->product->product_name : 'Product',
                    'description' => $item->product ? $item->product->description : '',
                    'image_url' => $item->product && $item->product->image_url ? $item->product->image_url : null,
                    'category' => $item->product ? $item->product->category : '',
                    'category_domain' => $item->category_domain ?: AgentContributionService::resolveCategoryDomain($item->product?->category),
                    'agent_commission_rate' => (float) ($item->agent_commission_rate ?? 0),
                    'agent_contribution' => (float) ($item->agent_contribution ?? 0),
                    'quantity' => (float)$item->quantity,
                    'unit_price' => (float)$item->unit_price,
                    'discount_amount' => (float)$item->discount_amount,
                    'line_total' => (float)$item->line_total,
                ];
            });
        }

        // Payment Schedules
        $schedules = $account->paymentSchedules->map(function ($s) use ($today, $balance) {
            $schedBalanceDue = (float)$s->balance_due;
            $schedStatus = $s->status;

            if ($balance <= 0) {
                $schedBalanceDue = 0;
                $schedStatus = 'Paid';
            } elseif ($schedBalanceDue <= 0) {
                $schedStatus = 'Paid';
            } elseif ($s->due_date < $today && $schedBalanceDue > 0) {
                $schedStatus = 'Overdue';
            } elseif ($s->due_date == $today && $schedBalanceDue > 0) {
                $schedStatus = 'Due';
            } elseif ($s->due_date > $today && (float)$s->amount_paid == 0) {
                $schedStatus = 'Upcoming';
            }

            return [
                'schedule_id' => $s->schedule_id,
                'installment_id' => $s->installment_id,
                'installment_no' => $s->installment_no,
                'due_date' => $s->due_date,
                'amount_due' => (float)$s->amount_due,
                'amount_paid' => $balance <= 0 ? (float)$s->amount_due : (float)$s->amount_paid,
                'balance_due' => $schedBalanceDue,
                'status' => $schedStatus,
                'paid_date' => $s->paid_date,
                'notes' => $s->notes,
            ];
        });

        // Next Payment
        $nextSchedule = $schedules->firstWhere('balance_due', '>', 0);

        // Payments History
        $payments = $account->payments->map(function ($p) {
            $actualStatus = $p->status ?: 'Completed';
            $receivedName = $p->receivedBy
                ? ($p->receivedBy->employee
                    ? trim("{$p->receivedBy->employee->first_name} {$p->receivedBy->employee->last_name}")
                    : $p->receivedBy->username)
                : ($actualStatus === 'Pending' ? 'Awaiting Verification' : 'Staff');

            return [
                'payment_id' => $p->payment_id,
                'installment_id' => $p->installment_id,
                'schedule_id' => $p->schedule_id,
                'receipt_no' => $p->receipt_no,
                'payment_date' => $p->payment_date,
                'amount' => (float)$p->amount,
                'payment_method' => $p->payment_method,
                'reference_no' => $p->reference_no,
                'received_by' => $receivedName,
                'status' => $actualStatus,
                'proof_of_payment' => $p->proof_of_payment ? asset('storage/' . $p->proof_of_payment) : null,
                'notes' => $p->notes,
            ];
        });

        $isFullyPaid = $account->isFullyPaid() || $balance <= 0.0;
        if ($isFullyPaid) {
            $balance = 0.0;
        }
        $paidTermsCount = $isFullyPaid ? max((int) $account->number_of_installments, $schedules->count()) : $schedules->where('balance_due', '<=', 0)->count();
        $totalTermsCount = max((int) $account->number_of_installments, $schedules->count());

        $verifierUser = $account->completedVerifiedBy;
        if ($isFullyPaid && !$verifierUser) {
            $lastSettled = $account->payments
                ->filter(fn ($p) => Payment::isSettledStatus($p->status))
                ->sortByDesc('payment_id')
                ->first();
            $verifierUser = $lastSettled?->confirmedBy ?: $lastSettled?->receivedBy;
        }
        $finalVerifierName = $verifierUser
            ? ($verifierUser->employee
                ? trim("{$verifierUser->employee->first_name} {$verifierUser->employee->last_name}")
                : $verifierUser->username)
            : null;
        $finalVerifierRole = $verifierUser?->role ?: null;

        return response()->json([
            'account' => [
                'installment_id' => $account->installment_id,
                'account_no' => $account->account_no,
                'customer_id' => $account->customer_id,
                'customer_code' => $account->customer ? ($account->customer->customer_code ?: '') : '',
                'customer_name' => $account->customer ? trim("{$account->customer->first_name} {$account->customer->last_name}") : 'Customer',
                'customer_phone' => $account->customer ? $account->customer->phone : '—',
                'customer_email' => $account->customer ? $account->customer->email : '—',
                'customer_address' => $account->customer ? $account->customer->address : '—',
                'branch_id' => $branchInfo['branch_id'],
                'branch' => $branch,
                'branch_name' => $branch,
                'store_admin' => $storeAdmin,
                'sale_id' => $account->sale_id,
                'invoice_no' => $account->sale ? $account->sale->invoice_no : 'N/A',
                'sale_date' => $account->sale ? $account->sale->sale_date : $account->start_date,
                'has_agent' => (bool) ($account->has_agent ?? $account->sale?->has_agent ?? false),
                'agent_id' => ($account->agent_id ?? $account->sale?->agent_id) ? (int) ($account->agent_id ?? $account->sale?->agent_id) : null,
                'assigned_agent_id' => ($account->agent_id ?? $account->sale?->agent_id) ? (int) ($account->agent_id ?? $account->sale?->agent_id) : null,
                'agent_name' => ($showAgent = $account->agent ?: $account->sale?->agent) ? trim("{$showAgent->first_name} {$showAgent->last_name}") : null,
                'agent_code' => $showAgent?->employee_code ?? null,
                'appliances_agent_contribution' => (float) ($account->appliances_agent_contribution ?? $account->sale?->appliances_agent_contribution ?? 0),
                'furniture_agent_contribution' => (float) ($account->furniture_agent_contribution ?? $account->sale?->furniture_agent_contribution ?? 0),
                'total_agent_contribution' => (float) ($account->total_agent_contribution ?? $account->sale?->total_agent_contribution ?? 0),
                'agent_contribution_status' => ($account->has_agent ?? $account->sale?->has_agent ?? false)
                    ? ($isFullyPaid ? ($account->agent_contribution_status ?: InstallmentAccount::AGENT_CONTRIBUTION_SETTLED) : ($account->agent_contribution_status ?: 'Pending'))
                    : null,
                'start_date' => $account->start_date,
                'principal_amount' => (float) $account->principal_amount,
                'down_payment' => (float) $account->down_payment,
                'financed_amount' => max(0, (float) $account->principal_amount - (float) $account->down_payment),
                'interest_rate' => (float) $account->interest_rate,
                'interest_amount' => (float) $account->interest_amount,
                'total_payable' => $totalPayable,
                'installment_amount' => (float) $account->installment_amount,
                'number_of_installments' => (int) $account->number_of_installments,
                'is_open_contract' => strtolower(trim((string) $account->frequency)) === 'open contract',
                'paid_installments' => $paidTermsCount,
                'total_terms' => $totalTermsCount,
                'frequency' => $account->frequency ?: 'Monthly',
                'paid' => round($paid, 2),
                'balance' => $balance,
                'remaining_balance' => $balance,
                'pending_payments_amount' => $fin['pending_amount'],
                'pending_payments_count' => $fin['pending_count'],
                'progress_percentage' => $isFullyPaid ? 100 : ($totalPayable > 0 ? min(100, round(($paid / $totalPayable) * 100, 1)) : 0),
                'status' => $isFullyPaid ? InstallmentAccount::STATUS_FULLY_PAID : $account->status,
                'completed_at' => $isFullyPaid ? ($account->completed_at ? $account->completed_at->toIso8601String() : ($account->updated_at ? $account->updated_at->toIso8601String() : null)) : null,
                'next_due_date' => $isFullyPaid ? null : ($nextSchedule ? $nextSchedule['due_date'] : null),
                'customer_standing' => $isFullyPaid ? ($account->customer_standing ?: InstallmentAccount::STANDING_CLEARED) : ($account->customer_standing ?: null),
                'final_verifier_name' => $finalVerifierName,
                'final_verifier_role' => $finalVerifierRole,
                'notes' => $account->notes,
            ],
            'next_payment' => (!$isFullyPaid && $nextSchedule) ? [
                'due_date' => $nextSchedule['due_date'],
                'amount_due' => $nextSchedule['balance_due'],
                'status' => $nextSchedule['status'],
                'installment_no' => $nextSchedule['installment_no'],
            ] : null,
            'sale_items' => $saleItems,
            'schedules' => $schedules,
            'payments' => $payments,
        ]);
    }

    public function clearanceDocument(Request $request, $id)
    {
        $user = $request->user();
        if (!$user) {
            return response()->json(['message' => 'Unauthorized.'], 401);
        }

        $relations = [
            'customer',
            'customer.branch:id,name,location,contact_number,email',
            'agent:employee_id,employee_code,first_name,last_name,position',
            'completedVerifiedBy.employee',
            'sale.branch:id,name,location,contact_number,email',
            'sale.agent:employee_id,employee_code,first_name,last_name,position',
            'sale.processedBy.employee',
            'sale.processedBy.employee.branch:id,name,location,contact_number,email',
            'sale.items.product',
            'paymentSchedules' => fn ($q) => $q->orderBy('installment_no'),
            'payments' => fn ($q) => $q->orderBy('payment_date')->orderBy('payment_id'),
            'payments.receivedBy.employee',
            'payments.confirmedBy.employee',
            'payments.collector.employee',
        ];

        $account = InstallmentAccount::with($relations)->find($id)
            ?: InstallmentAccount::with($relations)->where('account_no', $id)->first();

        if (!$account) {
            return response()->json(['message' => 'Installment account not found.'], 404);
        }

        $branchInfo = $this->resolveBranchInfo($account);

        if ($user->role === 'Customer') {
            $customerId = CustomerDashboardController::resolveCustomerId($user);
            if (!$customerId || (int) $account->customer_id !== (int) $customerId) {
                return response()->json(['message' => 'Unauthorized access to clearance document.'], 403);
            }
        } elseif (in_array($user->role, ['Store Administrator', 'Store Admin'], true)) {
            $userBranch = $user->employee?->branch_id ? (int) $user->employee->branch_id : null;
            if (!$userBranch || (int) $branchInfo['branch_id'] !== $userBranch) {
                return response()->json(['message' => 'Unauthorized access to installment in another branch.'], 403);
            }
        } elseif (!in_array($user->role, ['Administrator', 'Admin'], true)) {
            return response()->json(['message' => 'Unauthorized access to clearance document.'], 403);
        }

        $fin = $this->computeFinancials($account);
        $isFullyPaid = $account->isFullyPaid() || $fin['balance'] <= 0.0;
        if (!$isFullyPaid) {
            return response()->json([
                'message' => 'Certificate of Full Payment and Final SOA are only available for Fully Paid installment contracts.',
            ], 422);
        }

        $branchModel = $account->sale?->branch
            ?: $account->customer?->branch
            ?: ($branchInfo['branch_id'] ? \App\Models\BranchProfile::find($branchInfo['branch_id']) : null);

        $settledPayments = $account->payments
            ->filter(fn ($p) => Payment::isSettledStatus($p->status))
            ->sortBy([['payment_date', 'asc'], ['payment_id', 'asc']])
            ->values();

        $ledger = $settledPayments->map(function ($p) {
            $isCollector = $p->cash_channel === 'collector' || !empty($p->collector_id);
            $channelLabel = $isCollector
                ? 'Field Collector'
                : (strtolower((string) $p->payment_method) === 'cash' ? 'Store Cashier' : 'Store Cashier');
            $methodLabel = "{$p->payment_method} ({$channelLabel})";

            $verifier = $p->confirmedBy ?: $p->receivedBy;
            $verifiedByName = $verifier
                ? ($verifier->employee
                    ? trim("{$verifier->employee->first_name} {$verifier->employee->last_name}")
                    : $verifier->username)
                : 'Store Administrator';

            $collectorName = $p->collector
                ? ($p->collector->employee
                    ? trim("{$p->collector->employee->first_name} {$p->collector->employee->last_name}")
                    : $p->collector->username)
                : null;

            return [
                'payment_id' => $p->payment_id,
                'payment_date' => $p->payment_date,
                'reference_no' => $p->reference_no ?: $p->receipt_no,
                'method' => $p->payment_method,
                'channel_label' => $channelLabel,
                'method_display' => $methodLabel,
                'official_receipt_no' => $p->receipt_reference ?: $p->receipt_no,
                'receipt_no' => $p->receipt_no,
                'amount' => round((float) $p->amount, 2),
                'verified_by' => $verifiedByName,
                'collector_name' => $collectorName,
                'status' => $p->status ?: 'Completed',
            ];
        })->values();

        $lastPayment = $settledPayments->last();
        $finalVerifierUser = $account->completedVerifiedBy ?: ($lastPayment?->confirmedBy ?: $lastPayment?->receivedBy);
        $finalVerifierName = $finalVerifierUser
            ? ($finalVerifierUser->employee
                ? trim("{$finalVerifierUser->employee->first_name} {$finalVerifierUser->employee->last_name}")
                : $finalVerifierUser->username)
            : 'Store Administrator';
        $finalVerifierRole = $finalVerifierUser?->role ?: 'Store Administrator';

        $branchStoreAdmin = null;
        if ($branchInfo['branch_id']) {
            $saUser = \App\Models\User::with('employee')
                ->whereIn('role', ['Store Administrator', 'Store Admin'])
                ->whereHas('employee', fn ($q) => $q->where('branch_id', $branchInfo['branch_id']))
                ->orderByDesc('is_active')
                ->first();
            if ($saUser) {
                $branchStoreAdmin = $saUser->employee
                    ? trim("{$saUser->employee->first_name} {$saUser->employee->last_name}")
                    : $saUser->username;
            }
        }

        $items = ($account->sale?->items ?? collect())->map(function ($item) {
            return [
                'product_code' => $item->product?->product_code ?: 'SKU',
                'product_name' => $item->product?->product_name ?: 'Item',
                'category' => $item->product?->category ?: '',
                'quantity' => (int) ($item->quantity ?: 1),
                'unit_price' => round((float) $item->unit_price, 2),
                'line_total' => round((float) $item->line_total, 2),
            ];
        })->values();

        $completedAt = $account->completed_at
            ? $account->completed_at->toIso8601String()
            : ($lastPayment?->confirmed_at
                ? $lastPayment->confirmed_at->toIso8601String()
                : ($lastPayment?->payment_date ?: ($account->updated_at ? $account->updated_at->toIso8601String() : now()->toIso8601String())));

        return response()->json([
            'success' => true,
            'document' => [
                'certificate_no' => 'CERT-' . str_replace('ACC-', '', (string) $account->account_no),
                'soa_no' => 'SOA-' . str_replace('ACC-', '', (string) $account->account_no),
                'issued_at' => now()->toIso8601String(),
                'company' => [
                    'name' => 'Z-LICZ Furniture & Appliances Trading',
                    'branch_name' => $branchModel?->name ?: $branchInfo['branch_name'],
                    'branch_address' => $branchModel?->location ?: '',
                    'branch_contact' => $branchModel?->contact_number ?: '',
                    'branch_email' => $branchModel?->email ?: '',
                ],
                'contract' => [
                    'installment_id' => $account->installment_id,
                    'account_no' => $account->account_no,
                    'invoice_no' => $account->sale?->invoice_no ?: 'N/A',
                    'start_date' => $account->start_date,
                    'completed_at' => $completedAt,
                    'status' => InstallmentAccount::STATUS_FULLY_PAID,
                    'customer_standing' => $account->customer_standing ?: InstallmentAccount::STANDING_CLEARED,
                    'frequency' => $account->frequency ?: 'Monthly',
                    'number_of_installments' => (int) $account->number_of_installments,
                    'principal_amount' => round((float) $account->principal_amount, 2),
                    'down_payment' => round((float) $account->down_payment, 2),
                    'interest_rate' => round((float) $account->interest_rate, 2),
                    'interest_amount' => round((float) $account->interest_amount, 2),
                    'total_contract_price' => round((float) $account->total_payable, 2),
                    'total_paid' => round((float) $fin['paid'], 2),
                    'remaining_balance' => 0.00,
                    'has_agent' => (bool) ($account->has_agent ?? $account->sale?->has_agent ?? false),
                    'agent_name' => ($ag = $account->agent ?: $account->sale?->agent) ? trim("{$ag->first_name} {$ag->last_name}") : null,
                    'agent_contribution_status' => ($account->has_agent ?? $account->sale?->has_agent ?? false)
                        ? ($account->agent_contribution_status ?: InstallmentAccount::AGENT_CONTRIBUTION_SETTLED)
                        : null,
                    'total_agent_contribution' => round((float) ($account->total_agent_contribution ?? 0), 2),
                ],
                'customer' => [
                    'customer_id' => $account->customer_id,
                    'customer_code' => $account->customer?->customer_code ?: '',
                    'full_name' => $account->customer ? trim("{$account->customer->first_name} {$account->customer->last_name}") : 'Customer',
                    'address' => $account->customer?->address ?: '—',
                    'phone' => $account->customer?->phone ?: '—',
                    'email' => $account->customer?->email ?: '—',
                ],
                'items' => $items,
                'ledger' => $ledger,
                'signatory' => [
                    'verified_by_name' => $finalVerifierName,
                    'verified_by_role' => $finalVerifierRole,
                    'store_admin_name' => $branchStoreAdmin ?: $finalVerifierName,
                    'branch_name' => $branchModel?->name ?: $branchInfo['branch_name'],
                ],
            ],
        ]);
    }

    /**
     * Update installment details or status.
     */
    public function update(Request $request, $id)
    {
        $user = $request->user();
        if (!$user || !in_array($user->role, ['Administrator', 'Admin', 'Store Administrator', 'Store Admin'], true)) {
            return response()->json(['message' => 'Unauthorized to update installment accounts.'], 403);
        }

        $account = InstallmentAccount::with(['customer', 'sale.processedBy.employee'])->find($id);
        if (!$account && is_numeric($id)) {
            $account = InstallmentAccount::with(['customer', 'sale.processedBy.employee'])->where('sale_id', $id)->first();
        }
        if (!$account) {
            $account = InstallmentAccount::with(['customer', 'sale.processedBy.employee'])->where('account_no', $id)->first();
        }
        if (!$account) {
            return response()->json([
                'success' => false,
                'message' => "Installment account #{$id} was not found or has been removed."
            ], 404);
        }

        if (in_array($user->role, ['Store Administrator', 'Store Admin'], true)) {
            $userBranch = $user->employee?->branch_id;
            $accountBranch = $account->sale?->branch_id ?? $account->customer?->branch_id ?? $account->sale?->processedBy?->employee?->branch_id;
            if (!$userBranch || !$accountBranch || (int) $userBranch !== (int) $accountBranch) {
                return response()->json(['message' => 'Unauthorized access to installment in another branch.'], 403);
            }
        }

        $validated = $request->validate([
            'status' => 'nullable|string|in:Active,Pending,Overdue,Completed,Cancelled,Defaulted,Repossessed',
            'notes' => 'nullable|string',
            'phone' => 'nullable|string|max:20',
            'address' => 'nullable|string|max:255',
            'installment_amount' => 'nullable|numeric|min:1',
        ]);

        $oldStatus = $account->status;
        if (isset($validated['status'])) {
            $account->status = $validated['status'];
        }
        if (isset($validated['notes'])) {
            $account->notes = $validated['notes'];
        }
        if (isset($validated['installment_amount'])) {
            $account->installment_amount = (float)$validated['installment_amount'];
        }
        $account->save();

        if ($account->customer && (!empty($validated['phone']) || !empty($validated['address']))) {
            $account->customer->update(array_filter([
                'phone' => $validated['phone'] ?? null,
                'address' => $validated['address'] ?? null,
            ]));
        }

        if (isset($validated['status']) && $oldStatus !== 'Active' && $validated['status'] === 'Active') {
            if ($account->customer_id) {
                \App\Services\NotificationService::sendToCustomer($account->customer_id, [
                    'type' => 'installment_approved',
                    'title' => 'Installment Plan Approved',
                    'message' => "Congratulations! Your installment plan for {$account->account_no} has been approved. You can now view your schedule and make payments.",
                    'module' => 'Installments',
                    'related_id' => $account->installment_id,
                    'related_type' => 'App\Models\InstallmentAccount',
                    'action_url' => "/installments?id={$account->installment_id}",
                    'priority' => 'high',
                ]);
            }
        }

        SystemLog::create([
            'user_id' => $user ? $user->user_id : $request->input('user_id'),
            'action' => 'UPDATE',
            'module' => 'Installments',
            'description' => "Updated installment {$account->account_no} (Status: {$account->status})",
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
        ]);

        $account->load([
            'customer',
            'customer.branch:id,name',
            'sale.branch:id,name',
            'sale.processedBy.employee',
            'sale.processedBy.employee.branch:id,name',
            'sale.items.product',
            'payments',
            'paymentSchedules'
        ]);

        SyncController::invalidateFingerprint(['installments', 'sales', 'payments', 'customers']);

        $updBranchId = $account->sale?->branch_id ?? $account->customer?->branch_id ?? null;
        \App\Services\RealtimeBroadcaster::dispatch(new \App\Events\InstallmentScheduleUpdated([
            'installment_id' => $account->installment_id,
            'account_no' => $account->account_no,
            'status' => $account->status,
            'actor_user_id' => $user ? (int) $user->user_id : null,
            'toast_title' => 'Installment Updated',
            'toast_message' => "Installment {$account->account_no} status updated to {$account->status}.",
        ], $updBranchId ? (int) $updBranchId : null, $account->customer_id ? (int) $account->customer_id : null));

        return response()->json([
            'message' => "Installment {$account->account_no} updated successfully",
            'account' => $this->formatAccount($account, date('Y-m-d')),
        ]);
    }

    /**
     * Delete an installment and its associated schedules/payments safely.
     */
    public function destroy(Request $request, $id)
    {
        $user = $request->user();
        if (!$user || !in_array($user->role, ['Administrator', 'Admin', 'Store Administrator', 'Store Admin'], true)) {
            return response()->json(['message' => 'Unauthorized. Only administrators can delete installments.'], 403);
        }

        $account = InstallmentAccount::with(['customer', 'sale.processedBy.employee', 'payments', 'paymentSchedules'])->find($id);
        if (!$account && is_numeric($id)) {
            $account = InstallmentAccount::with(['customer', 'sale.processedBy.employee', 'payments', 'paymentSchedules'])->where('sale_id', $id)->first();
        }
        if (!$account) {
            $account = InstallmentAccount::with(['customer', 'sale.processedBy.employee', 'payments', 'paymentSchedules'])->where('account_no', $id)->first();
        }
        if (!$account) {
            return response()->json([
                'success' => false,
                'message' => "Installment account #{$id} was not found or has been removed."
            ], 404);
        }

        if (in_array($user->role, ['Store Administrator', 'Store Admin'], true)) {
            $userBranch = $user->employee?->branch_id;
            $accountBranch = $account->sale?->branch_id ?? $account->customer?->branch_id ?? $account->sale?->processedBy?->employee?->branch_id;
            if (!$userBranch || !$accountBranch || (int) $userBranch !== (int) $accountBranch) {
                return response()->json(['message' => 'Unauthorized access to installment in another branch.'], 403);
            }
        }

        return DB::transaction(function () use ($account, $user, $request) {
            $accountNo = $account->account_no;

            // Delete payments
            Payment::where('installment_id', $account->installment_id)->delete();

            // Delete payment schedules
            PaymentSchedule::where('installment_id', $account->installment_id)->delete();

            // Delete associated sale items & transaction if created for this installment
            if ($account->sale_id) {
                $saleItems = SaleItem::where('sale_id', $account->sale_id)->get();
                foreach($saleItems as $item) {
                    $product = \App\Models\Product::find($item->product_id);
                    if ($product) {
                        $product->stock_quantity += $item->quantity;
                        $product->save();
                    }
                }
                SaleItem::where('sale_id', $account->sale_id)->delete();
                SaleTransaction::where('sale_id', $account->sale_id)->delete();
            }

            // Delete account
            $account->delete();

            SystemLog::create([
                'user_id' => $user ? $user->user_id : $request->input('user_id'),
                'action' => 'DELETE',
                'module' => 'Installments',
                'description' => "Deleted installment {$accountNo}",
                'ip_address' => $request->ip(),
                'user_agent' => $request->userAgent(),
            ]);

            SyncController::invalidateFingerprint(['installments', 'sales', 'payments', 'products', 'customers']);

            return response()->json([
                'message' => "Installment {$accountNo} deleted successfully",
                'installment_id' => (int)$account->installment_id,
            ]);
        });
    }
}

