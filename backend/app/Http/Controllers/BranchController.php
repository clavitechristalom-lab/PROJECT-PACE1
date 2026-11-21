<?php

namespace App\Http\Controllers;

use App\Models\BranchProfile;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class BranchController extends Controller
{
    /**
     * Display a listing of the resource.
     */
    public function index()
    {
        $managers = \App\Models\User::where('role', 'Store Administrator')
            ->with('employee:employee_id,first_name,middle_name,last_name,phone,email,branch_id')
            ->get();

        $managersByBranch = $managers
            ->filter(fn($u) => $u->employee && $u->employee->branch_id)
            ->keyBy(fn($u) => $u->employee->branch_id);

        $managersById = $managers->keyBy('user_id');

        $globalProductCount = \App\Models\Product::whereNull('branch_id')->count();

        $branches = BranchProfile::withCount(['employees', 'customers', 'products', 'sales'])
            ->get()
            ->map(function ($branch) use ($managersByBranch, $managersById, $globalProductCount) {
                $managerUser = $managersByBranch->get($branch->id)
                    ?? ($branch->manager_id ? $managersById->get($branch->manager_id) : null);

                $fullName = null;
                if ($managerUser && $managerUser->employee) {
                    $fullName = trim(implode(' ', array_filter([
                        $managerUser->employee->first_name,
                        $managerUser->employee->middle_name,
                        $managerUser->employee->last_name,
                    ])));
                }

                $branch->manager = $managerUser?->username;
                $branch->manager_name = $fullName ?: $managerUser?->username;
                if (!$branch->manager_id && $managerUser) {
                    $branch->manager_id = $managerUser->user_id;
                }
                $branch->catalog_products_count = (int) ($branch->products_count ?? 0) + (int) $globalProductCount;
                return $branch;
            });
        
        return response()->json([
            'branches' => $branches
        ]);
    }

    /**
     * Display the specified resource.
     */
    public function show($id)
    {
        $branch = BranchProfile::withCount(['employees', 'customers', 'products', 'sales'])
            ->findOrFail($id);
        
        // Find the Store Administrator assigned to this branch (fallback to manager_id if set)
        $manager = \App\Models\User::where('role', 'Store Administrator')
            ->whereHas('employee', function ($q) use ($branch) {
                $q->where('branch_id', $branch->id);
            })
            ->with('employee:employee_id,first_name,middle_name,last_name,phone,email,branch_id')
            ->first();

        if (!$manager && $branch->manager_id) {
            $manager = \App\Models\User::with('employee:employee_id,first_name,middle_name,last_name,phone,email,branch_id')
                ->find($branch->manager_id);
        }

        $managerFullName = null;
        if ($manager && $manager->employee) {
            $managerFullName = trim(implode(' ', array_filter([
                $manager->employee->first_name,
                $manager->employee->middle_name,
                $manager->employee->last_name,
            ])));
        }
        
        // Append the manager details dynamically
        $branch->manager = $manager ? $manager->username : null;
        $branch->manager_name = $managerFullName ?: ($manager ? $manager->username : null);
        $branch->manager_email = $manager?->employee?->email ?: ($manager?->email ?? null);
        $branch->manager_phone = $manager?->employee?->phone ?: ($manager?->phone_number ?? null);

        return response()->json([
            'branch' => $branch
        ]);
    }

    /**
     * Store a newly created resource in storage.
     */
    public function store(Request $request)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255|unique:branch_profiles',
            'branch_code' => 'nullable|string|max:50',
            'branch_type' => 'nullable|string|max:100',
            'location' => 'nullable|string|max:255',
            'address' => 'nullable|string|max:255',
            'city' => 'nullable|string|max:120',
            'province' => 'nullable|string|max:120',
            'manager_id' => 'nullable',
            'manager_name' => 'nullable|string|max:255',
            'contact_number' => 'nullable|string|max:255',
            'email' => 'nullable|string|max:160',
            'operating_hours' => 'nullable|string|max:160',
            'opening_date' => 'nullable|string|max:40',
            'description' => 'nullable|string|max:1000',
            'status' => 'nullable|string|in:open,closed',
            'color' => 'nullable|string|max:50',
            'image_url' => 'nullable|string',
        ]);

        if (empty($validated['location'])) {
            $parts = array_filter([
                $validated['address'] ?? null,
                $validated['city'] ?? null,
                $validated['province'] ?? null,
            ]);
            if (!empty($parts)) {
                $validated['location'] = implode(', ', $parts);
            }
        }

        $validated['manager_id'] = !empty($validated['manager_id']) && is_numeric($validated['manager_id'])
            ? (int) $validated['manager_id']
            : null;
        $validated['status'] = $validated['status'] ?? 'open';
        $validated['color'] = $validated['color'] ?? '#2b5ce6';

        $branch = BranchProfile::create($validated);

        if ($branch->manager_id) {
            $managerUser = \App\Models\User::find($branch->manager_id);
            if ($managerUser && $managerUser->employee_id) {
                \App\Models\Employee::where('employee_id', $managerUser->employee_id)->update([
                    'branch_id' => $branch->id,
                    'branch' => $branch->name,
                ]);
            }
        }

        if ($request->hasFile('image')) {
            $request->validate([
                'image' => 'image|mimes:jpeg,png,jpg,gif,webp|max:5120',
            ]);
            $path = $request->file('image')->store('branches', 'public');
            $branch->image_url = url('storage/' . $path);
            $branch->save();
        }

        return response()->json([
            'message' => 'Branch created successfully',
            'branch' => $branch
        ], 201);
    }

    /**
     * Upload and update the branch hero image.
     */
    public function uploadImage(Request $request, $id)
    {
        $branch = BranchProfile::findOrFail($id);

        $request->validate([
            'image' => 'required|image|mimes:jpeg,png,jpg,gif,webp|max:5120',
        ]);

        if ($request->hasFile('image')) {
            $oldImageUrl = $branch->image_url;

            // Delete old stored image if exists
            if ($oldImageUrl) {
                $oldRel = Str::after($oldImageUrl, '/storage/');
                if ($oldRel && Storage::disk('public')->exists($oldRel)) {
                    Storage::disk('public')->delete($oldRel);
                }
            }

            $path = $request->file('image')->store('branches', 'public');
            $branch->image_url = url('storage/' . $path);
            $branch->save();

            return response()->json([
                'message' => 'Image updated successfully',
                'image_url' => $branch->image_url,
                'branch' => $branch->fresh()
            ]);
        }

        return response()->json(['message' => 'No image provided'], 400);
    }

    /**
     * Update branch details.
     */
    public function update(Request $request, $id)
    {
        $branch = BranchProfile::findOrFail($id);
        $oldName = $branch->name;
        $oldImageUrl = $branch->image_url;

        $validated = $request->validate([
            'name' => 'required|string|max:255|unique:branch_profiles,name,' . $id,
            'branch_code' => 'nullable|string|max:50',
            'branch_type' => 'nullable|string|max:100',
            'location' => 'nullable|string|max:255',
            'address' => 'nullable|string|max:255',
            'city' => 'nullable|string|max:120',
            'province' => 'nullable|string|max:120',
            'manager_name' => 'nullable|string|max:255',
            'manager_id' => 'nullable',
            'contact_number' => 'nullable|string|max:255',
            'email' => 'nullable|string|max:160',
            'operating_hours' => 'nullable|string|max:160',
            'opening_date' => 'nullable|string|max:40',
            'description' => 'nullable|string|max:1000',
            'status' => 'nullable|string',
            'color' => 'nullable|string',
            'image_url' => 'nullable|string',
        ]);

        if (empty($validated['location'])) {
            $parts = array_filter([
                $validated['address'] ?? null,
                $validated['city'] ?? null,
                $validated['province'] ?? null,
            ]);
            if (!empty($parts)) {
                $validated['location'] = implode(', ', $parts);
            }
        }

        if (array_key_exists('manager_id', $validated)) {
            $validated['manager_id'] = !empty($validated['manager_id']) && is_numeric($validated['manager_id'])
                ? (int) $validated['manager_id']
                : null;
        }

        $branch->update($validated);

        if ($branch->manager_id) {
            $managerUser = \App\Models\User::find($branch->manager_id);
            if ($managerUser && $managerUser->employee_id) {
                \App\Models\Employee::where('employee_id', $managerUser->employee_id)->update([
                    'branch_id' => $branch->id,
                    'branch' => $branch->name,
                ]);
            }
        }

        // Cascade branch name change across linked records
        if (!empty($validated['name']) && $validated['name'] !== $oldName) {
            \App\Models\Employee::where('branch_id', $branch->id)
                ->orWhere('branch', $oldName)
                ->update(['branch' => $branch->name]);

            \App\Models\Customer::where('branch_id', $branch->id)
                ->orWhere('branch', $oldName)
                ->update(['branch' => $branch->name]);

            \Illuminate\Support\Facades\DB::table('attendance_scan_logs')
                ->where('branch', $oldName)
                ->update(['branch' => $branch->name]);

            \Illuminate\Support\Facades\DB::table('qr_requests')
                ->where('branch', $oldName)
                ->update(['branch' => $branch->name]);
        }

        if ($request->hasFile('image')) {
            $request->validate([
                'image' => 'image|mimes:jpeg,png,jpg,gif,webp|max:5120',
            ]);

            // Delete old stored image if exists
            if ($oldImageUrl) {
                $oldRel = Str::after($oldImageUrl, '/storage/');
                if ($oldRel && Storage::disk('public')->exists($oldRel)) {
                    Storage::disk('public')->delete($oldRel);
                }
            }

            $path = $request->file('image')->store('branches', 'public');
            $branch->image_url = url('storage/' . $path);
            $branch->save();
        }

        // Dynamically append manager username if not present
        if (!$branch->manager) {
            $manager = \App\Models\User::where('role', 'Store Administrator')
                ->whereHas('employee', function ($q) use ($branch) {
                    $q->where('branch_id', $branch->id);
                })->first();
            $branch->manager = $manager ? $manager->username : null;
        }

        $user = $request->user();
        if ($user) {
            \App\Models\SystemLog::create([
                'user_id' => $user->user_id,
                'action' => 'UPDATE',
                'module' => 'Branches',
                'description' => "Updated branch details for '{$branch->name}' (ID: {$branch->id})",
                'ip_address' => $request->ip(),
                'user_agent' => $request->userAgent(),
            ]);

            \App\Services\NotificationService::sendToAdmins([
                'type' => 'branch_updated',
                'title' => 'Branch Profile Updated',
                'message' => "Branch '{$branch->name}' details were updated by {$user->username}.",
                'module' => 'Branches',
                'action_url' => '/branches',
                'priority' => 'normal',
            ]);
        }

        return response()->json([
            'message' => 'Branch updated successfully',
            'image_url' => $branch->image_url,
            'branch' => $branch->fresh()
        ]);
    }

    /**
     * Delete a branch.
     */
    public function destroy($id)
    {
        $branch = BranchProfile::findOrFail($id);
        
        // Prevent deletion if branch has linked records
        if ($branch->employees()->count() > 0 || $branch->customers()->count() > 0 || $branch->sales()->count() > 0) {
            return response()->json([
                'message' => 'Cannot delete branch because it has linked employees, customers, or sales.'
            ], 400);
        }

        $branch->delete();

        return response()->json([
            'message' => 'Branch deleted successfully'
        ]);
    }
}
