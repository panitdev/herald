/* AgentChat — the agent session view. Click "Open builder" on a workflow
   overview to land here. Sends are simulated locally. */

function ToolCall({ name, status, body }) {
  const cls = "toolCall" + (status === "pending" ? " toolCall--pending" : "");
  return (
    <div className={cls}>
      <div className="toolCall__head">
        {status === "pending"
          ? <Icon name="loader" size={12} className="spin" />
          : <Icon name="check-circle" size={12} />
        }
        <strong style={{ fontWeight: 600 }}>{name}</strong>
      </div>
      {body ? <div className="toolCall__body">{body}</div> : null}
    </div>
  );
}

function Message({ role, children }) {
  const isAgent = role === "agent";
  return (
    <div className={"msg " + (isAgent ? "msg--agent" : "msg--user")}>
      {isAgent ? (
        <div className="msg__av"><Icon name="bot" size={14} /></div>
      ) : null}
      <div className="msg__bubble">{children}</div>
    </div>
  );
}

function AgentChat({ workflowName, onBack }) {
  const [msgs, setMsgs] = React.useState([
    { id: 1, role: "agent",
      content: (<>
        <p style={{ margin: 0 }}>Drafted a starter workflow for <em style={{ fontStyle: "italic" }}>{workflowName}</em>. I've connected your Google Sheet and KakaoTalk channel — ready when you are.</p>
      </>)
    },
    { id: 2, role: "agent", content: <ToolCall name="connect_google_sheets" status="ok" body="→ Spreadsheet ID 1bX..a3pQ, tab Reports" /> },
    { id: 3, role: "user", content: "Add a step to label submissions as urgent when the photo metadata indicates a fall." },
  ]);
  const [text, setText] = React.useState("");
  const [thinking, setThinking] = React.useState(false);

  function send() {
    if (!text.trim()) return;
    const id = Date.now();
    setMsgs((prev) => [...prev, { id, role: "user", content: text }]);
    setText("");
    setThinking(true);
    setTimeout(() => {
      setMsgs((prev) => [...prev,
        { id: id + 1, role: "agent", content: <ToolCall name="add_workflow_step" status="ok" body="→ Inserted classifier between extract and notify steps." /> },
        { id: id + 2, role: "agent", content: "Added an urgency classifier that flags falls and routes them to the on-call lead first. Want me to add a manager-review checkpoint before the auto-notify?" },
      ]);
      setThinking(false);
    }, 1200);
  }

  return (
    <div className="chat" data-screen-label="06 Workspace/AgentChat">
      <div className="chat__breadcrumb">
        <a onClick={onBack} style={{ cursor: "pointer", color: "var(--panit-muted-foreground)" }}>Workflows</a>
        <Icon name="arrow-right" size={11} className="chev" />
        <span>{workflowName}</span>
        <Icon name="arrow-right" size={11} className="chev" />
        <span style={{ color: "var(--panit-foreground)" }}>Builder</span>
      </div>

      <div className="chat__messages">
        {msgs.map((m) => (
          <Message key={m.id} role={m.role}>{m.content}</Message>
        ))}
        {thinking ? (
          <Message role="agent">
            <ToolCall name="thinking" status="pending" />
          </Message>
        ) : null}
      </div>

      <div className="composer">
        <div className="promptBox">
          <textarea
            className="promptBox__input"
            placeholder="Reply..."
            rows={2}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
            }}
          />
          <div className="promptBox__ctrls">
            <button className="promptBox__icon"><Icon name="paperclip" size={15} /></button>
            <div className="promptBox__right">
              <span className="promptBox__model">Sonnet 4.6</span>
              <button className="promptBox__send" disabled={!text.trim()} onClick={send}>
                <Icon name="send" size={15} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { AgentChat, ToolCall, Message });
