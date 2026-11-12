<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\Product;
use App\Models\SystemLog;
use App\Services\CategoryFramework;
use Illuminate\Support\Facades\Cache;

class ProductController extends Controller
{
    private static function resolveSkuDomain(?string $category): string
    {
        $resolved = CategoryFramework::resolveHierarchy($category);
        return $resolved['main_category'] ?: ($resolved['sku_prefix'] ?: 'PRD');
    }

    private static function findDuplicateDomainProduct(string $code, string $category, ?int $ignoreProductId = null): ?Product
    {
        $targetDomain = self::resolveSkuDomain($category);
        $query = Product::whereRaw('LOWER(product_code) = ?', [strtolower(trim($code))]);
        if ($ignoreProductId !== null) {
            $query->where('product_id', '!=', $ignoreProductId);
        }

        foreach ($query->get() as $existing) {
            if (self::resolveSkuDomain($existing->category) === $targetDomain) {
                return $existing;
            }
        }

        return null;
    }

    private static function nextSkuForDomain(string $categoryOrDomain): string
    {
        $targetDomain = self::resolveSkuDomain($categoryOrDomain);
        $usedNumbers = [];

        foreach (Product::select('product_code', 'category')->get() as $item) {
            if (self::resolveSkuDomain($item->category) !== $targetDomain) {
                continue;
            }
            $raw = trim((string) $item->product_code);
            if (preg_match('/^(\d+)$/', $raw, $m)) {
                $usedNumbers[(int) $m[1]] = true;
            }
        }

        $next = 1;
        while (isset($usedNumbers[$next])) {
            $next++;
        }

        return str_pad((string) $next, 3, '0', STR_PAD_LEFT);
    }

    public function indexPublic(Request $request)
    {
        $query = Product::where('status', 'Active');
        if ($request->filled('category') && $request->query('category') !== 'All') {
            $matching = CategoryFramework::matchingCategories($request->query('category'));
            if (!empty($matching)) {
                $query->whereIn('category', $matching);
            } else {
                $query->where('category', $request->query('category'));
            }
        }
        $products = $query->limit(12)->get();
        return response()->json(['products' => $products]);
    }

