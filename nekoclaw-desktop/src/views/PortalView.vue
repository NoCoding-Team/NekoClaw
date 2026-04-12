<script setup lang="ts">
import { ref, computed, watch, onMounted } from "vue";
import { useRouter } from "vue-router";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { invoke } from "@tauri-apps/api/core";
import { useAccountsStore } from "../stores/accounts";

const router = useRouter();
const store = useAccountsStore();

const webviewEl = ref<HTMLIFrameElement | null>(null);
const loadError = ref(false);
const showSwitcher = ref(false);
const loading = ref(true);

const portalUrl = computed(() =>
  store.activeAccount ? store.activeAccount.backend_url + "/" : null
);

onMounted(async () => {
  await store.loadAccounts();
  if (!store.activeAccount) {
    router.replace("/config");
    return;
  }
  updateWindowTitle();
});

watch(
  () => store.activeAccountId,
  async (newId, oldId) => {
    if (!newId) {
      router.replace("/config");
      return;
    }
    if (newId !== oldId) {
      loadError.value = false;
      loading.value = true;
      updateWindowTitle();
    }
  }
);

async function updateWindowTitle() {
  const win = getCurrentWebviewWindow();
  const title = store.activeAccount
    ? `NekoClaw — ${store.activeAccount.name}`
    : "NekoClaw";
  await win.setTitle(title);
}

async function switchAccount(id: string) {
  await store.setActive(id);
  showSwitcher.value = false;
}

function retry() {
  loadError.value = false;
  loading.value = true;
  if (webviewEl.value) {
    webviewEl.value.src = portalUrl.value ?? "";
  }
}

async function onIframeLoad() {
  loading.value = false;
  await injectToken();
}

async function injectToken() {
  const accountId = store.activeAccountId;
  if (!accountId) return;
  try {
    const token = await invoke<string>("get_token", { accountId });
    if (token && token.length > 0) {
      await invoke("inject_token_to_webview", { token, accountId });
    }
  } catch {
  }
}

function onIframeError() {
  loading.value = false;
  loadError.value = true;
}

function goToConfig() {
  router.push("/config");
}
</script>

<template>
  <div class="portal-view">
    <div class="topbar">
      <div class="topbar-left">
        <img src="/icon.png" alt="NekoClaw" class="topbar-icon" />
      </div>
      <div class="topbar-center">
        <button class="account-switcher" @click="showSwitcher = !showSwitcher">
          <span class="account-name">{{ store.activeAccount?.name ?? "—" }}</span>
          <span class="switcher-arrow">{{ showSwitcher ? "▲" : "▼" }}</span>
        </button>
        <div class="switcher-dropdown" v-if="showSwitcher">
          <div
            v-for="account in store.accounts"
            :key="account.id"
            class="switcher-item"
            :class="{ active: account.id === store.activeAccountId }"
            @click="switchAccount(account.id)"
          >
            <span class="switcher-name">{{ account.name }}</span>
            <span class="switcher-url">{{ account.backend_url }}</span>
          </div>
          <div class="switcher-divider"></div>
          <div class="switcher-item manage" @click="goToConfig">
            管理账号
          </div>
        </div>
      </div>
      <div class="topbar-right">
      </div>
    </div>

    <div class="portal-body">
      <div class="loading-overlay" v-if="loading && !loadError">
        <div class="spinner"></div>
        <p>正在连接猫窝...</p>
      </div>

      <div class="error-state" v-if="loadError">
        <div class="error-icon">⚠</div>
        <h3>无法连接到 Backend</h3>
        <p class="error-url">{{ store.activeAccount?.backend_url }}</p>
        <p class="error-hint">请确认后端服务已启动，网络可访问</p>
        <div class="error-actions">
          <button class="btn btn-primary" @click="retry">重试</button>
          <button class="btn btn-ghost" @click="goToConfig">更换账号</button>
        </div>
      </div>

      <iframe
        v-if="portalUrl && !loadError"
        :key="store.activeAccountId"
        ref="webviewEl"
        :src="portalUrl"
        class="portal-iframe"
        @load="onIframeLoad"
        @error="onIframeError"
        allow="fullscreen"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
      ></iframe>
    </div>
  </div>
</template>

<style scoped>
.portal-view {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

.topbar {
  height: 44px;
  background: white;
  border-bottom: 1px solid #e8e8e8;
  display: flex;
  align-items: center;
  padding: 0 12px;
  gap: 8px;
  flex-shrink: 0;
  position: relative;
  z-index: 10;
}

.topbar-icon {
  width: 24px;
  height: 24px;
}

.topbar-center {
  position: relative;
  flex: 1;
  display: flex;
  justify-content: center;
}

.account-switcher {
  background: none;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  padding: 4px 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #333;
  transition: background 0.15s;
}

.account-switcher:hover {
  background: #f5f5f5;
}

.account-name {
  font-weight: 500;
}

.switcher-arrow {
  font-size: 10px;
  color: #999;
}

.switcher-dropdown {
  position: absolute;
  top: calc(100% + 6px);
  left: 50%;
  transform: translateX(-50%);
  background: white;
  border: 1px solid #e0e0e0;
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  min-width: 240px;
  padding: 6px;
  z-index: 100;
}

.switcher-item {
  padding: 8px 12px;
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.switcher-item:hover {
  background: #f5f5f5;
}

.switcher-item.active {
  background: #f5f0ff;
}

.switcher-name {
  font-size: 13px;
  font-weight: 500;
  color: #2d2d2d;
}

.switcher-url {
  font-size: 11px;
  color: #999;
}

.switcher-divider {
  height: 1px;
  background: #f0f0f0;
  margin: 4px 0;
}

.switcher-item.manage {
  font-size: 13px;
  color: #9b59b6;
  font-weight: 500;
}

.portal-body {
  flex: 1;
  position: relative;
  overflow: hidden;
}

.portal-iframe {
  width: 100%;
  height: 100%;
  border: none;
}

.loading-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  background: #fafafa;
  color: #888;
  font-size: 14px;
}

.spinner {
  width: 36px;
  height: 36px;
  border: 3px solid #e0d0f0;
  border-top-color: #9b59b6;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.error-state {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 40px;
  text-align: center;
}

.error-icon {
  font-size: 48px;
  color: #e67e22;
}

.error-state h3 {
  font-size: 18px;
  color: #2d2d2d;
}

.error-url {
  font-size: 13px;
  color: #999;
  word-break: break-all;
}

.error-hint {
  font-size: 13px;
  color: #aaa;
}

.error-actions {
  display: flex;
  gap: 10px;
  margin-top: 8px;
}

.btn {
  padding: 9px 18px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  border: none;
  transition: all 0.2s;
}

.btn-primary {
  background: #9b59b6;
  color: white;
}

.btn-primary:hover {
  background: #7d3c98;
}

.btn-ghost {
  background: transparent;
  color: #555;
  border: 1.5px solid #e0e0e0;
}

.btn-ghost:hover {
  background: #f5f5f5;
}
</style>
