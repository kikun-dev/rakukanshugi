import { create } from "zustand";
import { db, type AccountRecord } from "../db";
import { listAccounts, type Account } from "../api";

export type AccountState = {
  items: AccountRecord[];
  isLoading: boolean;
  error?: string;
  initialize(userId: string): Promise<void>;
  refreshFromRemote(userId: string): Promise<void>;
};

function mapAccount(record: Account, userId: string): AccountRecord {
  return {
    id: record.id,
    userId: record.user_id ?? userId,
    name: record.name,
    type: record.type,
    isActive: record.is_active,
    sortOrder: record.sort_order,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
}

export const useAccountStore = create<AccountState>((set) => ({
  items: [],
  isLoading: false,
  error: undefined,
  async initialize(userId) {
    set({ isLoading: true, error: undefined });
    try {
      const cached = await db.accounts.where("userId").equals(userId).sortBy("sortOrder");
      set({ items: cached, isLoading: false });
    } catch (error) {
      console.error("Failed to read accounts from IndexedDB", error);
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : "支払アカウントの読み込みに失敗しました",
      });
    }
  },
  async refreshFromRemote(userId) {
    try {
      const remote = await listAccounts();
      if (!remote || remote.length === 0) {
        return;
      }

      const mapped = remote
        .map((record) => mapAccount(record, userId))
        .sort((a, b) => a.sortOrder - b.sortOrder);

      await db.transaction("rw", db.accounts, async () => {
        await db.accounts.where("userId").equals(userId).delete();
        await db.accounts.bulkPut(mapped);
      });

      set({ items: mapped, error: undefined });
    } catch (error) {
      console.error("Failed to fetch accounts from Supabase", error);
      set({ error: error instanceof Error ? error.message : "支払アカウントの取得に失敗しました" });
    }
  },
}));
