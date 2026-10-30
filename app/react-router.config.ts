import type { Config } from "@react-router/dev/config";

export default {
  // root.tsx and routes.ts live at the project root instead of in ./app
  appDirectory: ".",
} satisfies Config;
