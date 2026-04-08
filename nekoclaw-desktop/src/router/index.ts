import { createRouter, createWebHistory } from "vue-router";
import ConfigView from "../views/ConfigView.vue";
import PortalView from "../views/PortalView.vue";
import SettingsView from "../views/SettingsView.vue";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", redirect: "/config" },
    { path: "/config", component: ConfigView },
    { path: "/portal", component: PortalView },
    { path: "/settings", component: SettingsView },
  ],
});

export default router;
