import { create } from "zustand";
import { v4 as uuidv4 } from "uuid";
import {
  db,
  type TransactionWithSplits as StoredTransaction,
  type TransactionRecord,
  type TransactionSplitRecord,
  type SyncOperationRecord,
} from "../db";
import {
  createTransaction as createRemoteTransaction,
  listTransactions as listRemoteTransactions,
  type TransactionWithSplits as RemoteTransaction,
} from "../api";

type AddTransactionInput = {
  userId: string;
  accountId: string;
  amount: number;
  occurredAt: string;
  memo?: string;
  categoryIds?: string[];
  splits?: Array<{ categoryId: string; ratio: number; id?: string }>; 
};

type TransactionsState = {
  items: StoredTransaction[];
  isLoading: boolean;
  error?: string;
  initialize(userId: string): Promise<void>;
  addTransaction(input: AddTransactionInput): Promise<void>;
  syncPending(userId: string): Promise<void>;
  refreshFromRemote(userId: string): Promise<void>;
};

type TransactionOutboxPayload = {
  transaction: TransactionRecord;
  splits: TransactionSplitRecord[];
};

function mapRemoteTransaction(record: RemoteTransaction, userId: string): StoredTransaction {
  const splits = (record.transaction_splits ?? []).map((split) => ({
    id: split.id,
    transactionId: split.transaction_id,
    categoryId: split.category_id,
    ratio: split.ratio,
    createdAt: split.created_at ?? record.created_at ?? record.updated_at,
    updatedAt: split.updated_at ?? record.updated_at,
  } satisfies TransactionSplitRecord));

  return {
    id: record.id,
    userId: record.user_id ?? userId,
    accountId: record.account_id,
    amount: record.amount,
    memo: record.memo ?? null,
    occurredAt: record.occurred_at,
    createdAt: record.created_at ?? record.updated_at,
    updatedAt: record.updated_at,
    isDeleted: record.is_deleted,
    pendingSync: false,
    splits,
  } satisfies StoredTransaction;
}

function toTransactionRecord(tx: StoredTransaction): TransactionRecord {
  const { splits: _splits, ...transaction } = tx;
  return transaction;
}

async function loadTransactionsFromDexie(userId: string): Promise<StoredTransaction[]> {
  const rows = await db.transactions.where("userId").equals(userId).filter((row) => !row.isDeleted).toArray();
  const transactions: StoredTransaction[] = [];
  for (const row of rows) {
    const splits = await db.transactionSplits.where("transactionId").equals(row.id).toArray();
    transactions.push({ ...row, splits });
  }
  return transactions.sort((a, b) => {
    if (a.occurredAt === b.occurredAt) {
      return b.updatedAt.localeCompare(a.updatedAt);
    }
    return b.occurredAt.localeCompare(a.occurredAt);
  });
}

function buildOutboxRecord(payload: TransactionOutboxPayload, userId: string): SyncOperationRecord {
  return {
    id: uuidv4(),
    userId,
    entity: "transactions",
    operation: "insert",
    payload,
    createdAt: new Date().toISOString(),
    retryCount: 0,
  } satisfies SyncOperationRecord;
}

export const useTransactionStore = create<TransactionsState>((set) => ({
  items: [],
  isLoading: false,
  error: undefined,
  async initialize(userId) {
    set({ isLoading: true, error: undefined });
    try {
      const transactions = await loadTransactionsFromDexie(userId);
      set({ items: transactions, isLoading: false });
    } catch (error) {
      console.error("Failed to load transactions from IndexedDB", error);
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : "Žæˆø‚Ì“Ç‚Ýž‚Ý‚ÉŽ¸”s‚µ‚Ü‚µ‚½",
      });
    }
  },
  async addTransaction(input) {
    const { userId, accountId, amount, occurredAt, memo } = input;
    const transactionId = uuidv4();
    const now = new Date().toISOString();

    const baseCategories = input.categoryIds ?? [];
    const ratio = baseCategories.length > 0 ? 1 / baseCategories.length : 1;
    const splitSources: Array<{ categoryId: string; ratio: number; id?: string }> =
      input.splits?.length ? input.splits : baseCategories.map((categoryId) => ({ categoryId, ratio }));

    const splitRecords: TransactionSplitRecord[] = splitSources.map((split) => ({
      id: uuidv4(),
      transactionId,
      categoryId: split.categoryId,
      ratio: split.ratio,
      createdAt: now,
      updatedAt: now,
    }));

    const transactionRecord: TransactionRecord = {
      id: transactionId,
      userId,
      accountId,
      amount,
      memo: memo ?? null,
      occurredAt,
      createdAt: now,
      updatedAt: now,
      isDeleted: false,
      pendingSync: true,
    };

    const outboxRecord = buildOutboxRecord(
      {
        transaction: transactionRecord,
        splits: splitRecords,
      },
      userId
    );

    await db.transaction("rw", db.transactions, db.transactionSplits, db.syncQueue, async () => {
      await db.transactions.put(transactionRecord);
      if (splitRecords.length > 0) {
        await db.transactionSplits.bulkPut(splitRecords);
      }
      await db.syncQueue.put(outboxRecord);
    });

    set((state) => ({
      items: [{ ...transactionRecord, splits: splitRecords }, ...state.items],
    }));
  },
  async syncPending(userId) {
    const operations = await db.syncQueue.where("userId").equals(userId).sortBy("createdAt");
    if (operations.length === 0) return;

    for (const op of operations) {
      if (op.entity !== "transactions" || op.operation !== "insert") continue;

      const payload = op.payload as TransactionOutboxPayload;
      try {
        await createRemoteTransaction({
          id: payload.transaction.id,
          accountId: payload.transaction.accountId,
          amount: payload.transaction.amount,
          occurredAt: payload.transaction.occurredAt,
          memo: payload.transaction.memo ?? undefined,
          splits: payload.splits.map((split) => ({
            id: split.id,
            categoryId: split.categoryId,
            ratio: split.ratio,
          })),
        });

        await db.transaction("rw", db.transactions, db.syncQueue, async () => {
          await db.syncQueue.delete(op.id);
          await db.transactions.update(payload.transaction.id, {
            pendingSync: false,
            updatedAt: new Date().toISOString(),
          });
        });
      } catch (error) {
        console.warn("Failed to sync transaction", error);
        await db.syncQueue.update(op.id, {
          retryCount: op.retryCount + 1,
          lastTriedAt: new Date().toISOString(),
        });
      }
    }

    const transactions = await loadTransactionsFromDexie(userId);
    set({ items: transactions });
  },
  async refreshFromRemote(userId) {
    try {
      const remote = await listRemoteTransactions();
      const mapped = remote
        .filter((tx) => !tx.is_deleted)
        .map((tx) => mapRemoteTransaction(tx, userId));

      await db.transaction("rw", db.transactions, db.transactionSplits, async () => {
        for (const tx of mapped) {
          await db.transactions.put(toTransactionRecord(tx));
          await db.transactionSplits.where("transactionId").equals(tx.id).delete();
        }
        const splitRecords = mapped.flatMap((tx) => tx.splits);
        if (splitRecords.length > 0) {
          await db.transactionSplits.bulkPut(splitRecords);
        }
      });

      const transactions = await loadTransactionsFromDexie(userId);
      set({ items: transactions, error: undefined });
    } catch (error) {
      console.error("Failed to fetch transactions from Supabase", error);
      set({ error: error instanceof Error ? error.message : "Žæˆø‚ÌŽæ“¾‚ÉŽ¸”s‚µ‚Ü‚µ‚½" });
    }
  },
}));


