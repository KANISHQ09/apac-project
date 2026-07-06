import { z } from "zod";

export const profileSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, "Name must be at least 2 characters")
    .max(100, "Name must be under 100 characters"),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9\s-]{10,15}$/, "Please enter a valid phone number")
    .or(z.literal(""))
    .nullable()
    .optional(),
  address: z.string().trim().max(300, "Address is too long").nullable().optional(),
  city: z.string().trim().max(100, "City name is too long").nullable().optional(),
  state: z.string().trim().max(100, "State name is too long").nullable().optional(),
  pincode: z
    .string()
    .trim()
    .regex(/^[1-9][0-9]{5}$/, "Please enter a valid 6-digit Indian pincode")
    .or(z.literal(""))
    .nullable()
    .optional(),
  preferredLanguage: z.enum(["en", "hi"]).default("en").optional(),
});

export type ProfileInput = z.infer<typeof profileSchema>;
