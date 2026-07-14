import type {
  AppState, CollectionItem, DailyContext, FragranceProfile, ManualFragranceInput,
  RecommendationResult, UserPreferences, WearLog,
} from '../shared/types';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });
  const payload = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(payload.error || `Request failed (${response.status})`);
  return payload as T;
}

export const api = {
  bootstrap: () => request<AppState>('/api/bootstrap'),
  recommend: (context: DailyContext, force = false) => request<RecommendationResult>('/api/recommendations', {
    method: 'POST', body: JSON.stringify({ context, force }),
  }),
  createWear: (profileIds: string[], context: DailyContext) => request<WearLog>('/api/wears', {
    method: 'POST', body: JSON.stringify({ profileIds, context }),
  }),
  updateWear: (id: string, feedback: Pick<WearLog, 'enjoyment' | 'strength' | 'longevity' | 'notes'>) =>
    request<WearLog>(`/api/wears/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(feedback) }),
  updateCollection: (profileId: string, active: boolean) => request<{ active: boolean }>(
    `/api/collection/${encodeURIComponent(profileId)}`,
    { method: 'PATCH', body: JSON.stringify({ active }) },
  ),
  addFragrance: (input: ManualFragranceInput) => request<{ profile: FragranceProfile; item: CollectionItem }>('/api/collection', {
    method: 'POST', body: JSON.stringify(input),
  }),
  updatePreferences: (preferences: Partial<UserPreferences>) => request<UserPreferences>('/api/preferences', {
    method: 'PATCH', body: JSON.stringify(preferences),
  }),
  importLegacy: (legacy: Record<string, string | null>) => request<AppState>('/api/migration/import-v1', {
    method: 'POST', body: JSON.stringify({ legacy }),
  }),
};
