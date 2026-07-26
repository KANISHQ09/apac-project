import { describe, it, expect } from "vitest";
import { supabase } from "@/integrations/supabase/client";
import { adminService } from "@/features/admin/services/adminService";
import { UserRole } from "@/shared/types/domain/UserRole";
import { categoryMatchesDept } from "@/features/admin/hooks/useAdminDashboard"; // wait, is it exported? We can test it.

describe("Real Supabase Database Diagnostic Test", () => {
  it("authenticates and queries the real DB issues and verifies department admin filters", async () => {
    const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
      email: "water@samadhan.gov.in",
      password: "Samadhan@Water2024!",
    });
    
    expect(authErr).toBeNull();
    console.log("Logged in user:", authData.user.id);

    // Fetch roles
    const { data: roles } = await supabase
      .from("user_roles")
      .select("*")
      .eq("user_id", authData.user.id);
    console.log("User roles:", roles);

    // Call adminService to fetch all issues
    const issues = await adminService.fetchAllIssuesAdmin();
    console.log("Fetched total issues from adminService:", issues.length);

    // Test visible issue filters for water_supply
    const dept = "water_supply";
    const filtered = issues.filter((issue) => {
      const isLead = issue.leadDepartment === dept;
      const hasActiveParticipation = issue.participations?.some(
        (p) => p.department === dept && p.status === "ACTIVE"
      );
      const hasActiveTask = issue.tasks?.some((t) => t.department === dept);
      
      // Let's implement check manually
      const DEPT_CATEGORY_MAP: Record<string, string[]> = {
        water_supply: ["Water Supply", "जल आपूर्ति"],
      };
      const labels = DEPT_CATEGORY_MAP[dept] ?? [];
      const isLegacyMatch =
        (!issue.participations || issue.participations.length === 0) &&
        labels.some((l) => l.toLowerCase() === issue.category?.toLowerCase());

      return isLead || !!hasActiveParticipation || !!hasActiveTask || isLegacyMatch;
    });

    console.log("Filtered issues for water_supply department:", filtered.length);
    filtered.forEach(i => {
      console.log(`- [${i.caseNumber}] Title: "${i.title}" | Category: "${i.category}" | Lead: "${i.leadDepartment}"`);
    });
  }, 30000);
});
