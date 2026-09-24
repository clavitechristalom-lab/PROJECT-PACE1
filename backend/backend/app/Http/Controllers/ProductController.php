<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\Product;
use App\Models\SystemLog;

class ProductController extends Controller
{
    public function index(Request $request)
    {
        $query = Product::with('branch');
        $user = $request->user();

        if ($user) {
            if ($user->role === 'Customer') {
                $customerId = $user->customer_id ?? ($user->customer ? $user->customer->customer_id : null);
                if (!$customerId) {
                    $cust = \App\Models\Customer::where('email', $user->username)->first();
                    if ($cust) {
                        $customerId = $cust->customer_id;
                    }
                }
                $branchId = null;
                if ($customerId) {
                    $cust = \App\Models\Customer::find($customerId);
                    $branchId = $cust ? $cust->branch_id : null;
                }
                if ($branchId) {
                    $branchCount = Product::where('branch_id', $branchId)->count();
                    if ($branchCount > 0) {
                        $query->where('branch_id', $branchId);
                    }
                }
            } elseif (in_array($user->role, ['Store Administrator', 'Store Admin'])) {
                $branchId = $user->employee ? $user->employee->branch_id : null;
                if (!$branchId) {
                    return response()->json(['products' => [], 'total' => 0]);
                }
                $query->where('branch_id', $branchId);
            }
            // Administrators see all products
        }

        if ($request->filled('search')) {
            $s = $request->query('search');
            $query->where(function ($q) use ($s) {
                $q->where('product_name', 'like', "%{$s}%")
                  ->orWhere('product_code', 'like', "%{$s}%")
                  ->orWhere('brand', 'like', "%{$s}%")
                  ->orWhere('category', 'like', "%{$s}%");
            });
        }

        if ($request->filled('category') && $request->query('category') !== 'All') {
            if ($request->query('category') === 'Sale Items') {
                $query->whereNotNull('discount_price');
            } else {
                $query->where('category', $request->query('category'));
            }
        }

        if ($request->filled('status') && $request->query('status') !== 'All') {
            $query->where('status', $request->query('status'));
        }

        if ($request->filled('stock_status') && $request->query('stock_status') !== 'All') {
            $stockStatus = $request->query('stock_status');
            if ($stockStatus === 'Out of Stock') {
                $query->where('stock_quantity', '<=', 0);
            } elseif ($stockStatus === 'Low Stock') {
                $query->where('stock_quantity', '>', 0)->whereColumn('stock_quantity', '<=', 'reorder_level');
            } elseif ($stockStatus === 'In Stock') {
                $query->whereColumn('stock_quantity', '>', 'reorder_level');
            }
        }

        if ($request->boolean('export_csv')) {
            $user = $request->user();
            
            SystemLog::create([
                'user_id' => $user ? $user->user_id : null,
                'action' => 'EXPORT',
                'module' => 'Products',
                'description' => 'Exported product catalog',
                'ip_address' => $request->ip(),
                'created_at' => now(),
            ]);

            return $this->exportCsv(
                'products_export_' . date('Y-m-d') . '.csv',
                ['Product ID', 'Product Code', 'Product Name', 'Brand', 'Category', 'Description', 'Price', 'Cost', 'Stock', 'Reorder Level', 'Status', 'Created Date'],
                $query->orderBy('product_name'),
                function ($p) {
                    return [
                        $p->product_id,
                        $p->product_code,
                        $p->product_name,
                        $p->brand,
                        $p->category,
                        $p->description,
                        $p->unit_price,
                        $p->cost_price,
                        $p->stock_quantity,
                        $p->reorder_level,
                        $p->status,
                        $p->created_at ? $p->created_at->format('Y-m-d H:i:s') : ''
                    ];
                }
            );
        }

        $products = $query->orderBy('product_name')->get();

        return response()->json([
            'products' => $products,
            'total' => $products->count(),
        ]);
    }

    public function show($id)
    {
        $product = Product::findOrFail($id);
        return response()->json(['product' => $product]);
    }

