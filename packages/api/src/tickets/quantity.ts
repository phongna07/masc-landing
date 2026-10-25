import { z } from "zod";

export const maxBundleQuantity = 10;
export const maxOrderAmount = 2_000_000_000;
export const bundleQuantityInput = z.number({ error: "bundleQuantityInvalid" }).int("bundleQuantityInvalid").min(1, "bundleQuantityInvalid").max(maxBundleQuantity, "bundleQuantityInvalid").default(1);
