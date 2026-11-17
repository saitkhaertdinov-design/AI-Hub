import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 3000);
const mime = {".html":"text/html; charset=utf-8",".css":"text/css; charset=utf-8",".js":"text/javascript; charset=utf-8",".json":"application/json; charset=utf-8",".webmanifest":"application/manifest+json",".svg":"image/svg+xml"};

async function providerReply(provider, message) {
  if (provider === "openai") {
    if (!process.env.OPENAI_API_KEY) throw new Error("На сервере не задан OPENAI_API_KEY");
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method:"POST", headers:{"Authorization":`Bearer ${process.env.OPENAI_API_KEY}`,"Content-Type":"application/json"},
      body:JSON.stringify({model:process.env.OPENAI_MODEL || "gpt-4.1-mini",messages:[{role:"user",content:message}]})
    });
    const d=await r.json(); if(!r.ok) throw new Error(d.error?.message || "Ошибка OpenAI API");
    return d.choices?.[0]?.message?.content || "Пустой ответ OpenAI";
  }
  if (provider === "anthropic") {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error("На сервере не задан ANTHROPIC_API_KEY");
    const r=await fetch("https://api.anthropic.com/v1/messages",{
      method:"POST",headers:{"x-api-key":process.env.ANTHROPIC_API_KEY,"anthropic-version":"2023-06-01","content-type":"application/json"},
      body:JSON.stringify({model:process.env.ANTHROPIC_MODEL || "claude-3-5-haiku-latest",max_tokens:1200,messages:[{role:"user",content:message}]})
    });
    const d=await r.json();if(!r.ok) throw new Error(d.error?.message || "Ошибка Anthropic API");
    return (d.content||[]).filter(x=>x.type==="text").map(x=>x.text).join("\n") || "Пустой ответ Claude";
  }
  if (provider === "google") {
    if (!process.env.GEMINI_API_KEY) throw new Error("На сервере не задан GEMINI_API_KEY");
    const model=process.env.GEMINI_MODEL || "gemini-2.0-flash";
    const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`,{
      method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({contents:[{parts:[{text:message}]}]})
    });
    const d=await r.json();if(!r.ok) throw new Error(d.error?.message || "Ошибка Gemini API");
    return d.candidates?.[0]?.content?.parts?.map(x=>x.text||"").join("") || "Пустой ответ Gemini";
  }
  throw new Error("Провайдер не поддерживается или не настроен");
}

const server=http.createServer(async(req,res)=>{
  res.setHeader("X-Content-Type-Options","nosniff");
  if(req.method==="POST" && req.url==="/api/chat"){
    let raw="";
    req.on("data",chunk=>{raw+=chunk;if(raw.length>100_000){res.writeHead(413);res.end(JSON.stringify({error:"Запрос слишком большой"}));req.destroy();}});
    req.on("end",async()=>{
      try{
        const body=JSON.parse(raw||"{}");
        const provider=String(body.provider||"");
        const message=String(body.message||"").trim();
        if(!message){res.writeHead(400,{"Content-Type":"application/json"});return res.end(JSON.stringify({error:"Пустое сообщение"}));}
        if(message.length>20000){res.writeHead(413,{"Content-Type":"application/json"});return res.end(JSON.stringify({error:"Сообщение слишком длинное"}));}
        const reply=await providerReply(provider,message);
        res.writeHead(200,{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"});
        res.end(JSON.stringify({reply}));
      }catch(e){res.writeHead(400,{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"});res.end(JSON.stringify({error:e.message||"Ошибка сервера"}));}
    });
    return;
  }
  if(req.method!=="GET" && req.method!=="HEAD"){res.writeHead(405);return res.end();}
  let pathname=decodeURIComponent((req.url||"/").split("?")[0]);
  if(pathname==="/")pathname="/index.html";
  const resolved=path.resolve(root,"."+pathname);
  if(!resolved.startsWith(root+path.sep)){res.writeHead(403);return res.end("Forbidden");}
  try{
    const data=await readFile(resolved);
    res.writeHead(200,{"Content-Type":mime[path.extname(resolved)]||"application/octet-stream","Cache-Control":"no-cache"});
    res.end(req.method==="HEAD"?undefined:data);
  }catch{res.writeHead(404);res.end("Not found");}
});
server.listen(port,"0.0.0.0",()=>console.log(`AI Hub запущен: http://localhost:${port}`));
