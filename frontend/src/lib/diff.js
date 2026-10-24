/**
 * High-performance, zero-allocation deep comparison and state reconciliation utility.
 * Optimizes the 1-2s auto-refresh cycle by preventing redundant React re-renders,
 * layout shifts, and garbage collection pressure when fetched data is unchanged.
 */

export function fastDeepEqual(a, b) {
  if (a === b) return true;
  if (a === null || b === null || a === undefined || b === undefined) return a === b;
  if (typeof a !== 'object' || typeof b !== 'object') return a === b;

  const aIsArr = Array.isArray(a);
  const bIsArr = Array.isArray(b);
  if (aIsArr !== bIsArr) return false;

  if (aIsArr) {
    const len = a.length;
    if (len !== b.length) return false;
    for (let i = 0; i < len; i++) {
      if (!fastDeepEqual(a[i], b[i])) return false;
    }
    return true;
  }

  // Fast date comparison
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime();
  }

  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  const len = keysA.length;
  if (len !== keysB.length) return false;

  for (let i = 0; i < len; i++) {
    const key = keysA[i];
    if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
    if (!fastDeepEqual(a[key], b[key])) return false;
  }

  return true;
}

/**
 * Update React state only if the new value is deeply different from the previous value.
 * @param {Function} setter - React dispatch setter (e.g. setRecords)
 * @param {*} currentVal - Current value in state or ref
 * @param {*} nextVal - Newly fetched value
 * @returns {boolean} Whether an update was dispatched
 */
export function setIfChanged(setter, currentVal, nextVal) {
  if (fastDeepEqual(currentVal, nextVal)) {
    return false;
  }
  setter(nextVal);
  return true;
}
