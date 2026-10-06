import type { ReactNode } from "react";
import { HourglassMedium } from "@phosphor-icons/react";
import { assets } from "../../data";
import { useAuth } from "./AuthProvider";
import { LoginScreen } from "./LoginScreen";

export function AuthGate({ children }: { children: ReactNode }) {
  const { status, resetToken } = useAuth();

  if (status === "checking") {
    return (
      <main className="auth-loading" aria-live="polite">
        <img src={assets.logo} alt="" />
        <HourglassMedium size={24} />
        <p>セッションを確認しています</p>
      </main>
    );
  }

  // A password reset link takes over even if a session is still open: the reset ends it.
  if (status === "unauthenticated" || resetToken) return <LoginScreen />;
  return children;
}
