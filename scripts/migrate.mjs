import pg from "pg";
import { readFile, readdir } from "node:fs/promises";
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
try {
  const dir=new URL("../migrations/",import.meta.url);
  for(const file of (await readdir(dir)).filter(name=>name.endsWith(".sql")).sort()){
    await db.query(await readFile(new URL(file,dir),"utf8"));
  }
} finally {
  await db.end();
}
