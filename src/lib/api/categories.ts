// src/lib/api/categories.ts
import { supabase } from "../supabase";

export type Category = {
  id: string;
  user_id?: string | null;
  name: string;
  color?: string | null;
  is_builtin: boolean;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export async function seedDefaultCategories() {
  const { error } = await supabase.rpc("seed_default_categories");
  if (error) throw error;
}

export async function listCategories(): Promise<Category[]> {
  const { data, error } = await supabase
    .from("categories")
    .select("*")
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return data ?? [];
}
