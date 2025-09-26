import { create } from "zustand";
import { db, type CategoryRecord } from "../db";
import { listCategories, seedDefaultCategories, type Category } from "../api";

export type CategoryState = {
  items: CategoryRecord[];
  isLoading: boolean;
  error?: string;
  initialize(userId: string): Promise<void>;
  refreshFromRemote(userId: string): Promise<void>;
};

function mapCategory(record: Category, userId: string): CategoryRecord {
  return {
    id: record.id,
    userId: record.user_id ?? userId,
    name: record.name,
    color: record.color ?? null,
    isBuiltin: record.is_builtin,
    isActive: record.is_active,
    sortOrder: record.sort_order,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
}

export const useCategoryStore = create<CategoryState>((set) => ({
  items: [],
  isLoading: false,
  error: undefined,
  async initialize(userId) {
    set({ isLoading: true, error: undefined });
    try {
      const cached = await db.categories.where("userId").equals(userId).sortBy("sortOrder");
      set({ items: cached, isLoading: false });
    } catch (error) {
      console.error("Failed to read categories from IndexedDB", error);
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : "カテゴリの読み込みに失敗しました",
      });
    }
  },
  async refreshFromRemote(userId) {
    try {
      let remote = await listCategories();
      if (!remote || remote.length === 0) {
        await seedDefaultCategories();
        remote = await listCategories();
        if (!remote || remote.length === 0) {
          return;
        }
      }

      const mapped = remote.map((item) => mapCategory(item, userId)).sort((a, b) => a.sortOrder - b.sortOrder);

      await db.transaction("rw", db.categories, async () => {
        await db.categories.where("userId").equals(userId).delete();
        await db.categories.bulkPut(mapped);
      });

      set({ items: mapped, error: undefined });
    } catch (error) {
      console.error("Failed to fetch categories from Supabase", error);
      set({ error: error instanceof Error ? error.message : "カテゴリの取得に失敗しました" });
    }
  },
}));