    public function index(Request $request)
    {
        $user = $request->user();

        // 1-2s Performance Cache: bypass if exporting CSV
        if (!$request->boolean('export_csv')) {
            $fp = SyncController::computeFingerprint('products');
            $cacheKey = 'pace_prod_idx_' . md5(json_encode([
                'u' => $user ? $user->user_id : 0,
                'r' => $user ? $user->role : '',
                's' => $request->query('search', ''),
                'c' => $request->query('category', ''),
                'st' => $request->query('status', ''),
                'ss' => $request->query('stock_status', ''),
                'b' => $request->query('branch', $request->query('branch_id', '')),
            ])) . '_' . $fp;

            $cached = Cache::get($cacheKey);
            if ($cached !== null) {
                return response()->json($cached);
            }
        }

        $query = Product::with('branch:id,name');

        if ($user) {
            if ($user->role === 'Customer') {
                $branchId = null;
                $cust = $user->customer ?: ($user->customer_id ? \App\Models\Customer::find($user->customer_id) : \App\Models\Customer::where('email', $user->username)->first());
                if ($cust) {
                    $branchId = $cust->branch_id;
                }
                if ($branchId) {
                    $query->where(function ($q) use ($branchId) {
                        $q->where('branch_id', $branchId)->orWhereNull('branch_id');
                    });
                }
            } elseif (in_array($user->role, ['Store Administrator', 'Store Admin', 'Employee'])) {
                $branchId = $user->employee ? $user->employee->branch_id : null;
                if ($branchId) {
                    $query->where(function ($q) use ($branchId) {
                        $q->where('branch_id', $branchId)->orWhereNull('branch_id');
                    });
                }
            }
            // Administrators see all products
        }

        // Branch filter (for Administrator or explicit branch filter)
        $branchQuery = $request->query('branch', $request->query('branch_id'));
        if ($branchQuery && !in_array($branchQuery, ['All', 'all'])) {
            $query->where('branch_id', $branchQuery);
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
                $matching = CategoryFramework::matchingCategories($request->query('category'));
                if (!empty($matching)) {
                    $query->whereIn('category', $matching);
                } else {
                    $query->where('category', $request->query('category'));
                }
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
                $query->where('stock_quantity', 1);
            } elseif ($stockStatus === 'Medium Stock') {
                $query->whereBetween('stock_quantity', [2, 4]);
            } elseif ($stockStatus === 'High Stock') {
                $query->where('stock_quantity', '>=', 5);
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
                ['Product ID', 'Product Code', 'Product Name', 'Brand', 'Category', 'Branch', 'Description', 'Price', 'Cost', 'Stock', 'Reorder Level', 'Status', 'Created Date'],
                $query->orderBy('product_name'),
                function ($p) {
                    return [
                        $p->product_id,
                        $p->product_code,
                        $p->product_name,
                        $p->brand,
                        $p->category,
                        $p->branch ? ($p->branch->name ?? $p->branch->branch ?? 'Branch #' . $p->branch_id) : 'All Branches (Global)',
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

        $res = [
            'products' => $products,
            'total' => $products->count(),
            'next_skus' => [
                'Furniture' => self::nextSkuForDomain('Furniture'),
                'Appliances' => self::nextSkuForDomain('Appliances'),
            ],
        ];

        if (isset($cacheKey)) {
            Cache::put($cacheKey, $res, 2);
        }

        return response()->json($res);
    }

    public function show($id)
    {
        $product = Product::with('branch')->find($id);
        if (!$product) {
            return response()->json(['message' => 'The requested product was not found or has been removed.'], 404);
        }
        return response()->json(['product' => $product]);
    }

    public function store(Request $request)
    {
        $user = $request->user();

        if ($request->has('branch_id') && ($request->input('branch_id') === 'all' || $request->input('branch_id') === '')) {
            $request->merge(['branch_id' => null]);
        }

        $validated = $request->validate([
            'branch_id' => 'nullable|exists:branch_profiles,id',
            'product_code' => 'nullable|string|max:255',
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
            'length' => 'nullable|numeric|min:0',
            'width' => 'nullable|numeric|min:0',
            'height' => 'nullable|numeric|min:0',
            'dimension_unit' => 'nullable|string|in:cm,mm,m,in,ft',
            'weight' => 'nullable|numeric|min:0',
            'weight_unit' => 'nullable|string|in:kg,g,lbs',
            'status' => 'required|string|in:Active,Inactive',
            'image_1' => 'nullable|image|mimes:jpeg,png,jpg,webp|max:5120',
            'image_2' => 'nullable|image|mimes:jpeg,png,jpg,webp|max:5120',
            'image_3' => 'nullable|image|mimes:jpeg,png,jpg,webp|max:5120',
            'image_4' => 'nullable|image|mimes:jpeg,png,jpg,webp|max:5120',
        ]);

        $validated['category'] = CategoryFramework::canonicalName($validated['category']);

        if (empty($validated['product_code'])) {
            $validated['product_code'] = self::nextSkuForDomain($validated['category']);
        } else {
            $validated['product_code'] = trim($validated['product_code']);
            if (self::findDuplicateDomainProduct($validated['product_code'], $validated['category'])) {
                $domainLabel = self::resolveSkuDomain($validated['category']);
                $msg = "The product code has already been taken in {$domainLabel}.";
                return response()->json([
                    'message' => $msg,
                    'errors' => ['product_code' => [$msg]],
                ], 422);
            }
        }

        $validated['cost_price'] = $validated['cost_price'] ?? 0;
        $validated['reorder_level'] = $validated['reorder_level'] ?? 0;
        $validated['unit'] = $validated['unit'] ?? 'unit';
        $validated['dimension_unit'] = $validated['dimension_unit'] ?? 'cm';
        $validated['weight_unit'] = $validated['weight_unit'] ?? 'kg';

        if ($user && in_array($user->role, ['Store Administrator', 'Store Admin'])) {
            $employee = \App\Models\Employee::where('employee_id', $user->employee_id)->first();
            if (!$employee || !$employee->branch_id) {
                return response()->json(['message' => 'Store Administrator is not assigned to any branch. (DEBUG: user_id=' . $user->user_id . ', employee_id=' . $user->employee_id . ', has_employee=' . ($employee ? 'yes' : 'no') . ')'], 403);
            }
            $validated['branch_id'] = $employee->branch_id;
        } elseif ($user && $user->role === 'Administrator') {
            if (empty($validated['branch_id']) || $validated['branch_id'] === 'all') {
                $validated['branch_id'] = null;
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
            'user_id' => $user ? $user->user_id : $request->input('user_id'),
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
        $product = Product::find($id);
        if (!$product) {
            return response()->json(['message' => 'The requested product was not found or has been removed.'], 404);
        }
        $user = $request->user();

        if ($request->has('branch_id') && ($request->input('branch_id') === 'all' || $request->input('branch_id') === '')) {
            $request->merge(['branch_id' => null]);
        }

        if ($user && in_array($user->role, ['Store Administrator', 'Store Admin'])) {
            $employee = \App\Models\Employee::where('employee_id', $user->employee_id)->first();
            if (!$employee || $employee->branch_id !== $product->branch_id) {
                return response()->json(['message' => 'Unauthorized to update product from another branch.'], 403);
            }
        }

        $validated = $request->validate([
            'branch_id' => 'nullable|exists:branch_profiles,id',
            'product_code' => 'required|string|max:255',
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
            'length' => 'nullable|numeric|min:0',
            'width' => 'nullable|numeric|min:0',
            'height' => 'nullable|numeric|min:0',
            'dimension_unit' => 'nullable|string|in:cm,mm,m,in,ft',
            'weight' => 'nullable|numeric|min:0',
            'weight_unit' => 'nullable|string|in:kg,g,lbs',
            'status' => 'required|string|in:Active,Inactive',
            'image_1' => 'nullable|image|mimes:jpeg,png,jpg,webp|max:5120',
            'image_2' => 'nullable|image|mimes:jpeg,png,jpg,webp|max:5120',
            'image_3' => 'nullable|image|mimes:jpeg,png,jpg,webp|max:5120',
            'image_4' => 'nullable|image|mimes:jpeg,png,jpg,webp|max:5120',
        ]);

        if ($user && in_array($user->role, ['Store Administrator', 'Store Admin'])) {
            unset($validated['branch_id']); // Store admin cannot change branch
        } elseif ($user && $user->role === 'Administrator') {
            if (empty($validated['branch_id']) || $validated['branch_id'] === 'all') {
                $validated['branch_id'] = null;
            }
        }

        $validated['category'] = CategoryFramework::canonicalName($validated['category']);
        $validated['product_code'] = trim($validated['product_code']);
        $validated['unit'] = $validated['unit'] ?? 'unit';
        $validated['dimension_unit'] = $validated['dimension_unit'] ?? 'cm';
        $validated['weight_unit'] = $validated['weight_unit'] ?? 'kg';

        if (self::findDuplicateDomainProduct($validated['product_code'], $validated['category'], (int) $id)) {
            $domainLabel = self::resolveSkuDomain($validated['category']);
            $msg = "The product code has already been taken in {$domainLabel}.";
            return response()->json([
                'message' => $msg,
                'errors' => ['product_code' => [$msg]],
            ], 422);
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
            'user_id' => $user ? $user->user_id : $request->input('user_id'),
            'action' => 'UPDATE',
            'module' => 'Products',
            'description' => "Updated product: {$product->product_name} ({$product->product_code})",
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
        ]);

        SyncController::invalidateFingerprint(['products', 'sales', 'dashboard']);

        return response()->json([
            'message' => 'Product updated successfully',
            'product' => $product,
        ]);
    }

    public function destroy(Request $request, $id)
    {
        $product = Product::find($id);
        if (!$product) {
            return response()->json(['message' => 'The requested product was not found or already deleted.'], 404);
        }
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
            'user_id' => $user ? $user->user_id : $request->input('user_id'),
            'action' => 'DELETE',
            'module' => 'Products',
            'description' => "Deleted product: {$name} ({$code})",
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
        ]);

        SyncController::invalidateFingerprint(['products', 'sales', 'dashboard']);

        return response()->json(['message' => 'Product deleted successfully']);
    }
}
