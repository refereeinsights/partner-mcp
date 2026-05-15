import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

// Lazy-initialized so Next.js static analysis doesn't throw at build time.
export function getSupabaseAdmin(): SupabaseClient {
  if (_client) return _client;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error("SUPABASE_URL is not set");
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");

  _client = createClient(url, key, { auth: { persistSession: false } });
  return _client;
}

// Convenience re-export for tools that prefer the direct import style.
export const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    return (getSupabaseAdmin() as any)[prop];
  },
});

export async function fetchAllPaginated<T>(
  factory: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  chunkSize = 1000
): Promise<T[]> {
  const rows: T[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await factory(offset, offset + chunkSize - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < chunkSize) break;
    offset += chunkSize;
  }
  return rows;
}
