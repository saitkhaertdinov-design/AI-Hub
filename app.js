const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
let selectedFiles = [];
let libraryFiles = [];
let projects = [];
const views = {chat:"Чат",files:"Мои файлы",projects:"Проекты",agents:"Агенты",settings:"Настройки API"};

function showView(name){
  $$(".view").forEach(v=>v.classList.toggle("active",v.id===`view-${name}`));
  $$(".nav-item[data-view]").forEach(b=>b.classList.toggle("active",b.dataset.view===name));
  $("#crumbCurrent").textContent=views[name]||"Чат";
  $("#sidebar").classList.remove("open");
}
$$(".nav-item[data-view]").forEach(b=>b.addEventListener("click",()=>showView(b.dataset.view)));
$("#menuBtn").addEventListener("click",()=>$("#sidebar").classList.toggle("open"));
$("#newChat").addEventListener("click",()=>{ $("#messages").innerHTML=""; $("#welcomeCard").hidden=false; selectedFiles=[]; renderAttached(); showView("chat"); });
$("#themeBtn").addEventListener("click",()=>document.body.classList.toggle("light"));

function renderAttached(){
  $("#attached").innerHTML=selectedFiles.map((f,i)=>`<span class="file-chip">${escapeHtml(f.name)} <button data-remove="${i}" aria-label="Убрать файл" style="background:none;border:0;color:#cbd6ec">×</button></span>`).join("");
  $$("[data-remove]").forEach(b=>b.addEventListener("click",()=>{selectedFiles.splice(+b.dataset.remove,1);renderAttached()}));
}
function addFiles(files,target){
  [...files].forEach(f=>{ if(!target.some(x=>x.name===f.name&&x.size===f.size)) target.push(f); });
}
$("#fileInput").addEventListener("change",e=>{addFiles(e.target.files,selectedFiles);renderAttached();e.target.value=""});
$("#libraryInput").addEventListener("change",e=>{addFiles(e.target.files,libraryFiles);renderLibrary();e.target.value=""});
function renderLibrary(){
  $("#fileList").innerHTML=libraryFiles.length?libraryFiles.map(f=>`<div class="file-card"><div style="font-size:23px;margin-bottom:8px">▤</div><b>${escapeHtml(f.name)}</b><small>${formatSize(f.size)}</small></div>`).join(""):'<div class="empty-state">Пока нет загруженных файлов.</div>';
}
function formatSize(n){return n<1024?`${n} Б`:n<1048576?`${(n/1024).toFixed(1)} КБ`:`${(n/1048576).toFixed(1)} МБ`}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function addMessage(role,text){
  const div=document.createElement("div");div.className=`message ${role}`;
  const label=document.createElement("div");label.className="role";label.textContent=role==="user"?"ТЫ":"AI HUB";
  const body=document.createElement("div");body.textContent=text;
  div.append(label,body);$("#messages").append(div);div.scrollIntoView({behavior:"smooth",block:"nearest"});
}
async function sendMessage(message){
  const files=selectedFiles.slice();
  $("#welcomeCard").hidden=true;addMessage("user",message+(files.length?`\n\nФайлы: ${files.map(f=>f.name).join(", ")}`:""));
  selectedFiles=[];renderAttached();
  const provider=$("#modelSelect").value;
  const apiUrl=localStorage.getItem("aihub-api-url")||"";
  if(provider!=="demo"&&apiUrl){
    try{
      const res=await fetch(apiUrl.replace(/\/$/,"")+"/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({provider,message,files:files.map(f=>({name:f.name,type:f.type,size:f.size}))})});
      if(!res.ok)throw new Error(`HTTP ${res.status}`);
      const data=await res.json();addMessage("assistant",data.reply||"Сервер вернул пустой ответ.");return;
    }catch(err){addMessage("assistant",`Не удалось подключиться к API-серверу (${err.message}). Проверь адрес и сервер. Ниже — демонстрационный ответ.`);}
  }
  const modelName={demo:"Демо-модель",openai:"OpenAI / GPT",anthropic:"Anthropic / Claude",google:"Google / Gemini",custom:"Свой API"}[provider];
  addMessage("assistant",`Я работаю в демонстрационном режиме (${modelName}). Интерфейс готов, но настоящая нейросеть пока не подключена.\n\nЧтобы включить реальные ответы, нужен backend-сервер с endpoint /api/chat. Он будет безопасно хранить API-ключи и отправлять запросы выбранному провайдеру.${files.length?`\n\nСейчас прикреплено файлов: ${files.length}. Для анализа содержимого серверу нужно отдельно передавать сами файлы.`:""}`);
}
$("#chatForm").addEventListener("submit",e=>{e.preventDefault();const value=$("#promptInput").value.trim();if(!value&&!selectedFiles.length)return;sendMessage(value||"Проанализируй прикреплённые файлы.");$("#promptInput").value="";});
$("#promptInput").addEventListener("input",e=>{e.target.style.height="auto";e.target.style.height=Math.min(e.target.scrollHeight,130)+"px"});
$$(".suggestion").forEach(b=>b.addEventListener("click",()=>{$("#promptInput").value=b.dataset.prompt;$("#promptInput").focus()}));
$("#createProject").addEventListener("click",()=>{const name=$("#projectName").value.trim();if(!name)return;projects.push(name);$("#projectName").value="";renderProjects()});
function renderProjects(){$("#projectGrid").innerHTML=projects.length?projects.map((p,i)=>`<div class="project-card"><div style="font-size:22px;color:#a99cff">⌘</div><b>${escapeHtml(p)}</b><small>Проект ${i+1} · создан локально</small></div>`).join(""):'<div class="empty-state">Создай первый проект — например, «Моё приложение».</div>'}
$("#saveSettings").addEventListener("click",()=>{const url=$("#apiUrl").value.trim().replace(/\/$/,"");if(url)localStorage.setItem("aihub-api-url",url);else localStorage.removeItem("aihub-api-url");$("#apiStatus").textContent=url?`Адрес сохранён: ${url}`:"Не настроено — работает демонстрационный режим.";});
$("#apiUrl").value=localStorage.getItem("aihub-api-url")||"";
if("serviceWorker" in navigator && location.protocol.startsWith("http"))navigator.serviceWorker.register("./sw.js").catch(()=>{});
