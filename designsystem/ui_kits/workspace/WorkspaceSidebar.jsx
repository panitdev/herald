/* WorkspaceSidebar — workspace switcher + nav + recent sessions + apps. */

function WorkspaceSidebar({ active, onNavigate, workspaceName, onSwitchWorkspace }) {
  const [open, setOpen] = React.useState(false);

  const navItem = (key, icon, label) => (
    <div
      className={"navItem " + (active === key ? "navItem--active" : "")}
      onClick={() => onNavigate(key)}
    >
      <Icon name={icon} className="navItem__ico" />
      <span>{label}</span>
    </div>
  );

  return (
    <aside className="sidebar">
      <div className="sidebar__top">
        <button
          type="button"
          className={"sidebar__switcher " + (open ? "open" : "")}
          onClick={() => setOpen((v) => !v)}
        >
          <PanitLogo size={22} animate={false} />
          <span className="name">{workspaceName}</span>
          <Icon name="chevron-down" size={14} className="chev" />
        </button>
        {open ? (
          <div className="sidebar__menu" role="menu">
            <button
              className="sidebar__menuItem"
              onClick={() => { onSwitchWorkspace("Panit Demo"); setOpen(false); }}
            >
              <span className="check-cell">{workspaceName === "Panit Demo" ? <Icon name="check" size={11} strokeWidth={3} /> : null}</span>
              <span>Panit Demo</span>
            </button>
            <button
              className="sidebar__menuItem"
              onClick={() => { onSwitchWorkspace("Ops Team"); setOpen(false); }}
            >
              <span className="check-cell">{workspaceName === "Ops Team" ? <Icon name="check" size={11} strokeWidth={3} /> : null}</span>
              <span>Ops Team</span>
            </button>
            <div style={{ height: 1, background: "var(--panit-border)", margin: "4px 2px" }} />
            <button className="sidebar__menuItem" style={{ color: "var(--panit-muted-foreground)" }}>
              <Icon name="plus" size={14} />
              <span>New workspace</span>
            </button>
          </div>
        ) : null}
      </div>

      <nav className="sidebar__nav">
        {navItem("home", "home", "Home")}
        {navItem("sessions", "sessions", "Sessions")}

        <div className="sidebar__section">Recent sessions</div>
        <div>
          <div className="sidebar__sessionItem" onClick={() => onNavigate("chat:1")}>
            <div className="tile"><Icon name="message" size={12} /></div>
            <div className="body">
              <p>Task Completion Reports</p>
              <small>May 12 · 14:32</small>
            </div>
          </div>
          <div className="sidebar__sessionItem" onClick={() => onNavigate("chat:2")}>
            <div className="tile"><Icon name="message" size={12} /></div>
            <div className="body">
              <p>Attendance Log</p>
              <small>May 11 · 09:14</small>
            </div>
          </div>
          <div className="sidebar__sessionItem" onClick={() => onNavigate("chat:3")}>
            <div className="tile"><Icon name="message" size={12} /></div>
            <div className="body">
              <p>Weekly support digest</p>
              <small>May 10 · 17:02</small>
            </div>
          </div>
        </div>
        <div className="sidebar__viewAll" onClick={() => onNavigate("sessions")}>
          View all sessions <Icon name="arrow-up-right" size={11} />
        </div>

        <div className="sidebar__section">Apps</div>
        <div>
          <div
            className={"navItem " + (active === "app:task-reports" ? "navItem--active" : "")}
            onClick={() => onNavigate("app:task-reports")}
          >
            <Icon name="file-check" className="navItem__ico" />
            <span>Task Completion Reports</span>
          </div>
          <div
            className={"navItem " + (active === "app:attendance" ? "navItem--active" : "")}
            onClick={() => onNavigate("app:attendance")}
          >
            <Icon name="clock" className="navItem__ico" />
            <span>Attendance Log</span>
          </div>
        </div>
        <div className="sidebar__newApp" onClick={() => onNavigate("new-app")}>
          <Icon name="plus" size={14} />
          <span>New app</span>
        </div>
      </nav>

      <div className="sidebar__footer">
        {navItem("members", "users", "Members")}
        {navItem("settings", "settings", "Settings")}
      </div>
    </aside>
  );
}

Object.assign(window, { WorkspaceSidebar });