    public function store(Request $request)
    {
        $user = $request->user();

        $validated = $request->validate([
            'branch_id' => 'nullable|exists:branch_profiles,id',
            'product_code' => 'nullable|string|unique:products,product_code',
            'product_name' => 'required|string|max:255',
            'category' => 'required|string|max:255',
            'brand' => 'nullable|string|max:255',
            'description' => 'nullable|string',
            'unit_price' => 'required|numeric|min:0',
            'discount_price' => 'nullable|numeric|min:0',
            'cost_price' => 'nullable|numeric|min:0',
            'stock_quantity' => 'required|integer|min:0',
            'reorder_level' => 'nullable|integer|min:0',
            'unit' => 'nullable|string|max:50',
            'status' => 'required|string|in:Active,Inactive',
            'image_1' => 'nullable|image|mimes:jpeg,png,jpg,webp|max:5120',
            'image_2' => 'nullable|image|mimes:jpeg,png,jpg,webp|max:5120',
            'image_3' => 'nullable|image|mimes:jpeg,png,jpg,webp|max:5120',
            'image_4' => 'nullable|image|mimes:jpeg,png,jpg,webp|max:5120',
        ]);

        if (empty($validated['product_code'])) {
            $count = Product::count() + 1;
            $validated['product_code'] = 'PRD-' . str_pad($count, 3, '0', STR_PAD_LEFT);
        }

        $validated['cost_price'] = $validated['cost_price'] ?? 0;
        $validated['reorder_level'] = $validated['reorder_level'] ?? 0;
        $validated['unit'] = $validated['unit'] ?? 'unit';

        if ($user && in_array($user->role, ['Store Administrator', 'Store Admin'])) {
            $employee = \App\Models\Employee::where('employee_id', $user->employee_id)->first();
            if (!$employee || !$employee->branch_id) {
                return response()->json(['message' => 'Store Administrator is not assigned to any branch. (DEBUG: user_id=' . $user->user_id . ', employee_id=' . $user->employee_id . ', has_employee=' . ($employee ? 'yes' : 'no') . ')'], 403);
            }
            $validated['branch_id'] = $employee->branch_id;
        } elseif ($user && $user->role === 'Administrator') {
            if (empty($validated['branch_id'])) {
                return response()->json(['message' => 'Branch ID is required for Administrator.'], 422);
            }
        }

        $product = Product::create($validated);

        // Handle image uploads
        $urlBase = $request->getSchemeAndHttpHost() . '/storage/';
        $updates = [];
        if ($request->hasFile('image_1')) {
            $path = $request->file('image_1')->store('products', 'public');
            $updates['image_url'] = $urlBase . $path;
        }
        if ($request->hasFile('image_2')) {
            $path = $request->file('image_2')->store('products', 'public');
            $updates['image_url_2'] = $urlBase . $path;
        }
        if ($request->hasFile('image_3')) {
            $path = $request->file('image_3')->store('products', 'public');
            $updates['image_url_3'] = $urlBase . $path;
        }
        if ($request->hasFile('image_4')) {
            $path = $request->file('image_4')->store('products', 'public');
            $updates['image_url_4'] = $urlBase . $path;
        }
        if (!empty($updates)) {
            $product->update($updates);
        }

        $product->load('branch');

        SystemLog::create([
            'user_id' => $request->input('user_id', 1),
            'action' => 'CREATE',
            'module' => 'Products',
            'description' => "Created new product: {$product->product_name} ({$product->product_code})",
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
        ]);

        $notificationData = [
            'type' => 'new_product_alert',
            'title' => 'New Product Added',
            'message' => "{$product->product_name} is now available in your branch.",
            'module' => 'Products',
            'related_id' => $product->product_id,
            'related_type' => 'App\Models\Product',
            'action_url' => '/products?id=' . $product->product_id,
            'priority' => 'normal',
        ];
        
        \App\Services\NotificationService::sendToAdmins($notificationData);
        \App\Services\NotificationService::sendToStoreAdmins($notificationData, $product->branch_id);
        \App\Services\NotificationService::sendToCustomers($notificationData, $product->branch_id);

        return response()->json([
            'message' => 'Product created successfully',
            'product' => $product,
        ], 201);
    }

