// Local/test implementation of the documented Blobs ETag contract.
export function memoryStore(initial = null) {
  let value = structuredClone(initial); let version = initial ? 1 : 0;
  return {
    async getWithMetadata() { return value === null ? null : { data: structuredClone(value), etag: `"revision-${version}"` }; },
    async setJSON(key, next, options = {}) {
      if (options.onlyIfNew && value !== null) return { modified: false };
      if (options.onlyIfMatch && options.onlyIfMatch !== `"revision-${version}"`) return { modified: false };
      value = structuredClone(next); version++;
      return { modified: true };
    },
  };
}
