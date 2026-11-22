# MyDesk

A laptop-friendly personal study desk built with Next.js App Router, TypeScript, PostgreSQL and optional server-side NVIDIA. Open the app and sign in or create an account to chat with your personal assistant. Choose Try offline sample only when you want the key-free workspace.

## Local setup

Use Node.js 24, npm and PostgreSQL 16 or newer. From this directory run:

```sh
npm ci
docker run -d --name mydesk-db -p 127.0.0.1:55433:5432 -e POSTGRES_USER=mydesk -e POSTGRES_PASSWORD=mydesk -v mydesk-db:/var/lib/postgresql/data postgres:16.8
```

Copy `.env.example` to `.env.local`. Set DATABASE_URL to `postgresql://mydesk:mydesk@localhost:55433/mydesk` for the Docker command above, or use your existing PostgreSQL database. The local password is for loopback development only.

```sh
npm run migrate
npm run dev -- --port 3218
```

Open http://localhost:3218. For a production check, run `npm run build` and `npm start -- --port 3218` after stopping the development server. Run `npm test` in a second terminal with the server running. Set TEST_URL to change the test target. Use a disposable database for tests, which create isolated accounts.

## Work with your desk

- Say “Add a task to revise linked lists tomorrow”, open Tasks, then ask “What should I study tomorrow?” The browser supplies an IANA timezone. Plans include open tasks due by the selected day and undated work, ordered by deadline and priority.
- Try “Set revise linked lists to high priority”, “Move revise linked lists to 2027-01-25”, “Complete revise linked lists”, or “List my tasks”. Use exact task titles for updates. Use Confirm or Cancel in the same conversation after a deletion or bulk preview.
- Say “Remember that I’m studying data structures.” Edit or remove the fact under Memory. Ordinary chat is retained as conversation history. Explicit memory requests alone create reusable facts.
- Add a note, select it and choose a study question, or attach it in the composer. Each note-based answer links back to the selected note. Sample mode provides extracts and practice prompts without network inference.
- To use NVIDIA in a personal account, set NVIDIA_API_KEY and NVIDIA_MODEL in the server environment and restart. Use a key from a free-tier project with billing disabled if you require a hard cost boundary. Sample sessions never call NVIDIA. Requests may send your question, recent conversation, memories and selected note to NVIDIA. Workspace writes are implemented on the server and model output is display-only.

## Vercel deployment

1. Push the source and lockfile to a private Git repository. Exclude .env.local, node_modules and .next.
2. Supply a PostgreSQL database accessible from Vercel. An existing free-tier database with a TLS-enabled pooled connection works. Choose a no-charge plan and leave paid upgrades disabled.
3. Import the repository into Vercel, select the MyDesk project directory and the Next.js preset. Configure DATABASE_URL, NVIDIA_MODEL and optionally NVIDIA_API_KEY in the project’s server environment. Keep production credentials separate from preview deployments.
4. Run `npm run migrate` with the intended deployment database URL from a trusted terminal before deploying. The initial migration can be rerun.
5. Deploy, open the HTTPS URL and repeat the sign-in and task flow. No external services are provisioned by this project.

[Next.js on Vercel](https://vercel.com/docs/frameworks/full-stack/nextjs) · [NVIDIA chat completions](https://docs.api.nvidia.com/nim/reference/llm-apis)

## Storage and access

Password hashes use salted scrypt. The browser holds an HttpOnly session cookie. PostgreSQL stores a digest of each session token and checks expiration. Each workspace is an owner-scoped JSONB record. Authenticated operations lock that user's record and commit before returning an action receipt. Object IDs are resolved within that workspace. Session revocation takes effect on sign-out. Notes and model responses have no execution path into the task or memory tools.


## Live data and local Windows actions

In a signed-in chat, try “Weather in Mumbai”, “News about technology”, “Stock price of Reliance Industries”, or “India cricket score”. MyDesk fetches Open-Meteo forecasts, Google News RSS headlines, Yahoo Finance market quotes and ESPNcricinfo scorecards when you ask. Links and source times accompany results. Quotes can be delayed. Queries go to the corresponding provider. These personal-use lookups require no additional key.

On Windows run `npm run build` then `npm run start:local` and open http://127.0.0.1:3220. Use “Set a timer for 5 minutes”, “Set an alarm for 7:30 AM”, or “Open Notepad”. Confirm the preview in the same chat within two minutes. Supported apps are Calculator, Clock, Notepad and File Explorer. Alarms use a local Windows process, sound and popup. They survive closing the browser while the computer stays awake and signed in, and end on logout or reboot. The launcher binds only to loopback. Keep this local service off public proxies and tunnels. The ordinary deployment and sample mode disable Windows actions.

The local Windows launcher also opens websites and searches in Brave, Chrome, Edge, Firefox, or the Windows default browser. Try “search for sorting algorithms on Chrome”, “open Wikipedia in Brave”, or “open Edge”. Confirm the displayed browser and destination to launch it. Named browsers must already be installed. MyDesk receives a Windows launch receipt, not page contents.

### Ask questions about PDFs

Choose **PDF** in chat or drop a file onto the composer. Ask a question, then continue in the same conversation. Open the page links to inspect the extracted text. Choose the × beside the filename to return to general chat. Uploads support unlocked text PDFs up to 4 MB and 150 pages. Scans need OCR before upload. PostgreSQL stores extracted pages per user and reuses the extraction for identical files. Live Q&A sends selected passages to NVIDIA. Offline mode provides extracts. Run npm run migrate to apply the PDF table migration.
