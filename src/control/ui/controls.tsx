// Native-feeling macOS controls for the presenter panel.
import type { ReactNode } from "react";

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  size = "regular",
  label,
}: {
  value: T;
  options: { value: T; label: ReactNode; title?: string }[];
  onChange: (value: T) => void;
  size?: "regular" | "small";
  label?: string;
}) {
  return (
    <div className={`seg seg-${size}`} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          title={o.title}
          className={`seg-item${o.value === value ? " is-on" : ""}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={`switch${checked ? " is-on" : ""}`}
      onClick={() => onChange(!checked)}
    >
      <span className="switch-knob" />
    </button>
  );
}

export function Button({
  children,
  onClick,
  variant = "default",
  disabled,
  title,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "default" | "primary" | "plain" | "destructive";
  disabled?: boolean;
  title?: string;
  type?: "button" | "submit";
}) {
  return (
    <button type={type} className={`btn btn-${variant}`} onClick={onClick} disabled={disabled} title={title}>
      {children}
    </button>
  );
}

export function Group({ title, children, footer, actions }: { title?: ReactNode; children: ReactNode; footer?: ReactNode; actions?: ReactNode }) {
  return (
    <section className="group">
      {(title || actions) && (
        <header className="group-header">
          <h3 className="group-title">{title}</h3>
          {actions && <div className="group-actions">{actions}</div>}
        </header>
      )}
      <div className="group-box">{children}</div>
      {footer && <p className="group-footer">{footer}</p>}
    </section>
  );
}

export function Row({ label, detail, children }: { label: ReactNode; detail?: ReactNode; children?: ReactNode }) {
  return (
    <div className="row">
      <div className="row-text">
        <div className="row-label">{label}</div>
        {detail && <div className="row-detail">{detail}</div>}
      </div>
      {children && <div className="row-control">{children}</div>}
    </div>
  );
}

export function Pill({ tone = "neutral", children, title }: { tone?: "neutral" | "good" | "warn" | "bad" | "accent"; children: ReactNode; title?: string }) {
  return (
    <span className={`pill pill-${tone}`} title={title}>
      {children}
    </span>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-title">{title}</div>
      {children && <div className="empty-body">{children}</div>}
    </div>
  );
}
