import { syncSeasonMenus } from "../lib/season-sync.js";

export default {
  async fetch() {
    return new Response("Not found", { status: 404 });
  },

  // Cron Trigger: 매달 1일 00:00 UTC = 한국 시간 매달 1일 09:00
  async scheduled(controller, env) {
    try {
      const { report } = await syncSeasonMenus(env, "cron");
      console.log("[season-sync]", JSON.stringify(report));
    } catch (error) {
      console.error("[season-sync] failed:", error.message);
      throw error;
    }
  },
};
