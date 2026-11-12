<?php

namespace App\Services;

use App\Models\Category;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

/**
 * Authoritative 3-Level Master Category Framework
 * Structure: 3 Main Domains -> 13 Groups -> 36 Subcategories (Categories Only).
 */
class CategoryFramework
{
    public const FRAMEWORK = [
        [
            'main' => 'Furniture',
            'sku_prefix' => 'FUR',
            'scope' => 'Interior & exterior residential furnishings across seating, sleeping, dining, workspace, outdoor, and accent zones.',
            'groups' => [
                [
                    'name' => 'Living Room Furniture',
                    'scope' => 'Seating, surface furnishings, and media storage for communal living rooms.',
                    'subcategories' => [
                        ['name' => 'Seating', 'scope' => 'Primary and supplemental residential seating systems engineered for communal living areas.'],
                        ['name' => 'Tables', 'scope' => 'Structural and utility surface furnishings for living-area organization and beverage placement.'],
                        ['name' => 'Media & Entertainment Storage', 'scope' => 'Enclosed and open console structures designed to house audio-visual hardware and media collections.'],
                    ],
                ],
                [
                    'name' => 'Bedroom Furniture',
                    'scope' => 'Sleep systems, bedroom storage cabinetry, and bedroom accent units.',
                    'subcategories' => [
                        ['name' => 'Beds & Sleep Systems', 'scope' => 'Structural sleeping frames, foundational supports, and ergonomic sleep surfaces.'],
                        ['name' => 'Bedroom Storage', 'scope' => 'Vertical and horizontal compartmentalized casegoods for apparel and personal linens.'],
                        ['name' => 'Accents & Vanities', 'scope' => 'Grooming stations, mirrored dressing units, and supplemental bedroom accent furnishings.'],
                    ],
                ],
                [
                    'name' => 'Dining & Kitchen Furniture',
                    'scope' => 'Dining seating, dining surfaces, and kitchen or bar storage cabinetry.',
                    'subcategories' => [
                        ['name' => 'Dining Seating', 'scope' => 'Upright and counter-height seating systems designed for formal and casual meal areas.'],
                        ['name' => 'Dining Tables', 'scope' => 'Fixed and extendable dining surfaces for residential dining rooms and kitchen spaces.'],
                        ['name' => 'Kitchen & Bar Storage', 'scope' => 'Freestanding culinary utility cabinetry, serving carts, and beverage organization units.'],
                    ],
                ],
                [
                    'name' => 'Home Office Furniture',
                    'scope' => 'Workstations, ergonomic task seating, and residential office filing storage.',
                    'subcategories' => [
                        ['name' => 'Desks & Workstations', 'scope' => 'Dedicated work surfaces and modular task configurations for residential workspaces.'],
                        ['name' => 'Office Seating', 'scope' => 'Adjustable ergonomic task and executive seating designed for sustained workspace use.'],
                        ['name' => 'Office Storage & Filing', 'scope' => 'Document archiving units, mobile pedestals, and modular workspace shelving systems.'],
                    ],
                ],
                [
                    'name' => 'Outdoor & Patio Furniture',
                    'scope' => 'Weather-resistant patio seating, outdoor dining sets, and sun lounging.',
                    'subcategories' => [
                        ['name' => 'Patio Seating', 'scope' => 'Weather-resistant seating configurations engineered for exterior residential living areas.'],
                        ['name' => 'Outdoor Dining', 'scope' => 'Exterior-grade dining surfaces and coordinated seating built for open-air entertaining.'],
                        ['name' => 'Shade & Sun Lounging', 'scope' => 'UV-shielding canopy structures and reclining exterior relaxation furnishings.'],
                    ],
                ],
                [
                    'name' => 'Entryway & Accent Furniture',
                    'scope' => 'Foyer benches, entryway storage, and hallway accent consoles.',
                    'subcategories' => [
                        ['name' => 'Entryway Storage & Benches', 'scope' => 'Transitional foyer organizers combining seating surfaces with footwear and outerwear storage.'],
                        ['name' => 'Hallway Accents', 'scope' => 'Narrow-profile console structures and perimeter furnishings for residential corridors.'],
                    ],
                ],
            ],
        ],
        [
            'main' => 'Appliances',
            'sku_prefix' => 'APP',
            'scope' => 'Major home systems, compact culinary appliances, climate comfort, floor care, and consumer electronics & audio-visual systems.',
            'groups' => [
                [
                    'name' => 'Major Home Appliances',
                    'scope' => 'Large-scale kitchen refrigeration, cooking, dishwashing, and laundry units.',
                    'subcategories' => [
                        ['name' => 'Refrigeration & Freezers', 'scope' => 'Large-capacity thermal preservation units for chilled and frozen food storage.'],
                        ['name' => 'Cooking & Baking Appliances', 'scope' => 'Full-scale freestanding and built-in thermal culinary appliances.'],
                        ['name' => 'Dishwashers', 'scope' => 'Automated plumbed sanitation and drying units for dishware and culinary utensils.'],
                        ['name' => 'Laundry Appliances', 'scope' => 'High-capacity residential garment washing, moisture extraction, and drying units.'],
                    ],
                ],
                [
                    'name' => 'Small Kitchen Appliances',
                    'scope' => 'Countertop culinary heating, food preparation, and beverage equipment.',
                    'subcategories' => [
                        ['name' => 'Countertop Cooking', 'scope' => 'Compact electric thermal appliances designed for localized kitchen countertop preparation.'],
                        ['name' => 'Food Preparation', 'scope' => 'Motorized and mechanical countertop units for ingredient processing, mixing, and blending.'],
                        ['name' => 'Beverage Preparation', 'scope' => 'Specialized countertop thermal extraction, brewing, and hydration appliances.'],
                    ],
                ],
                [
                    'name' => 'Climate Control & Home Comfort',
                    'scope' => 'Cooling, heating, ventilation, and indoor air quality regulation systems.',
                    'subcategories' => [
                        ['name' => 'Cooling & Ventilation', 'scope' => 'Active thermal cooling, airflow circulation, and interior exhaust regulation units.'],
                        ['name' => 'Heating', 'scope' => 'Residential ambient thermal warming units for localized and whole-room comfort.'],
                        ['name' => 'Air Quality & Moisture Control', 'scope' => 'Atmospheric particulate filtration, humidification, and dehumidification units.'],
                    ],
                ],
                [
                    'name' => 'Floor Care & Cleaning Appliances',
                    'scope' => 'Dry vacuuming and hard-floor steam cleaning equipment.',
                    'subcategories' => [
                        ['name' => 'Vacuum Cleaners', 'scope' => 'Dry-suction and particulate-collection appliances for carpeted and solid flooring.'],
                        ['name' => 'Hard Floor & Steam Cleaners', 'scope' => 'Wet-scrubbing, pressurized vapor, and sanitizing appliances for sealed floor maintenance.'],
                    ],
                ],
                [
                    'name' => 'Home Entertainment & Display',
                    'scope' => 'Residential television displays and large-format optical projection systems.',
                    'subcategories' => [
                        ['name' => 'Televisions & Displays', 'scope' => 'Integrated residential visual display panels and flat-screen entertainment systems.'],
                        ['name' => 'Projection Systems', 'scope' => 'Optical image-projection hardware and companion viewing surfaces for large-format display.'],
                    ],
                ],
                [
                    'name' => 'Audio Systems',
                    'scope' => 'Home theater soundbars, wireless speakers, and component hi-fi audio.',
                    'subcategories' => [
                        ['name' => 'Soundbars & Home Theater', 'scope' => 'Multi-channel spatial acoustic systems and integrated surround audio architectures.'],
                        ['name' => 'Wireless & Portable Audio', 'scope' => 'Battery-operated and networked wireless acoustic playback units for flexible placement.'],
                        ['name' => 'Component & Hi-Fi Audio', 'scope' => 'Dedicated amplification, signal-processing, and high-fidelity acoustic transducer components.'],
                    ],
                ],
                [
                    'name' => 'Media & Mounting Accessories',
                    'scope' => 'Structural AV wall mounting hardware and signal/media management accessories.',
                    'subcategories' => [
                        ['name' => 'AV Mounting & Hardware', 'scope' => 'Articulated wall mounts, structural brackets, and load-bearing AV installation hardware.'],
                        ['name' => 'Media Management', 'scope' => 'Signal-routing interconnects, power conditioning, and media organization accessories.'],
                    ],
                ],
            ],
        ],
    ];

