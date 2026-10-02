import { useOutletContext } from "react-router-dom";
import type { CurrentUser } from "../api/client";

export type AuthContext = {
  user: CurrentUser;
  onLogout: () => void;
  /** Replaces the in-memory user after a profile edit (no reload). */
  onUserChange: (user: CurrentUser) => void;
};

export function useAuth() {
  return useOutletContext<AuthContext>();
}