    public function update(Request $request, $id)
    {
        $product = Product::findOrFail($id);
        $user = $request->user();

        if ($user && in_array($user->role, ['Store Administrator', 'Store Admin'])) {
            $employee = \App\Models\Employee::where('employee_id', $user->employee_id)->first();
            if (!$employee || $employee->branch_id !== $product->branch_id) {
                return response()->json(['message' => 'Unauthorized to update product from another branch.'], 403);
            }
        }

        $validated = $request->validate([
            'branch_id' => 'nullable|exists:branch_profiles,id',
            'product_code' => "required|string|unique:products,product_code,{$id},product_id",
            'product_name' => 'required|string|max:255',
            'category' => 'required|string|max:255',
            'brand' => 'nullable|string|max:255',
            'description' => 'nullable|string',
            'unit_price' => 'required|numeric|min:0',
            'discount_price' => 'nullable|numeric|min:0',
            'cost_price' => 'nullable|numeric|min:0',
            'stock_quantity' => 'required|integer|min:0',
            'reorder_level' => 'nullable|integer|min:0',
            'unit' => 'nullable|string|max:50',
            'status' => 'required|string|in:Active,Inactive',
            'image_1' => 'nullable|image|mimes:jpeg,png,jpg,webp|max:5120',
            'image_2' => 'nullable|image|mimes:jpeg,png,jpg,webp|max:5120',
            'image_3' => 'nullable|image|mimes:jpeg,png,jpg,webp|max:5120',
            'image_4' => 'nullable|image|mimes:jpeg,png,jpg,webp|max:5120',
        ]);

        if ($user && in_array($user->role, ['Store Administrator', 'Store Admin'])) {
            unset($validated['branch_id']); // Store admin cannot change branch
        } elseif ($user && $user->role === 'Administrator') {
             if (empty($validated['branch_id'])) {
                return response()->json(['message' => 'Branch ID is required for Administrator.'], 422);
            }
        }

        $product->update($validated);

        // Handle image uploads and deletions
        $urlBase = $request->getSchemeAndHttpHost() . '/storage/';
        $updates = [];
        
        // Image 1
        if ($request->hasFile('image_1')) {
            $path = $request->file('image_1')->store('products', 'public');
            $updates['image_url'] = $urlBase . $path;
        } elseif ($request->input('remove_image_1') === 'true') {
            $updates['image_url'] = null;
        }

        // Image 2
        if ($request->hasFile('image_2')) {
            $path = $request->file('image_2')->store('products', 'public');
            $updates['image_url_2'] = $urlBase . $path;
        } elseif ($request->input('remove_image_2') === 'true') {
            $updates['image_url_2'] = null;
        }

        // Image 3
        if ($request->hasFile('image_3')) {
            $path = $request->file('image_3')->store('products', 'public');
            $updates['image_url_3'] = $urlBase . $path;
        } elseif ($request->input('remove_image_3') === 'true') {
            $updates['image_url_3'] = null;
        }

        // Image 4
        if ($request->hasFile('image_4')) {
            $path = $request->file('image_4')->store('products', 'public');
            $updates['image_url_4'] = $urlBase . $path;
        } elseif ($request->input('remove_image_4') === 'true') {
            $updates['image_url_4'] = null;
        }

        if (!empty($updates)) {
            $product->update($updates);
        }

        $product->load('branch');

        SystemLog::create([
            'user_id' => $request->input('user_id', 1),
            'action' => 'UPDATE',
            'module' => 'Products',
            'description' => "Updated product: {$product->product_name} ({$product->product_code})",
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
        ]);

        return response()->json([
            'message' => 'Product updated successfully',
            'product' => $product,
        ]);
    }

    public function destroy(Request $request, $id)
    {
        $product = Product::findOrFail($id);
        $user = $request->user();

        if ($user && in_array($user->role, ['Store Administrator', 'Store Admin'])) {
            if (!$user->employee || $user->employee->branch_id !== $product->branch_id) {
                return response()->json(['message' => 'Unauthorized to delete product from another branch.'], 403);
            }
        }

        $name = $product->product_name;
        $code = $product->product_code;

        $product->delete();

        SystemLog::create([
            'user_id' => $request->input('user_id', 1),
            'action' => 'DELETE',
            'module' => 'Products',
            'description' => "Deleted product: {$name} ({$code})",
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
        ]);

        return response()->json(['message' => 'Product deleted successfully']);
    }
}
