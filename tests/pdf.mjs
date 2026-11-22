import test from "node:test";
import assert from "node:assert/strict";
const base=process.env.TEST_URL||"http://127.0.0.1:3218";

function fixture(){
  const objects=[
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 400] /Resources << /Font << /F1 7 0 R >> >> /Contents 4 0 R >>",
    "Ground stations monitor the satellite.",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 400] /Resources << /Font << /F1 7 0 R >> >> /Contents 6 0 R >>",
    "The satellite carries exactly 37 silver sensors.",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
  ];
  let pdf="%PDF-1.4\n";const offsets=[0];
  for(const [i,value] of objects.entries()){
    const stream="BT /F1 12 Tf 20 350 Td ("+value+") Tj ET";
    offsets.push(pdf.length);
    pdf+=(i+1)+" 0 obj\n"+([3,5].includes(i)?"<< /Length "+stream.length+" >>\nstream\n"+stream+"\nendstream":value)+"\nendobj\n";
  }
  const start=pdf.length;pdf+="xref\n0 8\n0000000000 65535 f \n"+offsets.slice(1).map(n=>String(n).padStart(10,"0")+" 00000 n \n").join("")+"trailer\n<< /Root 1 0 R /Size 8 >>\nstartxref\n"+start+"\n%%EOF";
  return Buffer.from(pdf);
}
test("PDF uploads, follow-ups, page sources, reuse and private access",async()=>{
  const chat=(cookie,body)=>fetch(base+"/api/desk",{method:"POST",headers:{cookie,"content-type":"application/json"},body:JSON.stringify(body)});
  const login=async()=>{const r=await chat("",process.env.PDF_LIVE?{op:"signup",email:crypto.randomUUID()+"@example.test",password:crypto.randomUUID()}:{op:"sample"});assert.equal(r.status,200);return r.headers.get("set-cookie").split(";")[0]};
  const a=await login(),b=await login();
  const upload=(cookie,body)=>fetch(base+"/api/pdf?name=Satellite.pdf",{method:"POST",headers:{cookie,"content-type":"application/pdf"},body});
  assert.equal((await upload("",fixture())).status,401);
  assert.equal((await upload(a,"broken")).status,422);
  const res=await upload(a,fixture()),doc=await res.json();assert.equal(res.status,200,JSON.stringify(doc));assert.equal(doc.count,2);
  assert.equal((await (await upload(a,fixture())).json()).id,doc.id);
  const run=async(data)=>{const r=await chat(a,{op:"chat",...data});assert.equal(r.status,200);return (await r.json()).space.threads[0]};
  let c=await run({pdf:doc.id,text:"How many sensors are on page 2?"});
  const answer=c.messages.at(-1);assert.match(answer.text,/37/);assert.ok(answer.links.some(l=>l.url.endsWith("page=2")));
  c=await run({thread:c.id,text:"What color are those sensors?"});assert.match(c.messages.at(-1).text,/silver/i);
  c=await run({thread:c.id,text:"Summarize the whole PDF"});
  const overview=c.messages.at(-1);
  assert.match(overview.text,/ground stations/i);
  assert.match(overview.text,/silver sensors/i);
  assert.deepEqual(overview.links.map(l=>new URL(base+l.url).searchParams.get("page")),["1","2"]);
  const url=base+answer.links[0].url;
  assert.match(await (await fetch(url,{headers:{cookie:a}})).text(),/37 silver/);
  assert.equal((await fetch(url,{headers:{cookie:b}})).status,404);
  assert.equal((await chat(b,{op:"chat",pdf:doc.id,text:"What is inside?"})).status,404);
});
