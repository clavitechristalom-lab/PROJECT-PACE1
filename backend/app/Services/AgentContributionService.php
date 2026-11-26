<?php

namespace App\Services;

use App\Models\Category;
use App\Models\Employee;
use App\Models\InstallmentAccount;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Validation\ValidationException;

class AgentContributionService
{
    public const APPLIANCES_RATE = 0.12;
    public const FURNITURE_RATE = 0.15;

    public static function resolveCategoryDomain(?string $category): ?string
    {
        $raw = trim((string) $category);
        if ($raw === '') {
            return null;
        }

        $hierarchy = CategoryFramework::resolveHierarchy($raw);
        if (!empty($hierarchy['main_category']) && in_array($hierarchy['main_category'], ['Appliances', 'Furniture'], true)) {
            return $hierarchy['main_category'];
        }

        $lower = strtolower($raw);
        if ($lower === 'appliances' || str_contains($lower, 'appliance')) {
            return 'Appliances';
        }
        if ($lower === 'furniture' || str_contains($lower, 'furniture')) {
            return 'Furniture';
        }

        $dbCat = Category::whereRaw('LOWER(name) = ?', [$lower])
            ->whereIn('main_category', ['Appliances', 'Furniture'])
            ->first(['main_category']);

        if ($dbCat && in_array($dbCat->main_category, ['Appliances', 'Furniture'], true)) {
            return $dbCat->main_category;
        }

        return null;
    }

    public static function rateForDomain(?string $domain): float
    {
        return match ($domain) {
            'Appliances' => self::APPLIANCES_RATE,
            'Furniture' => self::FURNITURE_RATE,
            default => 0.0,
        };
    }

    public static function calculateLine(float $netLineTotal, ?string $category, bool $hasAgent = true): array
    {
        $domain = self::resolveCategoryDomain($category);
        if (!$hasAgent || $netLineTotal <= 0 || $domain === null) {
            return [
                'category_domain' => $domain,
                'agent_commission_rate' => $hasAgent ? round(self::rateForDomain($domain) * 100, 2) : 0.0,
                'agent_contribution' => 0.0,
            ];
        }

        $rate = self::rateForDomain($domain);
        $contribution = round($netLineTotal * $rate, 2);

        return [
            'category_domain' => $domain,
            'agent_commission_rate' => round($rate * 100, 2),
            'agent_contribution' => $contribution,
        ];
    }

    public static function summarize(array $lineCalculations, bool $hasAgent = true): array
    {
        if (!$hasAgent) {
            return [
                'appliances_agent_contribution' => 0.0,
                'furniture_agent_contribution' => 0.0,
                'total_agent_contribution' => 0.0,
            ];
        }

        $appliances = 0.0;
        $furniture = 0.0;

        foreach ($lineCalculations as $line) {
            $amount = round((float) ($line['agent_contribution'] ?? 0), 2);
            if (($line['category_domain'] ?? null) === 'Appliances') {
                $appliances += $amount;
            } elseif (($line['category_domain'] ?? null) === 'Furniture') {
                $furniture += $amount;
            }
        }

        $appliances = round($appliances, 2);
        $furniture = round($furniture, 2);

        return [
            'appliances_agent_contribution' => $appliances,
            'furniture_agent_contribution' => $furniture,
            'total_agent_contribution' => round($appliances + $furniture, 2),
        ];
    }

