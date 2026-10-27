import { auth } from './firebase';

const BASE = import.meta.env.VITE_API_URL || '';

export async function api(path, { method = 'GET', body } = {}) {
  const token = await auth.currentUser?.getIdToken();
  let res;
  try {
    res = await fetch(BASE + path, {
      method,
      headers: { ...(body && { 'content-type': 'application/json' }), ...(token && { authorization: `Bearer ${token}` }) },
      body: body && JSON.stringify(body),
    });
  } catch {
    throw new Error("Can't reach the server — check your connection.");
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(json.error || 'Something went wrong — try again.'), { status: res.status });
  return json;
}
