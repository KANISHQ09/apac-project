import { schemeRepository } from "../repositories/schemeRepository";
import { Scheme } from "@/shared/types/domain/Scheme";

export const schemeService = {
  async getSchemes(): Promise<Scheme[]> {
    return schemeRepository.fetchAllSchemes();
  },
};
