import { api } from './core.js';

const values = { sources: [], categories: [] };
const listeners = new Set();
function publish() {
  for (const listener of listeners) listener(values);
}
export const catalog = {
  get sources() {
    return values.sources;
  },
  get categories() {
    return values.categories;
  },
  subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  replace({ sources, categories }) {
    if (sources !== undefined) values.sources = sources;
    if (categories !== undefined) values.categories = categories;
    publish();
  },
  async refresh() {
    const [sourceResult, categoryResult] = await Promise.all([
      api('/admin/api/sources'),
      api('/admin/api/categories'),
    ]);
    values.sources = sourceResult.sources ?? [];
    values.categories = categoryResult.categories ?? [];
    publish();
    return values;
  },
};
