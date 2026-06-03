/* Composed screens — Home, Login, Signup — and the top-level App router. */

function Header({ rightSlot }) {
  return (
    <header className="shell__header">
      <a href="#" data-route="home" className="wordmark" style={{ textDecoration: "none" }}>
        <PanitWordmark />
      </a>
      <div className="topRight">
        <button className="locale" aria-label="Language">
          <span style={{ fontSize: 14 }}>🌐</span>
          <span>EN</span>
          <Icon name="chevron-down" size={12} />
        </button>
        {rightSlot}
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="shell__footer">
      <span>© 2026 Panit Labs</span>
      <div style={{ display: "flex", gap: 16 }}>
        <a href="#" style={{ color: "inherit" }}>Privacy</a>
        <a href="#" style={{ color: "inherit" }}>Terms</a>
      </div>
    </footer>
  );
}

function HomeScreen({ navigate }) {
  return (
    <main className="shell grain" data-screen-label="01 Marketing/Home">
      <div className="shell__grid">
        <div className="shell__left">
          <Header
            rightSlot={
              <a className="locale" onClick={() => navigate("login")} style={{ cursor: "pointer" }}>Log in</a>
            }
          />
          <div className="shell__body">
            <div className="shell__bodyInner shell__bodyHero">
              <p className="eyebrow">For worker-team managers</p>
              <h1 className="headline headline--hero" style={{ marginTop: 12 }}>
                Build agents that<br />
                <span className="em">do the busywork</span> for your team.
              </h1>
              <p className="sub">
                Panit is an LLM-agent workflow builder. Describe what your team shouldn't have to do anymore — Panit connects your tools, runs it on autopilot, and keeps humans in the loop where it counts.
              </p>
              <div className="ctas">
                <PulseButton onClick={() => navigate("signup")}>
                  Get started free <Icon name="arrow-right" />
                </PulseButton>
                <PulseButton variant="outline" onClick={() => navigate("login")}>
                  I already have an account
                </PulseButton>
              </div>
              <p className="footnote">No credit card. Invite your team in under 2 minutes.</p>
            </div>
          </div>
          <Footer />
        </div>
        <aside className="shell__right">
          <WorkflowShowcase />
        </aside>
      </div>
    </main>
  );
}

function isEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }

function LoginScreen({ navigate }) {
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  function submit(e) {
    e?.preventDefault?.();
    setLoading(true);
    setTimeout(() => navigate("workspace"), 700);
  }

  return (
    <main className="shell grain" data-screen-label="02 Marketing/Login">
      <div className="shell__grid">
        <div className="shell__left">
          <Header
            rightSlot={<span style={{ fontSize: 12, color: "var(--panit-muted-foreground)" }}>Workflow automation for worker teams</span>}
          />
          <div className="shell__body">
            <div className="shell__bodyInner">
              <p className="eyebrow">Welcome back</p>
              <h1 className="headline" style={{ marginTop: 8 }}>
                Good to see you <span className="em">again.</span>
              </h1>
              <p className="sub">
                Log in to check on your agents, review runs, and ship a new workflow your team will thank you for.
              </p>
              <form className="form" style={{ marginTop: 28 }} onSubmit={submit}>
                <AnimatedField
                  id="email" label="Email" type="email" icon="mail" required
                  value={email} onChange={setEmail}
                  placeholder="alex@company.com"
                  validate={(v) => !v ? null : isEmail(v) ? null : "Enter a valid email."}
                />
                <AnimatedField
                  id="password" label="Password" type="password" icon="lock" required
                  value={password} onChange={setPassword}
                  placeholder="Your password"
                  validate={(v) => !v ? null : v.length < 6 ? "Enter your password." : null}
                />
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: -4 }}>
                  <label className="checkbox"><input type="checkbox" />Keep me signed in</label>
                  <a className="linkRow" href="#" style={{ color: "var(--panit-muted-foreground)" }}>Forgot password?</a>
                </div>
                <PulseButton fullWidth loading={loading} type="submit">
                  Log in <Icon name="arrow-right" />
                </PulseButton>
                <div className="divider">or</div>
                <PulseButton variant="outline" fullWidth>
                  <Icon name="google" /> Continue with Google
                </PulseButton>
              </form>
              <p className="linkRow" style={{ marginTop: 20 }}>
                New to Panit? <a onClick={() => navigate("signup")} style={{ cursor: "pointer" }}>Create an account</a>
              </p>
            </div>
          </div>
          <Footer />
        </div>
        <aside className="shell__right"><WorkflowShowcase /></aside>
      </div>
    </main>
  );
}

