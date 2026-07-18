import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  client: {
    NEXT_PUBLIC_IS_REGISTRATION_OPENED: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
  },
  runtimeEnv: {
    NEXT_PUBLIC_IS_REGISTRATION_OPENED:
      process.env.NEXT_PUBLIC_IS_REGISTRATION_OPENED,
  },
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});
