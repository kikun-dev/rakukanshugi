import Dexie, { type Table } from "dexie";
import type {
  AccountRecord,
  CategoryRecord,
  TransactionRecord,
  TransactionSplitRecord,
  SyncOperationRecord,
} from "./schema";

class RakanshugiDatabase extends Dexie {
  accounts!: Table<AccountRecord, string>;
  categories!: Table<CategoryRecord, string>;
  transactions!: Table<TransactionRecord, string>;
  transactionSplits!: Table<TransactionSplitRecord, string>;
  syncQueue!: Table<SyncOperationRecord, string>;

  constructor() {
    super("rakanshugi-db");

    this.version(1).stores({
      categories: "&id, userId, sortOrder, isActive, isBuiltin, updatedAt",
      transactions: "&id, userId, occurredAt, updatedAt, isDeleted, pendingSync",
      transactionSplits: "&id, transactionId, categoryId",
      syncQueue: "&id, userId, entity, operation, createdAt",
    });

    this.version(2).stores({
      accounts: "&id, userId, isActive, sortOrder, updatedAt",
      categories: "&id, userId, sortOrder, isActive, isBuiltin, updatedAt",
      transactions: "&id, userId, occurredAt, updatedAt, isDeleted, pendingSync",
      transactionSplits: "&id, transactionId, categoryId",
      syncQueue: "&id, userId, entity, operation, createdAt",
    });
  }
}

export const db = new RakanshugiDatabase();
