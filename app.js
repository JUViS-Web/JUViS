(() => {
  const cfg = window.JUVIS_CONFIG || {};
  const configured =
    cfg.SUPABASE_URL?.includes("supabase.co") &&
    !cfg.SUPABASE_URL.includes("DEIN-PROJEKT") &&
    cfg.SUPABASE_ANON_KEY &&
    !cfg.SUPABASE_ANON_KEY.includes("DEIN_");

  const $ = id => document.getElementById(id);

  let sb = null;
  let user = null;
  let profile = null;
  let scan = null;
  let authMode = "login";
  
  const cache = {
    members: [],
    events: [],
    exercises: [],
    clothing: [],
    docs: [],
    attendance: [],
    awards: []
  };

  const labels = {
    home: "Übersicht",
    members: "Mitglieder",
    events: "Dienstplan",
    exercises: "Übungen",
    clothing: "Bekleidung & Spinde",
    docs: "Dokumente & Links",
    scanner: "QR-Scanner",
    admin: "Administration"
  };

  window.addEventListener("error", e => {
    console.error("JUVIS-Fehler:", e.message, e.lineno);
  });

  function msg(text, auth = false) {
    const el = $(auth ? "authMessage" : "message");
    if (!el) return;
    el.textContent = text;
    el.classList.remove("hidden");
  }

  function clearMsg(auth = false) {
    const el = $(auth ? "authMessage" : "message");
    if (el) {
      el.textContent = "";
      el.classList.add("hidden");
    }
  }

  function role() {
    return profile?.role || "member";
  }

  function admin() {
    return ["admin", "leader"].includes(role());
  }

  function isAdmin() {
    return role() === "admin";
  }

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[char]));
  }

  function formObj(form) {
    return Object.fromEntries(new FormData(form).entries());
  }

  function showPage(page) {
    if (page === "admin" && !isAdmin()) {
      msg("Du hast keine Berechtigung für die Administration.");
      return;
    }

    document.querySelectorAll(".page").forEach(section => {
      section.classList.toggle("hidden", section.id !== page);
    });

    document.querySelectorAll("#nav button[data-page]").forEach(button => {
      button.classList.toggle("active", button.dataset.page === page);
    });

    $("pageTitle").textContent = labels[page] || page;
    clearMsg();

    if (page === "scanner" && !window.Html5Qrcode) {
      msg("QR-Bibliothek konnte nicht geladen werden. Prüfe die Internetverbindung.");
    }
  }

  async function db(table) {
    const orderColumn =
      table === "events" ? "starts_at" :
      table === "exercises" ? "planned_date" :
      "created_at";

    const { data, error } = await sb
      .from(table)
      .select("*")
      .order(orderColumn, {
        ascending: true,
        nullsFirst: false
      });

    if (error) throw error;
    return data || [];
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
      if (output) {
        output.textContent =
          "Einstellung konnte nicht geladen werden: " + error.message;
      }
      return;
    }

    select.value = String(data.maintenance_mode);
  }

  async function saveMaintenanceSettings() {
    const select = $("maintenanceToggle");
    const output = $("adminMessage");
    const button = $("saveMaintenance");

    if (!select || !output || !button || !isAdmin() || !user) return;

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

      try {
        cache.awards = await db("member_awards");
      } catch (error) {
        cache.awards = [];
        console.error("Auszeichnungen konnten nicht geladen werden:", error);
      }

      render();
    } catch (error) {
      msg("Daten konnten nicht geladen werden: " + error.message);
    }
  }

  function removeButton(table, id) {
    return `
      <button
        type="button"
        class="tiny"
        data-delete="${esc(table)}"
        data-id="${esc(id)}"
      >Löschen</button>
    `;
  }

  function render() {
    $("countMembers").textContent = cache.members.length;
    $("countEvents").textContent = cache.events.length;
    $("countClothing").textContent = cache.clothing.length;
    $("countExercises").textContent = cache.exercises.length;

    $("upcoming").innerHTML =
      cache.events.slice(0, 5).map(event => `
        <div class="entry">
          <div class="icon">▣</div>
          <div class="grow">
            <b>${esc(event.title)}</b>
            <small>
              ${esc(new Date(event.starts_at).toLocaleString("de-DE"))}
              ${event.location ? " · " + esc(event.location) : ""}
            </small>
          </div>
        </div>
      `).join("") ||
      '<p class="muted">Noch keine Dienste angelegt.</p>';

    const search = ($("memberSearch").value || "").toLowerCase();

    $("memberList").innerHTML =
      cache.members
        .filter(member =>
          `${member.first_name} ${member.last_name}`
            .toLowerCase().includes(search)
        )
        .map(member => `
          <div class="entry">
            <div class="icon">♙</div>
            <div class="grow">
              <b>${esc(member.first_name)} ${esc(member.last_name)}</b>
              <small>
                Geburtstag: ${member.birth_date ? new Date(member.birth_date + "T00:00:00").toLocaleDateString("de-DE") : "–"}
                <br>
                Eintritt: ${member.join_date ? new Date(member.join_date + "T00:00:00").toLocaleDateString("de-DE") : "–"}
                <br>
                Austritt: ${member.leave_date ? new Date(member.leave_date + "T00:00:00").toLocaleDateString("de-DE") : "–"}
                <br>
                Einsatzposition: ${esc(member.known_position || "Keine angegeben")}
                <br>
                Spindnummer: ${esc(member.locker_number || "Keine angegeben")}
                <br>
                E-Mail: ${esc(member.email || "Keine hinterlegt")}
              </small>
            </div>
            <button type="button" class="tiny" data-edit-member="${esc(member.id)}">Bearbeiten</button>
            ${removeButton("members", member.id)}
          </div>
        `).join("") ||
      '<p class="muted">Keine Mitglieder gefunden.</p>';
    
    const awardMember = $("awardMember");

    if (awardMember) {
      const selectedMember = awardMember.value;

      awardMember.innerHTML =
        '<option value="">Mitglied auswählen …</option>' +
        cache.members.map(member => `
          <option value="${esc(member.id)}">
            ${esc(member.first_name)} ${esc(member.last_name)}
          </option>
        `).join("");

      awardMember.value = selectedMember;
    }

    $("awardList").innerHTML =
      (cache.awards || []).map(award => {
        const member = cache.members.find(
          item => String(item.id) === String(award.member_id)
        );

        return `
          <div class="entry">
            <div class="icon">★</div>
            <div class="grow">
              <b>${esc(award.title)}</b>
              <small>
                Mitglied: ${member
                  ? esc(member.first_name + " " + member.last_name)
                  : "Unbekannt"}
                <br>
                Datum: ${award.awarded_on
                  ? new Date(award.awarded_on + "T00:00:00").toLocaleDateString("de-DE")
                  : "–"}
                ${award.notes
                  ? "<br>Notiz: " + esc(award.notes)
                  : ""}
              </small>
            </div>
            ${removeButton("member_awards", award.id)}
          </div>
        `;
      }).join("") ||
      '<p class="muted">Noch keine Auszeichnungen eingetragen.</p>';

    $("eventList").innerHTML =
      cache.events.map(event => `
        <div class="entry">
          <div class="icon">▣</div>
          <div class="grow">
            <b>${esc(event.title)}</b>
            <small>
              ${esc(new Date(event.starts_at).toLocaleString("de-DE"))}
              ${event.location ? " · " + esc(event.location) : ""}
              <br>${esc(event.description || "")}
            </small>
          </div>
          ${removeButton("events", event.id)}
        </div>
      `).join("") ||
      '<p class="muted">Keine Dienste vorhanden.</p>';

    const attendanceEvent = $("attendanceEvent");

    if (attendanceEvent) {
      const selected = attendanceEvent.value;

      attendanceEvent.innerHTML =
        '<option value="">Bitte Dienst auswählen</option>' +
        cache.events.map(event => `
          <option value="${esc(event.id)}">
            ${esc(event.title)} – ${esc(
              new Date(event.starts_at).toLocaleString("de-DE")
            )}
          </option>
        `).join("");

      attendanceEvent.value = selected;
    }

    $("exerciseList").innerHTML =
      cache.exercises.map(exercise => `
        <div class="entry">
          <div class="icon">☷</div>
          <div class="grow">
            <b>${esc(exercise.title)}</b>
            <small>
              ${esc(exercise.planned_date || "Kein Datum")}
              <br>${esc(exercise.notes || "")}
            </small>
          </div>
          ${removeButton("exercises", exercise.id)}
        </div>
      `).join("") ||
      '<p class="muted">Keine Übungen vorhanden.</p>';

    $("clothingList").innerHTML =
      cache.clothing.map(item => {
        const member = cache.members.find(
          entry => entry.id === item.member_id
        );

        const qr = item.qr_code
          ? `<div class="qr">
               <img
                 src="https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(item.qr_code)}"
                 alt="QR-Code für ${esc(item.item)}"
                 width="160" height="160">
               <br><small>QR-Code: ${esc(item.qr_code)}</small>
             </div>`
          : "";

        return `
          <div class="entry" id="clothing-${esc(item.id)}">
            <div class="icon">♧</div>
            <div class="grow">
              <b>${esc(item.item)}</b>
              <small>
                ${member
                  ? esc(member.first_name + " " + member.last_name)
                  : "Nicht zugeordnet"}
                · Größe ${esc(item.size || "–")}
                · Spind ${esc(item.locker_number || "–")}
                · Code ${esc(item.qr_code || "–")}
              </small>
              ${qr}
            </div>
            ${removeButton("clothing", item.id)}
          </div>
        `;
      }).join("") ||
      '<p class="muted">Keine Bekleidungseinträge.</p>';

    $("docList").innerHTML =
      cache.docs.map(doc => `
        <div class="entry">
          <div class="icon">▤</div>
          <div class="grow">
            <b>${esc(doc.title)}</b>
            <small>${esc(doc.description || "")}</small>
            ${doc.url
              ? `<br><a href="${esc(doc.url)}"
                    target="_blank"
                    rel="noopener noreferrer">Link öffnen ↗</a>`
              : ""}
          </div>
          ${removeButton("documents", doc.id)}
        </div>
      `).join("") ||
      '<p class="muted">Keine Dokumente oder Links vorhanden.</p>';

    renderAttendance();
    bindEditMemberButtons();
    bindDeleteButtons();
  }

  function renderAttendance() {
    const list = $("attendanceList");
    const saveButton = $("saveAttendance");
    const eventId = $("attendanceEvent")?.value;

    if (!list) return;

    if (!admin()) {
      list.innerHTML =
        '<p class="muted">Die Anwesenheitserfassung ist nur für Betreuer und Administratoren verfügbar.</p>';

      if (saveButton) saveButton.hidden = true;
      return;
    }

    if (!eventId) {
      list.innerHTML =
        '<p class="muted">Bitte zuerst einen Dienst auswählen.</p>';

      if (saveButton) saveButton.hidden = false;
      return;
    }

    if (saveButton) saveButton.hidden = false;

    list.innerHTML = cache.members.map(member => {
      const record = cache.attendance.find(entry =>
        String(entry.event_id) === String(eventId) &&
        String(entry.member_id) === String(member.id)
      );

      const status = record?.status || "";

      return `
        <div class="entry attendance-entry">
          <div class="icon">♙</div>
          <div class="grow attendance-member">
            <strong class="attendance-name">
              ${esc(member.first_name)} ${esc(member.last_name)}
            </strong>
            <small class="attendance-subtitle">
              Jugendfeuerwehrmitglied
            </small>
          </div>
          <div class="attendance-status">
            <label for="attendance-${esc(member.id)}">Anwesenheit</label>
            <select id="attendance-${esc(member.id)}"
              data-attendance-member="${esc(member.id)}">
              <option value="" ${status === "" ? "selected" : ""}>
                Noch nicht erfasst
              </option>
              <option value="present" ${status === "present" ? "selected" : ""}>
                Anwesend
              </option>
              <option value="absent" ${status === "absent" ? "selected" : ""}>
                Abwesend
              </option>
              <option value="excused" ${status === "excused" ? "selected" : ""}>
                Entschuldigt
              </option>
            </select>
          </div>
        </div>
      `;
    }).join("") ||
    '<p class="muted">Keine Mitglieder vorhanden.</p>';
  }
  
