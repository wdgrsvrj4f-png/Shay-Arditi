export const blobKey = 'shared-budget';
export const emptyRevision = '"empty-budget"';
export async function budgetStore() {
  const { getStore } = await import('@netlify/blobs');
  // Preview deploys must never read/write the production budget.
  const context = process.env.CONTEXT;
  const name = context && context !== 'production' && context !== 'dev'
    ? `simple-budget-preview-${process.env.DEPLOY_ID || context}` : 'simple-budget';
  return getStore({ name, consistency: 'strong' });
}
export async function readSnapshot(store) {
  const entry = await store.getWithMetadata(blobKey, { type: 'json', consistency: 'strong' });
  return { data: entry?.data ?? { months: {} }, revision: entry?.etag ?? emptyRevision };
}
export async function writeSnapshot(store, data, revision) {
  const options = revision === emptyRevision ? { onlyIfNew: true } : { onlyIfMatch: revision };
  return (await store.setJSON(blobKey, data, options)).modified;
}