    private const ALIASES = [
        'furniture' => 'Furniture',
        'furniture categories' => 'Furniture',
        'appliances' => 'Appliances',
        'appliance categories' => 'Appliances',
        'home appliances' => 'Appliances',
        'consumer electronics & audio-visual' => 'Appliances',
        'consumer electronics & audio visual' => 'Appliances',
        'consumer electronics' => 'Appliances',
        'electronics' => 'Appliances',
        'audio-visual' => 'Appliances',
    ];

    private static ?array $lookupCache = null;

    private static function buildLookup(): array
    {
        if (self::$lookupCache !== null) {
            return self::$lookupCache;
        }

        $exactMap = [];
        $mainBranches = [];
        $groupBranches = [];

        foreach (self::FRAMEWORK as $domain) {
            $mainName = $domain['main'];
            $prefix = $domain['sku_prefix'];

            $exactMap[strtolower($mainName)] = [
                'category' => $mainName,
                'main_category' => $mainName,
                'category_group' => null,
                'subcategory' => null,
                'level' => 'main',
                'sku_prefix' => $prefix,
            ];

            $mainBranches[$mainName] = [$mainName];

            foreach ($domain['groups'] as $group) {
                $groupName = $group['name'];

                $exactMap[strtolower($groupName)] = [
                    'category' => $groupName,
                    'main_category' => $mainName,
                    'category_group' => $groupName,
                    'subcategory' => null,
                    'level' => 'group',
                    'sku_prefix' => $prefix,
                ];

                $mainBranches[$mainName][] = $groupName;
                $groupBranches[$groupName] = [$groupName];

                foreach ($group['subcategories'] as $sub) {
                    $subName = $sub['name'];

                    $exactMap[strtolower($subName)] = [
                        'category' => $subName,
                        'main_category' => $mainName,
                        'category_group' => $groupName,
                        'subcategory' => $subName,
                        'level' => 'subcategory',
                        'sku_prefix' => $prefix,
                    ];

                    $mainBranches[$mainName][] = $subName;
                    $groupBranches[$groupName][] = $subName;
                }
            }
        }

        self::$lookupCache = [
            'exact' => $exactMap,
            'mainBranches' => $mainBranches,
            'groupBranches' => $groupBranches,
        ];

        return self::$lookupCache;
    }

