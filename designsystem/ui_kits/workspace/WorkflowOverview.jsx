/* WorkflowOverview — the per-app overview page. */

function WorkflowOverview({ app, workspaceName, onOpenBuilder }) {
  return (
    <div className="page" data-screen-label="05 Workspace/Workflow">
      <header className="page__head">
        <div>
          <p className="eyebrow" style={{ margin: 0 }}>Workflow Overview</p>
          <h1 className="page__title">{app.name}</h1>
          <p className="page__date" style={{ marginTop: 6 }}>In workspace {workspaceName}</p>
        </div>
        <button className="actionChip" onClick={onOpenBuilder}>
          Open builder <Icon name="arrow-up-right" size={13} />
        </button>
      </header>

      <div className="statGrid statGrid--3">
        <StatCard label="Runs this week" value="48" delta="Across 2 triggers" icon="bot" tint="m" />
        <StatCard label="Avg. completion" value="2m 14s" delta="— 11s this week" icon="clock" tint="m" />
        <StatCard label="Pending checks" value="3" delta="Awaiting manager review" icon="list-checks" tint="m" />
      </div>

      <div className="workflowFlow">
        <div className="workflowFlow__tile"><Icon name="spark" size={16} /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 className="workflowFlow__h">Current flow</h2>
          <p className="workflowFlow__sub">
            Incoming submissions are collected, normalized, summarized, and pushed into the reporting channel for manager review.
          </p>
          <ol className="workflowFlow__steps">
            <li>1. Capture a new worker submission or attendance event.</li>
            <li>2. Validate the payload and extract structured fields.</li>
            <li>3. Summarize exceptions and notify the responsible lead.</li>
            <li>4. Store the final record for reporting.</li>
          </ol>
        </div>
      </div>

      <section className="panel">
        <header className="panel__head">
          <h2 className="panel__title">Run history</h2>
          <button className="panel__action">View all <Icon name="arrow-up-right" size={11} /></button>
        </header>
        {[
          { id: "run_8x91", when: "14:32:08", who: "Jamie Chen", ok: true,  dur: "2.18s" },
          { id: "run_8x90", when: "13:55:41", who: "Yuna Lee",   ok: true,  dur: "1.92s" },
          { id: "run_8x8f", when: "13:21:09", who: "System",     ok: true,  dur: "11.40s", note: "roll-up" },
          { id: "run_8x8e", when: "12:48:22", who: "Aram Park",  ok: false, dur: "4.06s", note: "Sheets quota exceeded" },
          { id: "run_8x8d", when: "11:30:17", who: "Yuna Lee",   ok: true,  dur: "1.58s" },
        ].map((r) => (
          <div key={r.id} className="activityRow" style={{ background: r.ok ? undefined : "oklch(0.55 0.20 25 / 0.04)" }}>
            <div style={{ display: "flex", flexDirection: "column", minWidth: 140 }}>
              <span style={{ fontFamily: "var(--panit-font-mono)", fontSize: 13, fontVariantNumeric: "tabular-nums", color: "var(--panit-foreground)" }}>{r.when}</span>
              <span style={{ fontFamily: "var(--panit-font-mono)", fontSize: 11, color: "var(--panit-muted-foreground)" }}>{r.id}</span>
            </div>
            <span style={{ flex: 1, fontSize: 13.5, color: r.who === "System" ? "var(--panit-muted-foreground)" : "var(--panit-foreground)" }}>{r.who}</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: r.ok ? 400 : 500, color: r.ok ? "var(--panit-muted-foreground)" : "var(--panit-destructive)" }}>
              {r.ok
                ? <><Icon name="check-circle" size={13} className="" /> <span>Success</span></>
                : <><Icon name="x-circle" size={13} /> <span>Failure</span></>
              }
              {r.note ? <span style={{ marginLeft: 4, fontSize: 11, padding: "2px 6px", borderRadius: 4, background: r.ok ? "transparent" : "oklch(0.55 0.20 25 / 0.10)", color: r.ok ? "var(--panit-muted-foreground)" : "var(--panit-destructive)", border: r.ok ? "none" : "1px solid oklch(0.55 0.20 25 / 0.25)" }}>{r.note}</span> : null}
            </span>
            <span style={{ fontFamily: "var(--panit-font-mono)", fontSize: 12.5, color: r.ok ? "var(--panit-muted-foreground)" : "var(--panit-destructive)", fontVariantNumeric: "tabular-nums" }}>{r.dur}</span>
          </div>
        ))}
      </section>
    </div>
  );
}

Object.assign(window, { WorkflowOverview });
