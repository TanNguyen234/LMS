import { ApiError, httpGet, httpPost } from './http';
import type { AuthResponse, DemoAccountItem } from '../types';

/**
 * Demo helpers. Backend exposes these endpoints only when APP_ENV=development;
 * otherwise they return 404 and every helper here resolves to "unavailable".
 */
export async function getDemoAccounts(): Promise<DemoAccountItem[] | null> {
  try {
    return await httpGet<DemoAccountItem[]>('/auth/demo-accounts', { skipAuth: true, skipAuthRedirect: true });
  } catch (err) {
    if (err instanceof ApiError && (err.status === 404 || err.status === 403)) {
      return null;
    }
    throw err;
  }
}

/** Issue a token for a seeded demo account (development only). Raw backend user payload. */
export async function demoSwitch(email: string): Promise<AuthResponse> {
  return httpPost<AuthResponse>('/auth/demo-switch', { email }, { skipAuth: true, skipAuthRedirect: true });
}

let cachedDemoAccounts: Promise<DemoAccountItem[] | null> | null = null;

/** Memoized variant so the login page and the role switcher share one request per page load. */
export function getDemoAccountsCached(): Promise<DemoAccountItem[] | null> {
  if (!cachedDemoAccounts) {
    cachedDemoAccounts = getDemoAccounts().catch(() => {
      cachedDemoAccounts = null;
      return null;
    });
  }
  return cachedDemoAccounts;
}
