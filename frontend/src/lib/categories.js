/**
 * Master Category Framework (Categories Only — Zero Products)
 * Hierarchy: 2 Main Domains (Furniture, Appliances) -> 13 Groups -> 36 Subcategories
 */
export const MASTER_CATEGORY_FRAMEWORK = [
  {
    main: 'Furniture',
    sku_prefix: 'FUR',
    groups: [
      {
        name: 'Living Room Furniture',
        subcategories: [
          { name: 'Seating' },
          { name: 'Tables' },
          { name: 'Media & Entertainment Storage' },
        ],
      },
      {
        name: 'Bedroom Furniture',
        subcategories: [
          { name: 'Beds & Sleep Systems' },
          { name: 'Bedroom Storage' },
          { name: 'Accents & Vanities' },
        ],
      },
      {
        name: 'Dining & Kitchen Furniture',
        subcategories: [
          { name: 'Dining Seating' },
          { name: 'Dining Tables' },
          { name: 'Kitchen & Bar Storage' },
        ],
      },
      {
        name: 'Home Office Furniture',
        subcategories: [
          { name: 'Desks & Workstations' },
          { name: 'Office Seating' },
          { name: 'Office Storage & Filing' },
        ],
      },
      {
        name: 'Outdoor & Patio Furniture',
        subcategories: [
          { name: 'Patio Seating' },
          { name: 'Outdoor Dining' },
          { name: 'Shade & Sun Lounging' },
        ],
      },
      {
        name: 'Entryway & Accent Furniture',
        subcategories: [
          { name: 'Entryway Storage & Benches' },
          { name: 'Hallway Accents' },
        ],
      },
    ],
  },
  {
    main: 'Appliances',
    sku_prefix: 'APP',
    groups: [
      {
        name: 'Major Home Appliances',
        subcategories: [
          { name: 'Refrigeration & Freezers' },
          { name: 'Cooking & Baking Appliances' },
          { name: 'Dishwashers' },
          { name: 'Laundry Appliances' },
        ],
      },
      {
        name: 'Small Kitchen Appliances',
        subcategories: [
          { name: 'Countertop Cooking' },
          { name: 'Food Preparation' },
          { name: 'Beverage Preparation' },
        ],
      },
      {
        name: 'Climate Control & Home Comfort',
        subcategories: [
          { name: 'Cooling & Ventilation' },
          { name: 'Heating' },
          { name: 'Air Quality & Moisture Control' },
        ],
      },
      {
        name: 'Floor Care & Cleaning Appliances',
        subcategories: [
          { name: 'Vacuum Cleaners' },
          { name: 'Hard Floor & Steam Cleaners' },
        ],
      },
      {
        name: 'Home Entertainment & Display',
        subcategories: [
          { name: 'Televisions & Displays' },
          { name: 'Projection Systems' },
        ],
      },
      {
        name: 'Audio Systems',
        subcategories: [
          { name: 'Soundbars & Home Theater' },
          { name: 'Wireless & Portable Audio' },
          { name: 'Component & Hi-Fi Audio' },
        ],
      },
      {
        name: 'Media & Mounting Accessories',
        subcategories: [
          { name: 'AV Mounting & Hardware' },
          { name: 'Media Management' },
        ],
      },
    ],
  },
]

export const MAIN_CATEGORIES = MASTER_CATEGORY_FRAMEWORK.map((d) => d.main)

const DOMAIN_ALIASES = {
  furniture: 'Furniture',
  'furniture categories': 'Furniture',
  appliances: 'Appliances',
  'appliance categories': 'Appliances',
  'home appliances': 'Appliances',
  'consumer electronics & audio-visual': 'Appliances',
  'consumer electronics & audio visual': 'Appliances',
  'consumer electronics': 'Appliances',
  electronics: 'Appliances',
  'audio-visual': 'Appliances',
}

const DOMAIN_BADGE_MAP = {
  Furniture: {
    main: 'Furniture',
    shortLabel: 'Furniture',
    skuPrefix: 'FUR',
    badgeClass: 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300',
    pillActiveClass: 'bg-amber-600 text-white shadow-xs',
  },
  Appliances: {
    main: 'Appliances',
    shortLabel: 'Appliances',
    skuPrefix: 'APP',
    badgeClass: 'bg-blue-100 text-blue-800 dark:bg-blue-950/80 dark:text-blue-300',
    pillActiveClass: 'bg-blue-600 text-white shadow-xs',
  },
}

const DEFAULT_BADGE_META = {
  main: null,
  shortLabel: 'General',
  skuPrefix: 'PRD',
  badgeClass: 'bg-muted text-muted-foreground',
  pillActiveClass: 'bg-primary text-primary-foreground shadow-xs',
}

function normalizeTree(tree = MASTER_CATEGORY_FRAMEWORK) {
  return Array.isArray(tree) && tree.length > 0 ? tree : MASTER_CATEGORY_FRAMEWORK
}

