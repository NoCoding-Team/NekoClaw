<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { invoke } from "@tauri-apps/api/core";

const router = useRouter();
const autostartEnabled = ref(false);
const saving = ref(false);

onMounted(async () => {
  autostartEnabled.value = await invoke<boolean>("get_autostart");
});

async function toggleAutostart(value: boolean) {
  saving.value = true;
  await invoke("set_autostart", { enabled: value });
  autostartEnabled.value = value;
  saving.value = false;
}

function back() {
  router.back();
}
</script>

<template>
  <div class="settings-view">
    <div class="settings-header">
      <button class="back-btn" @click="back">← 返回</button>
      <h2>设置</h2>
    </div>

    <div class="settings-section">
      <h3 class="section-title">通用</h3>
      <div class="setting-item">
        <div class="setting-info">
          <div class="setting-label">开机自启</div>
          <div class="setting-desc">系统登录时自动启动 NekoClaw</div>
        </div>
        <button
          class="toggle"
          :class="{ on: autostartEnabled }"
          :disabled="saving"
          @click="toggleAutostart(!autostartEnabled)"
        >
          <span class="toggle-knob"></span>
        </button>
      </div>
    </div>

    <div class="settings-section">
      <h3 class="section-title">关于</h3>
      <div class="about-info">
        <p><strong>NekoClaw Desktop</strong></p>
        <p class="version">版本 0.1.0</p>
        <p class="desc">猫咪 AI 经营伙伴管理平台</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-view {
  padding: 0;
  min-height: 100vh;
  background: #f8f8f8;
}

.settings-header {
  height: 52px;
  background: white;
  border-bottom: 1px solid #e8e8e8;
  display: flex;
  align-items: center;
  padding: 0 16px;
  gap: 16px;
}

.back-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: #9b59b6;
  font-size: 14px;
  font-weight: 500;
}

.settings-header h2 {
  font-size: 16px;
  font-weight: 600;
  color: #2d2d2d;
}

.settings-section {
  margin: 16px;
  background: white;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
}

.section-title {
  padding: 12px 16px 8px;
  font-size: 12px;
  font-weight: 600;
  color: #999;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  border-bottom: 1px solid #f0f0f0;
}

.setting-item {
  display: flex;
  align-items: center;
  padding: 16px;
  gap: 16px;
}

.setting-info {
  flex: 1;
}

.setting-label {
  font-size: 14px;
  font-weight: 500;
  color: #2d2d2d;
}

.setting-desc {
  font-size: 12px;
  color: #999;
  margin-top: 2px;
}

.toggle {
  width: 44px;
  height: 26px;
  border-radius: 13px;
  background: #ddd;
  border: none;
  cursor: pointer;
  position: relative;
  transition: background 0.2s;
  flex-shrink: 0;
}

.toggle.on {
  background: #9b59b6;
}

.toggle:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.toggle-knob {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 20px;
  height: 20px;
  background: white;
  border-radius: 50%;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
  transition: transform 0.2s;
}

.toggle.on .toggle-knob {
  transform: translateX(18px);
}

.about-info {
  padding: 16px;
  color: #555;
  font-size: 14px;
  line-height: 1.6;
}

.version {
  color: #999;
  font-size: 12px;
}

.desc {
  color: #888;
  font-size: 12px;
}
</style>
