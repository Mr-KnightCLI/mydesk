"use client";
import { useEffect, useRef, useState } from "react";
import {
  FileText, Upload, Mic, Volume2, VolumeX,
  PanelsTopLeft,
  MessageSquare,
  SquareCheck,
  BookOpen,
  Brain,
  Plus,
  ArrowUp,
  ArrowUpRight,
  PanelLeft,
  LogOut,
  Sun,
  CalendarDays,
  Paperclip,
  ChevronRight,
  NotebookPen,
  Check,
  Menu,
  X,
} from "lucide-react";
import { empty, type PdfRef, type Space } from "../lib/tasks";
const views = [
  ["Chat", MessageSquare],
  ["Tasks", SquareCheck],
  ["Notes", BookOpen],
  ["Memory", Brain],
] as const;
type Dictation = {
  lang: string;
  onresult: ((event: {results: ArrayLike<ArrayLike<{transcript:string}>>}) => void) | null;
  onerror: ((event: {error:string}) => void) | null;
  onend: (() => void) | null;
  start():void; stop():void; abort():void;
};
type VoiceWindow = Window & {SpeechRecognition?: new () => Dictation; webkitSpeechRecognition?: new () => Dictation};
const zone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
export default function Desk() {
  const [space, S] = useState<Space>(empty),
    [view, V] = useState("Chat"),
    [thread, T] = useState(""),
    [note, N] = useState(""),
    [draft, D] = useState(""),
    [email, E] = useState(""),
    [sample, A] = useState(true),
    [auth, H] = useState("loading"),
    [busy, B] = useState(false),
    [error, F] = useState(""),
    [menu, M] = useState(false),
    [form, G] = useState(false),
    [edit, J] = useState(""),
    [filter, K] = useState("Open");
  const [spoken,setSpoken]=useState(false), [listening,setListening]=useState(false);
  const mic=useRef<Dictation | null>(null), readAloud=useRef(false);
  useEffect(()=>()=>{mic.current?.abort();window.speechSynthesis?.cancel()},[]);
  function dictate(){
    if(mic.current){mic.current.stop();return}
    const w=window as VoiceWindow;
    const Engine=w.SpeechRecognition || w.webkitSpeechRecognition;
    if(!Engine){F("Microphone input is unavailable in this browser. Try Chrome or Edge, or type below.");return}
    window.speechSynthesis?.cancel(); F("");
    const rec=new Engine(); mic.current=rec;rec.lang=navigator.language;
    rec.onresult=e=>{const words=e.results[0]?.[0]?.transcript;if(words)D(old=>[old,words].filter(Boolean).join(" "))};
    rec.onerror=e=>F(e.error==="not-allowed"?"Allow microphone access in your browser to dictate.":"Dictation stopped. Try again or type your message.");
    rec.onend=()=>{mic.current=null;setListening(false)};
    try{rec.start();setListening(true)}catch{mic.current=null;F("The microphone could not start.")}
  }
  function toggleSpeech(){
    if(!window.speechSynthesis){F("Spoken replies are unavailable in this browser.");return}
    readAloud.current=!spoken;setSpoken(!spoken);window.speechSynthesis.cancel();
  }
  const [pdf,setPdf]=useState<PdfRef|null>(null);
  const [uploading,setUploading]=useState(false);
  const fileInput=useRef<HTMLInputElement>(null);
  async function attach(file?:File){
    if(!file||busy)return;
    await run(async()=>{
      if(file.size>4*1024*1024)throw Error("Choose a PDF under 4 MB.");
      setUploading(true);
      try{
        const response=await fetch("/api/pdf?name="+encodeURIComponent(file.name),{method:"POST",headers:{"content-type":"application/pdf"},body:file});
        const doc=await response.json();
        if(!response.ok)throw Error(doc.error||"Upload failed.");
        setPdf(doc);N("");V("Chat");
      }finally{setUploading(false)}
    });
  }
  const started = useRef(false),
    end = useRef<HTMLDivElement>(null);
  const chat = space.threads.find((c) => c.id === thread),
    selected = space.notes.find((n) => n.id === note);
  async function call(op: string, data: Record<string, unknown> = {}) {
    const r = await fetch("/api/desk", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ op, zone: zone(), ...data }),
    });
    const json = await r.json();
    if (!r.ok) throw Object.assign(Error(json.error), { status: r.status });
    if (json.space) {
      S(json.space);
      E(json.email);
      A(json.sample);
    }
    return json;
  }
  async function run(fn: () => Promise<void>) {
    B(true);
    F("");
    try {
      await fn();
    } catch (e) {
      F(e instanceof Error ? e.message : "Please retry.");
    } finally {
      B(false);
    }
  }
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void run(async () => {
      try {
        const session = await call("load");
        H(session.sample && !sessionStorage.getItem("choseSample") ? "signin" : "");
      } catch (e: any) {
        if (e.status !== 401) throw e;
        H("signin");
      }
    });
  }, []);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [chat?.messages.length]);
  function nav(v: string) {
    V(v);
    M(false);
    G(false);
    J("");
    F("");
  }
  function fresh() {
    nav("Chat");
    T("");
    setPdf(null);
    N("");
    D("");
  }
  async function send(text: string, source = note) {
    if (!text.trim() || busy) return;
    await run(async () => {
      const data = await call("chat", { thread, text, note: source, pdf: source?null:pdf?.id||null });
      const activeId=thread || data.space.threads[0].id;
      T(activeId);
      const reply=(data.space as Space).threads.find(c=>c.id===activeId)?.messages.at(-1);
      if(readAloud.current && reply?.role==="assistant" && window.speechSynthesis){
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(new SpeechSynthesisUtterance(reply.text));
      }
      V("Chat");
      D("");
    });
  }
  function openNote(id: string) {
    nav("Notes");
    N(id);
  }
  const composer = (
    <form
      className="composer"
      onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();void attach(e.dataTransfer.files[0])}}
      onSubmit={(e) => {
        e.preventDefault();
        void send(draft);
      }}
    >
      <input hidden ref={fileInput} type="file" accept=".pdf,application/pdf" aria-label="Choose PDF file" onChange={e=>{void attach(e.target.files?.[0]);e.target.value=""}}/>
      {pdf && <div className="fileChip"><FileText size={17}/><span>{pdf.title}</span><small>{pdf.count} pages</small><button type="button" aria-label="Detach PDF" onClick={()=>setPdf(null)}><X size={14}/></button></div>}
      <textarea
        aria-label="Message MyDesk"
        placeholder={
          pdf ? "Ask about "+pdf.title+"…" : selected
            ? "Ask about " + selected.title + "…"
            : "Ask MyDesk anything…"
        }
        value={draft}
        onChange={(e) => D(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            void send(draft);
          }
        }}
      />
      <div className="tools">
        <div className="attachTools"><button className="attachPdf" type="button" disabled={busy} onClick={()=>fileInput.current?.click()}><Upload size={15}/> PDF</button><label>
          <Paperclip size={15} />
          <select
            aria-label="Attach a note"
            value={note}
            onChange={(e) => {N(e.target.value);if(e.target.value)setPdf(null)}}
          >
            <option value="">Attach note</option>
            {space.notes.map((n) => (
              <option key={n.id} value={n.id}>
                {n.title}
              </option>
            ))}
          </select>
        </label></div>
        <div className="voiceControls">
        <button type="button" aria-label={listening?"Stop dictation":"Dictate a message"} title={listening?"Stop dictation":"Dictate a message"} aria-pressed={listening} onClick={dictate}><Mic size={17}/>{listening && "Listening…"}</button>
        <button type="button" aria-label="Speak replies aloud" title="Speak replies aloud" aria-pressed={spoken} onClick={toggleSpeech}>{spoken?<Volume2 size={17}/>:<VolumeX size={17}/>}</button>
        <button
          className="send"
          aria-label="Send message"
          disabled={busy || !draft.trim()}
        >
          <ArrowUp size={18} />
        </button></div>
      </div>
    </form>
  );
  return (
    <div className={auth ? "desk authenticating" : "desk"}>
      {menu && !auth && <button className="scrim" aria-label="Close navigation" onClick={()=>M(false)}/>}
      <aside className={menu ? "open" : ""}>
        <div className="brand">
          <PanelsTopLeft /> MyDesk
          <button
            className="mobile"
            onClick={() => M(false)}
            aria-label="Close menu"
          >
            <X />
          </button>
        </div>
        <button className="new" onClick={fresh}>
          <Plus size={17} /> New conversation
        </button>
        <small>Workspace</small>
        <nav>
          {views.map(([name, Icon]) => (
            <button
              key={name}
              className={view === name ? "active" : ""}
              onClick={() => nav(name)}
            >
              <Icon size={17} />
              {name}
            </button>
          ))}
        </nav>
        <small>Recent chats</small>
        <div className="history">
          {space.threads.length ? (
            space.threads.map((c) => (
              <button
                key={c.id}
                aria-current={thread===c.id && view==="Chat"?"page":undefined}
                onClick={() => {
                  nav("Chat");
                  T(c.id);
                  setPdf(c.pdf||null);
                  N("");
                }}
              >
                {c.title}
              </button>
            ))
          ) : (
            <span>Your chats appear here.</span>
          )}
        </div>
        <div className="account">
          <b>{sample ? "S" : email[0]?.toUpperCase()}</b>
          <div>
            {email || "Workspace"}
            <button
              onClick={() => {
                H("signin");
                F("");
              }}
            >
              {sample ? "Sign in to your desk" : "Switch account"}
            </button>
          </div>
          <button
            aria-label="Sign out"
            disabled={busy}
            onClick={() =>
              run(async () => {
                await call("signout");
                sessionStorage.setItem("signedOut", "1");
                S(empty());
                E("");
                fresh();
                H("signin");
              })
            }
          >
            <LogOut size={15} />
          </button>
        </div>
      </aside>
      <main>
        <header>
          <button
            className="mobile"
            onClick={() => M(true)}
            aria-label="Open menu"
          >
            <Menu />
          </button>
          <PanelLeft size={16} />
          <span>Workspace</span>
          <ChevronRight size={13} />
          <strong>{view}</strong>
          <time>
            {new Date().toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              weekday: "short",
            })}
          </time>
        </header>
        {error && (
          <div role="alert" className="error">
            {error}
          </div>
        )}
        {auth === "loading" ? (<section className="content" role="status">Opening your desk…</section>) : auth ? (
          <section className="content authPanel">
            <div className="authBrand"><PanelsTopLeft size={26}/> MyDesk</div>
            <h1>{auth === "signin" ? "Welcome back" : "Create your desk"}</h1>
            <p>{auth==="signin"?"Sign in to your personal AI workspace.":"Keep your conversations, notes and plans together."}</p>
            <form
              key={auth}
              className="editor"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void run(async () => {
                  await call(auth, {
                    email: f.get("email"),
                    password: f.get("password"),
                  });
                  sessionStorage.removeItem("signedOut");
                  sessionStorage.removeItem("choseSample");
                  fresh();
                  H("");
                });
              }}
            >
              <label>
                Email
                <input name="email" autoComplete="email" type="email" required />
              </label>
              <label>
                Password
                <input name="password" autoComplete={auth==="signin"?"current-password":"new-password"} type="password" minLength={8} required />
              </label>
              <button disabled={busy}>
                {auth === "signin" ? "Sign in" : "Create account"}
              </button>
            </form>
            <button onClick={() => H(auth === "signin" ? "signup" : "signin")}>
              {auth === "signin" ? "Create an account" : "Sign in instead"}
            </button>
            <button
              onClick={() =>
                run(async () => {
                  if (!email) await call("sample");
                  if (!email || sample) sessionStorage.setItem("choseSample","1");
                  H("");
                  fresh();
                })
              }
            >
              {email && !sample ? "Return to workspace" : "Try offline sample"}
            </button>
          </section>
        ) : view === "Chat" ? (
          <section className="chat">
            <div className="stream">
              {!chat ? (
                <div className="welcome">
                  <div className="sun">
                    <Sun size={42} strokeWidth={1.3} />
                  </div>
                  <h1>What’s on your desk?</h1>
                  <p>
                    Ask a question, explore a PDF, or make a plan for today.
                  </p>
                  <div className="suggest">
                    {[
                      [CalendarDays, "Plan my day", "What should I do today?"],
                      [BookOpen, "Study a note", ""],
                      [FileText, "Ask a PDF", ""],
                    ].map(([I, label, prompt]) => {
                      const Icon = I as typeof Sun;
                      return (
                        <button
                          key={String(label)}
                          onClick={() =>
                            label === "Ask a PDF" ? fileInput.current?.click() : label === "Study a note"
                              ? nav("Notes")
                              : label === "Plan my day"
                                ? void send(String(prompt), "")
                                : D(String(prompt))
                          }
                        >
                          <Icon size={18} />
                          {String(label)}
                          <ArrowUpRight size={14} />
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="messages">
                  <h2>{chat.title}</h2>
                  {chat.messages.map((m, i) => (
                    <article key={i} className={m.role}>
                      <strong>{m.role === "user" ? "You" : "MyDesk"}</strong>
                      <p>{m.text}</p>
                      {m.links?.map(link=><a className="feedSource" key={link.url} href={link.url} target="_blank" rel="noopener noreferrer">{link.title} ↗</a>)}
                      {i===chat.messages.length-1 && chat.desktop && <div>{["Confirm","Cancel"].map(label=><button key={label} disabled={busy} onClick={()=>void send(label,"")}>{label}</button>)}</div>}
                      {m.source && (
                        <button onClick={() => openNote(m.source!)}>
                          <BookOpen size={14} />
                          {space.notes.find((n) => n.id === m.source)?.title}
                        </button>
                      )}
                    </article>
                  ))}
                  <div ref={end} />
                </div>
              )}
            </div>
            {composer}
            <footer aria-live="polite">
              {busy
                ? (uploading?"Reading PDF…":"Working…")
                : sample
                  ? <button onClick={()=>H("signin")}>Sign in for live AI chat</button>
                  : "Personal workspace"}{" "}
            </footer>
          </section>
        ) : (
          <section className="content">
            <div className="sectionhead">
              <h1>{view}</h1>
              {view === "Notes" && (
                <button onClick={() => G(!form)}>
                  <Plus size={16} /> Add note
                </button>
              )}
              {view === "Tasks" && (
                <button
                  onClick={() => {
                    fresh();
                    D("Add a task to ");
                  }}
                >
                  <Plus size={16} /> Add task
                </button>
              )}
            </div>
            {view === "Tasks" ? (
              <>
                <div className="tabs">
                  {["Open", "Completed", "All"].map((v) => (
                    <button
                      className={v === filter ? "on" : ""}
                      key={v}
                      onClick={() => K(v)}
                    >
                      {v}
                    </button>
                  ))}
                </div>
                {space.tasks
                  .filter(
                    (t) =>
                      filter === "All" || t.done === (filter === "Completed"),
                  )
                  .map((t) => (
                    <div className="row" key={t.id}>
                      <button
                        className="check"
                        aria-label={"Toggle " + t.title}
                        disabled={busy}
                        onClick={() =>
                          run(async () => {
                            await call("toggle", { id: t.id, done: !t.done });
                          })
                        }
                      >
                        {t.done && <Check size={14} />}
                      </button>
                      <div>
                        <strong>{t.title}</strong>
                        <p>
                          {t.due || "No due date"} · {t.priority} priority
                        </p>
                      </div>
                    </div>
                  ))}
                {!space.tasks.some(
                  (t) =>
                    filter === "All" || t.done === (filter === "Completed"),
                ) && <p>No tasks in this view.</p>}
              </>
            ) : view === "Notes" ? (
              <>
                {form && (
                  <form
                    className="editor"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      void run(async () => {
                        const r = await call("note", {
                          title: f.get("title"),
                          text: f.get("text"),
                        });
                        N(r.space.notes[0].id);
                        G(false);
                      });
                    }}
                  >
                    <label>
                      Note title
                      <input name="title" required />
                    </label>
                    <label>
                      Note text
                      <textarea name="text" required />
                    </label>
                    <button disabled={busy}>Save note</button>
                  </form>
                )}
                {space.notes.map((n) => (
                  <button
                    className="noteRow"
                    key={n.id}
                    onClick={() => N(n.id)}
                  >
                    <NotebookPen size={18} />
                    {n.title}
                    <ChevronRight size={15} />
                  </button>
                ))}
                {selected && (
                  <article>
                    <h2>{selected.title}</h2>
                    <p>{selected.text}</p>
                    {["Summarize", "Explain", "Quiz me on"].map((p) => (
                      <button
                        key={p}
                        disabled={busy}
                        onClick={() =>
                          void send(p + " " + selected.title, selected.id)
                        }
                      >
                        {p} {selected.title}
                      </button>
                    ))}
                  </article>
                )}
                {!space.notes.length && (
                  <p>Add your first note to start a study session.</p>
                )}
              </>
            ) : (
              <>
                <p>Facts you’ve asked MyDesk to remember.</p>
                {space.memories.map((m) => (
                  <article key={m.id}>
                    {edit === m.id ? (
                      <form
                        className="editor"
                        onSubmit={(e) => {
                          e.preventDefault();
                          const f = new FormData(e.currentTarget);
                          void run(async () => {
                            await call("memoryEdit", {
                              id: m.id,
                              text: f.get("text"),
                            });
                            J("");
                          });
                        }}
                      >
                        <input
                          name="text"
                          aria-label="Memory text"
                          defaultValue={m.text}
                          required
                        />
                        <button disabled={busy}>Save</button>
                      </form>
                    ) : (
                      <>
                        <p>{m.text}</p>
                        <button onClick={() => J(m.id)}>Edit</button>
                        <button
                          disabled={busy}
                          onClick={() =>
                            run(async () => {
                              await call("memoryDelete", { id: m.id });
                            })
                          }
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </article>
                ))}
                <button
                  onClick={() => {
                    fresh();
                    D("Remember that ");
                  }}
                >
                  Add a memory
                </button>
              </>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