function strengthScore(p) {
  let s = 0;
  if (p.length >= 8) s++;
  if (/[A-Z]/.test(p)) s++;
  if (/[0-9]/.test(p)) s++;
  if (/[^A-Za-z0-9]/.test(p)) s++;
  if (p.length >= 12) s++;
  return s;
}
const STRENGTH = ["Too short", "Weak", "Okay", "Strong", "Excellent"];

function SignupScreen({ navigate }) {
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  const score = strengthScore(password);
  function submit(e) {
    e?.preventDefault?.();
    setLoading(true);
    setTimeout(() => navigate("workspace"), 700);
  }

  return (
    <main className="shell grain" data-screen-label="03 Marketing/Signup">
      <div className="shell__grid">
        <div className="shell__left">
          <Header
            rightSlot={
              <a className="locale" onClick={() => navigate("login")} style={{ cursor: "pointer" }}>Log in</a>
            }
          />
          <div className="shell__body">
            <div className="shell__bodyInner">
              <p className="eyebrow">Create your workspace</p>
              <h1 className="headline" style={{ marginTop: 8 }}>
                Give your team back their <span className="em">afternoons.</span>
              </h1>
              <p className="sub">
                Start free. Connect your first integration in minutes and let agents take the repeated tasks off the team's plate.
              </p>
              <form className="form" style={{ marginTop: 28 }} onSubmit={submit}>
                <AnimatedField id="name" label="Your name" icon="user" required value={name} onChange={setName} placeholder="Alex Rivera"
                  validate={(v) => !v ? null : v.length < 2 ? "Enter your full name." : null} />
                <AnimatedField id="email" label="Work email" type="email" icon="mail" required value={email} onChange={setEmail} placeholder="alex@company.com"
                  validate={(v) => !v ? null : isEmail(v) ? null : "Enter a valid work email."} />
                <AnimatedField id="password" label="Password" type="password" icon="lock" required value={password} onChange={setPassword}
                  placeholder="At least 8 characters"
                  validate={(v) => !v ? null : v.length < 8 ? "At least 8 characters." : null} />
                {password ? (
                  <div>
                    <div className="strength">
                      {[0,1,2,3,4].map((i) => (
                        <span key={i} className={"strength__bar " + (i < score ? "strength__bar--on" : "")} />
                      ))}
                    </div>
                    <p className="strength__label">{STRENGTH[Math.max(0, score - 1)] || STRENGTH[0]}</p>
                  </div>
                ) : null}
                <PulseButton fullWidth loading={loading} type="submit">
                  Create workspace <Icon name="arrow-right" />
                </PulseButton>
                <p className="footnote">
                  By creating an account you agree to Panit's <a href="#" style={{ color: "var(--panit-foreground)" }}>Terms</a> and <a href="#" style={{ color: "var(--panit-foreground)" }}>Privacy Policy</a>.
                </p>
              </form>
              <p className="linkRow" style={{ marginTop: 20 }}>
                Already on Panit? <a onClick={() => navigate("login")} style={{ cursor: "pointer" }}>Log in</a>
              </p>
            </div>
          </div>
          <Footer />
        </div>
        <aside className="shell__right"><WorkflowShowcase /></aside>
      </div>
    </main>
  );
}

function MarketingApp() {
  const [route, setRoute] = React.useState("home");
  if (route === "login") return <LoginScreen navigate={setRoute} />;
  if (route === "signup") return <SignupScreen navigate={setRoute} />;
  if (route === "workspace") {
    // Hand-off to the workspace kit (a sibling HTML file)
    if (typeof window !== "undefined") window.location.href = "../workspace/index.html";
    return null;
  }
  return <HomeScreen navigate={setRoute} />;
}

Object.assign(window, { HomeScreen, LoginScreen, SignupScreen, MarketingApp });
