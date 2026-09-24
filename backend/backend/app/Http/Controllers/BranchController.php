<?php

namespace App\Http\Controllers;

use App\Models\BranchProfile;
use Illuminate\Http\Request;

class BranchController extends Controller
{
    /**
     * Display a listing of the resource.
     */
    public function index()
    {
        $branches = BranchProfile::all()->map(function ($branch) {
            // Find the Store Administrator assigned to this branch
            $manager = \App\Models\User::where('role', 'Store Administrator')
                ->whereHas('employee', function ($q) use ($branch) {
                    $q->where('branch_id', $branch->id);
                })->first();
            
            // Append the manager name dynamically
            $branch->manager = $manager ? $manager->username : null;
            return $branch;
        });
        
        return response()->json([
            'branches' => $branches
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
            $path = $request->file('image')->store('branches', 'public');
            $branch->image_url = url('storage/' . $path);
            $branch->save();

            return response()->json([
                'message' => 'Image updated successfully',
                'image_url' => $branch->image_url
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

        $validated = $request->validate([
            'name' => 'required|string|max:255|unique:branch_profiles,name,' . $id,
            'location' => 'nullable|string|max:255',
            'manager_name' => 'nullable|string|max:255',
            'contact_number' => 'nullable|string|max:255',
            'status' => 'nullable|string',
            'color' => 'nullable|string',
        ]);

        $branch->update($validated);

        return response()->json([
            'message' => 'Branch updated successfully',
            'branch' => $branch
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
