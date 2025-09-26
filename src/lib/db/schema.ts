export type AccountRecord = {
  id: string;
  userId: string;
  name: string;
  type: "credit" | "debit" | "cash" | "other";
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type CategoryRecord = {
  id: string;
  userId: string;
  name: string;
  color: string | null;
  isBuiltin: boolean;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type TransactionRecord = {
  id: string;
  userId: string;
  accountId: string;
  amount: number;
  memo: string | null;
  occurredAt: string;
  createdAt: string;
  updatedAt: string;
  isDeleted: boolean;
  pendingSync: boolean;
};

export type TransactionSplitRecord = {
  id: string;
  transactionId: string;
  categoryId: string;
  ratio: number;
  createdAt: string;
  updatedAt: string;
};

export type SyncOperationRecord = {
  id: string;
  userId: string;
  entity: "transactions";
  operation: "insert" | "update" | "delete";
  payload: unknown;
  createdAt: string;
  retryCount: number;
  lastTriedAt?: string;
};

export type TransactionWithSplits = TransactionRecord & {
  splits: TransactionSplitRecord[];
};
