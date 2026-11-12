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

class CategoryController extends Controller
{
    public function index(Request $request)
    {
        $fp = SyncController::computeFingerprint('categories');
        $mainFilter = trim((string) $request->query('main_category', ''));
        $includeInactive = $request->boolean('include_inactive') && $request->user() !== null;
        $cacheKey = 'pace_categories_' . md5($mainFilter . '|' . ($includeInactive ? 'all' : 'active')) . '_' . $fp;

        $payload = Cache::remember($cacheKey, 2, function () use ($mainFilter, $includeInactive) {
            if (Schema::hasTable('categories')) {
                if (!Category::exists()) {
                    CategoryFramework::syncDatabase();
                }

                $query = Category::query()
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
                        'is_active' => (bool) $main->is_active,
                        'groups' => $mainGroups->map(function ($grp) use ($subcategories) {
                            $grpSubs = $subcategories->where('parent_id', $grp->id)->values();
                            return [
                                'id' => $grp->id,
                                'name' => $grp->name,
                                'slug' => $grp->slug,
                                'scope' => $grp->classification_scope,
                                'is_active' => (bool) $grp->is_active,
                                'subcategories' => $grpSubs->map(function ($sub) {
                                    return [
                                        'id' => $sub->id,
                                        'name' => $sub->name,
                                        'slug' => $sub->slug,
                                        'scope' => $sub->classification_scope,
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

    private function authorizeManage(Request $request)
    {
        $user = $request->user();
        if (!$user || !in_array($user->role, ['Administrator', 'Store Administrator', 'Store Admin'], true)) {
            return response()->json(['message' => 'Unauthorized to modify categories.'], 403);
        }
        return null;
    }

    private function formatRow(Category $category): array
    {
        return [
            'id' => $category->id,
            'name' => $category->name,
            'slug' => $category->slug,
            'level' => $category->level,
            'parent_id' => $category->parent_id,
            'main_category' => $category->main_category,
            'group_name' => $category->group_name,
            'sku_prefix' => $category->sku_prefix,
            'scope' => $category->classification_scope,
            'sort_order' => (int) $category->sort_order,
            'is_active' => (bool) $category->is_active,
        ];
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
            'classification_scope' => 'nullable|string|max:500',
            'is_active' => 'nullable|boolean',
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

        $nextOrder = ((int) Category::where('level', $level)->max('sort_order')) + 1;

        $category = Category::create([
            'name' => $name,
            'slug' => $this->uniqueSlug("{$mainName} {$groupName} {$name}"),
            'level' => $level,
            'parent_id' => $parentId,
            'main_category' => $mainName,
            'group_name' => $groupName,
            'sku_prefix' => CategoryFramework::skuPrefix($mainName),
            'classification_scope' => $validated['classification_scope'] ?? null,
            'sort_order' => $nextOrder,
            'is_active' => $request->has('is_active') ? (bool) $validated['is_active'] : true,
        ]);

        SystemLog::create([
            'user_id' => $request->user()?->user_id,
            'action' => 'CREATE',
            'module' => 'Categories',
            'description' => "Created category: {$category->name} ({$category->level})",
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
        ]);

        SyncController::bumpMutation(['categories', 'products']);

        return response()->json([
            'message' => 'Category created successfully',
            'category' => $this->formatRow($category),
        ], 201);
    }

    public function update(Request $request, $id)
    {
        if ($denied = $this->authorizeManage($request)) {
            return $denied;
        }

        $category = Category::find($id);
        if (!$category) {
            return response()->json(['message' => 'Category not found.'], 404);
        }

        $validated = $request->validate([
            'name' => 'required|string|max:120',
            'main_category' => 'nullable|string|max:120',
            'parent_id' => 'nullable|integer|exists:categories,id',
            'classification_scope' => 'nullable|string|max:500',
            'is_active' => 'nullable|boolean',
        ]);

        $oldName = $category->name;
        $newName = trim($validated['name']);
        $newMain = isset($validated['main_category']) && trim($validated['main_category']) !== ''
            ? trim($validated['main_category'])
            : $category->main_category;

        DB::transaction(function () use ($category, $validated, $request, $oldName, $newName, $newMain) {
            $updates = [
                'name' => $newName,
                'classification_scope' => array_key_exists('classification_scope', $validated)
                    ? $validated['classification_scope']
                    : $category->classification_scope,
            ];

            if ($request->has('is_active')) {
                $updates['is_active'] = (bool) $validated['is_active'];
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

            $category->update($updates);

            if ($category->level === 'group') {
                Category::where('parent_id', $category->id)->update([
                    'group_name' => $newName,
                    'main_category' => $category->main_category,
                    'sku_prefix' => $category->sku_prefix,
                ]);
            } elseif ($category->level === 'main' && $oldName !== $newName) {
                Category::where('main_category', $oldName)->where('id', '!=', $category->id)->update([
                    'main_category' => $newName,
                ]);
            }
        });

        $category->refresh();

        SystemLog::create([
            'user_id' => $request->user()?->user_id,
            'action' => 'UPDATE',
            'module' => 'Categories',
            'description' => "Updated category: {$category->name}",
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
        ]);

        SyncController::bumpMutation(['categories', 'products']);

        return response()->json([
            'message' => 'Category updated successfully',
            'category' => $this->formatRow($category),
        ]);
    }

    public function toggleStatus(Request $request, $id)
    {
        if ($denied = $this->authorizeManage($request)) {
            return $denied;
        }

        $category = Category::find($id);
        if (!$category) {
            return response()->json(['message' => 'Category not found.'], 404);
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
        if ($denied = $this->authorizeManage($request)) {
            return $denied;
        }

        $category = Category::find($id);
        if (!$category) {
            return response()->json(['message' => 'Category not found.'], 404);
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
