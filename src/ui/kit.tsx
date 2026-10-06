import { openPath, openUrl } from "@tauri-apps/plugin-opener";
import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { errText } from "../api";
import { sfx } from "../sound";
import type { IconName } from "./icons";
import { Px } from "./Px";

type BtnKind = "primary" | "paper" | "dark" | "danger" | "ghost" | "green";

export function Button({
  kind = "primary",
  icon,
  small,
  children,
  className,
  onClick,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { kind?: BtnKind; icon?: IconName; small?: boolean }) {
  return (
    <button
      type="button"
      className={`btn btn-${kind}${small ? " btn-small" : ""}${className ? " " + className : ""}`}
      onClick={(e) => {
        sfx.click();
        onClick?.(e);
      }}
      {...rest}
    >
      {icon && <Px name={icon} scale={small ? 1.5 : 2} />}
      {children && <span>{children}</span>}
    </button>
  );
}

export function Check({
  checked,
  onChange,
  disabled,
  label,
  className,
  small,
}: {
  checked: boolean;
  onChange?: (v: boolean) => void;
  disabled?: boolean;
  label?: ReactNode;
  className?: string;
  small?: boolean;
}) {
  return (
    <label
      className={`check${checked ? " on" : ""}${disabled ? " disabled" : ""}${small ? " small" : ""}${className ? " " + className : ""}`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => {
          if (e.target.checked) sfx.tick();
          else sfx.untick();
          onChange?.(e.target.checked);
        }}
      />
      <span className="check-box">{checked && <Px name="check" scale={small ? 1.5 : 2} />}</span>
      {label && <span className="check-label">{label}</span>}
    </label>
  );
}

export function Progress({ value, cells = 20 }: { value: number; cells?: number }) {
  const n = Math.round(Math.max(0, Math.min(1, value)) * cells);
  return (
    <div className="progress" role="progressbar" aria-valuenow={Math.round(value * 100)}>
      {Array.from({ length: cells }, (_, i) => (
        <i key={i} className={i < n ? "on" : ""} />
      ))}
    </div>
  );
}

export function Modal({
  title,
  children,
  onClose,
  wide,
  footer,
}: {
  title: ReactNode;
  children: ReactNode;
  onClose?: () => void;
  wide?: boolean;
  footer?: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && onClose) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`modal panel${wide ? " wide" : ""}`} role="dialog">
        <div className="modal-head">
          <h2>{title}</h2>
          {onClose && (
            <button className="icon-btn" onClick={onClose} title="Закрыть">
              <Px name="cross" scale={2} />
            </button>
          )}
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

type ToastMsg = { id: number; text: string; kind: "info" | "error" | "good" };
let toastSeq = 0;
const listeners = new Set<(t: ToastMsg) => void>();

export function toast(text: string, kind: ToastMsg["kind"] = "info") {
  if (kind === "error") sfx.error();
  const t = { id: ++toastSeq, text, kind };
  listeners.forEach((l) => l(t));
}

export function toastError(e: unknown) {
  toast(errText(e), "error");
}

export function Toasts() {
  const [items, setItems] = useState<ToastMsg[]>([]);
  useEffect(() => {
    const add = (t: ToastMsg) => {
      setItems((xs) => [...xs.slice(-3), t]);
      setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== t.id)), t.kind === "error" ? 6000 : 3200);
    };
    listeners.add(add);
    return () => {
      listeners.delete(add);
    };
  }, []);
  return (
    <div className="toasts">
      {items.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}`} onClick={() => setItems((xs) => xs.filter((x) => x.id !== t.id))}>
          {t.text}
        </div>
      ))}
    </div>
  );
}

export function StampOverlay({ text, onDone }: { text: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 1500);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div className="stamp-overlay" onClick={onDone}>
      <div className="stamp">{text}</div>
    </div>
  );
}

const LINK_RE =
  /(https?:\/\/[^\s<>"']*[^\s<>"'.,;:!?)\]}])|"([A-Za-z]:\\[^"]+)"|([A-Za-z]:\\[^\s<>"'|?*]*[^\s<>"'|?*.,;:!)\]])/g;

let lastOpen = { target: "", at: 0 };

export async function openTarget(target: string) {
  const now = Date.now();
  if (lastOpen.target === target && now - lastOpen.at < 800) return;
  lastOpen = { target, at: now };
  try {
    if (/^https?:\/\//i.test(target)) await openUrl(target);
    else await openPath(target);
  } catch (e) {
    toast(`Не открывается: ${errText(e)}`, "error");
  }
}

export function Linkify({ text, inert }: { text: string; inert?: boolean }) {
  const parts: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  LINK_RE.lastIndex = 0;
  while ((m = LINK_RE.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const target = m[1] ?? m[2] ?? m[3];
    const cls = m[1] ? "link" : "link path";
    const label = m[1] ? "ссылка" : fileName(target);
    parts.push(
      inert ? (
        <span key={m.index} className={`${cls} inert`} title={target}>
          {label}
        </span>
      ) : (
        <a
          key={m.index}
          className={cls}
          href="#"
          title={target}
          data-target={target}
          draggable={false}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            void openTarget(target);
          }}
        >
          {label}
        </a>
      ),
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

export function fileName(p: string) {
  const s = p.replace(/[\\/]+$/, "");
  const i = Math.max(s.lastIndexOf("\\"), s.lastIndexOf("/"));
  return i >= 0 ? s.slice(i + 1) : s;
}

export function AttachChip({ target, onRemove }: { target: string; onRemove?: () => void }) {
  const isUrl = /^https?:\/\//i.test(target);
  return (
    <span className="chip" title={target}>
      <button className="chip-main" onClick={() => void openTarget(target)}>
        <Px name={isUrl ? "arrowR" : "folder"} scale={1.5} />
        <span>{isUrl ? "ссылка" : fileName(target)}</span>
      </button>
      {onRemove && (
        <button className="chip-x" onClick={onRemove} title="Убрать">
          <Px name="cross" scale={1} />
        </button>
      )}
    </span>
  );
}
