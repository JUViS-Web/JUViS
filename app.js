(() => {
const cfg=window.JUVIS_CONFIG||{}, configured=cfg.SUPABASE_URL?.includes("supabase.co")&&!cfg.SUPABASE_URL.includes("DEIN-PROJEKT")&&cfg.SUPABASE_ANON_KEY&&!cfg.SUPABASE_ANON_KEY.includes("DEIN_");
const $=id=>document.getElementById(id); let sb=null,user=null,profile=null,scan=null,authMode="login",cache={members:[],events:[],exercises:[],clothing:[],docs:[],attendance:[]};
  window.addEventListener("error", e => {
  alert("JUVIS-Fehler: " + e.message + " | Zeile: " + e.lineno);
});
const labels={home:"Übersicht",members:"Mitglieder",events:"Dienstplan",exercises:"Übungen",clothing:"Bekleidung & Spinde",docs:"Dokumente & Links",scanner:"QR-Scanner", admin:"Administration",};
function msg(t,auth=false){const el=$(auth?"authMessage":"message");el.textContent=t;el.classList.remove("hidden")}
function clearMsg(auth=false){$(auth?"authMessage":"message").classList.add("hidden")}
function role(){return profile?.role||"member"} function admin(){return ["admin","leader"].includes(role())}
  function isAdmin(){
  return role() === "admin";
}
  
async function loadMaintenanceSettings() {
  const select = $("maintenanceToggle");
  const output = $("adminMessage");

  if (!select || !isAdmin()) return;

  const { data, error } = await sb
    .from("app_settings")
    .select("maintenance_mode")
    .eq("id", true)
    .single();

  if (error) {
    if (output) output.textContent =
      "Einstellung konnte nicht geladen werden: " + error.message;
    return;
  }

  select.value = String(data.maintenance_mode);
}
async function saveMaintenanceSettings() {
  const select = $("maintenanceToggle");
  const output = $("adminMessage");
  const button = $("saveMaintenance");

  if (!select || !output || !isAdmin()) return;

  button.disabled = true;
  output.textContent = "Wird gespeichert …";

  try {
    const { error } = await sb
      .from("app_settings")
      .update({
        maintenance_mode: select.value === "true",
        updated_at: new Date().toISOString(),
        updated_by: user.id
      })
    
$("adminUsers")?.addEventListener("click", async e => {
  const button = e.target.closest("[data-save-role]");
  if (!button) return;

  const userId = button.dataset.saveRole;
  const select = $("adminUsers").querySelector(
    `[data-role-user="${CSS.escape(userId)}"]`
  );

  if (!select) return;

  await saveUserRole(userId, select.value, button);
});
      .eq("id", true);

    if (error) throw error;

    output.textContent = "Einstellung erfolgreich gespeichert.";
  } catch (error) {
    output.textContent =
      "Speichern fehlgeschlagen: " + error.message;
  } finally {
    button.disabled = false;
  }
}
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function formObj(form){return Object.fromEntries(new FormData(form).entries())}
function showPage(p) {
  if (p === "admin" && profile?.role !== "admin") {
    msg("Du hast keine Berechtigung für die Administration.");
    return;
  }

  document.querySelectorAll(".page").forEach(x =>
    x.classList.toggle("hidden", x.id !== p)
  );

  document.querySelectorAll("#nav button[data-page]").forEach(b =>
    b.classList.toggle("active", b.dataset.page === p)
  );

  $("pageTitle").textContent = labels[p] || p;

  if (p === "scanner" && !window.Html5Qrcode) {
    msg("QR-Bibliothek konnte nicht geladen werden. Prüfe die Internetverbindung.");
  }
}
async function db(table){const {data,error}=await sb.from(table).select("*").order(table==="events"?"starts_at":table==="exercises"?"planned_date":"created_at",{ascending:true,nullsFirst:false});if(error)throw error;return data||[]}
async function load() {
  try {
    [
      cache.members,
      cache.events,
      cache.exercises,
      cache.clothing,
      cache.docs
    ] = await Promise.all([
      db("members"),
      db("events"),
      db("exercises"),
      db("clothing"),
      db("documents")
    ]);

    if (admin()) {
      cache.attendance = await db("attendance");
    } else {
      cache.attendance = [];
    }

    render();
  } catch (e) {
    msg("Daten konnten nicht geladen werden: " + e.message);
  }
}
function removeButton(table,id){return admin()?`<button class="danger tiny" data-delete="${table}" data-id="${esc(id)}">Löschen</button>`:""}
function render(){ $("countMembers").textContent=cache.members.length;$("countEvents").textContent=cache.events.length;$("countClothing").textContent=cache.clothing.length;$("countExercises").textContent=cache.exercises.length;
$("upcoming").innerHTML=cache.events.slice(0,5).map(e=>`<div class="entry"><div class="icon">▣</div><div class="grow"><b>${esc(e.title)}</b><small>${esc(new Date(e.starts_at).toLocaleString("de-DE"))} ${e.location?"· "+esc(e.location):""}</small></div></div>`).join("")||'<p class="muted">Noch keine Dienste angelegt.</p>';
const q=($("memberSearch").value||"").toLowerCase();$("memberList").innerHTML=cache.members.filter(m=>(m.first_name+" "+m.last_name).toLowerCase().includes(q)).map(m=>`<div class="entry"><div class="icon">♙</div><div class="grow"><b>${esc(m.first_name)} ${esc(m.last_name)}</b><small>${esc(m.email||"Keine E-Mail hinterlegt")}</small></div>${removeButton("members",m.id)}</div>`).join("")||'<p class="muted">Keine Mitglieder gefunden.</p>';
$("eventList").innerHTML=cache.events.map(e=>`<div class="entry"><div class="icon">▣</div><div class="grow"><b>${esc(e.title)}</b><small>${esc(new Date(e.starts_at).toLocaleString("de-DE"))} ${e.location?"· "+esc(e.location):""}<br>${esc(e.description||"")}</small></div>${removeButton("events",e.id)}</div>`).join("")||'<p class="muted">Keine Dienste vorhanden.</p>';
const attendanceEvent = $("attendanceEvent");
if (attendanceEvent) {
  const selected = attendanceEvent.value;
  attendanceEvent.innerHTML =
    '<option value="">Bitte Dienst auswählen</option>' +
    cache.events.map(e =>
      `<option value="${esc(e.id)}">${esc(e.title)} – ${esc(new Date(e.starts_at).toLocaleString("de-DE"))}</option>`
    ).join("");
  attendanceEvent.value = selected;
}
$("exerciseList").innerHTML=cache.exercises.map(e=>`<div class="entry"><div class="icon">☷</div><div class="grow"><b>${esc(e.title)}</b><small>${esc(e.planned_date||"Kein Datum")}<br>${esc(e.notes||"")}</small></div>${removeButton("exercises",e.id)}</div>`).join("")||'<p class="muted">Keine Übungen vorhanden.</p>';
$("clothingList").innerHTML=cache.clothing.map(c=>{let m=cache.members.find(x=>x.id===c.member_id);let qr=c.qr_code?`<div><img src="https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(c.qr_code)}" alt="QR-Code" width="120" height="120"><br><small>Code: ${esc(c.qr_code)}</small></div>`:"<small>Kein QR-Code vorhanden</small>";return `<div class="entry"><div class="icon">♧</div><div class="grow"><b>${esc(c.item)}</b><small>${m?esc(m.first_name+" "+m.last_name):"Nicht zugeordnet"} · Größe ${esc(c.size||"–")} · Spind ${esc(c.locker_number||"–")}</small>${qr}</div>${removeButton("clothing",c.id)}</div>`}).join("")||'<p class="muted">Keine Bekleidungseinträge.</p>';
$("clothingList").innerHTML=cache.clothing.map(c=>{let m=cache.members.find(x=>x.id===c.member_id);let qr=c.qr_code?`<div class="qr"><img src="https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(c.qr_code)}" alt="QR-Code für ${esc(c.item)}" width="160" height="160"><br><small>QR-Code: ${esc(c.qr_code)}</small></div>`:"";return `<div class="entry" id="clothing-${esc(c.id)}"><div class="icon">♧</div><div class="grow"><b>${esc(c.item)}</b><small>${m?esc(m.first_name+" "+m.last_name):"Nicht zugeordnet"} · Größe ${esc(c.size||"–")} · Spind ${esc(c.locker_number||"–")} · Code ${esc(c.qr_code||"–")}</small>${qr}</div>${removeButton("clothing",c.id)}</div>`}).join("")||'<p class="muted">Keine Bekleidungseinträge.</p>';
$("docList").innerHTML=cache.docs.map(d=>`<div class="entry"><div class="icon">▤</div><div class="grow"><b>${esc(d.title)}</b><small>${esc(d.description||"")}</small>${d.url?`<br><a href="${esc(d.url)}" target="_blank" rel="noopener noreferrer">Link öffnen ↗</a>`:""}</div>${removeButton("documents",d.id)}</div>`).join("")||'<p class="muted">Keine Dokumente oder Links vorhanden.</p>';

const attendanceList = $("attendanceList");
const attendanceSave = $("saveAttendance");
const selectedEventId = $("attendanceEvent")?.value;

if (attendanceList) {
  if (!admin()) {
    attendanceList.innerHTML =
      '<p class="muted">Die Anwesenheitserfassung ist nur für Betreuer und Administratoren verfügbar.</p>';
    if (attendanceSave) attendanceSave.hidden = true;  
} else if (!selectedEventId) {
  attendanceList.innerHTML =
    '<p class="muted">Bitte zuerst einen Dienst auswählen.</p>';
  if (attendanceSave) attendanceSave.hidden = false;
  } else {
    if (attendanceSave) attendanceSave.hidden = false;
    
attendanceList.innerHTML = cache.members.map(m => {
  const record = cache.attendance.find(a =>
    a.event_id === selectedEventId && a.member_id === m.id
  );
  const status = record?.status || "";

  return `<div class="entry attendance-entry">
    <div class="icon">♙</div>
    <div class="grow attendance-member">
      <strong class="attendance-name">
        ${esc(m.first_name)} ${esc(m.last_name)}
      </strong>
      <small class="attendance-subtitle">Jugendfeuerwehrmitglied</small>
    </div>
    <div class="attendance-status">
      <label for="attendance-${esc(m.id)}">Anwesenheit</label>
      <select id="attendance-${esc(m.id)}"
        data-attendance-member="${esc(m.id)}">
        <option value="" ${status === "" ? "selected" : ""}>Noch nicht erfasst</option>
        <option value="present" ${status === "present" ? "selected" : ""}>Anwesend</option>
        <option value="absent" ${status === "absent" ? "selected" : ""}>Abwesend</option>
        <option value="excused" ${status === "excused" ? "selected" : ""}>Entschuldigt</option>
      </select>
    </div>
  </div>`;
}).join("") ||
  '<p class="muted">Keine Mitglieder vorhanden.</p>';
  }
}
document.querySelectorAll("[data-delete]").forEach(b=>b.onclick=async()=>{if(!admin()){msg("Nur Jugendfeuerwehrwart oder berechtigte Betreuer dürfen Einträge löschen.");return}if(!confirm("Eintrag wirklich löschen?"))return;const {error}=await sb.from(b.dataset.delete).delete().eq("id",b.dataset.id);if(error)msg(error.message);else{msg("Eintrag gelöscht.");await load()}});
}
async function add(table,data){clearMsg();if(!admin()){msg("Du hast keine Berechtigung, Daten anzulegen. Bitte wende dich an die Administration.");return}const {error}=await sb.from(table).insert({...data,created_by:user.id});if(error)msg("Speichern fehlgeschlagen: "+error.message);else{msg("Gespeichert.");await load()}}
async function boot(){if(!configured||!window.supabase){$("authView").classList.remove("hidden");$("authMessage").textContent="Noch nicht konfiguriert: Öffne config.js und trage die Supabase-Projekt-URL sowie den anon/public key ein. Danach schema.sql im Supabase SQL Editor ausführen."; $("authMessage").classList.remove("hidden");$("authSubmit").disabled=true;return}
sb=window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY);const {data:{session}}=await sb.auth.getSession();if(session)await signedIn(session.user);sb.auth.onAuthStateChange((_event,session)=>{if(session) setTimeout(()=>signedIn(session.user),0);else signedOut()})}



$("logout").onclick=()=>sb.auth.signOut();$("nav").onclick=e=>{const b=e.target.closest("[data-page]");if(b)showPage(b.dataset.page)};
$("memberSearch").oninput=render;
$("attendanceEvent").onchange = () => render();
  
$("attendanceEvent").onchange = () => render();

$("saveAttendance").onclick = async () => {
  if (!admin()) {
    msg("Nur Betreuer und Administratoren dürfen Anwesenheit speichern.");
    return;
  }

  const eventId = $("attendanceEvent").value;
  if (!eventId) {
    $("attendanceMessage").textContent = "Bitte zuerst einen Dienst auswählen.";
    return;
  }

  const selects = [
    ...document.querySelectorAll("[data-attendance-member]")
  ];

  if (!selects.length) {
    $("attendanceMessage").textContent = "Keine Mitglieder zum Speichern gefunden.";
    return;
  }

  $("saveAttendance").disabled = true;
  $("attendanceMessage").textContent = "Anwesenheit wird gespeichert …";

  try {
    for (const select of selects) {
      const memberId = select.dataset.attendanceMember;
      const status = select.value;

      if (!status) {
        const { error } = await sb.from("attendance")
          .delete()
          .eq("event_id", eventId)
          .eq("member_id", memberId);

        if (error) throw error;
        continue;
      }

      const { error } = await sb.from("attendance").upsert({
        event_id: eventId,
        member_id: memberId,
        status: status,
        recorded_by: user.id
      }, {
        onConflict: "event_id,member_id"
      });

      if (error) throw error;
    }

    await load();
    $("attendanceMessage").textContent = "Anwesenheit erfolgreich gespeichert.";
  } catch (e) {
    $("attendanceMessage").textContent =
      "Fehler beim Speichern: " + e.message;
  } finally {
    $("saveAttendance").disabled = false;
  }
};
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
      {fps:10, qrbox:250},
      (text)=>{
        lookup(text);
        scan.stop().catch(()=>{});
      },
      ()=>{}
    );
  }catch(e){
    msg("Kamera konnte nicht gestartet werden: "+e.message);
  }
};

