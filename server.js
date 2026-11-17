import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root=path.dirname(fileURLToPath(import.meta.url));
const port=Number(process.env.PORT||3000);
const mime={".html":"text/html; charset=utf-8",".css":"text/css; charset=utf-8",".js":"text/javascript; charset=utf-8",".json":"application/json; charset=utf-8",".webmanifest":"application/manifest+json",".svg":"image/svg+xml"};
const rate=new Map();
function limited(ip){
  const now=Date.now(),entry=rate.get(ip);
  if(!entry||now-entry.start>60_000){rate.set(ip,{start:now,count:1});return false;}
  entry.count++;return entry.count>20;
}
async function providerReply(provider,message){
  if(provider==="openai"){
    if(!process.env.OPENAI_API_KEY)throw new Error("Добавь OPENAI_API_KEY в Render → Environment");
    const r=await fetch("https://api.openai.com/v1/chat/completions",{method:"POST",headers:{"Authorization":`Bearer ${process.env.OPENAI_API_KEY}`,"Content-Type":"application/json"},body:JSON.stringify({model:process.env.OPENAI_MODEL||"gpt-5.5",messages:[{role:"user",content:message}]})});
    const d=await r.json();if(!r.ok)throw new Error(d.error?.message||"Ошибка OpenAI API");
    return d.choices?.[0]?.message?.content||"Пустой ответ OpenAI";
  }
  if(provider==="anthropic"){
    if(!process.env.ANTHROPIC_API_KEY)throw new Error("Добавь ANTHROPIC_API_KEY в Render → Environment");
    const r=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"x-api-key":process.env.ANTHROPIC_API_KEY,"anthropic-version":"2023-06-01","content-type":"application/json"},body:JSON.stringify({model:process.env.ANTHROPIC_MODEL||"claude-haiku-5-5",max_tokens:1600,messages:[{role:"user",content:message}]})});
    const d=await r.json();if(!r.ok)throw new Error(d.error?.message||"Ошибка Anthropic API");
    return(d.content||[]).filter(x=>x.type==="text").map(x=>x.text).join("\n")||"Пустой ответ Claude";
  }
  if(provider==="google"){
    if(!process.env.GEMINI_API_KEY)throw new Error("Добавь GEMINI_API_KEY в Render → Environment");
    const model=process.env.GEMINI_MODEL||"gemini-3.8-flash";
    const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,{method:"POST",headers:{"Content-Type":"application/json","x-goog-api-key":process.env.GEMINI_API_KEY},body:JSON.stringify({contents:[{parts:[{text:message}]}]})});
    const d=await r.json();if(!r.ok)throw new Error(d.error?.message||"Ошибка Gemini API");
    return d.candidates?.[0]?.content?.parts?.map(x=>x.text||"").join("")||"Пустой ответ Gemini";
  }
  throw new Error("Выбери OpenAI, Claude или Gemini");
}
const server=http.createServer(async(req,res)=>{
  res.setHeader("X-Content-Type-Options","nosniff");
  res.setHeader("Referrer-Policy","strict-origin-when-cross-origin");
  if(req.method==="POST"&&req.url==="/api/chat"){
    const ip=req.headers["x-forwarded-for"]?.split(",")[0]?.trim()||req.socket.remoteAddress||"unknown";
    if(limited(ip)){res.writeHead(429,{"Content-Type":"application/json"});return res.end(JSON.stringify({error:"Слишком много запросов. Подожди минуту и попробуй снова."}));}
    let raw="";
    req.on("data",chunk=>{raw+=chunk;if(raw.length>100_000){res.writeHead(413,{"Content-Type":"application/json"});res.end(JSON.stringify({error:"Запрос слишком большой"}));req.destroy();}});
    req.on("end",async()=>{
      try{
        const body=JSON.parse(raw||"{}"),provider=String(body.provider||""),message=String(body.message||"").trim();
        if(!message){res.writeHead(400,{"Content-Type":"application/json"});return res.end(JSON.stringify({error:"Пустое сообщение"}));}
        if(message.length>20000){res.writeHead(413,{"Content-Type":"application/json"});return res.end(JSON.stringify({error:"Сообщение слишком длинное"}));}
        const reply=await providerReply(provider,message);
        res.writeHead(200,{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"});res.end(JSON.stringify({reply}));
      }catch(e){res.writeHead(400,{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"});res.end(JSON.stringify({error:e.message||"Ошибка сервера"}));}
    });return;
  }
  if(req.method!=="GET"&&req.method!=="HEAD"){res.writeHead(405);return res.end();}
  let pathname;try{pathname=decodeURIComponent((req.url||"/").split("?")[0]);}catch{res.writeHead(400);return res.end("Bad request");}
  if(pathname==="/")pathname="/index.html";
  const resolved=path.resolve(root,"."+pathname);
  if(!resolved.startsWith(root+path.sep)){res.writeHead(403);return res.end("Forbidden");}
  try{const data=await readFile(resolved);res.writeHead(200,{"Content-Type":mime[path.extname(resolved)]||"application/octet-stream","Cache-Control":"no-cache"});res.end(req.method==="HEAD"?undefined:data);}
  catch{res.writeHead(404);res.end("Not found");}
});
server.listen(port,"0.0.0.0",()=>console.log(`AI Hub запущен на порту ${port}`));
