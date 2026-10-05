import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { X } from "@phosphor-icons/react";

/** A modal dialog that closes on Escape or a click on the backdrop. */
export function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      previous?.focus?.();
    };
  }, [onClose]);

  return (
    <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={panel}>
        <header>
          <h2>{title}</h2>
          <button type="button" className="icon-button" aria-label="閉じる" onClick={onClose}><X size={20} /></button>
        </header>
        {children}
      </div>
    </div>
  );
}
