import { supabase } from "../supabase";

export type Account = {
  id: string;
  user_id?: string | null;
  name: string;
  type: "credit" | "debit" | "cash" | "other";
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export async function listAccounts(): Promise<Account[]> {
  const { data, error } = await supabase
    .from("accounts")
    .select("id, user_id, name, type, is_active, sort_order, created_at, updated_at")
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return data ?? [];
}