export function buildCategoryLookup(tree = MASTER_CATEGORY_FRAMEWORK) {
  const source = normalizeTree(tree)
  const exactMap = new Map()
  const branchSets = new Map()

  for (const domain of source) {
    const mainName = domain.main
    const skuPrefix = domain.sku_prefix || DOMAIN_BADGE_MAP[mainName]?.skuPrefix || 'PRD'
    const mainSet = new Set([mainName.toLowerCase()])

    exactMap.set(mainName.toLowerCase(), {
      category: mainName,
      mainCategory: mainName,
      categoryGroup: null,
      subcategory: null,
      level: 'main',
      skuPrefix,
    })

    for (const group of domain.groups || []) {
      const groupName = group.name
      const groupSet = new Set([groupName.toLowerCase()])
      mainSet.add(groupName.toLowerCase())

      exactMap.set(groupName.toLowerCase(), {
        category: groupName,
        mainCategory: mainName,
        categoryGroup: groupName,
        subcategory: null,
        level: 'group',
        skuPrefix,
      })

      for (const sub of group.subcategories || []) {
        const subName = typeof sub === 'string' ? sub : sub.name
        mainSet.add(subName.toLowerCase())
        groupSet.add(subName.toLowerCase())

        exactMap.set(subName.toLowerCase(), {
          category: subName,
          mainCategory: mainName,
          categoryGroup: groupName,
          subcategory: subName,
          level: 'subcategory',
          skuPrefix,
        })
      }

      branchSets.set(`group:${groupName.toLowerCase()}`, groupSet)
    }

    for (const [alias, target] of Object.entries(DOMAIN_ALIASES)) {
      if (target === mainName) {
        mainSet.add(alias)
      }
    }

    branchSets.set(`main:${mainName.toLowerCase()}`, mainSet)
  }

  return { exactMap, branchSets }
}

const DEFAULT_LOOKUP = buildCategoryLookup(MASTER_CATEGORY_FRAMEWORK)

/**
 * Resolves a product object or category string into its normalized
 * 3-level hierarchy (Main Category, Category Group, Subcategory) + SKU prefix.
 */
export function resolveCategoryHierarchy(categoryOrProduct, tree = MASTER_CATEGORY_FRAMEWORK) {
  const isObj = categoryOrProduct && typeof categoryOrProduct === 'object'
  const rawCategory = String(isObj ? (categoryOrProduct.category ?? '') : (categoryOrProduct ?? '')).trim()
  const lookup = tree === MASTER_CATEGORY_FRAMEWORK ? DEFAULT_LOOKUP : buildCategoryLookup(tree)

  if (!rawCategory) {
    return {
      category: '',
      mainCategory: isObj ? (categoryOrProduct.main_category || null) : null,
      categoryGroup: isObj ? (categoryOrProduct.category_group || null) : null,
      subcategory: isObj ? (categoryOrProduct.category_subcategory || null) : null,
      level: 'unknown',
      skuPrefix: 'PRD',
    }
  }

  const lower = DOMAIN_ALIASES[rawCategory.toLowerCase()]?.toLowerCase() || rawCategory.toLowerCase()
  const matched = lookup.exactMap.get(lower)
  if (matched) return matched

  if (isObj && categoryOrProduct.main_category) {
    const mainName = categoryOrProduct.main_category
    return {
      category: rawCategory,
      mainCategory: mainName,
      categoryGroup: categoryOrProduct.category_group || null,
      subcategory: categoryOrProduct.category_subcategory || null,
      level: 'custom',
      skuPrefix: DOMAIN_BADGE_MAP[mainName]?.skuPrefix || 'PRD',
    }
  }

  if (lower.includes('furniture')) {
    return { category: rawCategory, mainCategory: 'Furniture', categoryGroup: null, subcategory: null, level: 'legacy', skuPrefix: 'FUR' }
  }
  if (lower.includes('appliance') || lower.includes('electronic') || lower.includes('audio') || lower.includes('television') || lower.includes('display')) {
    return { category: rawCategory, mainCategory: 'Appliances', categoryGroup: null, subcategory: null, level: 'legacy', skuPrefix: 'APP' }
  }

  const fallbackPrefix = rawCategory.replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase() || 'PRD'
  return {
    category: rawCategory,
    mainCategory: null,
    categoryGroup: null,
    subcategory: null,
    level: 'custom',
    skuPrefix: fallbackPrefix,
  }
}

/**
 * Checks whether a product or category matches an active filter at the
 * Main Category, Group, Subcategory, or Sale Items level.
 */
