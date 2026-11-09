// Local/test implementation of the documented Blobs ETag contract.
const budgetKey = 'shared-budget';
export function memoryStore(initial = null) {
  const values = new Map();
  const versions = new Map();
  if (initial !== null) {
    values.set(budgetKey, structuredClone(initial));
    versions.set(budgetKey, 1);
  }
  return {
    async getWithMetadata(key = budgetKey) {
      if (!values.has(key)) return null;
      return { data: structuredClone(values.get(key)), etag: `"revision-${versions.get(key) || 0}"` };
    },
    async get(key) {
      return values.has(key) ? structuredClone(values.get(key)) : null;
    },
    async delete(key) {
      values.delete(key);
      versions.delete(key);
    },
    async setJSON(key, next, options = {}) {
      const version = versions.get(key) || 0;
      if (options.onlyIfNew && values.has(key)) return { modified: false };
      if (options.onlyIfMatch && options.onlyIfMatch !== `"revision-${version}"`) return { modified: false };
      values.set(key, structuredClone(next));
      versions.set(key, version + 1);
      return { modified: true };
    },
  };
}
