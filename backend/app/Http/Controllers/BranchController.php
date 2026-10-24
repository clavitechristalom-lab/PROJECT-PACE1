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
            ->with('employee:employee_id,branch_id')
            ->get()
            ->filter(fn($u) => $u->employee && $u->employee->branch_id)
            ->keyBy(fn($u) => $u->employee->branch_id);

        $branches = BranchProfile::all()->map(function ($branch) use ($managers) {
            $branch->manager = $managers->get($branch->id)?->username;
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
        $branch = BranchProfile::findOrFail($id);
        
        // Find the Store Administrator assigned to this branch
        $manager = \App\Models\User::where('role', 'Store Administrator')
            ->whereHas('employee', function ($q) use ($branch) {
                $q->where('branch_id', $branch->id);
            })->first();
        
        // Append the manager name dynamically
        $branch->manager = $manager ? $manager->username : null;

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
            'location' => 'nullable|string|max:255',
            'manager_name' => 'nullable|string|max:255',
            'contact_number' => 'nullable|string|max:255',
            'status' => 'nullable|string|in:open,closed',
            'color' => 'nullable|string|max:50',
            'image_url' => 'nullable|string',
        ]);

        $branch = BranchProfile::create($validated);

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
            'location' => 'nullable|string|max:255',
            'manager_name' => 'nullable|string|max:255',
            'manager_id' => 'nullable',
            'contact_number' => 'nullable|string|max:255',
            'status' => 'nullable|string',
            'color' => 'nullable|string',
            'image_url' => 'nullable|string',
        ]);

        $branch->update($validated);

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
