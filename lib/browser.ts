import { existsSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const browsers = {
  Brave: "BraveSoftware/Brave-Browser/Application/brave.exe",
  Chrome: "Google/Chrome/Application/chrome.exe",
  Edge: "Microsoft/Edge/Application/msedge.exe",
  Firefox: "Mozilla Firefox/firefox.exe",
} as const;
type Browser = keyof typeof browsers | "default browser";
export type Browse = {kind:"browse"; browser:Browser; url:string};
const sites: Record<string,string> = {
  wikipedia:"https://www.wikipedia.org/", youtube:"https://www.youtube.com/",
  google:"https://www.google.com/", github:"https://github.com/",
};
const browserName = "(?:(?:google|microsoft|mozilla) )?(brave|chrome|edge|firefox|default browser|browser)";
export function parseBrowse(text:string): Browse | string | undefined {
  let q=text.trim().replace(/^(?:(?:can|could|would) you\s+)?(?:please\s+)?/i,"").replace(/[?!.]+$/,"");
  // Normalize ordinary launch requests before selecting the desktop tool.
  q=q.replace(/^(?:start|launch|open)\s+(?:(?:up|my|the|a)\s+)*(?:(?:default\s+)?web\s+)?(?=(?:brave|google chrome|chrome|microsoft edge|edge|firefox|default browser|browser)\b)/i,"open ");
  const search=/^(?:search(?: the web)?(?: for)?|look up|browse(?: for)?|google)\s+/i;
  const open=/^(?:open|launch|visit|go to)\s+/i;
  if(!search.test(q)&&!open.test(q)&&!/^use /i.test(q))return;
  let browser:Browser="default browser";
  const prefix=q.match(new RegExp("^(?:use|open|launch) "+browserName+"(?: browser)?(?: (?:and|to) (.+))?$","i"));
  const suffix=q.match(new RegExp(" (?:in|on|using|with) (?:my |the )?"+browserName+"(?: browser)?$","i"));
  const requested=prefix?.[1]||suffix?.[1];
  if(requested)browser=Object.keys(browsers).find(b=>b.toLowerCase()===requested.toLowerCase()) as Browser || "default browser";
  if(prefix&&!prefix[2])return {kind:"browse",browser,url:""};
  if(prefix)q=prefix[2];
  if(suffix)q=q.slice(0,suffix.index);
  const searching=search.test(q), visiting=open.test(q);
  if(!searching&&!visiting)return;
  const target=q.replace(searching?search:open,"").trim();
  if(!target||target.length>1500)return "Give me a shorter search or a website address.";
  const known=Object.hasOwn(sites,target.toLowerCase())?sites[target.toLowerCase()]:undefined;
  const looksLikeUrl=/^https?:\/\//i.test(target)||/^(?:[a-z0-9-]+\.)+[a-z]{2,}(?:[/?#]|$)/i.test(target);
  if(!searching&&!requested&&!known&&!looksLikeUrl)return;
  if(!searching&&(known||looksLikeUrl)){
    try{
      const url=new URL(known||(target.includes("://")?target:"https://"+target));
      if(!["http:","https:"].includes(url.protocol)||url.username||url.password)throw Error();
      return {kind:"browse",browser,url:url.href};
    }catch{return "Give me a valid website address without embedded credentials."}
  }
  if(!searching)return "Give me the website address, or say “search for” followed by a topic.";
  return {kind:"browse",browser,url:(browser==="Brave"?"https://search.brave.com/search?q=":"https://www.google.com/search?q=")+encodeURIComponent(target)};
}
export function findBrowser(browser:Browser){
  if(browser==="default browser")return path.join(process.env.SystemRoot||"C:/Windows","explorer.exe");
  return [process.env.ProgramFiles,process.env["ProgramFiles(x86)"],process.env.LOCALAPPDATA,process.env.LOCALAPPDATA&&path.join(process.env.LOCALAPPDATA,"Programs")].filter(Boolean).map(root=>path.join(root!,browsers[browser])).find(existsSync);
}
export async function launchBrowser(action:Browse){
  const exe=findBrowser(action.browser);
  if(!exe)return false;
  const link=action.url||(action.browser==="default browser"?"https://www.google.com/":"");
  if(link&&!/^https?:\/\//i.test(link))throw Error("Invalid destination");
  await new Promise<void>((resolve,reject)=>{
    const args=action.browser==="default browser"?[link]:action.browser==="Firefox"?["-new-window",link||"about:blank"]:["--new-window",link||"about:blank"];
    const child=spawn(exe,args,{detached:true,stdio:"ignore",shell:false});
    child.once("error",reject);child.once("spawn",()=>{child.unref();resolve()});
  });
  return true;
}
