/* PulseButton + AnimatedField + Icon helper — basic interactive primitives. */

/* Lucide-style icons rendered inline (no extra deps) */
function Icon({ name, size = 16, strokeWidth = 2, className }) {
  const props = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    className,
  };
  switch (name) {
    case "arrow-right": return <svg {...props}><path d="M5 12h14M13 5l7 7-7 7"/></svg>;
    case "arrow-up-right": return <svg {...props}><path d="M7 7h10v10"/><path d="M7 17 17 7"/></svg>;
    case "arrow-down": return <svg {...props}><path d="M12 5v14M19 12l-7 7-7-7"/></svg>;
    case "check": return <svg {...props}><polyline points="20 6 9 17 4 12"/></svg>;
    case "check-circle": return <svg {...props}><path d="M21.801 10A10 10 0 1 1 17 3.335"/><path d="m9 11 3 3L22 4"/></svg>;
    case "alert-circle": return <svg {...props}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>;
    case "mail": return <svg {...props}><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>;
    case "lock": return <svg {...props}><rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>;
    case "user": return <svg {...props}><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>;
    case "eye": return <svg {...props}><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>;
    case "eye-off": return <svg {...props}><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/></svg>;
    case "google": return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <path d="M21.6 12.2c0-.7-.1-1.4-.2-2.1H12v4h5.4c-.2 1.2-.9 2.3-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.4z" fill="#4285F4"/>
        <path d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6C4.7 19.7 8.1 22 12 22z" fill="#34A853"/>
        <path d="M6.4 13.9c-.2-.6-.3-1.3-.3-2s.1-1.3.3-2V7.4H3.1C2.4 8.7 2 10.3 2 12s.4 3.3 1.1 4.6l3.3-2.7z" fill="#FBBC05"/>
        <path d="M12 6c1.5 0 2.8.5 3.9 1.5l2.9-2.9C17 2.9 14.7 2 12 2 8.1 2 4.7 4.3 3.1 7.4l3.3 2.6C7.2 7.8 9.4 6 12 6z" fill="#EA4335"/>
      </svg>
    );
    case "spark": return <svg {...props}><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/></svg>;
    case "spreadsheet": return <svg {...props}><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/></svg>;
    case "message": return <svg {...props}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>;
    case "loader": return <svg {...props} strokeWidth="2.4"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>;
    case "send": return <svg {...props}><path d="m3 3 3 9-3 9 19-9Z"/><path d="M6 12h16"/></svg>;
    case "paperclip": return <svg {...props}><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 17.93 8.8l-8.58 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>;
    case "home": return <svg {...props}><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>;
    case "sessions": return <svg {...props}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>;
    case "users": return <svg {...props}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>;
    case "settings": return <svg {...props}><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>;
    case "plus": return <svg {...props}><path d="M5 12h14M12 5v14"/></svg>;
    case "chevron-down": return <svg {...props}><polyline points="6 9 12 15 18 9"/></svg>;
    case "file-check": return <svg {...props}><path d="M16 22h2a2 2 0 0 0 2-2V7l-5-5H6a2 2 0 0 0-2 2v3"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="m3 15 2 2 4-4"/></svg>;
    case "clock": return <svg {...props}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>;
    case "inbox": return <svg {...props}><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>;
    case "activity": return <svg {...props}><path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.5.5 0 0 1-.96 0L9.24 3.18a.5.5 0 0 0-.96 0l-2.35 8.36A2 2 0 0 1 4 13H2"/></svg>;
    case "zap": return <svg {...props}><path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/></svg>;
    case "log-out": return <svg {...props}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>;
    case "building": return <svg {...props}><rect width="16" height="20" x="4" y="2" rx="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01M16 6h.01M12 6h.01M12 10h.01M12 14h.01M16 10h.01M16 14h.01M8 10h.01M8 14h.01"/></svg>;
    case "x-circle": return <svg {...props}><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6M9 9l6 6"/></svg>;
    case "list-checks": return <svg {...props}><path d="m3 17 2 2 4-4"/><path d="m3 7 2 2 4-4"/><path d="M13 6h8"/><path d="M13 12h8"/><path d="M13 18h8"/></svg>;
    case "bot": return <svg {...props}><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2M20 14h2M15 13v2M9 13v2"/></svg>;
    default: return null;
  }
}

function PulseButton({ children, variant = "primary", loading, disabled, fullWidth, onClick, type = "button" }) {
  const cls = ["btn", `btn--${variant}`, fullWidth && "btn--full", loading && "btn--loading"].filter(Boolean).join(" ");
  return (
    <button type={type} className={cls} disabled={disabled || loading} onClick={onClick}>
      {loading ? (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <Icon name="loader" className="spin" />
          Working...
        </span>
      ) : children}
    </button>
  );
}

function AnimatedField({ id, label, type = "text", value, onChange, placeholder, autoComplete, validate, required, icon }) {
  const [touched, setTouched] = React.useState(false);
  const [focused, setFocused] = React.useState(false);
  const error = validate ? validate(value) : null;
  const valid = (value || "").length > 0 && !error;
  const showError = touched && !focused && !!error;
  const wrapCls = ["field__wrap", showError && "field__wrap--err"].filter(Boolean).join(" ");
  return (
    <div className="field">
      <label htmlFor={id} className="field__label">
        {label}{required ? <span className="field__req">*</span> : null}
      </label>
      <div className={wrapCls}>
        {icon ? <span className="field__icon"><Icon name={icon} /></span> : null}
        <input
          id={id}
          type={type}
          value={value || ""}
          required={required}
          autoComplete={autoComplete}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => { setFocused(false); setTouched(true); }}
          className="field__input"
        />
        {showError ? (
          <span className="field__badge field__badge--err" key="err"><Icon name="alert-circle" size={13} /></span>
        ) : valid ? (
          <span className="field__badge field__badge--ok" key="ok"><Icon name="check" size={13} strokeWidth={3} /></span>
        ) : null}
      </div>
      <div className="field__err">{showError ? error : "\u00A0"}</div>
    </div>
  );
}

Object.assign(window, { Icon, PulseButton, AnimatedField });
