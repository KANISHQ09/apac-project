import { UserRole } from "@/shared/types/domain/UserRole";
import { adminRepository } from "../repositories/adminRepository";
import { issueService } from "@/features/issues";
import { Issue } from "@/shared/types/domain/Issue";

import { IssueStatus } from "@/shared/types/domain/IssueStatus";

export const adminService = {
  async checkIsAdmin(userId: string): Promise<boolean> {
    return adminRepository.checkIsAdmin(userId);
  },

  async getUserRole(userId: string): Promise<{ role: UserRole | null; department: string | null }> {
    return adminRepository.getUserRole(userId);
  },

  async fetchAllIssuesAdmin(): Promise<Issue[]> {
    const raw = await adminRepository.fetchAllIssuesAdmin();
    return raw.map((item) => issueService.mapResponseToDomain(item));
  },

  async updateIssueStatusAdmin(id: string, status: IssueStatus): Promise<void> {
    return adminRepository.updateIssueStatusAdmin(id, status);
  },

  async deleteIssueAdmin(id: string): Promise<void> {
    return adminRepository.deleteIssueAdmin(id);
  },
};
