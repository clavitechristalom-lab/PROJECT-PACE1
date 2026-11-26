<?php

namespace App\Http\Controllers;

use App\Models\Category;
use App\Models\Product;
use App\Models\SystemLog;
use App\Services\CategoryFramework;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class CategoryController extends Controller
{
    public function index(Request $request)
    {
        $mainFilter = trim((string) $request->query('main_category', ''));
        $includeInactive = $request->boolean('include_inactive') && $request->user() !== null;
        $catVer = SyncController::moduleVersion('categories');
        $cacheKey = 'pace_categories_' . md5($mainFilter . '|' . ($includeInactive ? 'all' : 'active') . '|' . $catVer);

        $payload = Cache::remember($cacheKey, 60, function () use ($mainFilter, $includeInactive) {
            if (Schema::hasTable('categories')) {
                if (!Category::exists()) {
                    CategoryFramework::syncDatabase();
                }

                $query = Category::with('branch:id,name,location')
                    ->orderBy('sort_order')
                    ->orderBy('id');

                if (!$includeInactive) {
                    $query->where('is_active', true);
                }

                $rows = $query->get();

                $mains = $rows->where('level', 'main')->values();
                $groups = $rows->where('level', 'group')->values();
                $subcategories = $rows->where('level', 'subcategory')->values();

                $tree = $mains->map(function ($main) use ($groups, $subcategories) {
                    $mainGroups = $groups->where('parent_id', $main->id)->values();
                    return [
                        'id' => $main->id,
                        'main' => $main->name,
                        'slug' => $main->slug,
                        'sku_prefix' => $main->sku_prefix,
                        'scope' => $main->classification_scope,
                        'branch_id' => $main->branch_id,
                        'branch_name' => $main->branch?->name,
                        'is_active' => (bool) $main->is_active,
                        'groups' => $mainGroups->map(function ($grp) use ($subcategories) {
                            $grpSubs = $subcategories->where('parent_id', $grp->id)->values();
                            return [
                                'id' => $grp->id,
                                'name' => $grp->name,
                                'slug' => $grp->slug,
                                'scope' => $grp->classification_scope,
                                'branch_id' => $grp->branch_id,
                                'branch_name' => $grp->branch?->name,
                                'is_active' => (bool) $grp->is_active,
                                'subcategories' => $grpSubs->map(function ($sub) {
                                    return [
                                        'id' => $sub->id,
                                        'name' => $sub->name,
                                        'slug' => $sub->slug,
                                        'scope' => $sub->classification_scope,
                                        'branch_id' => $sub->branch_id,
                                        'branch_name' => $sub->branch?->name,
                                        'is_active' => (bool) $sub->is_active,
                                    ];
                                })->values()->all(),
                            ];
                        })->values()->all(),
                    ];
                })->values()->all();

                $flat = $rows->map(fn ($r) => [
                    'id' => $r->id,
                    'name' => $r->name,
                    'slug' => $r->slug,
                    'level' => $r->level,
                    'parent_id' => $r->parent_id,
                    'main_category' => $r->main_category,
                    'group_name' => $r->group_name,
                    'branch_id' => $r->branch_id,
                    'branch_name' => $r->branch?->name,
                    'sku_prefix' => $r->sku_prefix,
                    'scope' => $r->classification_scope,
                    'sort_order' => (int) $r->sort_order,
                    'is_active' => (bool) $r->is_active,
                ])->values()->all();
            } else {
                $tree = CategoryFramework::framework();
                $flat = [];
            }

            if ($mainFilter !== '' && strcasecmp($mainFilter, 'All') !== 0) {
                $resolvedMain = CategoryFramework::resolveHierarchy($mainFilter)['main_category'] ?? $mainFilter;
                $tree = array_values(array_filter($tree, static fn ($d) => strcasecmp($d['main'], $resolvedMain) === 0));
                $flat = array_values(array_filter($flat, static fn ($r) => strcasecmp($r['main_category'] ?? '', $resolvedMain) === 0));
            }

            $groupNames = [];
            $subNames = [];
            foreach ($tree as $domain) {
                foreach ($domain['groups'] ?? [] as $grp) {
                    $groupNames[] = $grp['name'];
                    foreach ($grp['subcategories'] ?? [] as $sub) {
                        $subNames[] = $sub['name'];
                    }
                }
            }

            return [
                'tree' => $tree,
                'categories' => $flat,
                'domains' => CategoryFramework::mainCategories(),
                'groups' => array_values(array_unique($groupNames)),
                'subcategories' => array_values(array_unique($subNames)),
            ];
        });

        return response()->json($payload);
    }

    private function authorizeManage(Request $request, ?Category $category = null)
    {
        $user = $request->user();
        if (!$user || !in_array($user->role, ['Administrator', 'Admin', 'Store Administrator', 'Store Admin'], true)) {
            return response()->json(['message' => 'Unauthorized to modify categories.'], 403);
        }

        if (in_array($user->role, ['Store Administrator', 'Store Admin'], true)) {
            $userBranchId = $user->employee?->branch_id;
            if (!$userBranchId) {
                return response()->json(['message' => 'Store Administrator is not assigned to any branch.'], 403);
            }
            if ($category && ((int) ($category->branch_id ?? 0) !== (int) $userBranchId)) {
                return response()->json(['message' => 'Unauthorized to modify global or another branch\'s categories.'], 403);
            }
        }
        return null;
    }

    private function formatRow(Category $category): array
    {
        $category->loadMissing('branch:id,name,location');
        return [
            'id' => $category->id,
            'name' => $category->name,
            'slug' => $category->slug,
            'level' => $category->level,
            'parent_id' => $category->parent_id,
            'main_category' => $category->main_category,
            'group_name' => $category->group_name,
            'branch_id' => $category->branch_id,
            'branch_name' => $category->branch?->name,
            'sku_prefix' => $category->sku_prefix,
            'scope' => $category->classification_scope,
            'sort_order' => (int) $category->sort_order,
            'is_active' => (bool) $category->is_active,
        ];
    }

    private function resolveBranchId(Request $request): ?int
    {
        $user = $request->user();
        if ($user && in_array($user->role, ['Store Administrator', 'Store Admin'], true)) {
            return $user->employee?->branch_id ? (int) $user->employee->branch_id : null;
        }

        $raw = $request->input('branch_id');
        if ($raw === null || $raw === '' || strcasecmp((string) $raw, 'all') === 0) {
            return null;
        }
        if (is_numeric($raw) && \App\Models\BranchProfile::where('id', (int) $raw)->exists()) {
            return (int) $raw;
        }
        return null;
    }

    private function uniqueSlug(string $base, ?int $ignoreId = null): string
    {
        $slug = Str::slug($base) ?: 'category';
        $candidate = $slug;
        $i = 2;
        while (Category::where('slug', $candidate)->when($ignoreId, fn ($q) => $q->where('id', '!=', $ignoreId))->exists()) {
            $candidate = "{$slug}-{$i}";
            $i++;
        }
        return $candidate;
    }

    private function resolveSkuDomain(?string $categoryOrDomain): string
    {
        $resolved = CategoryFramework::resolveHierarchy($categoryOrDomain);
        return $resolved['main_category'] ?: ($resolved['sku_prefix'] ?: 'PRD');
    }

    private function attachMultipleProducts(Category $category, Request $request, array $newProducts, array $assignProductIds): array
    {
        $user = $request->user();
        $isStoreAdmin = $user && in_array($user->role, ['Store Administrator', 'Store Admin'], true);
        $userBranchId = $isStoreAdmin ? ($user->employee?->branch_id ? (int) $user->employee->branch_id : null) : null;
        $targetBranchId = $isStoreAdmin ? $userBranchId : $category->branch_id;

        $createdProducts = [];
        $assignedCount = 0;

        if (!empty($newProducts)) {
            $targetDomain = $category->main_category ?: $this->resolveSkuDomain($category->name);

            $usedNumericSkus = [];
            $usedCodesLower = [];
            foreach (Product::select('product_code', 'category')->get() as $existing) {
                if ($this->resolveSkuDomain($existing->category) !== $targetDomain) {
                    continue;
                }
                $rawCode = trim((string) $existing->product_code);
                if ($rawCode !== '') {
                    $usedCodesLower[strtolower($rawCode)] = true;
                }
                if (preg_match('/^(\d+)$/', $rawCode, $m)) {
                    $usedNumericSkus[(int) $m[1]] = true;
                }
            }

            $nextSkuNum = 1;
            $allocateNextSku = static function () use (&$nextSkuNum, &$usedNumericSkus, &$usedCodesLower): string {
                while (true) {
                    $candidate = str_pad((string) $nextSkuNum, 3, '0', STR_PAD_LEFT);
                    $lower = strtolower($candidate);
                    $taken = isset($usedNumericSkus[$nextSkuNum]) || isset($usedCodesLower[$lower]);
                    $nextSkuNum++;
                    if (!$taken) {
                        $usedNumericSkus[(int) $candidate] = true;
                        $usedCodesLower[$lower] = true;
                        return $candidate;
                    }
                }
            };

            foreach ($newProducts as $idx => $item) {
                $prodName = trim((string) ($item['product_name'] ?? ''));
                if ($prodName === '') {
                    continue;
                }

                $rawCode = trim((string) ($item['product_code'] ?? ''));
                if ($rawCode !== '') {
                    $lower = strtolower($rawCode);
                    if (isset($usedCodesLower[$lower])) {
                        throw ValidationException::withMessages([
                            "new_products.{$idx}.product_code" => ["Product code '{$rawCode}' is already taken in {$targetDomain}."],
                        ]);
                    }
                    $usedCodesLower[$lower] = true;
                    if (preg_match('/^(\d+)$/', $rawCode, $m)) {
                        $usedNumericSkus[(int) $m[1]] = true;
                    }
                    $productCode = $rawCode;
                } else {
                    $productCode = $allocateNextSku();
                }

                $created = Product::create([
                    'branch_id' => $targetBranchId,
                    'product_code' => $productCode,
                    'product_name' => $prodName,
                    'category' => $category->name,
                    'brand' => isset($item['brand']) && trim((string) $item['brand']) !== '' ? trim((string) $item['brand']) : null,
                    'description' => isset($item['description']) && trim((string) $item['description']) !== '' ? trim((string) $item['description']) : null,
                    'unit_price' => (float) ($item['unit_price'] ?? 0),
                    'cost_price' => isset($item['cost_price']) && $item['cost_price'] !== '' ? (float) $item['cost_price'] : 0,
                    'stock_quantity' => isset($item['stock_quantity']) && $item['stock_quantity'] !== '' ? max(0, (int) $item['stock_quantity']) : 0,
                    'reorder_level' => 0,
                    'unit' => isset($item['unit']) && trim((string) $item['unit']) !== '' ? trim((string) $item['unit']) : 'unit',
                    'dimension_unit' => 'cm',
                    'weight_unit' => 'kg',
                    'status' => in_array(($item['status'] ?? 'Active'), ['Active', 'Inactive'], true) ? $item['status'] : 'Active',
                ]);

                $createdProducts[] = $created;
            }
        }

        $cleanAssignIds = array_values(array_unique(array_filter(array_map('intval', $assignProductIds), static fn ($v) => $v > 0)));
        if (!empty($cleanAssignIds)) {
            $assignQuery = Product::whereIn('product_id', $cleanAssignIds);
            if ($isStoreAdmin && $userBranchId) {
                $assignQuery->where(function ($q) use ($userBranchId) {
                    $q->where('branch_id', $userBranchId)->orWhereNull('branch_id');
                });
            }
            $assignUpdates = ['category' => $category->name];
            if ($targetBranchId !== null) {
                $assignUpdates['branch_id'] = $targetBranchId;
            }
            $assignedCount = $assignQuery->update($assignUpdates);
        }

        return [
            'created_products' => $createdProducts,
            'created_count' => count($createdProducts),
            'assigned_count' => $assignedCount,
        ];
    }

    public function store(Request $request)
    {
        if ($denied = $this->authorizeManage($request)) {
            return $denied;
        }

        $validated = $request->validate([
            'name' => 'required|string|max:120',
            'level' => 'required|string|in:main,group,subcategory',
            'main_category' => 'required|string|max:120',
            'parent_id' => 'nullable|integer|exists:categories,id',
            'group_name' => 'nullable|string|max:120',
            'sku_prefix' => 'nullable|string|max:16',
            'slug' => 'nullable|string|max:160',
            'sort_order' => 'nullable|integer|min:0|max:9999',
            'classification_scope' => 'nullable|string|max:500',
            'is_active' => 'nullable|boolean',
            'new_products' => 'nullable|array|max:100',
            'new_products.*.product_name' => 'required|string|max:255',
            'new_products.*.product_code' => 'nullable|string|max:255',
            'new_products.*.brand' => 'nullable|string|max:255',
            'new_products.*.description' => 'nullable|string',
            'new_products.*.unit_price' => 'required|numeric|min:0',
            'new_products.*.cost_price' => 'nullable|numeric|min:0',
            'new_products.*.stock_quantity' => 'nullable|integer|min:0',
            'new_products.*.unit' => 'nullable|string|max:50',
            'new_products.*.status' => 'nullable|string|in:Active,Inactive',
            'assign_product_ids' => 'nullable|array|max:500',
            'assign_product_ids.*' => 'integer|exists:products,product_id',
        ]);

        $name = trim($validated['name']);
        $level = $validated['level'];
        $mainName = trim($validated['main_category']);
        $parentId = $validated['parent_id'] ?? null;
        $groupName = isset($validated['group_name']) ? trim($validated['group_name']) : null;

        if ($level === 'main') {
            $mainName = $name;
            $parentId = null;
            $groupName = null;
        } elseif ($level === 'group') {
            if (!$parentId) {
                $mainNode = Category::where('level', 'main')->where('name', $mainName)->first();
                $parentId = $mainNode?->id;
            }
            $groupName = $name;
        } elseif ($level === 'subcategory') {
            $parentNode = $parentId ? Category::find($parentId) : null;
            if (!$parentNode && $groupName) {
                $parentNode = Category::where('level', 'group')
                    ->where('main_category', $mainName)
                    ->where('name', $groupName)
                    ->first();
            }
            if ($parentNode) {
                $parentId = $parentNode->id;
                $mainName = $parentNode->main_category ?: $mainName;
                $groupName = $parentNode->name;
            }
        }

        $nextOrder = isset($validated['sort_order'])
            ? (int) $validated['sort_order']
            : (((int) Category::where('level', $level)->max('sort_order')) + 1);
        $branchId = Schema::hasColumn('categories', 'branch_id') ? $this->resolveBranchId($request) : null;
        $customPrefix = isset($validated['sku_prefix']) && trim($validated['sku_prefix']) !== ''
            ? strtoupper(trim($validated['sku_prefix']))
            : CategoryFramework::skuPrefix($mainName);
        $slugBase = isset($validated['slug']) && trim($validated['slug']) !== ''
            ? trim($validated['slug'])
            : "{$mainName} {$groupName} {$name}";

        $result = DB::transaction(function () use (
            $name, $slugBase, $level, $parentId, $mainName, $groupName, $branchId, $customPrefix, $validated, $nextOrder, $request
        ) {
            $category = Category::create([
                'name' => $name,
                'slug' => $this->uniqueSlug($slugBase),
                'level' => $level,
                'parent_id' => $parentId,
                'main_category' => $mainName,
                'group_name' => $groupName,
                'branch_id' => $branchId,
                'sku_prefix' => $customPrefix,
                'classification_scope' => $validated['classification_scope'] ?? null,
                'sort_order' => $nextOrder,
                'is_active' => $request->has('is_active') ? (bool) $validated['is_active'] : true,
            ]);

            CategoryFramework::clearLookupCache();

            $attached = $this->attachMultipleProducts(
                $category,
                $request,
                $validated['new_products'] ?? [],
                $validated['assign_product_ids'] ?? []
            );

            return [
                'category' => $category,
                'attached' => $attached,
            ];
        });

        $category = $result['category'];
        $attached = $result['attached'];
        $createdCount = $attached['created_count'];
        $assignedCount = $attached['assigned_count'];

        $descExtra = [];
        if ($createdCount > 0) {
            $descExtra[] = "{$createdCount} new product(s)";
        }
        if ($assignedCount > 0) {
            $descExtra[] = "{$assignedCount} assigned product(s)";
        }
        $extraText = !empty($descExtra) ? ' with ' . implode(' and ', $descExtra) : '';

        SystemLog::create([
            'user_id' => $request->user()?->user_id,
            'action' => 'CREATE',
            'module' => 'Categories',
            'description' => "Created category: {$category->name} ({$category->level}){$extraText}",
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
        ]);

        CategoryFramework::clearLookupCache();
        SyncController::bumpMutation(['categories', 'products']);

        return response()->json([
            'message' => "Category created successfully{$extraText}",
            'category' => $this->formatRow($category),
            'created_products_count' => $createdCount,
            'assigned_products_count' => $assignedCount,
        ], 201);
    }

    public function update(Request $request, $id)
    {
        $category = Category::find($id);
        if (!$category) {
            if ($denied = $this->authorizeManage($request)) {
                return $denied;
            }
            return response()->json(['message' => 'Category not found.'], 404);
        }

        if ($denied = $this->authorizeManage($request, $category)) {
            return $denied;
        }

        $validated = $request->validate([
            'name' => 'required|string|max:120',
            'main_category' => 'nullable|string|max:120',
            'parent_id' => 'nullable|integer|exists:categories,id',
            'sku_prefix' => 'nullable|string|max:16',
            'slug' => 'nullable|string|max:160',
            'sort_order' => 'nullable|integer|min:0|max:9999',
            'classification_scope' => 'nullable|string|max:500',
            'is_active' => 'nullable|boolean',
            'new_products' => 'nullable|array|max:100',
            'new_products.*.product_name' => 'required|string|max:255',
            'new_products.*.product_code' => 'nullable|string|max:255',
            'new_products.*.brand' => 'nullable|string|max:255',
            'new_products.*.description' => 'nullable|string',
            'new_products.*.unit_price' => 'required|numeric|min:0',
            'new_products.*.cost_price' => 'nullable|numeric|min:0',
            'new_products.*.stock_quantity' => 'nullable|integer|min:0',
            'new_products.*.unit' => 'nullable|string|max:50',
            'new_products.*.status' => 'nullable|string|in:Active,Inactive',
            'assign_product_ids' => 'nullable|array|max:500',
            'assign_product_ids.*' => 'integer|exists:products,product_id',
        ]);

        $oldName = $category->name;
        $newName = trim($validated['name']);
        $newMain = isset($validated['main_category']) && trim($validated['main_category']) !== ''
            ? trim($validated['main_category'])
            : $category->main_category;

        $attached = DB::transaction(function () use ($category, $validated, $request, $oldName, $newName, $newMain) {
            $updates = [
                'name' => $newName,
                'classification_scope' => array_key_exists('classification_scope', $validated)
                    ? $validated['classification_scope']
                    : $category->classification_scope,
            ];

            if ($request->has('is_active')) {
                $updates['is_active'] = (bool) $validated['is_active'];
            }

            if ($request->has('branch_id') && Schema::hasColumn('categories', 'branch_id')) {
                $updates['branch_id'] = $this->resolveBranchId($request);
            }

            if (array_key_exists('sort_order', $validated) && $validated['sort_order'] !== null) {
                $updates['sort_order'] = (int) $validated['sort_order'];
            }

            if (isset($validated['slug']) && trim($validated['slug']) !== '') {
                $updates['slug'] = $this->uniqueSlug(trim($validated['slug']), $category->id);
            }

            if ($category->level === 'main') {
                $updates['main_category'] = $newName;
                $updates['sku_prefix'] = CategoryFramework::skuPrefix($newName);
            } elseif ($category->level === 'group') {
                $updates['main_category'] = $newMain;
                $updates['group_name'] = $newName;
                $updates['sku_prefix'] = CategoryFramework::skuPrefix($newMain);
                if ($newMain !== $category->main_category) {
                    $mainNode = Category::where('level', 'main')->where('name', $newMain)->first();
                    if ($mainNode) {
                        $updates['parent_id'] = $mainNode->id;
                    }
                }
            } elseif ($category->level === 'subcategory') {
                if (!empty($validated['parent_id']) && (int) $validated['parent_id'] !== (int) $category->parent_id) {
                    $grp = Category::find($validated['parent_id']);
                    if ($grp) {
                        $updates['parent_id'] = $grp->id;
                        $updates['group_name'] = $grp->name;
                        $updates['main_category'] = $grp->main_category;
                        $updates['sku_prefix'] = $grp->sku_prefix;
                    }
                } else {
                    $updates['main_category'] = $newMain;
                    $updates['sku_prefix'] = CategoryFramework::skuPrefix($newMain);
                }
            }

            if (isset($validated['sku_prefix']) && trim($validated['sku_prefix']) !== '') {
                $updates['sku_prefix'] = strtoupper(trim($validated['sku_prefix']));
            }

            $category->update($updates);

            if ($oldName !== $newName) {
                Product::where('category', $oldName)->update(['category' => $newName]);
            }

            if ($category->level === 'group') {
                $childUpdates = [
                    'group_name' => $newName,
                    'main_category' => $category->main_category,
                    'sku_prefix' => $category->sku_prefix,
                ];
                if ($request->has('branch_id') && Schema::hasColumn('categories', 'branch_id')) {
                    $childUpdates['branch_id'] = $category->branch_id;
                }
                Category::where('parent_id', $category->id)->update($childUpdates);
            } elseif ($category->level === 'main') {
                $mainUpdates = [];
                if ($oldName !== $newName) {
                    $mainUpdates['main_category'] = $newName;
                }
                if ($request->has('branch_id') && Schema::hasColumn('categories', 'branch_id')) {
                    $mainUpdates['branch_id'] = $category->branch_id;
                }
                if (!empty($mainUpdates)) {
                    Category::where('main_category', $oldName)->where('id', '!=', $category->id)->update($mainUpdates);
                }
            }

            if ($request->has('branch_id')) {
                $childCategoryNames = [];
                if ($category->level === 'group') {
                    $childCategoryNames = Category::where('parent_id', $category->id)->pluck('name')->all();
                } elseif ($category->level === 'main') {
                    $childCategoryNames = Category::where('main_category', $newName)->pluck('name')->all();
                }
                $affectedCategoryNames = array_values(array_unique(array_filter(array_merge(
                    [$oldName, $newName],
                    CategoryFramework::matchingCategories($newName),
                    CategoryFramework::matchingCategories($oldName),
                    $childCategoryNames
                ))));
                if (!empty($affectedCategoryNames)) {
                    Product::whereIn('category', $affectedCategoryNames)->update([
                        'branch_id' => $category->branch_id,
                    ]);
                }
            }

            CategoryFramework::clearLookupCache();

            return $this->attachMultipleProducts(
                $category,
                $request,
                $validated['new_products'] ?? [],
                $validated['assign_product_ids'] ?? []
            );
        });

        $category->refresh();

        $createdCount = $attached['created_count'];
        $assignedCount = $attached['assigned_count'];
        $descExtra = [];
        if ($createdCount > 0) {
            $descExtra[] = "{$createdCount} new product(s)";
        }
        if ($assignedCount > 0) {
            $descExtra[] = "{$assignedCount} assigned product(s)";
        }
        $extraText = !empty($descExtra) ? ' with ' . implode(' and ', $descExtra) : '';

        SystemLog::create([
            'user_id' => $request->user()?->user_id,
            'action' => 'UPDATE',
            'module' => 'Categories',
            'description' => "Updated category: {$category->name}{$extraText}",
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
        ]);

        CategoryFramework::clearLookupCache();
        SyncController::bumpMutation(['categories', 'products']);

        return response()->json([
            'message' => "Category updated successfully{$extraText}",
            'category' => $this->formatRow($category),
            'created_products_count' => $createdCount,
            'assigned_products_count' => $assignedCount,
        ]);
    }

    public function toggleStatus(Request $request, $id)
    {
        $category = Category::find($id);
        if (!$category) {
            if ($denied = $this->authorizeManage($request)) {
                return $denied;
            }
            return response()->json(['message' => 'Category not found.'], 404);
        }

        if ($denied = $this->authorizeManage($request, $category)) {
            return $denied;
        }

        $category->is_active = !$category->is_active;
        $category->save();

        SystemLog::create([
            'user_id' => $request->user()?->user_id,
            'action' => 'UPDATE',
            'module' => 'Categories',
            'description' => ($category->is_active ? 'Activated' : 'Deactivated') . " category: {$category->name}",
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
        ]);

        SyncController::bumpMutation(['categories', 'products']);

        return response()->json([
            'message' => 'Category ' . ($category->is_active ? 'activated' : 'deactivated') . ' successfully',
            'category' => $this->formatRow($category),
        ]);
    }

    public function destroy(Request $request, $id)
    {
        $category = Category::find($id);
        if (!$category) {
            if ($denied = $this->authorizeManage($request)) {
                return $denied;
            }
            return response()->json(['message' => 'Category not found.'], 404);
        }

        if ($denied = $this->authorizeManage($request, $category)) {
            return $denied;
        }

        $childIds = Category::where('parent_id', $category->id)->pluck('id')->all();
        $namesToCheck = array_values(array_unique(array_merge(
            [$category->name],
            CategoryFramework::matchingCategories($category->name),
            Category::whereIn('id', $childIds)->pluck('name')->all()
        )));

        $assignedCount = Product::whereIn('category', $namesToCheck)->count();
        if ($assignedCount > 0) {
            return response()->json([
                'message' => "Cannot delete \"{$category->name}\" because {$assignedCount} product(s) are assigned to it. Deactivate it instead.",
            ], 422);
        }

        $catName = $category->name;
        DB::transaction(function () use ($category, $childIds) {
            if (!empty($childIds)) {
                Category::whereIn('id', $childIds)->delete();
            }
            $category->delete();
        });

        SystemLog::create([
            'user_id' => $request->user()?->user_id,
            'action' => 'DELETE',
            'module' => 'Categories',
            'description' => "Deleted category: {$catName}",
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
        ]);

        SyncController::bumpMutation(['categories', 'products']);

        return response()->json([
            'message' => 'Category deleted successfully',
        ]);
    }
}
