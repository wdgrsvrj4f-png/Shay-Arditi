// A three-way merge applies only edits made since the last acknowledged snapshot.
// Concurrent edits to the same value require an explicit choice, never last-write-wins.
const lists = ['obligations', 'debts', 'transactions', 'creditPayments', 'surplusActions'];
const tombstones = { obligations: 'deletedObligationIds', debts: 'deletedDebtIds', transactions: 'deletedTransactionIds' };
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const clone = value => value === undefined ? undefined : structuredClone(value);

export function mergeChanges(base, local, remote, { preferLocal = false } = {}) {
  const conflicts = [];
  function merge(b, l, r, path) {
    if (equal(l, b)) return clone(r);
    if (equal(r, b) || equal(l, r)) return clone(l);
    if ([b, l, r].every(v => v && typeof v === 'object' && !Array.isArray(v))) {
      return Object.fromEntries([...new Set([...Object.keys(b), ...Object.keys(l), ...Object.keys(r)])]
        .map(key => [key, merge(b[key], l[key], r[key], `${path}.${key}`)]));
    }
    conflicts.push(path);
    return clone(preferLocal ? l : r);
  }
  const result = clone(remote);
  result.settings = merge(base.settings, local.settings, remote.settings, 'settings');
  for (const key of lists) {
    const b = new Map((base[key] || []).map(v => [v.id, v]));
    const l = new Map((local[key] || []).map(v => [v.id, v]));
    const r = new Map((remote[key] || []).map(v => [v.id, v]));
    const deletedKey = tombstones[key];
    const deleted = new Set(deletedKey ? [...(remote[deletedKey] || []), ...(local[deletedKey] || [])] : []);
    if (deletedKey) result[deletedKey] = [...deleted];
    result[key] = [...new Set([...r.keys(), ...l.keys(), ...b.keys()])]
      .filter(id => !deleted.has(id))
      .map(id => merge(b.get(id), l.get(id), r.get(id), `${key}.${id}`))
      .filter(Boolean);
  }
  return { state: result, conflicts };
}

// Upgrade a pre-sync-protocol device conservatively: preserve new records and
// deletions, but ask before replacing existing cloud values with unknown-age data.
export function migrateLegacyPending(local, remote) {
  const base = structuredClone(remote);
  base.settings = {};
  for (const key of lists) base[key] = [];
  return mergeChanges(base, local, remote);
}
