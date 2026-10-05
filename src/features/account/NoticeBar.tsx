import { useEffect } from "react";
import { useAuth } from "../auth/AuthProvider";

/** Reports the result of account actions, such as a verification link, while signed in. */
export function NoticeBar() {
  const { status, notice, clearNotice } = useAuth();
  const visible = status === "authenticated" && notice !== null;

  useEffect(() => {
    if (!visible || notice?.kind === "error") return;
    const timer = window.setTimeout(clearNotice, 6000);
    return () => window.clearTimeout(timer);
  }, [clearNotice, notice, visible]);

  if (!visible || !notice) return null;
  return (
    <div className={`notice-bar notice-bar--${notice.kind}`} role="status">
      <span>{notice.text}</span>
      <button type="button" onClick={clearNotice}>閉じる</button>
    </div>
  );
}
