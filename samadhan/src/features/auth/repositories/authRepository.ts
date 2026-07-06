import { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { LoginInput } from "../validation/loginSchema";
import { SignupInput } from "../validation/signupSchema";
import { AuthError } from "@/shared/errors/errors";

export const authRepository = {
  async signUp(input: SignupInput) {
    const { data, error } = await supabase.auth.signUp({
      email: input.email,
      password: input.password,
      options: {
        emailRedirectTo: window.location.origin,
        data: {
          full_name: input.fullName,
        },
      },
    });
    if (error) throw new AuthError(error.message, error);
    return data;
  },

  async signIn(input: LoginInput) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: input.email,
      password: input.password,
    });
    if (error) throw new AuthError(error.message, error);
    return data;
  },

  async signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw new AuthError(error.message, error);
  },

  async getSession() {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw new AuthError(error.message, error);
    return data.session;
  },

  onAuthStateChange(callback: (event: AuthChangeEvent, session: Session | null) => void) {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(callback);
    return subscription;
  },
};
