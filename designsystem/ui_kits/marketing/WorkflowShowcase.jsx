/* The right-side WorkflowShowcase pane (used on home + auth shells). */

function FlowItem({ index, icon, label, tag, isLast }) {
  return (
    <li className={`flowItem flowItem--${index + 1}`}>
      <div className="flowItem__tile"><Icon name={icon} size={16} /></div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <p className="flowItem__title" style={{ margin: 0 }}>{label}</p>
        <p className="flowItem__tag" style={{ margin: 0 }}>{tag}</p>
      </div>
      <Icon name="check-circle" size={16} className="flowItem__check" />
      {!isLast ? (
        <span style={{ display: "none" }}>arrow rendered below</span>
      ) : null}
    </li>
  );
}

function WorkflowShowcase() {
  const steps = [
    { icon: "mail",        label: "New support email arrives",            tag: "Trigger" },
    { icon: "spark",       label: "Agent extracts order ID & intent",     tag: "LLM step" },
    { icon: "spreadsheet", label: "Log row in Orders sheet",              tag: "Integration" },
    { icon: "message",     label: "Notify #support in Slack",             tag: "Integration" },
  ];

  return (
    <div className="showcase" data-screen-label="Marketing/Showcase">
      <span className="showcase__grid" aria-hidden />
      <div>
        <p className="eyebrow" style={{ margin: 0 }}>Live example</p>
        <h2 className="showcase__title">
          Describe it once.<br />
          <span className="em">Panit</span> runs it forever.
        </h2>
        <p className="showcase__desc">
          Managers compose workflows in plain English. Agents handle the repetitive work so the team stays in flow.
        </p>
      </div>

      <div className="showcase__flow">
        <ol style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {steps.map((s, i) => (
            <React.Fragment key={s.label}>
              <FlowItem index={i} icon={s.icon} label={s.label} tag={s.tag} isLast={i === steps.length - 1} />
              {i < steps.length - 1 ? (
                <div className="flowArrow"><Icon name="arrow-down" size={12} /></div>
              ) : null}
            </React.Fragment>
          ))}
        </ol>
        <div className="showcase__savings">
          <span className="dot" style={{ "--dot-color": "var(--panit-primary)" }}><span className="dot__ping" /><span className="dot__core" /></span>
          Saved your team ~14 hrs this week
        </div>
      </div>

      <blockquote className="showcase__quote" style={{ margin: 0 }}>
        <p className="showcase__quoteText" style={{ margin: 0 }}>
          &ldquo;My ops team stopped copy-pasting between six tools. Panit just does it.&rdquo;
        </p>
        <footer className="showcase__quoteAttr">Maya R. — Operations Manager, Fieldwork Co.</footer>
      </blockquote>
    </div>
  );
}

Object.assign(window, { WorkflowShowcase });
