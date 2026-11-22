import {spawn} from "node:child_process";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url);
const child=spawn(process.execPath,[require.resolve("next/dist/bin/next"),"start","--hostname","127.0.0.1","--port","3220"],{
  stdio:"inherit",env:{...process.env,MYDESK_LOCAL_DESKTOP:"1"}
});
child.on("exit",code=>process.exit(code??1));