    public static function framework(): array
    {
        return self::FRAMEWORK;
    }

    public static function mainCategories(): array
    {
        return array_map(static fn ($d) => $d['main'], self::FRAMEWORK);
    }

    /**
     * Resolves any Main Category, Group, Subcategory, or legacy/alias value into its
     * normalized 3-level parent hierarchy and SKU prefix.
     */
    public static function resolveHierarchy(?string $category): array
    {
        $raw = trim((string) $category);
        if ($raw === '') {
            return [
                'category' => '',
                'main_category' => null,
                'category_group' => null,
                'subcategory' => null,
                'level' => 'unknown',
                'sku_prefix' => 'PRD',
            ];
        }

        $lookup = self::buildLookup();
        $lower = strtolower($raw);
        if (isset(self::ALIASES[$lower])) {
            $lower = strtolower(self::ALIASES[$lower]);
        }

        if (isset($lookup['exact'][$lower])) {
            return $lookup['exact'][$lower];
        }

        if (Schema::hasTable('categories')) {
            $dbCat = Category::whereRaw('LOWER(name) = ?', [$lower])->first();
            if ($dbCat) {
                $dbMain = $dbCat->main_category ?: ($dbCat->level === 'main' ? $dbCat->name : null);
                $dbPrefix = $dbMain === 'Furniture'
                    ? 'FUR'
                    : ($dbMain === 'Appliances' ? 'APP' : ($dbCat->sku_prefix ?: 'PRD'));

                return [
                    'category' => $dbCat->name,
                    'main_category' => $dbMain,
                    'category_group' => $dbCat->level === 'group' ? $dbCat->name : ($dbCat->group_name ?: null),
                    'subcategory' => $dbCat->level === 'subcategory' ? $dbCat->name : null,
                    'level' => $dbCat->level ?: 'custom',
                    'sku_prefix' => $dbPrefix,
                ];
            }
        }

        // Heuristic fallback for any legacy custom labels
        $prefix = strtoupper(substr(preg_replace('/[^A-Za-z0-9]/', '', $raw), 0, 3)) ?: 'PRD';
        if (str_contains($lower, 'furniture')) {
            return [
                'category' => $raw,
                'main_category' => 'Furniture',
                'category_group' => null,
                'subcategory' => null,
                'level' => 'legacy',
                'sku_prefix' => 'FUR',
            ];
        }
        if (str_contains($lower, 'appliance') || str_contains($lower, 'electronic') || str_contains($lower, 'audio') || str_contains($lower, 'television') || str_contains($lower, 'display')) {
            return [
                'category' => $raw,
                'main_category' => 'Appliances',
                'category_group' => null,
                'subcategory' => null,
                'level' => 'legacy',
                'sku_prefix' => 'APP',
            ];
        }

        return [
            'category' => $raw,
            'main_category' => null,
            'category_group' => null,
            'subcategory' => null,
            'level' => 'custom',
            'sku_prefix' => $prefix,
        ];
    }

    public static function canonicalName(string $category): string
    {
        $resolved = self::resolveHierarchy($category);
        return $resolved['category'] !== '' ? $resolved['category'] : trim($category);
    }

    public static function skuPrefix(?string $category): string
    {
        $resolved = self::resolveHierarchy($category);
        return $resolved['sku_prefix'] ?: 'PRD';
    }

