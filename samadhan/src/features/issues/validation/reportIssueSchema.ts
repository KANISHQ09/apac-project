import { z } from "zod";

export const reportIssueSchema = z.object({
  title: z
    .string()
    .trim()
    .min(5, "Title must be at least 5 characters")
    .max(200, "Title must be less than 200 characters"),
  description: z
    .string()
    .trim()
    .min(10, "Description must be at least 10 characters")
    .max(2000, "Description must be less than 2000 characters"),
  category: z.string().min(1, "Please select a category"),
  location: z
    .string()
    .trim()
    .min(5, "Location must be at least 5 characters")
    .max(500, "Location must be less than 500 characters"),
});

export type ReportIssueInput = z.infer<typeof reportIssueSchema>;
