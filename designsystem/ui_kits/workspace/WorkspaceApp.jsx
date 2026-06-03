/* WorkspaceApp — top-level shell that composes Sidebar + content area. */

function EmptyPage({ eyebrow, title, description }) {
  return (
    <div className="empty" data-screen-label={`07 Workspace/${title}`}>
      <p className="eyebrow" style={{ margin: 0 }}>{eyebrow}</p>
      <h1 className="page__title" style={{ marginTop: 8 }}>{title}</h1>
      <p style={{ fontSize: 15, lineHeight: 1.6, color: "var(--panit-muted-foreground)", marginTop: 14, maxWidth: 520 }}>
        {description}
      </p>
    </div>
  );
}

const APPS = {
  "task-reports": { id: "task-reports", name: "Task Completion Reports", icon: "file-check" },
  "attendance":   { id: "attendance",   name: "Attendance Log",          icon: "clock" },
};

function WorkspaceApp() {
  const [workspaceName, setWorkspaceName] = React.useState("Panit Demo");
  const [active, setActive] = React.useState("home");

  let content;
  if (active === "home") {
    content = <WorkspaceDashboard workspaceName={workspaceName} onNavigate={setActive} />;
  } else if (active.startsWith("app:")) {
    const app = APPS[active.slice(4)] ?? APPS["task-reports"];
    content = <WorkflowOverview app={app} workspaceName={workspaceName} onOpenBuilder={() => setActive("chat:" + app.id)} />;
  } else if (active.startsWith("chat:")) {
    const app = APPS[active.slice(5)] ?? APPS["task-reports"];
    content = <AgentChat workflowName={app.name} onBack={() => setActive("app:" + app.id)} />;
  } else if (active === "sessions") {
    content = (
      <EmptyPage
        eyebrow="Sessions"
        title="Agent sessions in this workspace"
        description="Open a recent build chat, review earlier runs, or start a fresh session against this workspace."
      />
    );
  } else if (active === "members") {
    content = (
      <EmptyPage
        eyebrow="Members"
        title="Workspace members"
        description="Invite teammates, review roles, and manage who can operate workflows in this workspace."
      />
    );
  } else if (active === "settings") {
    content = (
      <EmptyPage
        eyebrow="Settings"
        title="Workspace settings"
        description="Configure defaults, connected tools, compliance options, and workspace-wide behavior."
      />
    );
  } else if (active === "new-app") {
    content = (
      <EmptyPage
        eyebrow="New workflow"
        title="Create a workflow from a brief"
        description="Give the workflow a clear name and a one-line brief. Panit will open a dedicated build chat for it."
      />
    );
  } else {
    content = <WorkspaceDashboard workspaceName={workspaceName} onNavigate={setActive} />;
  }

  // Chat takes full height; other content scrolls inside the grained shell.
  const isChat = active.startsWith("chat:");

  return (
    <div className="app">
      <WorkspaceSidebar
        active={active}
        onNavigate={setActive}
        workspaceName={workspaceName}
        onSwitchWorkspace={setWorkspaceName}
      />
      <div className="main">
        <div className={"content" + (isChat ? "" : " content--grain")}>
          {content}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { WorkspaceApp, EmptyPage });
