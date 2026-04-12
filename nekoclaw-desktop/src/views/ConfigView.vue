<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useAccountsStore, type Account } from "../stores/accounts";

const router = useRouter();
const store = useAccountsStore();

const formName = ref("");
const formUrl = ref("");
const formToken = ref("");
const formError = ref("");
const editingId = ref<string | null>(null);
const showForm = ref(false);

onMounted(() => {
  store.loadAccounts();
  if (store.accounts.length === 0) {
    showForm.value = true;
  }
});

function validateUrl(url: string): boolean {
  return /^https?:\/\/.+/.test(url.trim());
}

function openAddForm() {
  editingId.value = null;
  formName.value = "";
  formUrl.value = "";
  formToken.value = "";
  formError.value = "";
  showForm.value = true;
}

function openEditForm(account: Account) {
  editingId.value = account.id;
  formName.value = account.name;
  formUrl.value = account.backend_url;
  formToken.value = "";
  formError.value = "";
  showForm.value = true;
}

function cancelForm() {
  showForm.value = false;
  formError.value = "";
}

async function submitForm() {
  formError.value = "";
  if (!formName.value.trim()) {
    formError.value = "账号名称不能为空";
    return;
  }
  if (!validateUrl(formUrl.value)) {
    formError.value = "Backend URL 必须以 http:// 或 https:// 开头";
    return;
  }
  const account: Account = {
    id: editingId.value ?? crypto.randomUUID(),
    name: formName.value.trim(),
    backend_url: formUrl.value.trim().replace(/\/$/, ""),
  };
  await store.saveAccount(account, formToken.value || undefined);
  showForm.value = false;
  if (store.accounts.length > 0) {
    await store.setActive(account.id);
    router.push("/portal");
  }
}

async function deleteAccount(id: string) {
  await store.deleteAccount(id);
}

async function setActive(id: string) {
  await store.setActive(id);
  router.push("/portal");
}
</script>

<template>
  <div class="config-view">
    <div class="header">
      <div class="logo">
        <img src="/icon.png" alt="NekoClaw" class="logo-icon" />
        <span class="logo-text">NekoClaw</span>
      </div>
      <p class="subtitle">配置 Backend 连接</p>
    </div>

    <div class="accounts-list" v-if="store.accounts.length > 0 && !showForm">
      <div
        v-for="account in store.accounts"
        :key="account.id"
        class="account-card"
        :class="{ active: account.id === store.activeAccountId }"
      >
        <div class="account-info">
          <div class="account-name">{{ account.name }}</div>
          <div class="account-url">{{ account.backend_url }}</div>
        </div>
        <div class="account-actions">
          <button class="btn btn-primary btn-sm" @click="setActive(account.id)">
            连接
          </button>
          <button class="btn btn-ghost btn-sm" @click="openEditForm(account)">
            编辑
          </button>
          <button
            class="btn btn-danger btn-sm"
            @click="deleteAccount(account.id)"
          >
            删除
          </button>
        </div>
      </div>

      <button class="btn btn-outline add-btn" @click="openAddForm">
        + 添加账号
      </button>
    </div>

    <div class="form-card" v-if="showForm">
      <h3 class="form-title">{{ editingId ? "编辑账号" : "添加账号" }}</h3>
      <div class="form-group">
        <label>账号名称</label>
        <input
          v-model="formName"
          type="text"
          placeholder="例如：我的猫窝"
          class="input"
          @keydown.enter="submitForm"
        />
      </div>
      <div class="form-group">
        <label>Backend URL</label>
        <input
          v-model="formUrl"
          type="text"
          placeholder="https://nekoclaw.example.com 或 http://localhost:8000"
          class="input"
          @keydown.enter="submitForm"
        />
      </div>
      <div class="form-group">
        <label>API Token（可选）</label>
        <input
          v-model="formToken"
          type="password"
          placeholder="留空则不更改已存 Token"
          class="input"
          @keydown.enter="submitForm"
        />
      </div>
      <p class="form-error" v-if="formError">{{ formError }}</p>
      <div class="form-actions">
        <button
          class="btn btn-ghost"
          @click="cancelForm"
          v-if="store.accounts.length > 0"
        >
          取消
        </button>
        <button class="btn btn-primary" @click="submitForm">保存</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.config-view {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 40px 24px;
  min-height: 100vh;
  background: linear-gradient(135deg, #f5f0ff 0%, #fce4f0 100%);
}

.header {
  text-align: center;
  margin-bottom: 32px;
}

.logo {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-bottom: 8px;
}

.logo-icon {
  width: 48px;
  height: 48px;
}

.logo-text {
  font-size: 28px;
  font-weight: 700;
  color: #4a0e8f;
}

.subtitle {
  color: #888;
  font-size: 14px;
}

.accounts-list {
  width: 100%;
  max-width: 480px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.account-card {
  background: white;
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  display: flex;
  align-items: center;
  gap: 12px;
  border: 2px solid transparent;
  transition: border-color 0.2s;
}

.account-card.active {
  border-color: #9b59b6;
}

.account-info {
  flex: 1;
  min-width: 0;
}

.account-name {
  font-weight: 600;
  color: #2d2d2d;
}

.account-url {
  font-size: 12px;
  color: #999;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.account-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.add-btn {
  width: 100%;
  margin-top: 4px;
}

.form-card {
  background: white;
  border-radius: 16px;
  padding: 32px;
  width: 100%;
  max-width: 480px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
}

.form-title {
  font-size: 18px;
  font-weight: 600;
  color: #2d2d2d;
  margin-bottom: 24px;
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: #555;
  margin-bottom: 6px;
}

.input {
  width: 100%;
  padding: 10px 12px;
  border: 1.5px solid #e0e0e0;
  border-radius: 8px;
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s;
}

.input:focus {
  border-color: #9b59b6;
}

.form-error {
  color: #e74c3c;
  font-size: 13px;
  margin-bottom: 12px;
}

.form-actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  margin-top: 24px;
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

.btn-sm {
  padding: 6px 12px;
  font-size: 12px;
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

.btn-outline {
  background: transparent;
  color: #9b59b6;
  border: 1.5px dashed #9b59b6;
}

.btn-outline:hover {
  background: #f5f0ff;
}

.btn-danger {
  background: transparent;
  color: #e74c3c;
  border: 1.5px solid #fcc;
}

.btn-danger:hover {
  background: #fff5f5;
}
</style>
