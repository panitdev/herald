/* WorkspaceDashboard — page shown for sidebar active === "home". */

function StatCard({ label, value, delta, icon, tint = "p" }) {
  return (
    <div className="statCard">
      <div className="statCard__head">
        <span className="statCard__label">{label}</span>
        <span className={"statCard__tile statCard__tile--" + tint}><Icon name={icon} size={14} /></span>
      </div>
      <div className="statCard__num">{value}</div>
      <p className="statCard__delta">{delta}</p>
    </div>
  );
}

function BuildingBanner({ appName }) {
  return (
    <div className="banner">
      <div className="banner__tile"><Icon name="spark" size={16} /></div>
      <div className="banner__body">
        <div className="banner__head">
          <p className="banner__title">Building <em>{appName}</em>...</p>
          <span className="banner__pct">60%</span>
        </div>
        <p className="banner__sub">Step 3 of 5 — your teammate invite link will be ready in a moment.</p>
        <div className="banner__track"><div className="banner__bar" /></div>
      </div>
    </div>
  );
}

function StatePill({ live }) {
  return (
    <span className={"pill " + (live ? "pill--live" : "pill--paused")}>
      <span className="dot" style={{ "--dot-color": live ? "var(--panit-primary)" : "var(--panit-muted-foreground)" }}>
        {live ? <span className="dot__ping" /> : null}
        <span className="dot__core" />
      </span>
      {live ? "Live" : "Paused"}
    </span>
  );
}

function WorkspaceDashboard({ workspaceName, onNavigate }) {
  const apps = [
    { id: "task-reports", name: "Task Completion Reports", icon: "file-check", runs: 12, live: true },
    { id: "attendance",   name: "Attendance Log",          icon: "clock",      runs: 17, live: true },
  ];
  const activity = [
    { id: "a1", who: "Jamie Chen", what: "submitted a task report",     time: "14:32", kind: "submission" },
    { id: "a2", who: "Yuna Lee",   what: "logged attendance",           time: "13:55", kind: "submission" },
    { id: "a3", who: "Panit",      what: "workflow roll-up completed",  time: "13:21", kind: "system" },
  ];

  return (
    <div className="page" data-screen-label="04 Workspace/Dashboard">
      <header className="page__head">
        <div>
          <p className="eyebrow" style={{ margin: 0 }}>Home</p>
          <h1 className="page__title">{workspaceName}</h1>
        </div>
        <span className="page__date">Sunday, May 17</span>
      </header>

      <BuildingBanner appName={apps[0].name} />

      <div className="statGrid">
        <StatCard label="Submissions today" value="29" delta="+6 vs. yesterday" icon="inbox" tint="p" />
        <StatCard label="Running apps" value="2" delta="All healthy" icon="activity" tint="a" />
      </div>

      <section className="panel">
        <header className="panel__head">
          <h2 className="panel__title">Apps overview</h2>
          <button className="panel__action">Manage apps <Icon name="arrow-up-right" size={11} /></button>
        </header>
        {apps.map((app) => (
          <button
            key={app.id}
            className="row"
            onClick={() => onNavigate("app:" + app.id)}
          >
            <div className="row__tile"><Icon name={app.icon} size={15} /></div>
            <div className="row__body">
              <p className="row__title">{app.name}</p>
              <p className="row__sub">{app.runs} runs today</p>
            </div>
            <StatePill live={app.live} />
          </button>
        ))}
      </section>

      <section className="panel">
        <header className="panel__head">
          <h2 className="panel__title">Today's activity</h2>
          <button className="panel__action">View all <Icon name="arrow-up-right" size={11} /></button>
        </header>
        {activity.map((it) => {
          const sys = it.kind === "system";
          return (
            <div key={it.id} className="activityRow">
              <div className={"activityRow__av " + (sys ? "activityRow__av--a" : "activityRow__av--p")}>
                {sys ? <Icon name="zap" size={13} /> : it.who.split(" ").map((n) => n[0]).slice(0, 2).join("")}
              </div>
              <p className="activityRow__text">
                <span style={{ fontWeight: 500 }}>{it.who}</span>
                <span className="q"> · {it.what}</span>
              </p>
              <span className="activityRow__time">{it.time}</span>
            </div>
          );
        })}
      </section>
    </div>
  );
}

Object.assign(window, { WorkspaceDashboard, StatCard, BuildingBanner, StatePill });