async function loadAdminUsers() {
  const container = $("adminUsers");
  if (!container || !isAdmin()) return;

  container.innerHTML = '<p class="muted">Benutzer werden geladen …</p>';

  try {
    const { data, error } = await sb.rpc("juvis_admin_list_users");

    if (error) throw error;

    if (!Array.isArray(data) || data.length === 0) {
      container.innerHTML = '<p class="muted">Keine Benutzer gefunden.</p>';
      return;
    }

    container.innerHTML = data.map(u => {
      const id = u.user_id || u.id;
      const email = u.email || "Keine E-Mail";
      const currentRole = u.role || "member";

      if (!id) return "";

      return `
        <div class="entry">
          <div class="grow">
            <b>${esc(email)}</b>
            <small>Benutzerrolle</small>
          </div>
          <select data-role-user="${esc(id)}">
            <option value="member" ${currentRole === "member" ? "selected" : ""}>Mitglied</option>
            <option value="leader" ${currentRole === "leader" ? "selected" : ""}>Betreuer</option>
            <option value="admin" ${currentRole === "admin" ? "selected" : ""}>Administrator</option>
          </select>
          <button type="button" class="tiny" data-save-role="${esc(id)}">Rolle speichern</button>
        </div>`;
    }).join("");
  } catch (error) {
    container.innerHTML =
 
    const { error } = await sb.rpc("juvis_admin_set_role", {
      target_user_id: id,
      new_role: select.value
    });

    if (error) throw error;

    $("adminMessage").textContent = "Benutzerrolle erfolgreich geändert.";
    await loadAdminUsers();
  } catch (error) {
    $("adminMessage").textContent =
      "Rollenänderung fehlgeschlagen: " + error.message;
  } finally {
    button.disabled = false;
  }
});
$("saveMaintenance")?.addEventListener("click", () => {
  saveMaintenanceSettings();
});

boot();
})();
