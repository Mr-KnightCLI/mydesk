import type { PoolClient } from "pg";
import { empty,type Thread,type Message } from "./tasks";
import { study } from "./study";

const stop=new Set("a an and are as at be by do does for from how i in is it me of on or pdf the this to what which with".split(" "));
function words(s:string){return new Set((s.toLowerCase().match(/[\p{L}\p{N}]+/gu)||[]).filter(w=>!stop.has(w)))}

export async function answerPdf(client:PoolClient,owner:string,id:string,c:Thread,question:string,sample:boolean):Promise<Message>{
  if(!/^[\da-f-]{36}$/i.test(id))throw Object.assign(Error("PDF unavailable."),{status:404});
  const row=(await client.query("SELECT title,pages FROM desk_pdfs WHERE owner=$1 AND id=$2",[owner,id])).rows[0];
  if(!row)throw Object.assign(Error("PDF unavailable."),{status:404});
  const pages:string[]=row.pages;
  const history=c.pdf?.id===id?c.messages.slice(-6):[];
  const terms=words(question),previous=words(history.slice(-2).map(m=>m.text).join(" "));
  const requested=Number(question.match(/\b(?:page|p\.)\s*(\d+)/i)?.[1]);
  c.pdf={id,title:row.title,count:pages.length};
  delete c.desktop;delete c.pending;delete c.suggestedMemory;
  if(requested>pages.length)return {role:"assistant",text:"This PDF has "+pages.length+" pages."};
  const chunks=pages.flatMap((text,i)=>{
    const result:{page:number,text:string,score:number}[]=[];
    for(let start=0;start<text.length;start+=1400){
      const excerpt=text.slice(start,start+1600),tokens=words(excerpt);
      let score=0;for(const word of terms)if(tokens.has(word))score+=4;
      for(const word of previous)if(tokens.has(word))score+=0.1;
      result.push({page:i+1,text:excerpt,score});
    }
    return result;
  }).filter(c=>!requested||c.page===requested);
  if(!chunks.length)return {role:"assistant",text:"That page has no selectable text."};
  if(!requested && /\bsummari[sz]\w*|\bsummary\b|\boverview\b|\bmain points\b|\bkey takeaways\b/i.test(question)){
    const sections: string[]=[];
    const sources=new Set<number>();
    for(let offset=0;offset<chunks.length;offset+=8){
      const batch=chunks.slice(offset,offset+8);
      const first=batch[0].page,last=batch.at(-1)!.page;
      const scope=first===last?"Page "+first:"Pages "+first+"–"+last;
      const context=batch.map(x=>"[p. "+x.page+"] "+x.text).join("\n\n");
      const pageNumbers=new Set(batch.map(x=>x.page));
      const reply=sample||!process.env.NVIDIA_API_KEY?undefined:await study(
        empty(),{...c,messages:[]},
        "Summarize this section of the PDF. Cover the key points across all supplied pages, including the last passage. Cite each page using [p. N]. User request: "+question,
        undefined,false,{id,title:row.title,text:context},
      );
      const cited=new Set(Array.from(reply?.text.matchAll(/\[p\.\s*(\d+)\]/gi)||[],m=>Number(m[1])));
      const covered=reply?.source && [...pageNumbers].every(page=>cited.has(page));
      const excerpts=[...pageNumbers].map(page=>{
        const passages=batch.filter(chunk=>chunk.page===page);
        const text=passages.map(chunk=>chunk.text.slice(0,220).trim()).join(" … ");
        return "[p. "+page+"] "+text;
      }).join("\n");
      sections.push(scope+(covered?"":" · excerpts")+"\n"+(covered?reply.text:excerpts));
      for(const page of pageNumbers)sources.add(page);
    }
    return {role:"assistant",text:"Document overview · "+row.title+"\n\n"+sections.join("\n\n"),links:[...sources].map(page=>({title:row.title+" · p. "+page,url:"/api/pdf?id="+id+"&page="+page}))};
  }
  const chosen=chunks.sort((a,b)=>b.score-a.score).slice(0,8);
  const context=chosen.map(x=>"[p. "+x.page+"] "+x.text).join("\n\n");
  const reply=sample||!process.env.NVIDIA_API_KEY?{role:"assistant",text:"Relevant text from "+row.title+"\n\n"+chosen.slice(0,2).map(x=>"[p. "+x.page+"] "+x.text.slice(0,600)).join("\n\n"),source:id}:await study(empty(),{...c,messages:history},question,undefined,false,{id,title:row.title,text:context});
  if(!reply.source)return reply;
  const allowed=new Set(chosen.map(x=>x.page));
  const cited=Array.from(reply.text.matchAll(/\[p\.\s*(\d+)\]/gi),m=>Number(m[1])).filter(p=>allowed.has(p));
  const citedPages=chosen.filter(chunk=>cited.includes(chunk.page));
  const evidence=citedPages.map(chunk=>chunk.text).join(" ");
  const numericTokens=(text:string)=>text.match(/\b\d+(?:[.,]\d+)*\b/g)||[];
  const supported=new Set(numericTokens(evidence));
  const numbers=numericTokens(reply.text.replace(/\[p\.\s*\d+\]/gi,""));
  if(!sample && (!cited.length || numbers.some(value=>!supported.has(value)))){
    const excerpts=chosen.slice(0,2);
    return {role:"assistant",text:"Here is the relevant text from "+row.title+":\n\n"+excerpts.map(x=>"[p. "+x.page+"] "+x.text.slice(0,900)).join("\n\n"),links:[...new Set(excerpts.map(x=>x.page))].map(p=>({title:row.title+" · p. "+p,url:"/api/pdf?id="+id+"&page="+p}))};
  }
  return {role:"assistant",text:reply.text,links:[...new Set(cited.length?cited:allowed)].map(p=>({title:row.title+" · p. "+p,url:"/api/pdf?id="+id+"&page="+p}))};
}
