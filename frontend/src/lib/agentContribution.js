export const APPLIANCES_CONTRIBUTION_RATE = 0.12
export const FURNITURE_CONTRIBUTION_RATE = 0.15

const APPLIANCES_KEYWORDS = [
  'appliance',
  'home entertainment',
  'cooling',
  'climate control',
  'kitchen appliance',
  'laundry',
  'cleaning',
  'small home',
  'television',
  'tv',
  'audio',
  'soundbar',
  'home theater',
  'air condition',
  'aircon',
  'air cooler',
  'fan',
  'refrigerator',
  'freezer',
  'induction',
  'stove',
  'range',
  'oven',
  'microwave',
  'rice cooker',
  'coffee maker',
  'blender',
  'toaster',
  'washing machine',
  'washer',
  'dryer',
  'vacuum',
  'iron',
  'purifier',
  'dispenser',
  'heater',
  'speaker',
  'showcase',
  'beverage',
]

const FURNITURE_KEYWORDS = [
  'furniture',
  'living room',
  'bedroom',
  'dining',
  'office',
  'study',
  'outdoor',
  'utility',
  'sofa',
  'sectional',
  'couch',
  'coffee table',
  'side table',
  'tv stand',
  'console',
  'bed',
  'wardrobe',
  'cabinet',
  'dresser',
  'nightstand',
  'table',
  'chair',
  'stool',
  'buffet',
  'sideboard',
  'desk',
  'bookshelf',
  'shelving',
  'shelf',
  'rack',
  'patio',
  'bench',
  'recliner',
  'ottoman',
  'vanity',
  'cupboard',
  'mattress',
]

export function resolveCategoryDomain(categoryOrProduct) {
  if (!categoryOrProduct) return null

  if (typeof categoryOrProduct === 'object') {
    const main = String(categoryOrProduct.main_category || '').trim().toLowerCase()
    if (main === 'appliances') return 'Appliances'
    if (main === 'furniture') return 'Furniture'
    return (
      resolveCategoryDomain(categoryOrProduct.category) ||
      resolveCategoryDomain(categoryOrProduct.category_group) ||
      resolveCategoryDomain(categoryOrProduct.category_subcategory) ||
      null
    )
  }

  const normalized = String(categoryOrProduct).trim().toLowerCase()
  if (!normalized) return null

  if (normalized === 'appliances' || normalized.includes('appliance')) return 'Appliances'
  if (normalized === 'furniture' || normalized.includes('furniture')) return 'Furniture'

  if (APPLIANCES_KEYWORDS.some(k => normalized.includes(k))) return 'Appliances'
  if (FURNITURE_KEYWORDS.some(k => normalized.includes(k))) return 'Furniture'

  return null
}

export function getRateForDomain(domain) {
  if (domain === 'Appliances') return APPLIANCES_CONTRIBUTION_RATE
  if (domain === 'Furniture') return FURNITURE_CONTRIBUTION_RATE
  return 0
}

export function computeItemContribution(netLineTotal, categoryOrProduct, hasAgent = true) {
  const net = Math.max(0, Number(netLineTotal) || 0)
  const domain = resolveCategoryDomain(categoryOrProduct)
  if (!hasAgent || net <= 0 || !domain) {
    return {
      category_domain: domain,
      rate: domain ? getRateForDomain(domain) : 0,
      rate_percent: domain ? Math.round(getRateForDomain(domain) * 100) : 0,
      contribution: 0,
    }
  }

  const rate = getRateForDomain(domain)
  const contribution = Math.round(net * rate * 100) / 100
  return {
    category_domain: domain,
    rate,
    rate_percent: Math.round(rate * 100),
    contribution,
  }
}

export function summarizeAgentContributions(items = [], hasAgent = true) {
  if (!hasAgent) {
    return {
      appliances_sales_total: 0,
      furniture_sales_total: 0,
      appliances_agent_contribution: 0,
      furniture_agent_contribution: 0,
      total_agent_contribution: 0,
      has_unclassified_items: false,
      lines: [],
    }
  }

  let appliancesSales = 0
  let furnitureSales = 0
  let appliancesContrib = 0
  let furnitureContrib = 0
  let hasUnclassifiedItems = false

  const lines = items.map(item => {
    const net = Math.max(0, Number(item.netLineTotal ?? item.lineTotal ?? 0) || 0)
    const source = item.product || item.category || item.category_domain || null
    const calc = computeItemContribution(net, source, true)

    if (calc.category_domain === 'Appliances') {
      appliancesSales += net
      appliancesContrib += calc.contribution
    } else if (calc.category_domain === 'Furniture') {
      furnitureSales += net
      furnitureContrib += calc.contribution
    } else if (net > 0) {
      hasUnclassifiedItems = true
    }

    return calc
  })

  const roundedApp = Math.round(appliancesContrib * 100) / 100
  const roundedFurn = Math.round(furnitureContrib * 100) / 100

  return {
    appliances_sales_total: Math.round(appliancesSales * 100) / 100,
    furniture_sales_total: Math.round(furnitureSales * 100) / 100,
    appliances_agent_contribution: roundedApp,
    furniture_agent_contribution: roundedFurn,
    total_agent_contribution: Math.round((roundedApp + roundedFurn) * 100) / 100,
    has_unclassified_items: hasUnclassifiedItems,
    lines,
  }
}
