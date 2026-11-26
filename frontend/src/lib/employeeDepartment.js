export function getEmployeeSubRole(user) {
  if (!user) return null
  const explicit = String(
    user.sub_role || user.employee?.sub_role || user.employee_department || ''
  ).trim().toLowerCase()
  if (explicit === 'collector' || explicit === 'cashier' || explicit === 'utility') {
    return explicit
  }

  const pos = String(user.employee?.position || user.position || '').trim().toLowerCase()
  const dept = String(user.employee?.department || user.department || '').trim().toLowerCase()

  if (pos.includes('collector') || dept.includes('collector')) return 'collector'
  if (pos.includes('cashier') || dept.includes('cashier')) return 'cashier'
  if (pos.includes('utility') || dept.includes('utility')) return 'utility'
  if (pos.includes('sales agent') || dept.includes('sales agent')) return 'sales_agent'
  if (pos.includes('manager') || dept.includes('store admin')) return 'manager'
  return explicit || null
}

export function isCollectorUser(user) {
  const role = String(user?.role || '').trim().toLowerCase()
  return role === 'employee' && getEmployeeSubRole(user) === 'collector'
}

export function isCashierUser(user) {
  const role = String(user?.role || '').trim().toLowerCase()
  return role === 'employee' && getEmployeeSubRole(user) === 'cashier'
}

export function isUtilityUser(user) {
  const role = String(user?.role || '').trim().toLowerCase()
  return role === 'employee' && getEmployeeSubRole(user) === 'utility'
}

export function getEmployeeSubRoleLabel(user) {
  const sub = getEmployeeSubRole(user)
  if (sub === 'collector') return 'Collector'
  if (sub === 'cashier') return 'Cashier'
  if (sub === 'utility') return 'Utility'
  if (sub === 'sales_agent') return 'Sales Agent'
  if (sub === 'manager') return 'Store Admin'
  return user?.employee?.position || user?.employee?.department || 'Employee'
}
