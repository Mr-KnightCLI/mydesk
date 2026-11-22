import type {DesktopAction} from "./desktop";
export type Task = {
  id: string;
  title: string;
  due: string;
  priority: string;
  done: boolean;
};
export type Change = { id: string; patch: Partial<Task> | null };
export type Message = { role: string; text: string; source?: string; links?: {title:string,url:string}[] };
export type PdfRef={id:string,title:string,count:number};
export type Thread = {
  pdf?:PdfRef;
  id: string;
  title: string;
  messages: Message[];
  pending?: Change[];
  suggestedMemory?: string;
  desktop?: {action:DesktopAction,expires:number};
  awaitingFeed?: "weather"|"stocks";
};
export type Space = {
  tasks: Task[];
  threads: Thread[];
  memories: { id: string; text: string }[];
  notes: { id: string; title: string; text: string }[];
};
export function empty(): Space {
  return { tasks: [], threads: [], memories: [], notes: [] };
}
export function day(zone: string, offset = 0) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts();
  const get = (key: string) => Number(parts.find((p) => p.type === key)?.value);
  return new Date(Date.UTC(get("year"), get("month") - 1, get("day") + offset))
    .toISOString()
    .slice(0, 10);
}
function dateIn(text: string, zone: string) {
  if (/\btomorrow\b/i.test(text)) return day(zone, 1);
  if (/\btoday\b/i.test(text)) return day(zone);
  return text.match(/\b\d{4}-\d\d-\d\d\b/)?.[0] || "";
}
export function taskReply(
  s: Space,
  c: Thread,
  input: string,
  zone: string,
): string | undefined {
  const q = input.trim().replace(/[.!?]+$/, "");
  if (c.pending && /^(confirm|cancel)$/i.test(q)) {
    const changes = c.pending;
    delete c.pending;
    if (/^cancel$/i.test(q)) return "Cancelled.";
    for (const change of changes) {
      const task = s.tasks.find((t) => t.id === change.id);
      if (!task) throw Error("Preview expired. Request a new preview.");
      if (change.patch) Object.assign(task, change.patch);
      else s.tasks = s.tasks.filter((t) => t.id !== task.id);
    }
    return "Applied the confirmed changes.";
  }
  delete c.pending;
  const mentionsTask = /\btasks?\b/i.test(q) || s.tasks.some(task => q.toLowerCase().includes(task.title.toLowerCase()));
  const due = dateIn(q, zone),
    priority = q.match(/\b(high|medium|low) priority/i)?.[1].toLowerCase();
  if (
    mentionsTask && /^(add|create|update|move|reschedule|set|change)/i.test(q) &&
    (/\b(next|later|weekend|monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december)\b|\d+\/\d+|\b(?:by|due|on)\s+(?!today\b|tomorrow\b|\d{4}-\d\d-\d\d)/i.test(
      q,
    ) ||
      (due &&
        (!Number.isFinite(Date.parse(due)) ||
          new Date(due).toISOString().slice(0, 10) !== due)))
  )
    return "Which date did you mean? Repeat the task request with a YYYY-MM-DD date.";
  if (/^(add|create) (?:a |an )?task\b/i.test(q)) {
    const title = q
      .replace(/^(add|create) (?:a |an )?task\s*(?:to\s+)?/i, "")
      .replace(/\s*(?:due |by |on )?(?:tomorrow|today|\d{4}-\d\d-\d\d)\b/gi, "")
      .replace(/\s*(?:with |at )?(high|medium|low) priority/gi, "")
      .trim();
    if (!title) return "What should the task be called?";
    s.tasks.push({
      id: crypto.randomUUID(),
      title,
      due,
      priority: priority || "medium",
      done: false,
    });
    return "Added “" + title + "”" + (due ? " for " + due : "") + ".";
  }
  if (
    mentionsTask && /^(complete|finish|mark|delete|remove|update|set|move|reschedule|change)\b/i.test(
      q,
    )
  ) {
    const bulk = /\b(all|every)\b/i.test(q);
    if (
      bulk &&
      !/^(?:delete|remove|complete|finish) all (?:my )?tasks$|^(?:set|change|move|reschedule|update) all (?:my )?tasks (?:to |due |by |on )?(?:today|tomorrow|\d{4}-\d\d-\d\d|(?:high|medium|low) priority)$/i.test(
        q,
      )
    )
      return "For a bulk change, specify all tasks or request one exact task title at a time.";
    const matches = s.tasks.filter(
      (t) => bulk || q.toLowerCase().includes(t.title.toLowerCase()),
    );
    if (!matches.length || (!bulk && matches.length !== 1))
      return "Use the exact task title, or specify all tasks.";
    if (/^mark/i.test(q) && !/(?:done|complete|completed)$/i.test(q))
      return "To complete a task, say “Complete” followed by its title.";
    const del = /^(delete|remove)/i.test(q),
      done = /^(complete|finish|mark)/i.test(q);
    if (!del && !done && !due && !priority)
      return "Include a new due date or a high, medium, or low priority.";
    const patch = del
      ? null
      : done
        ? { done: true }
        : { ...(due ? { due } : {}), ...(priority ? { priority } : {}) };
    if (del || bulk) {
      c.pending = matches.map((t) => ({ id: t.id, patch }));
      return (
        "Preview • " +
        (del
          ? "Delete"
          : done
            ? "Complete"
            : "Update " + [due, priority].filter(Boolean).join(", ")) +
        "\n" +
        matches.map((t) => "• " + t.title).join("\n") +
        "\nReply Confirm or Cancel."
      );
    }
    Object.assign(matches[0], patch);
    return "Updated “" + matches[0].title + "”.";
  }
  if (/^(?:what should i (?:do|study)(?: today| tomorrow)?|plan my day(?: today| tomorrow)?|daily plan|(?:list|show)(?: me)? (?:all )?(?:my )?tasks)$/i.test(q)) {
    const list = /list|show/i.test(q),
      target = due || day(zone),
      rank: Record<string, number> = { high: 0, medium: 1, low: 2 };
    const tasks = s.tasks
      .filter((t) => list || (!t.done && (!t.due || t.due <= target)))
      .sort(
        (a, b) =>
          (a.due || "9999").localeCompare(b.due || "9999") ||
          rank[a.priority] - rank[b.priority],
      );
    if (!tasks.length)
      return list
        ? "Your task list is empty."
        : "No open tasks are scheduled through " + target + ".";
    return (
      (list ? "Your tasks" : "Your plan for " + target) +
      "\n" +
      (list ? tasks : tasks.slice(0, 3))
        .map(
          (t, i) =>
            i +
            1 +
            ". " +
            t.title +
            " · " +
            t.priority +
            (t.due ? " · " + t.due : "") +
            (t.done ? " · complete" : ""),
        )
        .join("\n") +
      (list
        ? ""
        : "\nStart with " +
          tasks[0].title +
          ". Earlier deadlines come first, then higher priority.")
    );
  }
}