function bindEditMemberButtons() {
  document.querySelectorAll("[data-edit-member]").forEach(button => {
    button.onclick = () => {
      const member = cache.members.find(
        item => String(item.id) === button.dataset.editMember
      );

      if (!member) {
        msg("Mitglied konnte nicht gefunden werden.");
        return;
      }

      const form = $("memberForm");

      form.elements.first_name.value = member.first_name || "";
      form.elements.last_name.value = member.last_name || "";
      form.elements.birth_date.value = member.birth_date || "";
      form.elements.join_date.value = member.join_date || "";
      form.elements.leave_date.value = member.leave_date || "";
      form.elements.known_position.value = member.known_position || "";
      form.elements.locker_number.value = member.locker_number || "";
      form.elements.email.value = member.email || "";
      form.elements.notes.value = member.notes || "";

      form.scrollIntoView({ behavior: "smooth", block: "start" });
      msg("Mitglied geladen. Änderungen sind noch nicht gespeichert.");
    };
  });
}
  
  function bindDeleteButtons() {
    document.querySelectorAll("[data-delete]").forEach(button => {
      button.onclick = async () => {
        if (!admin()) {
          msg("Nur Betreuer und Administratoren dürfen Einträge löschen.");
          return;
        }

        if (!confirm("Eintrag wirklich löschen?")) return;

        button.disabled = true;

        try {
          const { error } = await sb
            .from(button.dataset.delete)
            .delete()
            .eq("id", button.dataset.id);

          if (error) throw error;

          msg("Eintrag gelöscht.");
          await load();
        } catch (error) {
          msg("Löschen fehlgeschlagen: " + error.message);
        } finally {
          button.disabled = false;
        }
      };
    });
  }

  async function add(table, data) {
    clearMsg();

    if (!admin()) {
      msg("Du hast keine Berechtigung, Daten anzulegen. Bitte wende dich an die Administration.");
      return false;
    }

    try {
      const { error } = await sb
        .from(table)
        .insert({ ...data, created_by: user.id });

      if (error) throw error;

      msg("Gespeichert.");
      await load();
      return true;
    } catch (error) {
      msg("Speichern fehlgeschlagen: " + error.message);
      return false;
    }
  }

  async function signedIn(authUser) {
    if (!sb || !authUser) return;

    user = authUser;

    try {
      const { data, error } = await sb
        .from("profiles")
        .select("*")
        .eq("id", authUser.id)
        .maybeSingle();

      if (error) throw error;

      profile = data || { role: "member" };

      $("authView").classList.add("hidden");
      $("appView").classList.remove("hidden");

      $("adminNav").classList.toggle("hidden", !isAdmin());

      $("welcome").textContent =
        (authUser.email || "Angemeldet") +
        " · Rolle: " +
        ({
          admin: "Administration",
          leader: "Betreuung",
          member: "Mitglied"
        }[role()] || "Mitglied");

      $("connection").textContent = "Angemeldet";

      showPage("home");
      await load();

      if (isAdmin()) {
        await loadMaintenanceSettings();
        await loadAdminUsers();
      }
    } catch (error) {
      msg("Benutzerdaten konnten nicht geladen werden: " + error.message);
    }
  }

  function signedOut() {
    user = null;
    profile = null;
    cache.members = [];
    cache.events = [];
    cache.exercises = [];
    cache.clothing = [];
    cache.docs = [];
    cache.attendance = [];

    $("appView").classList.add("hidden");
    $("authView").classList.remove("hidden");
    $("adminNav").classList.add("hidden");
    $("connection").textContent = "Nicht angemeldet";
  }

  async function handleAuth() {
    clearMsg(true);

    const email = $("email").value.trim();
    const password = $("password").value;

    if (!email || !password) {
      msg("Bitte E-Mail und Passwort eingeben.", true);
      return;
    }

    const button = $("authSubmit");
    button.disabled = true;

    try {
      if (authMode === "login") {
        const { error } = await sb.auth.signInWithPassword({
          email,
          password
        });

        if (error) throw error;
      } else {
        const { data, error } = await sb.auth.signUp({
          email,
          password
        });

        if (error) throw error;

        if (data.session) {
          msg("Registrierung erfolgreich.", true);
        } else {
          msg("Registrierung erfolgreich. Bitte prüfe deine E-Mails, um dein Konto zu bestätigen.", true);
        }
      }
    } catch (error) {
      msg("Anmeldung/Registrierung fehlgeschlagen: " + error.message, true);
    } finally {
      button.disabled = false;
    }
  }

  async function boot() {
    if (!configured || !window.supabase) {
      $("authView").classList.remove("hidden");
      $("authMessage").textContent =
        "Noch nicht konfiguriert: Öffne config.js und trage die Supabase-Projekt-URL sowie den anon/public key ein. Danach schema.sql im Supabase SQL Editor ausführen.";
      $("authMessage").classList.remove("hidden");
      $("authSubmit").disabled = true;
      return;
    }

    sb = window.supabase.createClient(
      cfg.SUPABASE_URL,
      cfg.SUPABASE_ANON_KEY
    );

    const { data, error } = await sb.auth.getSession();

    if (error) {
      msg("Sitzung konnte nicht geprüft werden: " + error.message, true);
    }

    if (data?.session) {
      await signedIn(data.session.user);
    }

    sb.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setTimeout(() => signedIn(session.user), 0);
      } else {
        signedOut();
      }
    });
  }

  // Anmeldung und Registrierung
  $("authSubmit").addEventListener("click", handleAuth);

  $("password").addEventListener("keydown", event => {
    if (event.key === "Enter") handleAuth();
  });

  $("toggleAuth").addEventListener("click", () => {
    authMode = authMode === "login" ? "register" : "login";

    $("authTitle").textContent =
      authMode === "login" ? "Anmelden" : "Konto registrieren";

    $("authSubmit").textContent =
      authMode === "login" ? "Anmelden" : "Registrieren";

    $("toggleAuth").textContent =
      authMode === "login"
        ? "Neues Konto registrieren"
        : "Zur Anmeldung";

    $("password").autocomplete =
      authMode === "login" ? "current-password" : "new-password";

    clearMsg(true);
  });

  // Navigation
  $("logout").onclick = async () => {
    if (!sb) return;

    const { error } = await sb.auth.signOut();

    if (error) {
      msg("Abmelden fehlgeschlagen: " + error.message);
    }
  };


