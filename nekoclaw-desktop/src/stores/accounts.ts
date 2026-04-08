import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { invoke } from "@tauri-apps/api/core";

export interface Account {
  id: string;
  name: string;
  backend_url: string;
}

export const useAccountsStore = defineStore("accounts", () => {
  const accounts = ref<Account[]>([]);
  const activeAccountId = ref<string | null>(null);

  const activeAccount = computed(
    () => accounts.value.find((a) => a.id === activeAccountId.value) ?? null
  );

  async function loadAccounts() {
    accounts.value = await invoke<Account[]>("get_accounts");
    activeAccountId.value =
      (await invoke<string | null>("get_active_account_id")) ?? null;

    if (!activeAccountId.value && accounts.value.length > 0) {
      activeAccountId.value = accounts.value[0].id;
    }
  }

  async function saveAccount(account: Account, token?: string) {
    await invoke("save_account", { account, token: token ?? null });
    await loadAccounts();
  }

  async function deleteAccount(id: string) {
    await invoke("delete_account", { id });
    if (activeAccountId.value === id) {
      activeAccountId.value = accounts.value[0]?.id ?? null;
    }
    await loadAccounts();
  }

  async function setActive(id: string) {
    activeAccountId.value = id;
    await invoke("set_active_account_id", { id });
  }

  return {
    accounts,
    activeAccountId,
    activeAccount,
    loadAccounts,
    saveAccount,
    deleteAccount,
    setActive,
  };
});
