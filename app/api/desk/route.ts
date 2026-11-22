import {liveReply} from "../../../lib/live";
import {desktopReply} from "../../../lib/desktop";
import { sampleSpace, study } from "../../../lib/study";
import { NextRequest, NextResponse } from "next/server";
import { db } from "../../../lib/db";
import { answerPdf } from "../../../lib/pdf-answer";
import { randomBytes, createHash, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { empty, taskReply, type Space, type Thread } from "../../../lib/tasks";
const hash = promisify(scrypt);
const digest = (v: string) => createHash("sha256").update(v).digest("hex");
function fail(message: string, status = 400): never {
  throw Object.assign(Error(message), { status });
}
export async function POST(req: NextRequest) {
  if (
    req.headers.get("origin") &&
    new URL(req.headers.get("origin")!).host !== req.headers.get("host")
  )
    return NextResponse.json({ error: "Origin mismatch" }, { status: 403 });
  let client;
  try {
    const body = await req.text();
    if (body.length > 100000) fail("Request too large.", 413);
    const b = JSON.parse(body),
      op = b.op,
      zone = b.zone || "UTC";
    client = await db.connect();
    await client.query("BEGIN");
    let owner: string,
      email: string,
      s: Space,
      sample = false,
      newToken = "";
    let updatedThread: Thread | undefined;
    const token = digest(req.cookies.get("desk")?.value || "");
    if (["signup", "signin", "sample"].includes(op)) {
      sample = op === "sample";
      email = sample
        ? crypto.randomUUID() + "@sample.local"
        : String(b.email || "")
            .trim()
            .toLowerCase();
      if (
        !sample &&
        (!/^\S+@\S+\.\S+$/.test(email) ||
          typeof b.password !== "string" ||
          b.password.length < 8 ||
          b.password.length > 256)
      )
        fail("Enter an email and a password of 8–256 characters.");
      if (op === "signin") {
        const row = (
          await client.query(
            "SELECT * FROM users WHERE email=$1 AND NOT sample",
            [email],
          )
        ).rows[0];
        const [salt, key] = (
          row?.password || "missing:" + "00".repeat(64)
        ).split(":");
        const actual = (await hash(b.password, salt, 64)) as Buffer;
        if (!timingSafeEqual(actual, Buffer.from(key, "hex")) || !row)
          fail("Incorrect email or password.", 401);
        owner = row.id;
        s = row.workspace;
      } else {
        owner = crypto.randomUUID();
        s = sample ? sampleSpace(zone) : empty();
        const salt = randomBytes(16).toString("hex");
        const password = sample
          ? ""
          : salt +
            ":" +
            ((await hash(b.password, salt, 64)) as Buffer).toString("hex");
        await client.query("INSERT INTO users VALUES($1,$2,$3,$4,$5)", [
          owner,
          email,
          password,
          sample,
          s,
        ]);
      }
      newToken = randomBytes(32).toString("hex");
      await client.query(
        "INSERT INTO sessions VALUES($1,$2,now()+interval '14 days')",
        [digest(newToken), owner],
      );
    } else {
      const row = (
        await client.query(
          "SELECT u.id,u.email,u.sample,u.workspace FROM users u JOIN sessions x ON x.owner=u.id WHERE x.token=$1 AND x.expires>now()" + (op==="load" ? "" : " FOR UPDATE OF u"),
          [token],
        )
      ).rows[0];
      if (!row) fail("Sign in to open your desk.", 401);
      owner = row.id;
      email = row.email;
      s = row.workspace;
      sample = row.sample;
      if (op === "signout")
        await client.query("DELETE FROM sessions WHERE token=$1", [token]);
      else if (op === "chat") {
        const input = String(b.text || "").trim();
        if (!input || input.length > 8000)
          fail("Enter up to 8,000 characters.");
        let c: Thread | undefined = s.threads.find((t) => t.id === b.thread);
        if (!c) {
          if (b.thread) fail("Conversation unavailable.", 404);
          c = {
            id: crypto.randomUUID(),
            title: input.slice(0, 55),
            messages: [],
          };
          s.threads.unshift(c);
        }
        updatedThread=c;
        const pdfId=b.pdf===undefined?c.pdf?.id:b.pdf;
        if(pdfId && !b.note){
          const reply=await answerPdf(client,owner,pdfId,c,input,sample);
          c.messages.push({role:"user",text:input},reply);
        }else{
        delete c.pdf;
        const local = !sample && process.platform==="win32" && process.env.MYDESK_LOCAL_DESKTOP==="1" && !process.env.VERCEL && ["127.0.0.1:3220","localhost:3220"].includes(req.headers.get("host")||"");
        const desktop = b.note ? undefined : await desktopReply(input,c,zone,local);
        const result = b.note || desktop ? undefined : taskReply(s, c, input, zone);
        const answer = desktop ?? (result
          ? { role: "assistant", text: result }
          : (b.note ? undefined : await liveReply(input,c,zone,sample)) ?? await study(s, c, input, b.note, sample));
        c.messages.push({ role: "user", text: input }, answer);
        }
      } else if (op === "note") {
        const title = String(b.title || "").trim(),
          text = String(b.text || "").trim();
        if (!title || !text || title.length > 200 || text.length > 40000)
          fail("Enter a title and up to 40,000 characters of notes.");
        s.notes.unshift({ id: crypto.randomUUID(), title, text });
      } else if (op === "memoryEdit" || op === "memoryDelete") {
        const item = s.memories.find((m) => m.id === b.id);
        if (!item) fail("Memory unavailable.", 404);
        if (op === "memoryDelete")
          s.memories = s.memories.filter((m) => m.id !== item.id);
        else {
          const text = String(b.text || "").trim();
          if (!text || text.length > 8000)
            fail("Enter a memory of up to 8,000 characters.");
          item.text = text;
        }
      } else if (op === "toggle") {
        const task = s.tasks.find((t) => t.id === b.id);
        if (!task) fail("Task unavailable.", 404);
        if (typeof b.done !== "boolean") fail("Invalid status.");
        task.done = b.done;
      } else if (op !== "load") fail("Unknown action.");
    }
    if (["chat","note","memoryEdit","memoryDelete","toggle"].includes(op))
      await client.query("UPDATE users SET workspace=$1 WHERE id=$2", [
        s,
        owner,
      ]);
    await client.query("COMMIT");
    const res = NextResponse.json(
      op === "signout"
        ? {}
        : updatedThread && b.compact === true
          ? { thread: updatedThread, tasks: s.tasks, memories: s.memories }
          : { space: s, email: sample ? "Sample workspace" : email, sample },
    );
    if (newToken || op === "signout")
      res.cookies.set("desk", newToken, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.VERCEL === "1" || req.nextUrl.protocol === "https:",
        path: "/",
        maxAge: newToken ? 1209600 : 0,
      });
    return res;
  } catch (e: any) {
    await client?.query("ROLLBACK").catch(() => {});
    return NextResponse.json(
      {
        error: e.status
          ? e.message
          : e.code === "23505"
            ? "Account unavailable. Try signing in."
            : "The request failed. Please retry.",
      },
      { status: e.status || (e.code === "23505" ? 409 : 500) },
    );
  } finally {
    client?.release();
  }
}
