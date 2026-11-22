import {parseBrowse, launchBrowser, findBrowser, type Browse} from "./browser";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import type { Message,Thread } from "./tasks";

const run=promisify(execFile);
const apps=["Calculator","Notepad","Clock","File Explorer"] as const;
export type DesktopAction=Browse|{kind:"timer",seconds:number}|{kind:"alarm",at:number}|{kind:"open",app:typeof apps[number]};
function clockTime(at:number,zone:string){
  return new Intl.DateTimeFormat("en",{timeZone:zone,hour:"numeric",minute:"2-digit",timeZoneName:"short"}).format(at);
}
function nextAlarm(hour:number,minute:number,zone:string){
  const formatter=new Intl.DateTimeFormat("en-GB",{timeZone:zone,hour:"2-digit",minute:"2-digit",hourCycle:"h23"});
  const target=[hour,minute].map(n=>String(n).padStart(2,"0")).join(":");
  const start=Math.floor(Date.now()/60000)*60000;
  for(let i=1;i<=26*60;i++){const at=start+i*60000;if(formatter.format(at)===target)return at}
}
export async function desktopReply(input:string,c:Thread,zone:string,enabled:boolean):Promise<Message|undefined>{
  const q=input.trim().replace(/[.!?]+$/,"").replace(/^please\s+/i,"");
  const say=(text:string):Message=>({role:"assistant",text});
  const pending=c.desktop;delete c.desktop;
  if(pending && /^(confirm|yes|go ahead|cancel|no)$/i.test(q)){
    if(/^(cancel|no)$/i.test(q))return say("Cancelled the desktop action.");
    if(!enabled||Date.now()>pending.expires)return say("The desktop preview expired or this desk is no longer connected.");
    const a=pending.action;
    if(a.kind==="browse"){
      try{return say(await launchBrowser(a)?"Windows accepted the launch request for "+a.browser+".":"I couldn’t locate "+a.browser+" on this computer. Try another installed browser.")}
      catch{return say("Windows could not open "+a.browser+".")}
    }
    const at=a.kind==="open"?0:a.kind==="timer"?Date.now()+a.seconds*1000:a.at;
    if(a.kind!=="open" && at<=Date.now())return say("That alarm time has passed. Choose a new time.");
    try{
      const script=path.join(process.cwd(),"scripts","desktop.ps1");
      await run("powershell.exe",["-NoProfile","-NonInteractive","-ExecutionPolicy","Bypass","-File",script,a.kind,a.kind==="open"?a.app:String(at)],{windowsHide:true,timeout:10000});
      return say(a.kind==="open"?"Windows accepted the request to open "+a.app+".":"Windows started your "+a.kind+" for "+clockTime(at,zone)+". Keep the computer awake and signed in.");
    }catch{return say("Windows could not confirm that action.")}
  }
  const timer=q.match(/^(?:set|start|create) (?:a |an )?(?:(\d+)\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?)[ -]+timer|timer (?:for )?(\d+)\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?))$/i);
  const alarm=q.match(/^(?:set|create) (?:an? )?alarm (?:at |for )?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  const open=q.match(/^(?:open|launch) (calculator|notepad|clock|file explorer)$/i);
  const browse=parseBrowse(input);
  if(!timer&&!alarm&&!open&&!browse){
    if(/^(?:set|start|create) (?:an? )?(?:alarm|timer)\b/i.test(q))return say("Try “set a timer for 10 minutes” or “set an alarm for 7:30 AM”.");
    return;
  }
  if(!enabled)return say("Desktop actions are available in a signed-in personal workspace on the local Windows launcher.");
  let action:DesktopAction,description:string;
  if(browse){
    if(typeof browse==="string")return say(browse);
    if(!findBrowser(browse.browser))return say("I couldn’t locate "+browse.browser+" on this computer. Try another installed browser.");
    action=browse;description="Open "+(browse.url?browse.url+" in ":"")+browse.browser;
  }else if(timer){
    const n=Number(timer[1]||timer[3]),unit=(timer[2]||timer[4]).toLowerCase();
    const seconds=n*(unit.startsWith("h")?3600:unit.startsWith("m")?60:1);
    if(seconds<1||seconds>86400)return say("Choose a timer from one second to 24 hours.");
    action={kind:"timer",seconds};description="Start a timer for "+n+" "+unit;
  }else if(alarm){
    let h=Number(alarm[1]);const m=Number(alarm[2]||0),period=alarm[3]?.toLowerCase();
    if(m>59||h>23||period&&(h<1||h>12))return say("Choose a valid time, such as 7:30 AM.");
    if(!period&&!alarm[2]&&h>=1&&h<=12)return say("Did you mean AM or PM? Include it in the alarm request.");
    if(period)h=h%12+(period==="pm"?12:0);
    const at=nextAlarm(h,m,zone);if(!at)return say("Please choose another alarm time.");
    action={kind:"alarm",at};description="Set an alarm for "+new Date(at).toLocaleString("en",{timeZone:zone,timeZoneName:"short"});
  }else{
    const app=apps.find(x=>x.toLowerCase()===open![1].toLowerCase())!;
    action={kind:"open",app};description="Open "+app;
  }
  delete c.pending;delete c.suggestedMemory;
  c.desktop={action,expires:Date.now()+120000};
  return say(description+" on this Windows computer? Reply Confirm or Cancel.");
}