export function matchesCategoryFilter(productOrCategory, filterValue, tree = MASTER_CATEGORY_FRAMEWORK) {
  const filter = String(filterValue || '').trim()
  if (!filter || filter === 'All') return true

  const isObj = productOrCategory && typeof productOrCategory === 'object'
  if (filter === 'Sale Items') {
    return isObj ? Boolean(productOrCategory.discount_price) : false
  }

  const lookup = tree === MASTER_CATEGORY_FRAMEWORK ? DEFAULT_LOOKUP : buildCategoryLookup(tree)
  const filterHier = resolveCategoryHierarchy(filter, tree)
  const itemHier = resolveCategoryHierarchy(productOrCategory, tree)

  const rawCatLower = String(isObj ? (productOrCategory.category ?? '') : (productOrCategory ?? '')).trim().toLowerCase()
  const filterLower = filter.toLowerCase()

  if (rawCatLower === filterLower || itemHier.category.toLowerCase() === filterHier.category.toLowerCase()) {
    return true
  }

  if (filterHier.level === 'main' && filterHier.mainCategory) {
    if (itemHier.mainCategory === filterHier.mainCategory) return true
    const set = lookup.branchSets.get(`main:${filterHier.mainCategory.toLowerCase()}`)
    return Boolean(set && set.has(rawCatLower))
  }

  if (filterHier.level === 'group' && filterHier.categoryGroup) {
    if (itemHier.categoryGroup === filterHier.categoryGroup) return true
    const set = lookup.branchSets.get(`group:${filterHier.categoryGroup.toLowerCase()}`)
    return Boolean(set && set.has(rawCatLower))
  }

  return false
}

export function formatCategoryBreadcrumbs(categoryOrProduct, tree = MASTER_CATEGORY_FRAMEWORK) {
  const h = resolveCategoryHierarchy(categoryOrProduct, tree)
  const parts = [h.mainCategory, h.categoryGroup, h.subcategory].filter(Boolean)
  if (parts.length > 0) return parts.join(' › ')
  return h.category || 'Uncategorized'
}

export function getMainCategoryBadgeMeta(categoryOrProduct, tree = MASTER_CATEGORY_FRAMEWORK) {
  const h = resolveCategoryHierarchy(categoryOrProduct, tree)
  return (h.mainCategory && DOMAIN_BADGE_MAP[h.mainCategory]) || {
    ...DEFAULT_BADGE_META,
    shortLabel: h.category || 'General',
    skuPrefix: h.skuPrefix,
  }
}

export function getNextSkuPrefix(categoryName, tree = MASTER_CATEGORY_FRAMEWORK) {
  return resolveCategoryHierarchy(categoryName, tree).skuPrefix || 'PRD'
}

/**
 * Computes the next domain-specific sequential SKU code starting at '001' independently
 * for Furniture and Appliances (e.g., Furniture -> '001', Appliances -> '001').
 */
export function getNextSkuPreview(
  categoryName,
  tree = MASTER_CATEGORY_FRAMEWORK,
  existingProducts = [],
  nextSkusMap = null
) {
  const domain = resolveCategoryHierarchy(categoryName, tree).mainCategory || getNextSkuPrefix(categoryName, tree)
  const usedNums = new Set()

  for (const p of existingProducts || []) {
    const pDomain = resolveCategoryHierarchy(p, tree).mainCategory || getNextSkuPrefix(p?.category, tree)
    if (pDomain !== domain) continue
    const code = String(p?.product_code || '').trim()
    const m = code.match(/^(\d+)$/)
    if (m) {
      usedNums.add(Number(m[1]))
    }
  }

  let candidate = 1
  if (nextSkusMap && typeof nextSkusMap[domain] === 'string') {
    const m = nextSkusMap[domain].trim().match(/^(\d+)$/)
    if (m) candidate = Math.max(1, Number(m[1]))
  }

  while (usedNums.has(candidate)) {
    candidate += 1
  }

  return String(candidate).padStart(3, '0')
}

/**
 * Returns the flat, user-facing category options for a given Main Category
 * ('Furniture' or 'Appliances'), inserting 'Soundbars & Home Theater' directly
 * after 'Audio Systems' when active under Appliances.
 */
export function getScopedCategoryOptions(mainName, tree = MASTER_CATEGORY_FRAMEWORK) {
  const list = Array.isArray(tree) && tree.length > 0 ? tree : MASTER_CATEGORY_FRAMEWORK
  const domainObj = list.find((d) => d.main === mainName) || null
  const options = []
  for (const grp of domainObj?.groups || []) {
    if (grp?.name && !options.includes(grp.name)) {
      options.push(grp.name)
    }
    if (mainName === 'Appliances' && grp?.name === 'Audio Systems') {
      const subs = Array.isArray(grp.subcategories) ? grp.subcategories : []
      const hasSoundbars = subs.some((s) => (typeof s === 'string' ? s : s?.name) === 'Soundbars & Home Theater')
      if (hasSoundbars && !options.includes('Soundbars & Home Theater')) {
        options.push('Soundbars & Home Theater')
      }
    }
  }
  return options
}

