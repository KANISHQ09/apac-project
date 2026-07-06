import { supabase } from "@/integrations/supabase/client";
import { UserRole } from "@/shared/types/domain/UserRole";
import { IssueResponse } from "@/shared/contracts/IssueResponse";
import { APIError } from "@/shared/errors/errors";

import { IssueStatus } from "@/shared/types/domain/IssueStatus";

export const adminRepository = {
  async checkIsAdmin(userId: string): Promise<boolean> {
    const { data, error } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .in("role", ["admin", "super_admin", "department_admin"])
      .maybeSingle();

    if (error) throw new APIError(error.message, undefined, error);
    return !!data;
  },

  async getUserRole(userId: string): Promise<{ role: UserRole | null; department: string | null }> {
    const { data, error } = await supabase
      .from("user_roles")
      .select("role, department")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) throw new APIError(error.message, undefined, error);
    return {
      role: (data?.role as UserRole) || null,
      department: data?.department || null,
    };
  },

  async fetchAllIssuesAdmin(): Promise<IssueResponse[]> {
    const { data, error } = await supabase
      .from("reported_issues")
      .select("*")
      .is("master_issue_id", null)
      .order("created_at", { ascending: false });

    if (error) throw new APIError(error.message, undefined, error);
    return data as IssueResponse[];
  },

  async updateIssueStatusAdmin(id: string, status: IssueStatus): Promise<void> {
    const { error } = await supabase
      .from("reported_issues")
      .update({ status })
      .eq("id", id);

    if (error) throw new APIError(error.message, undefined, error);
  },

  async deleteIssueAdmin(id: string): Promise<void> {
    const { error } = await supabase
      .from("reported_issues")
      .delete()
      .eq("id", id);

    if (error) throw new APIError(error.message, undefined, error);
  },
};
