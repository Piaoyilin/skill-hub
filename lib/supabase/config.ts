export class SupabaseConfigurationError extends Error {
  constructor(message = "未配置 Supabase Auth 环境变量。") {
    super(message);
    this.name = "SupabaseConfigurationError";
  }
}

export function getSupabasePublicConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

  if (!url || !publishableKey) {
    throw new SupabaseConfigurationError();
  }

  return { url, publishableKey };

}
