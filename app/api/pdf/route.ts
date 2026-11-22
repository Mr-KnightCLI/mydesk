import { NextRequest, NextResponse } from "next/server";
import { createHash, randomUUID } from "node:crypto";
import { db } from "../../../lib/db";

const limit=4*1024*1024;
async function owner(req:NextRequest){
  const token=createHash("sha256").update(req.cookies.get("desk")?.value||"").digest("hex");
  return (await db.query("SELECT owner FROM sessions WHERE token=$1 AND expires>now()", [token])).rows[0]?.owner;
}
function error(message:string,status:number){return NextResponse.json({error:message},{status})}
export async function POST(req:NextRequest){
  if(req.headers.get("origin") && new URL(req.headers.get("origin")!).host!==req.headers.get("host"))return error("Origin mismatch.",403);
  const user=await owner(req);
  if(!user)return error("Sign in to upload a PDF.",401);
  if(req.headers.get("content-type")!=="application/pdf")return error("Choose a PDF file.",415);
  if(Number(req.headers.get("content-length"))>limit)return error("Choose a PDF under 4 MB.",413);
  const reader=req.body?.getReader();
  if(!reader)return error("Choose a PDF file.",400);
  const chunks:Uint8Array[]=[];let size=0;
  for(;;){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.length;if(size>limit){await reader.cancel();return error("Choose a PDF under 4 MB.",413)}chunks.push(chunk.value)}
  const bytes=Buffer.concat(chunks);
  if(!bytes.subarray(0,1024).includes(Buffer.from("%PDF-")))return error("This file is not a PDF.",422);
  const hash=createHash("sha256").update(bytes).digest("hex");
  const metadata="id,title,jsonb_array_length(pages) AS count";
  const existing=await db.query("SELECT "+metadata+" FROM desk_pdfs WHERE owner=$1 AND digest=$2",[user,hash]);
  if(existing.rowCount)return NextResponse.json(existing.rows[0]);
  const {PDFParse}=await import("pdf-parse");
  const {getData}=await import("pdf-parse/worker");
  PDFParse.setWorker(getData());
  const parser=new PDFParse({data:new Uint8Array(bytes),isEvalSupported:false});
  let pages:string[];
  try{
    if((await parser.getInfo()).total>150)return error("Choose a PDF with up to 150 pages.",422);
    pages=(await parser.getText({pageJoiner:""})).pages.map(p=>p.text.replace(/\u0000/g,"").trim());
    if(!pages.some(Boolean))return error("This PDF has no selectable text. Upload a text or OCR version.",422);
    if(pages.join("").length>600000)return error("This PDF contains too much text. Split it into sections.",422);
  }catch{return error("This PDF could not be read. Check that it opens and is unlocked.",422)}
  finally{await parser.destroy()}
  const title=(req.nextUrl.searchParams.get("name")||"Document.pdf").slice(0,160);
  const row=await db.query("INSERT INTO desk_pdfs(id,owner,digest,title,pages) VALUES($1,$2,$3,$4,$5) ON CONFLICT(owner,digest) DO UPDATE SET digest=excluded.digest RETURNING "+metadata,[randomUUID(),user,hash,title,JSON.stringify(pages)]);
  return NextResponse.json(row.rows[0]);
}
export async function GET(req:NextRequest){
  const user=await owner(req),id=req.nextUrl.searchParams.get("id")||"",page=Number(req.nextUrl.searchParams.get("page"));
  if(!user)return error("Sign in to view this page.",401);
  if(!/^[a-f0-9-]{36}$/i.test(id)||!Number.isInteger(page)||page<1||page>150)return error("Invalid page.",400);
  const row=(await db.query("SELECT title,pages ->> $3::int AS text FROM desk_pdfs WHERE owner=$1 AND id=$2",[user,id,page-1])).rows[0];
  if(!row||row.text==null)return error("Page unavailable.",404);
  return new Response(row.title+" · Page "+page+"\n\n"+row.text,{headers:{"Content-Type":"text/plain; charset=utf-8","Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
}
