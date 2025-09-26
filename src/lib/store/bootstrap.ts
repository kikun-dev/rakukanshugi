import { useAccountStore } from "./accounts";
import { useCategoryStore } from "./categories";
import { useTransactionStore } from "./transactions";

export async function bootstrapUserData(userId: string) {
  await Promise.all([
    useAccountStore.getState().initialize(userId),
    useCategoryStore.getState().initialize(userId),
    useTransactionStore.getState().initialize(userId),
  ]);
}

export async function refreshUserDataFromRemote(userId: string) {
  await Promise.allSettled([
    useAccountStore.getState().refreshFromRemote(userId),
    useCategoryStore.getState().refreshFromRemote(userId),
    useTransactionStore.getState().refreshFromRemote(userId),
  ]);
}

export async function syncOutboundChanges(userId: string) {
  await useTransactionStore.getState().syncPending(userId);
}