    public static function eligibleAgentsQuery(?User $actor, ?int $branchId = null): Builder
    {
        $query = Employee::query()
            ->with(['branch:id,name', 'user:user_id,employee_id,role,is_active'])
            ->where(function ($q) {
                $q->where('account_verified', true)
                    ->orWhere('information_verified', true);
            })
            ->where(function ($q) {
                $q->whereNull('status')
                    ->orWhereRaw("LOWER(status) NOT IN ('terminated', 'resigned', 'suspended', 'archived', 'disabled')");
            })
            ->whereNotNull('branch_id')
            ->where(function ($q) {
                $q->whereNull('position')
                    ->orWhere(function ($posQ) {
                        $posQ->where('position', 'NOT LIKE', '%System Administrator%')
                            ->where('position', 'NOT LIKE', '%Main Administrator%')
                            ->where('position', '!=', 'Administrator');
                    });
            })
            ->whereDoesntHave('user', function ($uq) {
                $uq->where('role', 'Administrator');
            });

        if ($actor && $actor->role !== 'Administrator') {
            $actor->loadMissing('employee');
            $actorBranchId = $actor->employee ? (int) $actor->employee->branch_id : -1;
            $query->where('branch_id', $actorBranchId > 0 ? $actorBranchId : -1);
        } elseif ($branchId !== null && $branchId > 0) {
            $query->where('branch_id', $branchId);
        }

        return $query->orderByRaw("
            CASE
                WHEN LOWER(COALESCE(position, '')) LIKE '%sales agent%' THEN 0
                WHEN LOWER(COALESCE(position, '')) LIKE '%cashier%' THEN 1
                WHEN LOWER(COALESCE(position, '')) LIKE '%collector%' THEN 2
                ELSE 3
            END ASC
        ")->orderBy('first_name')->orderBy('last_name');
    }

    public static function formatAgent(Employee $employee): array
    {
        $fullName = trim($employee->first_name . ' ' . $employee->last_name);
        return [
            'employee_id' => (int) $employee->employee_id,
            'agent_id' => (int) $employee->employee_id,
            'employee_code' => $employee->employee_code,
            'first_name' => $employee->first_name,
            'last_name' => $employee->last_name,
            'full_name' => $fullName,
            'position' => $employee->position,
            'department' => $employee->department,
            'branch_id' => $employee->branch_id ? (int) $employee->branch_id : null,
            'branch_name' => $employee->branch_name,
            'status' => $employee->status,
            'is_online' => $employee->user ? (bool) $employee->user->is_active : false,
        ];
    }

    public static function resolveAgentSelection(array $payload, ?User $actor, ?int $targetBranchId = null): array
    {
        $hasAgent = filter_var($payload['has_agent'] ?? false, FILTER_VALIDATE_BOOLEAN);

        if (!$hasAgent) {
            return [
                'has_agent' => false,
                'agent_id' => null,
                'agent' => null,
            ];
        }

        $rawAgentId = $payload['assigned_agent_id'] ?? ($payload['agent_id'] ?? null);
        if (empty($rawAgentId) || !is_numeric($rawAgentId) || (int) $rawAgentId <= 0) {
            return [
                'has_agent' => true,
                'agent_id' => null,
                'agent' => null,
            ];
        }

        $agentId = (int) $rawAgentId;
        $agent = self::eligibleAgentsQuery($actor, $targetBranchId)
            ->where('employees.employee_id', $agentId)
            ->first();

        if (!$agent) {
            $exists = Employee::find($agentId);
            if ($exists && $targetBranchId && (int) $exists->branch_id !== (int) $targetBranchId) {
                throw ValidationException::withMessages([
                    'agent_id' => ['The selected sales agent does not belong to the transaction branch.'],
                ]);
            }

            throw ValidationException::withMessages([
                'agent_id' => ['The selected sales agent is inactive, unverified, or not eligible for sales assignment.'],
            ]);
        }

        return [
            'has_agent' => true,
            'agent_id' => (int) $agent->employee_id,
            'agent' => $agent,
        ];
    }

    public static function calculateInstallmentPaymentContribution(InstallmentAccount $inst, float $payAmount, bool $hasAgent = true): array
    {
        if (!$hasAgent || $payAmount <= 0) {
            return [
                'appliances_agent_contribution' => 0.0,
                'furniture_agent_contribution' => 0.0,
                'total_agent_contribution' => 0.0,
            ];
        }

        $inst->loadMissing(['sale.items.product']);
        $items = $inst->sale?->items ?? collect();

        $appWeight = 0.0;
        $furnWeight = 0.0;

        foreach ($items as $item) {
            $domain = $item->category_domain ?: self::resolveCategoryDomain($item->product?->category);
            $weight = max(0.0, (float) $item->line_total);
            if ($weight <= 0) {
                $weight = max(0.0, (float) $item->unit_price * max(1, (float) $item->quantity));
            }
            if ($domain === 'Appliances') {
                $appWeight += $weight;
            } elseif ($domain === 'Furniture') {
                $furnWeight += $weight;
            }
        }

        $totalWeight = $appWeight + $furnWeight;
        if ($totalWeight <= 0) {
            return [
                'appliances_agent_contribution' => 0.0,
                'furniture_agent_contribution' => 0.0,
                'total_agent_contribution' => 0.0,
            ];
        }

        $appShare = round($payAmount * ($appWeight / $totalWeight), 2);
        $furnShare = round(max(0.0, $payAmount - $appShare), 2);

        $appLine = self::calculateLine($appShare, 'Appliances', true);
        $furnLine = self::calculateLine($furnShare, 'Furniture', true);

        return self::summarize([$appLine, $furnLine], true);
    }
}
