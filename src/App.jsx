import { useState, useEffect } from "react";
import { db, auth } from "./firebase";
import { ref, set, onValue, remove, update, push } from "firebase/database";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile
} from "firebase/auth";

const CARDS = ["1", "2", "3", "5", "8", "13", "21", "Huge"];
const CARD_COLORS = {
  "1": "#4ECDC4", "2": "#45B7D1", "3": "#96CEB4",
  "5": "#FFEAA7", "8": "#DDA0DD", "13": "#F0A500",
  "21": "#FF6B6B", "Huge": "#2D3436"
};

// ── Styles ────────────────────────────────────────────────────────
const s = {
  page: { minHeight: "100vh", background: "#0f0f1a", display: "flex", alignItems: "flex-start", justifyContent: "center", fontFamily: "'Georgia', serif", padding: "30px 16px" },
  card: { background: "#1a1a2e", borderRadius: 20, padding: "40px 36px", width: "100%", maxWidth: 420, textAlign: "center", boxShadow: "0 20px 60px rgba(0,0,0,0.5)", marginTop: 40 },
  title: { color: "#fff", fontSize: 28, margin: "0 0 4px", fontWeight: 800, letterSpacing: 1 },
  sub: { color: "#444", fontSize: 13, marginBottom: 28 },
  field: { textAlign: "left", marginBottom: 16 },
  label: { color: "#555", fontSize: 11, display: "block", marginBottom: 6, letterSpacing: 1 },
  input: { width: "100%", padding: "11px 14px", background: "#0f0f1a", border: "1px solid #2a2a3e", borderRadius: 9, color: "#fff", fontSize: 14, outline: "none", boxSizing: "border-box" },
  btn: { background: "#F0A500", color: "#1a1a2e", border: "none", borderRadius: 50, padding: "13px 32px", fontSize: 15, fontWeight: 700, cursor: "pointer", width: "100%", transition: "opacity 0.2s", marginTop: 4 },
  btnSmall: { background: "#F0A500", color: "#1a1a2e", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" },
  btnGhost: { background: "transparent", color: "#555", border: "1px solid #2a2a3e", borderRadius: 50, padding: "10px 24px", fontSize: 13, cursor: "pointer", width: "100%", marginTop: 8 },
  header: { display: "flex", alignItems: "center", justifyContent: "space-between", background: "#1a1a2e", borderRadius: 12, padding: "11px 18px", marginBottom: 20, gap: 12, flexWrap: "wrap" },
  badge: { background: "#0f0f1a", color: "#F0A500", padding: "5px 13px", borderRadius: 20, fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" },
  error: { color: "#EF476F", fontSize: 12, marginTop: 8, textAlign: "left" },
  teamCard: { background: "#0f0f1a", borderRadius: 12, padding: "16px 18px", marginBottom: 10, display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", transition: "background 0.2s", border: "1px solid #1e1e30" },
};

export default function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [view, setView] = useState("role"); // role | smAuth | devJoin | smDashboard | smSession | devSession

  // SM auth
  const [authMode, setAuthMode] = useState("login"); // login | register
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [authError, setAuthError] = useState("");

  // SM dashboard
  const [myTeams, setMyTeams] = useState({});
  const [newTeamName, setNewTeamName] = useState("");
  const [selectedTeam, setSelectedTeam] = useState(null); // { id, name }

  // SM session
  const [newMember, setNewMember] = useState("");
  const [session, setSession] = useState({});
  const [editingStory, setEditingStory] = useState(false);
  const [storyDraft, setStoryDraft] = useState("");

  // Dev join
  const [allTeams, setAllTeams] = useState({});
  const [devTeamId, setDevTeamId] = useState("");
  const [devName, setDevName] = useState("");

  // Dev session
  const [selectedCard, setSelectedCard] = useState(null);
  const [submitted, setSubmitted] = useState(false);

  // ── Auth listener ───────────────────────────────────────────────
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
      if (u) setView("smDashboard");
    });
    return () => unsub();
  }, []);

  // ── Load SM's teams ─────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const teamsRef = ref(db, `teams/${user.uid}`);
    const unsub = onValue(teamsRef, (snap) => {
      setMyTeams(snap.val() || {});
    });
    return () => unsub();
  }, [user]);

  // ── Load all teams for dev dropdown ─────────────────────────────
  useEffect(() => {
    if (view !== "devJoin") return;
    const unsub = onValue(ref(db, "teams"), (snap) => {
      const data = snap.val() || {};
      // Flatten: { smId: { teamId: { name, members } } } → { teamId: { name, smId } }
      const flat = {};
      Object.entries(data).forEach(([smId, teams]) => {
        Object.entries(teams).forEach(([teamId, team]) => {
          flat[teamId] = { ...team, smId };
        });
      });
      setAllTeams(flat);
    });
    return () => unsub();
  }, [view]);

  // ── Load session for selected team ──────────────────────────────
  useEffect(() => {
    if (!selectedTeam) return;
    const sessionRef = ref(db, `sessions/${selectedTeam.id}`);
    const unsub = onValue(sessionRef, (snap) => {
      const data = snap.val() || {};
      setSession(prev => {
        if (prev.revealed === true && data.revealed === false) {
          setSelectedCard(null);
          setSubmitted(false);
        }
        return data;
      });
    });
    return () => unsub();
  }, [selectedTeam]);

  // ── SM Auth ─────────────────────────────────────────────────────
  const handleAuth = async () => {
    setAuthError("");
    try {
      if (authMode === "register") {
        if (!displayName.trim()) { setAuthError("Please enter your name."); return; }
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(cred.user, { displayName: displayName.trim() });
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (e) {
      const msgs = {
        "auth/email-already-in-use": "This email is already registered.",
        "auth/invalid-email": "Invalid email address.",
        "auth/weak-password": "Password must be at least 6 characters.",
        "auth/invalid-credential": "Wrong email or password.",
        "auth/user-not-found": "No account found with this email.",
      };
      setAuthError(msgs[e.code] || e.message);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    setView("role");
    setSelectedTeam(null);
    setSession({});
  };

  // ── SM Team management ──────────────────────────────────────────
  const handleCreateTeam = async () => {
    if (!newTeamName.trim()) return;
    const teamRef = ref(db, `teams/${user.uid}`);
    const newRef = push(teamRef);
    await set(newRef, { name: newTeamName.trim(), members: {} });
    setNewTeamName("");
  };

  const handleDeleteTeam = async (teamId) => {
    await remove(ref(db, `teams/${user.uid}/${teamId}`));
    await remove(ref(db, `sessions/${teamId}`));
  };

  const handleSelectTeam = (teamId, teamData) => {
    setSelectedTeam({ id: teamId, ...teamData });
    setView("smSession");
    // Init session if needed
    onValue(ref(db, `sessions/${teamId}/revealed`), (snap) => {
      if (snap.val() === null) {
        set(ref(db, `sessions/${teamId}/revealed`), false);
        set(ref(db, `sessions/${teamId}/story`), "User story to estimate...");
      }
    }, { onlyOnce: true });
  };

  const handleAddMember = async () => {
    if (!newMember.trim() || !selectedTeam) return;
    await set(ref(db, `teams/${user.uid}/${selectedTeam.id}/members/${newMember.trim()}`), true);
    setNewMember("");
  };

  const handleRemoveMember = async (memberName) => {
    await remove(ref(db, `teams/${user.uid}/${selectedTeam.id}/members/${memberName}`));
    await remove(ref(db, `sessions/${selectedTeam.id}/votes/${memberName}`));
  };

  const handleReveal = () => update(ref(db, `sessions/${selectedTeam.id}`), { revealed: true });

  const handleReset = async () => {
    await set(ref(db, `sessions/${selectedTeam.id}/votes`), null);
    await set(ref(db, `sessions/${selectedTeam.id}/revealed`), false);
  };

  const handleStoryChange = (story) => update(ref(db, `sessions/${selectedTeam.id}`), { story });

  // ── Dev join ────────────────────────────────────────────────────
  const handleDevJoin = () => {
    if (!devTeamId || !devName) return;
    const team = allTeams[devTeamId];
    setSelectedTeam({ id: devTeamId, name: team.name, members: team.members || {} });
    setView("devSession");
    onValue(ref(db, `sessions/${devTeamId}/revealed`), (snap) => {
      if (snap.val() === null) {
        set(ref(db, `sessions/${devTeamId}/revealed`), false);
      }
    }, { onlyOnce: true });
  };

  const handleSubmitVote = async () => {
    if (!selectedCard || !devTeamId) return;
    await set(ref(db, `sessions/${devTeamId}/votes/${devName}`), selectedCard);
    setSubmitted(true);
  };

  // ── Derived session data ────────────────────────────────────────
  const teamMembers = selectedTeam?.members ? Object.keys(selectedTeam.members) : [];
  const votes = session.votes || {};
  const revealed = session.revealed || false;
  const story = session.story || "";
  const voteValues = Object.values(votes);
  const numericVotes = voteValues.filter(v => v !== "Huge").map(Number);
  const tally = voteValues.reduce((acc, v) => { acc[v] = (acc[v] || 0) + 1; return acc; }, {});
  const mostVoted = Object.entries(tally).sort((a, b) => b[1] - a[1])[0]?.[0];
  const highest = numericVotes.length ? Math.max(...numericVotes) : null;
  const lowest = numericVotes.length ? Math.min(...numericVotes) : null;
  const highestVoter = Object.entries(votes).find(([, v]) => v === String(highest))?.[0];
  const lowestVoter = Object.entries(votes).find(([, v]) => v === String(lowest))?.[0];
  const votedCount = Object.keys(votes).length;

  if (authLoading) return (
    <div style={{ ...s.page, alignItems: "center" }}>
      <p style={{ color: "#F0A500", fontSize: 18 }}>🃏 Loading...</p>
    </div>
  );

  // ══════════════════════════════════════════════════════════════
  // ROLE SELECTION
  // ══════════════════════════════════════════════════════════════
  if (view === "role") return (
    <div style={s.page}>
      <div style={s.card}>
        <div style={{ fontSize: 48, marginBottom: 8 }}>🃏</div>
        <h1 style={s.title}>Planning Poker</h1>
        <p style={s.sub}>Sprint estimation for agile teams</p>
        <button style={s.btn} onClick={() => setView("smAuth")}>🎯 Scrum Master</button>
        <button style={s.btnGhost} onClick={() => setView("devJoin")}>👨‍💻 Developer</button>
        <p style={{ color: "#2a2a3e", fontSize: 11, marginTop: 28 }}>Built by <span style={{ color: "#F0A500" }}>Hakan</span></p>
      </div>
    </div>
  );

  // ══════════════════════════════════════════════════════════════
  // SM AUTH (Login / Register)
  // ══════════════════════════════════════════════════════════════
  if (view === "smAuth") return (
    <div style={s.page}>
      <div style={s.card}>
        <div style={{ fontSize: 36, marginBottom: 8 }}>🎯</div>
        <h1 style={s.title}>Scrum Master</h1>
        <p style={s.sub}>{authMode === "login" ? "Sign in to your account" : "Create your account"}</p>

        <div style={{ display: "flex", background: "#0f0f1a", borderRadius: 10, padding: 3, marginBottom: 20 }}>
          {["login", "register"].map(m => (
            <button key={m} onClick={() => { setAuthMode(m); setAuthError(""); }} style={{
              flex: 1, padding: "9px 0", borderRadius: 8, border: "none",
              background: authMode === m ? "#F0A500" : "transparent",
              color: authMode === m ? "#1a1a2e" : "#555",
              fontWeight: authMode === m ? 700 : 400,
              cursor: "pointer", fontSize: 13,
            }}>
              {m === "login" ? "Sign In" : "Register"}
            </button>
          ))}
        </div>

        {authMode === "register" && (
          <div style={s.field}>
            <label style={s.label}>YOUR NAME</label>
            <input style={s.input} placeholder="e.g. Hakan" value={displayName} onChange={e => setDisplayName(e.target.value)} />
          </div>
        )}
        <div style={s.field}>
          <label style={s.label}>EMAIL</label>
          <input style={s.input} type="email" placeholder="you@company.com" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === "Enter" && handleAuth()} />
        </div>
        <div style={s.field}>
          <label style={s.label}>PASSWORD</label>
          <input style={s.input} type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === "Enter" && handleAuth()} />
        </div>
        {authError && <p style={s.error}>❌ {authError}</p>}
        <button style={s.btn} onClick={handleAuth}>
          {authMode === "login" ? "Sign In →" : "Create Account →"}
        </button>
        <button style={s.btnGhost} onClick={() => setView("role")}>← Back</button>
      </div>
    </div>
  );

  // ══════════════════════════════════════════════════════════════
  // SM DASHBOARD
  // ══════════════════════════════════════════════════════════════
  if (view === "smDashboard") return (
    <div style={s.page}>
      <div style={{ width: "100%", maxWidth: 600 }}>
        <div style={s.header}>
          <span style={s.badge}>🎯 {user?.displayName || user?.email}</span>
          <span style={{ color: "#F0A500", fontSize: 22 }}>🃏 My Teams</span>
          <button onClick={handleLogout} style={{ background: "transparent", border: "1px solid #2a2a3e", color: "#555", borderRadius: 20, padding: "5px 14px", cursor: "pointer", fontSize: 12 }}>Sign Out</button>
        </div>

        {/* Create team */}
        <div style={{ display: "flex", gap: 10, marginBottom: 24 }}>
          <input
            style={{ ...s.input, flex: 1 }}
            placeholder="New team name..."
            value={newTeamName}
            onChange={e => setNewTeamName(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleCreateTeam()}
          />
          <button onClick={handleCreateTeam} style={{ ...s.btnSmall, fontSize: 20, padding: "8px 18px" }}>+</button>
        </div>

        {/* Team list */}
        {Object.keys(myTeams).length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 20px", color: "#333" }}>
            <p style={{ fontSize: 32, marginBottom: 8 }}>🏗️</p>
            <p>No teams yet. Create your first team above!</p>
          </div>
        ) : (
          Object.entries(myTeams).map(([teamId, team]) => (
            <div key={teamId} style={s.teamCard} onClick={() => handleSelectTeam(teamId, team)}
              onMouseEnter={e => e.currentTarget.style.background = "#1a1a2e"}
              onMouseLeave={e => e.currentTarget.style.background = "#0f0f1a"}>
              <div>
                <p style={{ color: "#fff", fontWeight: 700, margin: 0, fontSize: 15 }}>{team.name}</p>
                <p style={{ color: "#555", fontSize: 12, margin: "3px 0 0" }}>
                  {Object.keys(team.members || {}).length} member{Object.keys(team.members || {}).length !== 1 ? "s" : ""}
                </p>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ color: "#F0A500", fontSize: 13 }}>Open →</span>
                <button onClick={e => { e.stopPropagation(); handleDeleteTeam(teamId); }} style={{
                  background: "transparent", border: "none", color: "#333", cursor: "pointer", fontSize: 18, padding: "2px 6px",
                }}
                  onMouseEnter={e => e.target.style.color = "#EF476F"}
                  onMouseLeave={e => e.target.style.color = "#333"}
                >✕</button>
              </div>
            </div>
          ))
        )}
        <p style={{ color: "#1e1e30", fontSize: 11, marginTop: 32, textAlign: "center" }}>Built by <span style={{ color: "#2a2a3e" }}>Hakan</span></p>
      </div>
    </div>
  );

  // ══════════════════════════════════════════════════════════════
  // SM SESSION
  // ══════════════════════════════════════════════════════════════
  if (view === "smSession" && selectedTeam) {
    // Refresh members from live DB
    const liveMembers = myTeams[selectedTeam.id]?.members ? Object.keys(myTeams[selectedTeam.id].members) : [];

    return (
      <div style={s.page}>
        <div style={{ width: "100%", maxWidth: 920 }}>
          <div style={s.header}>
            <button onClick={() => setView("smDashboard")} style={{ background: "transparent", border: "none", color: "#F0A500", cursor: "pointer", fontSize: 13 }}>← Teams</button>
            {editingStory ? (
              <input autoFocus style={{ ...s.input, flex: 1, margin: "0 12px", fontSize: 13, padding: "8px 12px" }}
                value={storyDraft}
                onChange={e => setStoryDraft(e.target.value)}
                onBlur={() => { handleStoryChange(storyDraft); setEditingStory(false); }}
                onKeyDown={e => e.key === "Enter" && (handleStoryChange(storyDraft), setEditingStory(false))}
              />
            ) : (
              <span onClick={() => { setStoryDraft(story); setEditingStory(true); }}
                style={{ color: "#ccc", fontSize: 13, flex: 1, textAlign: "center", cursor: "pointer" }}>
                📋 {story} ✏️
              </span>
            )}
            <span style={s.badge}>{votedCount}/{liveMembers.length} voted</span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 20 }}>
            {/* Left: vote cards */}
            <div>
              <p style={{ color: "#555", fontSize: 12, marginBottom: 12 }}>🎯 {selectedTeam.name}</p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))", gap: 14, marginBottom: 20 }}>
                {liveMembers.map(p => (
                  <div key={p} style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                    <div style={{
                      width: 76, height: 106, borderRadius: 12,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 26, fontWeight: 800, border: "2px solid #1e1e30",
                      background: revealed && votes[p] ? CARD_COLORS[votes[p]] || "#555" : "#1a1a2e",
                      color: revealed && votes[p] ? "#1a1a2e" : "#2a2a3e",
                      transition: "all 0.5s ease",
                    }}>
                      {revealed && votes[p] ? votes[p] : "?"}
                    </div>
                    <span style={{ fontSize: 12, color: "#666", marginTop: 6 }}>{p}</span>
                    {votes[p] && !revealed && <span style={{ fontSize: 10, color: "#06D6A0" }}>✓ voted</span>}
                    {!votes[p] && <span style={{ fontSize: 10, color: "#EF476F" }}>waiting...</span>}
                  </div>
                ))}
              </div>

              <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
                {!revealed ? (
                  <button style={{ ...s.btn, background: "#F0A500", color: "#1a1a2e", width: "auto", padding: "13px 36px" }} onClick={handleReveal}>
                    🃏 Reveal Votes
                  </button>
                ) : (
                  <button style={{ ...s.btn, background: "#4ECDC4", color: "#1a1a2e", width: "auto", padding: "13px 36px" }} onClick={handleReset}>
                    🔄 New Round
                  </button>
                )}
              </div>

              {revealed && voteValues.length > 0 && (
                <div style={{ background: "#1a1a2e", borderRadius: 14, padding: 20, marginTop: 20, textAlign: "center" }}>
                  <h3 style={{ color: "#F0A500", marginBottom: 14, fontSize: 14, letterSpacing: 1 }}>RESULTS</h3>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 16 }}>
                    {[
                      { val: mostVoted, lbl: "Most Voted" },
                      { val: highest ?? "—", lbl: `Highest (${highestVoter || "—"})` },
                      { val: lowest ?? "—", lbl: `Lowest (${lowestVoter || "—"})` },
                    ].map(({ val, lbl }) => (
                      <div key={lbl} style={{ background: "#0f0f1a", borderRadius: 10, padding: "14px 8px" }}>
                        <div style={{ color: "#F0A500", fontSize: 26, fontWeight: 800 }}>{val}</div>
                        <div style={{ color: "#555", fontSize: 11, marginTop: 4 }}>{lbl}</div>
                      </div>
                    ))}
                  </div>
                  {Object.entries(tally).sort((a, b) => b[1] - a[1]).map(([card, count]) => (
                    <div key={card} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 7 }}>
                      <span style={{ background: CARD_COLORS[card] || "#555", width: 34, textAlign: "center", padding: "2px 5px", borderRadius: 5, fontSize: 12, fontWeight: 700, color: "#1a1a2e" }}>{card}</span>
                      <div style={{ flex: 1, background: "#0f0f1a", borderRadius: 4, height: 18 }}>
                        <div style={{ width: `${(count / liveMembers.length) * 100}%`, height: "100%", borderRadius: 4, background: CARD_COLORS[card] || "#555", transition: "width 0.8s ease" }} />
                      </div>
                      <span style={{ color: "#555", fontSize: 11, width: 50, textAlign: "right" }}>{count} vote{count > 1 ? "s" : ""}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Right: member management */}
            <div style={{ background: "#1a1a2e", borderRadius: 14, padding: 18, height: "fit-content", position: "sticky", top: 20 }}>
              <h3 style={{ color: "#F0A500", fontSize: 13, letterSpacing: 1, margin: "0 0 14px" }}>👥 TEAM MEMBERS</h3>
              <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                <input style={{ ...s.input, flex: 1, padding: "9px 12px", fontSize: 13 }}
                  placeholder="Add member..."
                  value={newMember}
                  onChange={e => setNewMember(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleAddMember()}
                />
                <button onClick={handleAddMember} style={{ background: "#F0A500", border: "none", borderRadius: 8, padding: "9px 14px", cursor: "pointer", fontWeight: 700, color: "#1a1a2e", fontSize: 18 }}>+</button>
              </div>
              {liveMembers.length === 0 ? (
                <p style={{ color: "#333", fontSize: 12, textAlign: "center", padding: "12px 0" }}>No members yet.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  {liveMembers.map(p => (
                    <div key={p} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#0f0f1a", borderRadius: 8, padding: "8px 12px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 26, height: 26, borderRadius: "50%", background: votes[p] ? "#F0A500" : "#1e1e30", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: votes[p] ? "#1a1a2e" : "#333" }}>
                          {votes[p] ? "✓" : "?"}
                        </div>
                        <span style={{ color: "#ccc", fontSize: 13 }}>{p}</span>
                      </div>
                      <button onClick={() => handleRemoveMember(p)} style={{ background: "transparent", border: "none", color: "#333", cursor: "pointer", fontSize: 16, padding: "2px 6px" }}
                        onMouseEnter={e => e.target.style.color = "#EF476F"}
                        onMouseLeave={e => e.target.style.color = "#333"}
                      >✕</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════
  // DEVELOPER JOIN
  // ══════════════════════════════════════════════════════════════
  if (view === "devJoin") {
    const selectedTeamData = allTeams[devTeamId];
    const memberNames = selectedTeamData?.members ? Object.keys(selectedTeamData.members) : [];

    return (
      <div style={s.page}>
        <div style={s.card}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>👨‍💻</div>
          <h1 style={s.title}>Developer</h1>
          <p style={s.sub}>Select your team and name</p>

          <div style={s.field}>
            <label style={s.label}>SELECT TEAM</label>
            <select style={{ ...s.input, cursor: "pointer" }} value={devTeamId} onChange={e => { setDevTeamId(e.target.value); setDevName(""); }}>
              <option value="">— Choose a team —</option>
              {Object.entries(allTeams).map(([id, team]) => (
                <option key={id} value={id}>{team.name}</option>
              ))}
            </select>
            {Object.keys(allTeams).length === 0 && (
              <p style={{ color: "#333", fontSize: 12, marginTop: 8 }}>⏳ No teams available yet...</p>
            )}
          </div>

          {devTeamId && (
            <div style={s.field}>
              <label style={s.label}>SELECT YOUR NAME</label>
              <select style={{ ...s.input, cursor: "pointer" }} value={devName} onChange={e => setDevName(e.target.value)}>
                <option value="">— Choose your name —</option>
                {memberNames.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
              {memberNames.length === 0 && (
                <p style={{ color: "#333", fontSize: 12, marginTop: 8 }}>⏳ Scrum Master hasn't added members yet...</p>
              )}
            </div>
          )}

          <button style={{ ...s.btn, opacity: devTeamId && devName ? 1 : 0.4, marginTop: 8 }}
            onClick={handleDevJoin} disabled={!devTeamId || !devName}>
            Join Session →
          </button>
          <button style={s.btnGhost} onClick={() => setView("role")}>← Back</button>
          <p style={{ color: "#2a2a3e", fontSize: 11, marginTop: 20 }}>Built by <span style={{ color: "#F0A500" }}>Hakan</span></p>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════
  // DEVELOPER SESSION
  // ══════════════════════════════════════════════════════════════
  if (view === "devSession" && selectedTeam) {
    const liveMembers = selectedTeam?.members ? Object.keys(selectedTeam.members) : [];
    // Refresh from allTeams
    const freshMembers = allTeams[selectedTeam.id]?.members ? Object.keys(allTeams[selectedTeam.id].members) : liveMembers;

    return (
      <div style={s.page}>
        <div style={{ width: "100%", maxWidth: 680 }}>
          <div style={s.header}>
            <span style={s.badge}>👨‍💻 {devName}</span>
            <span style={{ color: "#ccc", fontSize: 13, flex: 1, textAlign: "center" }}>📋 {story}</span>
            <span style={s.badge}>{votedCount}/{freshMembers.length} voted</span>
          </div>

          {revealed ? (
            <div style={{ background: "#1a2535", color: "#45B7D1", padding: "13px 20px", borderRadius: 10, textAlign: "center", marginBottom: 24, fontSize: 14 }}>
              🃏 Scrum Master revealed the votes!
            </div>
          ) : !submitted ? (
            <p style={{ color: "#555", textAlign: "center", marginBottom: 24, fontSize: 14 }}>Pick your estimate — others can't see your vote yet</p>
          ) : (
            <div style={{ background: "#1a2e1a", color: "#06D6A0", padding: "13px 20px", borderRadius: 10, textAlign: "center", marginBottom: 24, fontSize: 14 }}>
              ✅ Vote submitted! Waiting for Scrum Master to reveal...
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
            {CARDS.map(card => (
              <button key={card} onClick={() => !submitted && !revealed && setSelectedCard(card)}
                disabled={submitted || revealed}
                style={{
                  aspectRatio: "2/3", borderRadius: 12,
                  border: `2px solid ${selectedCard === card ? CARD_COLORS[card] : "#1e1e30"}`,
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                  background: selectedCard === card ? CARD_COLORS[card] : "#1a1a2e",
                  color: selectedCard === card ? "#1a1a2e" : "#ccc",
                  transform: selectedCard === card ? "translateY(-10px) scale(1.06)" : "translateY(0)",
                  boxShadow: selectedCard === card ? `0 10px 28px ${CARD_COLORS[card]}55` : "0 2px 8px rgba(0,0,0,0.4)",
                  cursor: submitted || revealed ? "not-allowed" : "pointer",
                  opacity: (submitted || revealed) && selectedCard !== card ? 0.35 : 1,
                  transition: "all 0.2s ease",
                }}>
                <span style={{ fontSize: card === "Huge" ? 18 : 26, fontWeight: 800 }}>{card}</span>
                <span style={{ fontSize: 9, opacity: 0.5, marginTop: 3 }}>pts</span>
              </button>
            ))}
          </div>

          {!submitted && !revealed && (
            <button style={{ ...s.btn, opacity: selectedCard ? 1 : 0.4 }} onClick={handleSubmitVote} disabled={!selectedCard}>
              Submit Vote 🚀
            </button>
          )}

          <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap", marginTop: 28 }}>
            {freshMembers.map(p => (
              <div key={p} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <div style={{
                  width: 38, height: 38, borderRadius: "50%",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontWeight: 700, fontSize: 13, transition: "all 0.3s",
                  background: votes[p] ? "#F0A500" : "#1e1e30",
                  color: votes[p] ? "#1a1a2e" : "#444",
                  border: p === devName ? "2px solid #F0A500" : "2px solid transparent",
                }}>
                  {revealed && votes[p] ? votes[p] : votes[p] ? "✓" : "?"}
                </div>
                <span style={{ fontSize: 10, color: p === devName ? "#F0A500" : "#555" }}>{p}</span>
              </div>
            ))}
          </div>

          <p style={{ color: "#1a1a2e", fontSize: 11, marginTop: 32, textAlign: "center" }}>
            Built by <span style={{ color: "#2a2a3e" }}>Hakan</span>
          </p>
        </div>
      </div>
    );
  }

  return null;
}
