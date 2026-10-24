(() => {
const cfg=window.JUVIS_CONFIG||{}, configured=cfg.SUPABASE_URL?.includes("supabase.co")&&!cfg.SUPABASE_URL.includes("DEIN-PROJEKT")&&cfg.SUPABASE_ANON_KEY&&!cfg.SUPABASE_ANON_KEY.includes("DEIN_");
const $=id=>document.getElementById(id); let sb=null,user=null,profile=null,scan=null,authMode="login",cache={members:[],events:[],exercises:[],clothing:[],docs:[]};
const labels={home:"Übersicht",members:"Mitglieder",events:"Dienstplan",exercises:"Übungen",clothing:"Bekleidung & Spinde",docs:"Dokumente & Links",scanner:"QR-Scanner"};
function msg(t,auth=false){const el=$(auth?"authMessage":"message");el.textContent=t;el.classList.remove("hidden")}
function clearMsg(auth=false){$(auth?"authMessage":"message").classList.add("hidden")}
function role(){return profile?.role||"member"} function admin(){return ["admin","leader"].includes(role())}
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function formObj(form){return Object.fromEntries(new FormData(form).entries())}
function showPage(p){document.querySelectorAll(".page").forEach(x=>x.classList.toggle("hidden",x.id!==p));document.querySelectorAll("#nav button[data-page]").forEach(b=>b.classList.toggle("active",b.dataset.page===p));$("pageTitle").textContent=labels[p]||p; if(p==="scanner"&&!window.Html5Qrcode)msg("QR-Bibliothek konnte nicht geladen werden. Prüfe die Internetverbindung.");}
async function db(table){const {data,error}=await sb.from(table).select("*").order(table==="events"?"starts_at":table==="exercises"?"planned_date":"created_at",{ascending:true,nullsFirst:false});if(error)throw error;return data||[]}
async function load(){try{[cache.members,cache.events,cache.exercises,cache.clothing,cache.docs]=await Promise.all([db("members"),db("events"),db("exercises"),db("clothing"),db("documents")]);render();}catch(e){msg("Daten konnten nicht geladen werden: "+e.message)}}
function removeButton(table,id){return admin()?`<button class="danger tiny" data-delete="${table}" data-id="${esc(id)}">Löschen</button>`:""}
function render(){ $("countMembers").textContent=cache.members.length;$("countEvents").textContent=cache.events.length;$("countClothing").textContent=cache.clothing.length;$("countExercises").textContent=cache.exercises.length;
$("upcoming").innerHTML=cache.events.slice(0,5).map(e=>`<div class="entry"><div class="icon">▣</div><div class="grow"><b>${esc(e.title)}</b><small>${esc(new Date(e.starts_at).toLocaleString("de-DE"))} ${e.location?"· "+esc(e.location):""}</small></div></div>`).join("")||'<p class="muted">Noch keine Dienste angelegt.</p>';
const q=($("memberSearch").value||"").toLowerCase();$("memberList").innerHTML=cache.members.filter(m=>(m.first_name+" "+m.last_name).toLowerCase().includes(q)).map(m=>`<div class="entry"><div class="icon">♙</div><div class="grow"><b>${esc(m.first_name)} ${esc(m.last_name)}</b><small>${esc(m.email||"Keine E-Mail hinterlegt")}</small></div>${removeButton("members",m.id)}</div>`).join("")||'<p class="muted">Keine Mitglieder gefunden.</p>';
$("eventList").innerHTML=cache.events.map(e=>`<div class="entry"><div class="icon">▣</div><div class="grow"><b>${esc(e.title)}</b><small>${esc(new Date(e.starts_at).toLocaleString("de-DE"))} ${e.location?"· "+esc(e.location):""}<br>${esc(e.description||"")}</small></div>${removeButton("events",e.id)}</div>`).join("")||'<p class="muted">Keine Dienste vorhanden.</p>';
$("exerciseList").innerHTML=cache.exercises.map(e=>`<div class="entry"><div class="icon">☷</div><div class="grow"><b>${esc(e.title)}</b><small>${esc(e.planned_date||"Kein Datum")}<br>${esc(e.notes||"")}</small></div>${removeButton("exercises",e.id)}</div>`).join("")||'<p class="muted">Keine Übungen vorhanden.</p>';
$("clothingList").innerHTML=cache.clothing.map(c=>{let m=cache.members.find(x=>x.id===c.member_id);let qr=c.qr_code?`<div><img src="https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(c.qr_code)}" alt="QR-Code" width="120" height="120"><br><small>Code: ${esc(c.qr_code)}</small></div>`:"<small>Kein QR-Code vorhanden</small>";return `<div class="entry"><div class="icon">♧</div><div class="grow"><b>${esc(c.item)}</b><small>${m?esc(m.first_name+" "+m.last_name):"Nicht zugeordnet"} · Größe ${esc(c.size||"–")} · Spind ${esc(c.locker_number||"–")}</small>${qr}</div>${removeButton("clothing",c.id)}</div>`}).join("")||'<p class="muted">Keine Bekleidungseinträge.</p>';
$("clothingList").innerHTML=cache.clothing.map(c=>{let m=cache.members.find(x=>x.id===c.member_id);let qr=c.qr_code?`<div class="qr"><img src="https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(c.qr_code)}" alt="QR-Code für ${esc(c.item)}" width="160" height="160"><br><small>QR-Code: ${esc(c.qr_code)}</small></div>`:"";return `<div class="entry" id="clothing-${esc(c.id)}"><div class="icon">♧</div><div class="grow"><b>${esc(c.item)}</b><small>${m?esc(m.first_name+" "+m.last_name):"Nicht zugeordnet"} · Größe ${esc(c.size||"–")} · Spind ${esc(c.locker_number||"–")} · Code ${esc(c.qr_code||"–")}</small>${qr}</div>${removeButton("clothing",c.id)}</div>`}).join("")||'<p class="muted">Keine Bekleidungseinträge.</p>';
$("docList").innerHTML=cache.docs.map(d=>`<div class="entry"><div class="icon">▤</div><div class="grow"><b>${esc(d.title)}</b><small>${esc(d.description||"")}</small>${d.url?`<br><a href="${esc(d.url)}" target="_blank" rel="noopener noreferrer">Link öffnen ↗</a>`:""}</div>${removeButton("documents",d.id)}</div>`).join("")||'<p class="muted">Keine Dokumente oder Links vorhanden.</p>';
document.querySelectorAll("[data-delete]").forEach(b=>b.onclick=async()=>{if(!admin()){msg("Nur Jugendfeuerwehrwart oder berechtigte Betreuer dürfen Einträge löschen.");return}if(!confirm("Eintrag wirklich löschen?"))return;const {error}=await sb.from(b.dataset.delete).delete().eq("id",b.dataset.id);if(error)msg(error.message);else{msg("Eintrag gelöscht.");await load()}});
}
async function add(table,data){clearMsg();if(!admin()){msg("Du hast keine Berechtigung, Daten anzulegen. Bitte wende dich an die Administration.");return}const {error}=await sb.from(table).insert({...data,created_by:user.id});if(error)msg("Speichern fehlgeschlagen: "+error.message);else{msg("Gespeichert.");await load()}}
async function boot(){if(!configured||!window.supabase){$("authView").classList.remove("hidden");$("authMessage").textContent="Noch nicht konfiguriert: Öffne config.js und trage die Supabase-Projekt-URL sowie den anon/public key ein. Danach schema.sql im Supabase SQL Editor ausführen."; $("authMessage").classList.remove("hidden");$("authSubmit").disabled=true;return}
sb=window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY);const {data:{session}}=await sb.auth.getSession();if(session)await signedIn(session.user);sb.auth.onAuthStateChange((_event,session)=>{if(session) setTimeout(()=>signedIn(session.user),0);else signedOut()})}
async function signedIn(u){user=u;const {data:p}=await sb.from("profiles").select("*").eq("id",u.id).maybeSingle();profile=p||{role:"member"};$("authView").classList.add("hidden");$("appView").classList.remove("hidden");$("welcome").textContent=(u.email||"Angemeldet")+" · Rolle: "+({admin:"Administration",leader:"Betreuung",member:"Mitglied"}[role()]||"Mitglied");$("connection").textContent="Angemeldet";document.querySelectorAll("#nav button[data-page]").forEach(b=>b.classList.toggle("hidden",b.dataset.page==="members"||b.dataset.page==="clothing"||b.dataset.page==="docs"?false:false));await load()}
function signedOut(){$("appView").classList.add("hidden");$("authView").classList.remove("hidden");user=null;profile=null}
$("toggleAuth").onclick=()=>{authMode=authMode==="login"?"signup":"login";$("authTitle").textContent=authMode==="login"?"Anmelden":"Konto erstellen";$("authSubmit").textContent=authMode==="login"?"Anmelden":"Registrieren";$("toggleAuth").textContent=authMode==="login"?"Neues Konto registrieren":"Zur Anmeldung wechseln";clearMsg(true)};
$("authSubmit").onclick=async()=>{if(!sb)return;clearMsg(true);const email=$("email").value.trim(),password=$("password").value;if(!email||password.length<8){msg("Bitte E-Mail und ein Passwort mit mindestens 8 Zeichen eingeben.",true);return}const r=authMode==="login"?await sb.auth.signInWithPassword({email,password}):await sb.auth.signUp({email,password});if(r.error)msg(r.error.message,true);else if(authMode==="signup"&&!r.data.session)msg("Konto erstellt.\nPrüfe dein E-Mail-Postfach zur Bestätigung.",true)};
$("logout").onclick=()=>sb.auth.signOut();$("nav").onclick=e=>{const b=e.target.closest("[data-page]");if(b)showPage(b.dataset.page)};
$("memberSearch").oninput=render;
$("printClothing").onclick=()=>{
  const rows=cache.clothing.map(c=>{
    const m=cache.members.find(x=>x.id===c.member_id);
    const qr=c.qr_code
      ?`<img src="https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(c.qr_code)}" alt="QR-Code">`
      :"<p>Kein QR-Code vorhanden</p>";

    return `<article>
      <div>
        <h2>${esc(c.item)}</h2>
        <p>Mitglied: ${m?esc(m.first_name+" "+m.last_name):"Nicht zugeordnet"}</p>
        <p>Größe: ${esc(c.size||"–")}</p>
        <p>Spind: ${esc(c.locker_number||"–")}</p>
        <p>Code: ${esc(c.qr_code||"–")}</p>
      </div>${qr}
    </article>`;
  }).join("");

  const html=`<!doctype html>
  <html lang="de"><head><meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>JUVIS – Bekleidungsübersicht</title>
  <style>
  body{font:14px Arial,sans-serif;margin:20px;color:#111}
  h1{font-size:22px}
  article{display:flex;align-items:center;justify-content:space-between;gap:20px;border:1px solid #aaa;padding:12px;margin-bottom:12px;break-inside:avoid}
  article img{width:130px;height:130px}
  p{margin:5px 0}
  @media print{button{display:none}body{margin:10mm}}
  </style></head><body>
  <h1>JUVIS – Bekleidungsübersicht</h1>
  ${rows}
  <button onclick="window.print()">Drucken</button>
  </body></html>`;

  const blob=new Blob([html],{type:"text/html"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url;
  a.target="_blank";
  a.rel="noopener";
  a.click();
  setTimeout(()=>URL.revokeObjectURL(url),60000);
};
$("memberForm").onsubmit=e=>{e.preventDefault();const d=formObj(e.target);add("members",{first_name:d.first_name.trim(),last_name:d.last_name.trim(),email:d.email||null,notes:d.notes||null});e.target.reset()};
$("eventForm").onsubmit=e=>{e.preventDefault();const d=formObj(e.target);add("events",{title:d.title,starts_at:new Date(d.starts_at).toISOString(),location:d.location||null,description:d.description||null});e.target.reset()};
$("exerciseForm").onsubmit=e=>{e.preventDefault();const d=formObj(e.target);add("exercises",{title:d.title,notes:d.notes||null,planned_date:d.planned_date||null});e.target.reset()};
$("clothingForm").onsubmit=e=>{e.preventDefault();const d=formObj(e.target);const code="JUV-"+crypto.randomUUID().replace(/-/g,"").slice(0,8).toUpperCase();add("clothing",{member_id:d.member_id||null,item:d.item,size:d.size||null,locker_number:d.locker_number||null,qr_code:code});e.target.reset()};
$("docForm").onsubmit=e=>{e.preventDefault();const d=formObj(e.target);add("documents",{title:d.title,url:d.url||null,description:d.description||null});e.target.reset()};
$("memberSearch").value="";
async function lookup(code){
  const res=$("scanResult");
  res.classList.remove("hidden");

  const found=cache.clothing.filter(c=>
    (c.qr_code||"").toLowerCase()===code.trim().toLowerCase() ||
    String(c.id)===code.trim()
  );

  if(!found.length){
    res.textContent="Kein passender Bekleidungs-/Inventareintrag gefunden. Der Code muss zuerst einem Datensatz zugeordnet werden.";
    return;
  }

  const c=found[0];
  const m=cache.members.find(x=>x.id===c.member_id);

  res.textContent=
    `Gefunden: ${c.item} · ${m?m.first_name+" "+m.last_name:"Nicht zugeordnet"} · Größe ${c.size||"–"} · Spind ${c.locker_number||"–"}`;

  $("clothing").classList.remove("hidden");

  document.querySelectorAll(".page").forEach(p=>{
    if(p.id!=="clothing") p.classList.add("hidden");
  });

  document.querySelectorAll(".nav button").forEach(b=>{
    b.classList.toggle("active",b.dataset.page==="clothing");
  });

  const entry=document.getElementById("clothing-"+c.id);

  if(entry){
    entry.scrollIntoView({behavior:"smooth",block:"center"});
    entry.style.outline="3px solid #d97706";
    entry.style.borderRadius="8px";
    setTimeout(()=>{
      entry.style.outline="";
      entry.style.borderRadius="";
    },5000);
  }else{
    msg("Eintrag gefunden, aber nicht in der Liste sichtbar. Bitte lade die Bekleidungsliste neu.");
  }
}

$("lookupCode").onclick=()=>{
  const c=$("manualCode").value.trim();
  if(c) lookup(c);
};

$("startScan").onclick=async()=>{
  if(!window.Html5Qrcode){
    msg("QR-Bibliothek nicht geladen.");
    return;
  }

  try{
    if(!scan) scan=new Html5Qrcode("qr-reader");

    await scan.start(
      {facingMode:"environment"},
      {fps:10,qrbox:{width:230,height:230}},
      text=>{
        $("manualCode").value=text;
        lookup(text);
        scan.stop().catch(()=>{});
      },
      ()=>{}
    );
  }catch(e){
    msg("Kamera konnte nicht gestartet werden: "+e.message);
  }
};

$("stopScan").onclick=()=>scan?.stop().catch(()=>{});
document.querySelectorAll("#nav button[data-page]").forEach(b=>b.addEventListener("click",()=>clearMsg()));
boot();
})();
