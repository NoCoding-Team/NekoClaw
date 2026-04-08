<script setup lang="ts">
import { onMounted } from "vue";
import { useRouter } from "vue-router";
import { listen } from "@tauri-apps/api/event";
import { check } from "@tauri-apps/plugin-updater";
import { sendNotification } from "@tauri-apps/plugin-notification";

const router = useRouter();

onMounted(async () => {
  await listen("navigate-to-settings", () => {
    router.push("/settings");
  });

  checkForUpdates();
});

async function checkForUpdates() {
  try {
    const update = await check();
    if (update?.available) {
      await sendNotification({
        title: "NekoClaw 有新版本",
        body: `发现新版本 ${update.version}，点击安装`,
      });
      const confirmed = window.confirm(
        `发现新版本 ${update.version}\n\n${update.body ?? ""}\n\n是否立即下载安装？`
      );
      if (confirmed) {
        await update.downloadAndInstall();
        window.alert("更新已完成，请重启 NekoClaw 以应用更新。");
      }
    }
  } catch {
    // 网络不可达时静默忽略
  }
}
</script>

<template>
  <router-view />
</template>
