// src/lib/api/transactions.ts
import { v4 as uuidv4 } from "uuid";
import { supabase } from "../supabase";

export type Transaction = {
  id: string;
  user_id?: string | null;
  account_id: string;
  amount: number;
  title: string;
  memo?: string | null;
  occurred_at: string; // YYYY-MM-DD
  created_at?: string;
  updated_at: string;
  is_deleted: boolean;
};

export type TransactionSplit = {
  id: string;
  transaction_id: string;
  category_id: string;
  ratio: number; // 0~1
  created_at?: string;
  updated_at?: string;
};

export type TransactionWithSplits = Transaction & {
  transaction_splits: TransactionSplit[];
};

export type CreateTransactionInput = {
  id?: string;
  accountId: string;
  amount: number;
  title: string;
  occurredAt: string; // YYYY-MM-DD
  memo?: string;
  categoryIds?: string[];
  splits?: Array<{ id?: string; categoryId: string; ratio: number }>;
};

export async function createTransaction(input: CreateTransactionInput) {
  const { accountId, amount, title, occurredAt, memo } = input;
  const transactionId = input.id ?? uuidv4();

  const insertPayload: Record<string, unknown> = {
    id: transactionId,
    account_id: accountId,
    amount,
    title,
    occurred_at: occurredAt,
    memo,
  };

  const { data: tx, error: txErr } = await supabase
    .from("transactions")
    .insert([insertPayload])
    .select("id, user_id, account_id, amount, title, memo, occurred_at, created_at, updated_at, is_deleted")
    .single();

  if (txErr) throw txErr;

  const splitSources: Array<{ id?: string; categoryId: string; ratio: number }> =
    input.splits?.length
      ? input.splits
      : (input.categoryIds ?? []).map((categoryId, _index, arr) => ({
          categoryId,
          ratio: arr.length > 0 ? 1 / arr.length : 1,
        }));

  let splits: TransactionSplit[] = [];

  if (splitSources.length > 0) {
    const rows = splitSources.map((split) => ({
      id: split.id ?? uuidv4(),
      transaction_id: tx.id,
      category_id: split.categoryId,
      ratio: split.ratio,
    }));

    const { data: insertedSplits, error: spErr } = await supabase
      .from("transaction_splits")
      .insert(rows)
      .select("id, transaction_id, category_id, ratio, created_at, updated_at");

    if (spErr) throw spErr;
    splits = insertedSplits ?? [];
  }

  return { ...tx, transaction_splits: splits } as TransactionWithSplits;
}

export async function listTransactions(limit = 200) {
  const { data, error } = await supabase
    .from("transactions")
    .select(
      `
      id, user_id, account_id, amount, title, memo, occurred_at, created_at, updated_at, is_deleted,
      transaction_splits ( id, transaction_id, category_id, ratio, created_at, updated_at )
    `
    )
    .eq("is_deleted", false)
    .order("occurred_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as TransactionWithSplits[];
}

export async function listSplitsWithAmount(txId: string) {
  const { data, error } = await supabase
    .from("v_transaction_splits")
    .select("transaction_id, category_id, ratio, amount_calc")
    .eq("transaction_id", txId);
  if (error) throw error;
  return data as Array<{ transaction_id: string; category_id: string; ratio: number; amount_calc: number }>;
}