$("nav").onclick = event => {
  const button = event.target.closest("[data-page]");
  if (button) {
    showPage(button.dataset.page);

    if (window.matchMedia("(max-width: 720px)").matches) {
      $("appLayout").classList.remove("nav-open");
      $("navToggle").setAttribute("aria-expanded", "false");
      $("navToggle").setAttribute("aria-label", "Navigationsmenü öffnen");
      $("navToggle").textContent = "☰ Menü";
    }
  }
};

$("navToggle").addEventListener("click", () => {
  const layout = $("appLayout");
  const mobile = window.matchMedia("(max-width: 720px)").matches;

  if (mobile) {
    const open = layout.classList.toggle("nav-open");

    $("navToggle").setAttribute("aria-expanded", String(open));
    $("navToggle").setAttribute(
      "aria-label",
      open ? "Navigationsmenü schließen" : "Navigationsmenü öffnen"
    );
    $("navToggle").textContent = open ? "✕ Menü schließen" : "☰ Menü";
  } else {
    const collapsed = layout.classList.toggle("nav-collapsed");

    $("navToggle").setAttribute("aria-expanded", String(!collapsed));
    $("navToggle").setAttribute(
      "aria-label",
      collapsed ? "Navigation ausklappen" : "Navigation einklappen"
    );
    $("navToggle").textContent = collapsed ? "☰" : "☰ Menü";
  }
});


  // Suche und Anwesenheit
  $("memberSearch").oninput = render;
  $("attendanceEvent").onchange = render;

  $("saveAttendance").onclick = async () => {
    if (!admin()) {
      msg("Nur Betreuer und Administratoren dürfen Anwesenheit speichern.");
      return;
    }

    const eventId = $("attendanceEvent").value;

    if (!eventId) {
      $("attendanceMessage").textContent =
        "Bitte zuerst einen Dienst auswählen.";
      return;
    }

    const selects = [
      ...document.querySelectorAll("[data-attendance-member]")
    ];

    if (!selects.length) {
      $("attendanceMessage").textContent =
        "Keine Mitglieder zum Speichern gefunden.";
      return;
    }

    const button = $("saveAttendance");
    button.disabled = true;
    $("attendanceMessage").textContent = "Anwesenheit wird gespeichert …";

    try {
      for (const select of selects) {
        const memberId = select.dataset.attendanceMember;
        const status = select.value;

        if (!status) {
          const { error } = await sb
            .from("attendance")
            .delete()
            .eq("event_id", eventId)
            .eq("member_id", memberId);

          if (error) throw error;
          continue;
        }

        const { error } = await sb
          .from("attendance")
          .upsert({
            event_id: eventId,
            member_id: memberId,
            status,
            recorded_by: user.id
          }, {
            onConflict: "event_id,member_id"
          });

        if (error) throw error;
      }

      await load();
      $("attendanceMessage").textContent =
        "Anwesenheit erfolgreich gespeichert.";
    } catch (error) {
      $("attendanceMessage").textContent =
        "Fehler beim Speichern: " + error.message;
    } finally {
      button.disabled = false;
    }
  };

  // Bekleidung drucken
  $("printClothing").onclick = () => {
    const rows = cache.clothing.map(item => {
      const member = cache.members.find(
        entry => entry.id === item.member_id
      );

      const qr = item.qr_code
        ? `<img src="https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(item.qr_code)}" alt="QR-Code">`
        : "<p>Kein QR-Code vorhanden</p>";

      return `
        <article>
          <div>
            <h2>${esc(item.item)}</h2>
            <p>Mitglied: ${member
              ? esc(member.first_name + " " + member.last_name)
              : "Nicht zugeordnet"}</p>
            <p>Größe: ${esc(item.size || "–")}</p>
            <p>Spind: ${esc(item.locker_number || "–")}</p>
            <p>Code: ${esc(item.qr_code || "–")}</p>
          </div>
          ${qr}
        </article>
      `;
    }).join("");

    const html = `<!doctype html>
      <html lang="de">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width,initial-scale=1">
        <title>JUVIS – Bekleidungsübersicht</title>
        <style>
          body{font:14px Arial,sans-serif;margin:20px;color:#111}
          h1{font-size:22px}
          article{display:flex;align-items:center;justify-content:space-between;gap:20px;border:1px solid #aaa;padding:12px;margin-bottom:12px;break-inside:avoid}
          article img{width:130px;height:130px}
          p{margin:5px 0}
          @media print{button{display:none}body{margin:10mm}}
        </style>
      </head>
      <body>
        <h1>JUVIS – Bekleidungsübersicht</h1>
        ${rows}
        <button onclick="window.print()">Drucken</button>
      </body>
      </html>`;

    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.target = "_blank";
    link.rel = "noopener";
    link.click();

    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  // Formulare
  $("memberForm").onsubmit = async event => {
    event.preventDefault();

    const form = event.target;
    const data = formObj(form);

    const saved = await add("members", {
      first_name: data.first_name.trim(),
      last_name: data.last_name.trim(),
      birth_date: data.birth_date || null,
      join_date: data.join_date || null,
      leave_date: data.leave_date || null,
      known_position: data.known_position.trim() || null,
      locker_number: data.locker_number.trim() || null,
      email: data.email || null,
      notes: data.notes || null
    });

    if (saved) form.reset();
  };
  
  $("awardForm").onsubmit = async event => {
    event.preventDefault();

    const form = event.target;
    const data = formObj(form);

    const saved = await add("member_awards", {
      member_id: data.member_id,
      title: data.title.trim(),
      awarded_on: data.awarded_on || null,
      notes: data.notes || null
    });

    if (saved) form.reset();
  };

  $("eventForm").onsubmit = async event => {
    event.preventDefault();

    const form = event.target;
    const data = formObj(form);

    const saved = await add("events", {
      title: data.title,
      starts_at: new Date(data.starts_at).toISOString(),
      location: data.location || null,
      description: data.description || null
    });

    if (saved) form.reset();
  };

  $("exerciseForm").onsubmit = async event => {
    event.preventDefault();

    const form = event.target;
    const data = formObj(form);

    const saved = await add("exercises", {
      title: data.title,
      notes: data.notes || null,
      planned_date: data.planned_date || null
    });

    if (saved) form.reset();
  };

  $("clothingForm").onsubmit = async event => {
    event.preventDefault();

    const form = event.target;
    const data = formObj(form);

    const code =
      "JUV-" +
      crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();

    const saved = await add("clothing", {
      member_id: data.member_id || null,
      item: data.item,
      size: data.size || null,
      locker_number: data.locker_number || null,
      qr_code: code
    });

    if (saved) form.reset();
  };

  $("docForm").onsubmit = async event => {
    event.preventDefault();

    const form = event.target;
    const data = formObj(form);
    let url = (data.url || "").trim();

    if (url && !/^https?:\/\//i.test(url)) {
      url = "https://" + url;
    }

    const saved = await add("documents", {
      title: data.title,
      url: url || null,
      description: data.description || null
    });

    if (saved) form.reset();
  };

  // QR-Code-Suche
  async function lookup(code) {
    const result = $("scanResult");
    result.classList.remove("hidden");

    const normalized = code.trim().toLowerCase();

    const found = cache.clothing.filter(item =>
      (item.qr_code || "").toLowerCase() === normalized ||
      String(item.id) === code.trim()
    );

    if (!found.length) {
      result.textContent =
        "Kein passender Bekleidungs-/Inventareintrag gefunden. Der Code muss zuerst einem Datensatz zugeordnet werden.";
      return;
    }

    const item = found[0];
    const member = cache.members.find(
      entry => entry.id === item.member_id
    );

    result.textContent =
      `Gefunden: ${item.item} · ${
        member
          ? member.first_name + " " + member.last_name
          : "Nicht zugeordnet"
      } · Größe ${item.size || "–"} · Spind ${item.locker_number || "–"}`;

    showPage("clothing");

    const entry = document.getElementById("clothing-" + item.id);

    if (entry) {
      entry.scrollIntoView({ behavior: "smooth", block: "center" });
      entry.style.outline = "3px solid #d97706";
      entry.style.borderRadius = "8px";

      setTimeout(() => {
        entry.style.outline = "";
        entry.style.borderRadius = "";
      }, 5000);
    } else {
      msg("Eintrag gefunden, aber nicht in der Liste sichtbar. Bitte lade die Bekleidungsliste neu.");
    }
  }

  $("lookupCode").onclick = () => {
    const code = $("manualCode").value.trim();
    if (code) lookup(code);
  };

  $("startScan").onclick = async () => {
    if (!window.Html5Qrcode) {
      msg("QR-Bibliothek nicht geladen.");
      return;
    }

    try {
      if (!scan) scan = new Html5Qrcode("qr-reader");

      await scan.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: 250 },
        text => {
          lookup(text);
          scan.stop().catch(() => {});
        },
        () => {}
      );
    } catch (error) {
      msg("Kamera konnte nicht gestartet werden: " + error.message);
    }
  };

  $("stopScan").onclick = async () => {
    if (!scan) return;

    try {
      if (scan.isScanning) {
        await scan.stop();
      }
    } catch (error) {
      msg("Scanner konnte nicht gestoppt werden: " + error.message);
    }
  };

  // Benutzerverwaltung
  async function loadAdminUsers() {
    const container = $("adminUsers");

    if (!container || !isAdmin()) return;

    container.innerHTML =
      '<p class="muted">Benutzer werden geladen …</p>';

    try {
      const { data, error } = await sb.rpc("juvis_admin_list_users");

      if (error) throw error;

      if (!Array.isArray(data) || data.length === 0) {
        container.innerHTML =
          '<p class="muted">Keine Benutzer gefunden.</p>';
        return;
      }

      container.innerHTML = data.map(account => {
        const id = account.user_id || account.id;
        const email = account.email || "Keine E-Mail";
        const currentRole = account.user_role || account.role || "member";

        if (!id) return "";

        return `
          <div class="entry">
            <div class="grow">
              <b>${esc(email)}</b>
              <small>Benutzerrolle</small>
            </div>
            <select data-role-user="${esc(id)}">
              <option value="member" ${currentRole === "member" ? "selected" : ""}>
                Mitglied
              </option>
              <option value="leader" ${currentRole === "leader" ? "selected" : ""}>
                Betreuer
              </option>
              <option value="admin" ${currentRole === "admin" ? "selected" : ""}>
                Administrator
              </option>
            </select>
            <button type="button" class="tiny"
              data-save-role="${esc(id)}">Rolle speichern</button>
          </div>
        `;
      }).join("");
    } catch (error) {
      container.innerHTML =
        '<p class="dangertext">Benutzer konnten nicht geladen werden.</p>';

      $("adminMessage").textContent =
        "Benutzerverwaltung: " + error.message;
    }
  }

  $("adminUsers").addEventListener("click", async event => {
    const button = event.target.closest("[data-save-role]");
    if (!button) return;

    if (!isAdmin()) {
      msg("Nur Administratoren dürfen Benutzerrollen ändern.");
      return;
    }

    const id = button.dataset.saveRole;
    const select = $("adminUsers").querySelector(
      `[data-role-user="${CSS.escape(id)}"]`
    );

    if (!select) return;

    if (id === user.id && select.value !== "admin") {
      $("adminMessage").textContent =
        "Du kannst dir selbst nicht die Administratorrolle entziehen.";
      await loadAdminUsers();
      return;
    }

    if (!confirm("Benutzerrolle wirklich ändern?")) {
      await loadAdminUsers();
      return;
    }

    button.disabled = true;

    try {
      const { error } = await sb.rpc("juvis_admin_set_role", {
        target_user_id: id,
        new_role: select.value
      });

      if (error) throw error;

      $("adminMessage").textContent =
        "Benutzerrolle erfolgreich geändert.";

      await loadAdminUsers();
    } catch (error) {
      $("adminMessage").textContent =
        "Rollenänderung fehlgeschlagen: " + error.message;
    } finally {
      button.disabled = false;
    }
  });

  $("saveMaintenance").addEventListener(
    "click",
    saveMaintenanceSettings
  );

  boot();
})();
