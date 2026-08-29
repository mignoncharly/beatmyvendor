import { createClient } from "@supabase/supabase-js";

export type PublicDuel = {
  public_id: number; slug: string; category_name: string; current_software_name: string;
  annual_spend: number; currency: string; seats: number; country_code: string;
  company_size: string; buyer_intent: string; submission_deadline: string; verification_badge: string | null;
};

export type PublicWin = {
  slug: string; buyer_display_name: string; vendor_display_name: string | null;
  current_software_name: string; challenger_software_name: string | null; current_annual_price: number;
  final_annual_price: number; currency: string; seats: number; country_code: string; confirmed_at: string;
};

function publicClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key || url.includes("your-project")) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function getPublicDuels(): Promise<PublicDuel[]> {
  const client = publicClient();
  if (!client) return [];
  const { data, error } = await client.rpc("list_public_duels");
  if (error) return [];
  return (data || []) as PublicDuel[];
}

export async function getPublicDuel(slug: string) {
  return (await getPublicDuels()).find((duel) => duel.slug === slug);
}

export async function getPublicWins(): Promise<PublicWin[]> {
  const client = publicClient();
  if (!client) return [];
  const { data, error } = await client.rpc("list_public_wins");
  if (error) return [];
  return (data || []) as PublicWin[];
}

export async function getPublicWin(slug: string) {
  return (await getPublicWins()).find((win) => win.slug === slug);
}

export function money(value: number, currency: string) {
  return new Intl.NumberFormat("en", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
}