    /**
     * Returns all category strings in `products.category` that belong under the given
     * Main Category, Category Group, or Subcategory filter (preserving legacy rows).
     */
    public static function matchingCategories(string $filterCategory): array
    {
        $raw = trim($filterCategory);
        if ($raw === '' || strcasecmp($raw, 'All') === 0) {
            return [];
        }

        $resolved = self::resolveHierarchy($raw);
        $lookup = self::buildLookup();
        $matches = [$raw];

        if ($resolved['level'] === 'main' && $resolved['main_category']) {
            $matches = array_merge($matches, $lookup['mainBranches'][$resolved['main_category']] ?? []);
            // Include alias keys that resolve directly to this main category
            foreach (self::ALIASES as $alias => $target) {
                if ($target === $resolved['main_category']) {
                    $matches[] = $alias;
                    $matches[] = ucwords($alias);
                }
            }
        } elseif ($resolved['level'] === 'group' && $resolved['category_group']) {
            $matches = array_merge($matches, $lookup['groupBranches'][$resolved['category_group']] ?? []);
        } elseif ($resolved['category'] !== '') {
            $matches[] = $resolved['category'];
        }

        if (Schema::hasTable('categories')) {
            $catNode = Category::where('name', $raw)->first();
            if ($catNode) {
                $descendants = Category::where('parent_id', $catNode->id)->pluck('name')->all();
                $matches = array_merge($matches, $descendants);
                if ($catNode->level === 'main') {
                    $deep = Category::where('main_category', $catNode->name)->pluck('name')->all();
                    $matches = array_merge($matches, $deep);
                }
            }
        }

        return array_values(array_unique(array_filter($matches, static fn ($v) => $v !== '')));
    }

    /**
     * Idempotently syncs ONLY the 3-level category taxonomy into `categories` (zero products touched).
     */
    public static function syncDatabase(): void
    {
        if (!Schema::hasTable('categories')) {
            return;
        }

        $mainOrder = 1;
        foreach (self::FRAMEWORK as $domain) {
            $mainName = $domain['main'];
            $prefix = $domain['sku_prefix'];

            $mainNode = Category::updateOrCreate(
                ['slug' => Str::slug($mainName)],
                [
                    'name' => $mainName,
                    'level' => 'main',
                    'parent_id' => null,
                    'main_category' => $mainName,
                    'group_name' => null,
                    'sku_prefix' => $prefix,
                    'classification_scope' => $domain['scope'],
                    'sort_order' => $mainOrder++,
                    'is_active' => true,
                ]
            );

            $groupOrder = 1;
            foreach ($domain['groups'] as $group) {
                $groupName = $group['name'];
                $targetSlug = Str::slug($mainName . ' ' . $groupName);
                $existingGroup = Category::where('slug', $targetSlug)->first()
                    ?? Category::where('level', 'group')->where('name', $groupName)->first();

                if ($existingGroup) {
                    $existingGroup->update([
                        'name' => $groupName,
                        'slug' => $targetSlug,
                        'level' => 'group',
                        'parent_id' => $mainNode->id,
                        'main_category' => $mainName,
                        'group_name' => $groupName,
                        'sku_prefix' => $prefix,
                        'classification_scope' => $group['scope'],
                        'sort_order' => $groupOrder++,
                        'is_active' => true,
                    ]);
                    $groupNode = $existingGroup;
                } else {
                    $groupNode = Category::create([
                        'name' => $groupName,
                        'slug' => $targetSlug,
                        'level' => 'group',
                        'parent_id' => $mainNode->id,
                        'main_category' => $mainName,
                        'group_name' => $groupName,
                        'sku_prefix' => $prefix,
                        'classification_scope' => $group['scope'],
                        'sort_order' => $groupOrder++,
                        'is_active' => true,
                    ]);
                }

                $subOrder = 1;
                foreach ($group['subcategories'] as $sub) {
                    $subName = $sub['name'];
                    Category::updateOrCreate(
                        ['slug' => Str::slug($groupName . ' ' . $subName)],
                        [
                            'name' => $subName,
                            'level' => 'subcategory',
                            'parent_id' => $groupNode->id,
                            'main_category' => $mainName,
                            'group_name' => $groupName,
                            'sku_prefix' => $prefix,
                            'classification_scope' => $sub['scope'],
                            'sort_order' => $subOrder++,
                            'is_active' => true,
                        ]
                    );
                }
            }
        }

        // Remove legacy separate Consumer Electronics & Audio-Visual main row after groups reparented to Appliances
        Category::where('level', 'main')
            ->where(function ($q) {
                $q->where('slug', 'consumer-electronics-audio-visual')
                  ->orWhere('name', 'Consumer Electronics & Audio-Visual');
            })
            ->delete();
    }
}

