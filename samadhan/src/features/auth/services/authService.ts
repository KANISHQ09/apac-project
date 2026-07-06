import { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { authRepository } from "../repositories/authRepository";
import { LoginInput } from "../validation/loginSchema";
import { SignupInput } from "../validation/signupSchema";

export const authService = {
  async signUp(input: SignupInput) {
    return authRepository.signUp(input);
  },

  async signIn(input: LoginInput) {
    return authRepository.signIn(input);
  },

  async signOut() {
    return authRepository.signOut();
  },

  async getSession() {
    return authRepository.getSession();
  },

  onAuthStateChange(callback: (event: AuthChangeEvent, session: Session | null) => void) {
    return authRepository.onAuthStateChange(callback);
  },
};
