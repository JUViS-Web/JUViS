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
  
  const cache = {
  members: [],
  events: [],
  attendance: "Anwesenheit",
  exercises: [],
  clothing: [],
  docs: [],
  attendance: [],
  awards: [],
  fegedienstRecords: [],
  fegedienstMembers: []
};

  const labels = {
    home: "Übersicht",
    members: "Mitglieder",
    events: "Dienstplan",
    serviceBook: "Dienstbuch",
    fegedienst: "Fegedienst",
    clothing: "Bekleidung",
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
    try {
  localStorage.setItem("juvis_last_page", page);
} catch (error) {
  console.warn("Reiter konnte nicht gespeichert werden:", error);
}
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

      const [records, members] = await Promise.all([
        db("fegedienst_records"),
        db("fegedienst_members")
      ]);

      cache.fegedienstRecords = records;
      cache.fegedienstMembers = members;
    } else {
      cache.attendance = [];
      cache.fegedienstRecords = [];
      cache.fegedienstMembers = [];
    }

    try {
      cache.awards = await db("member_awards");
    } catch (error) {
      cache.awards = [];
      console.error(
        "Auszeichnungen konnten nicht geladen werden:",
        error
      );
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

function renderFegedienst() {
  const eventSelect = $("fegedienstEvent");
  const memberList = $("fegedienstMemberList");
  const history = $("fegedienstHistory");
  const stats = $("fegedienstStats");

  if (!eventSelect || !memberList || !history || !stats) return;

  const previousEventId = eventSelect.value;

  eventSelect.innerHTML =
    '<option value="">Bitte Dienst auswählen</option>' +
    cache.events
      .slice()
      .sort((a, b) => new Date(b.starts_at) - new Date(a.starts_at))
      .map(event => {
        const date = event.starts_at
          ? new Date(event.starts_at).toLocaleDateString("de-DE")
          : "Ohne Datum";

        return `<option value="${esc(event.id)}">${esc(date)} – ${esc(event.title)}</option>`;
      })
      .join("");

  if (cache.events.some(event => event.id === previousEventId)) {
    eventSelect.value = previousEventId;

    setupFegedienstForm();
  }

  memberList.innerHTML = cache.members
    .filter(member => !member.leave_date)
    .slice()
    .sort((a, b) =>
      `${a.last_name} ${a.first_name}`.localeCompare(
        `${b.last_name} ${b.first_name}`,
        "de"
      )
    )
    .map(member => `
      <label class="fegedienst-member">
        <input type="checkbox" name="fegedienst_member" value="${esc(member.id)}">
        ${esc(member.first_name)} ${esc(member.last_name)}
      </label>
    `)
    .join("") || '<p class="muted">Keine Mitglieder vorhanden.</p>';

  history.innerHTML = cache.fegedienstRecords
    .slice()
    .sort((a, b) => {
      const eventA = cache.events.find(e => e.id === a.event_id);
      const eventB = cache.events.find(e => e.id === b.event_id);
      return new Date(eventB?.starts_at || 0) - new Date(eventA?.starts_at || 0);
    })
    .map(record => {
      const event = cache.events.find(e => e.id === record.event_id);
      const assigned = cache.fegedienstMembers
        .filter(item => item.record_id === record.id)
        .map(item => cache.members.find(member => member.id === item.member_id))
        .filter(Boolean);

      const names = record.nobody_swept
        ? "Niemand hat gefegt"
        : assigned.map(member =>
            `${esc(member.first_name)} ${esc(member.last_name)}`
          ).join(", ") || "Keine Mitglieder eingetragen";

      return `
        <div class="entry">
          <div class="icon">✓</div>
          <div class="grow">
            <b>${esc(event?.title || "Unbekannter Dienst")}</b>
            <small>
              ${event?.starts_at ? esc(new Date(event.starts_at).toLocaleDateString("de-DE")) : "Ohne Datum"}
              <br>${names}
              ${record.notes ? `<br>${esc(record.notes)}` : ""}
            </small>
          </div>
        </div>
      `;
    })
    .join("") || '<p class="muted">Noch keine Fegedienste erfasst.</p>';

  const counts = cache.members
    .filter(member => !member.leave_date)
    .map(member => {
      const memberRecords = cache.fegedienstMembers.filter(item => {
        const record = cache.fegedienstRecords.find(r => r.id === item.record_id);
        return item.member_id === member.id && record && !record.nobody_swept;
      });

      const dates = memberRecords
        .map(item => {
          const record = cache.fegedienstRecords.find(r => r.id === item.record_id);
          const event = cache.events.find(e => e.id === record?.event_id);
          return event?.starts_at ? new Date(event.starts_at) : null;
        })
        .filter(Boolean)
        .sort((a, b) => b - a);

      return {
        name: `${member.first_name} ${member.last_name}`,
        count: memberRecords.length,
        lastDate: dates[0] || null
      };
    })
    .sort((a, b) =>
      a.count - b.count ||
      (a.lastDate?.getTime() || 0) - (b.lastDate?.getTime() || 0) ||
      a.name.localeCompare(b.name, "de")
    );
  
  const selectedEventId = eventSelect.value;

const eligibleMemberIds = new Set(
  cache.members
    .filter(member => !member.leave_date)
    .filter(member => {
      const attendanceRecord = cache.attendance.find(entry =>
        String(entry.event_id) === String(selectedEventId) &&
        String(entry.member_id) === String(member.id)
      );

      const status = attendanceRecord?.status || "present";
      return status === "present" || status === "late";
    })
    .map(member => member.id)
);

const recommended = counts
  .filter(item => {
    const member = cache.members.find(candidate =>
      `${candidate.first_name} ${candidate.last_name}` === item.name
    );

    return member && eligibleMemberIds.has(member.id);
  })
  .slice(0, 3);

  const recommendationHtml = recommended.length
    ? `
      <div class="fegedienst-recommendations">
        <p class="muted">
          Diese Mitglieder haben nach der bisherigen Statistik Vorrang.
          Die endgültige Auswahl triffst du selbst.
        </p>
        ${recommended.map((item, index) => `
          <div class="fegedienst-recommendation">
            <span class="fegedienst-rank">${index + 1}</span>
            <div class="grow">
              <b>${esc(item.name)}</b>
              <small>
                ${item.count} ${item.count === 1 ? "Fegedienst" : "Fegedienste"}
                · Zuletzt:
                ${item.lastDate
                  ? esc(item.lastDate.toLocaleDateString("de-DE"))
                  : "Noch nie"}
              </small>
            </div>
          </div>
        `).join("")}
      </div>
    `
    : '<p class="muted">Keine Mitglieder vorhanden.</p>';

  stats.innerHTML = `
    <h3>Nächste Empfehlung</h3>
    ${recommendationHtml}
    <h3>Gesamtübersicht</h3>
    ${counts.map(item => `
      <div class="entry">
        <div class="icon">#</div>
        <div class="grow">
          <b>${esc(item.name)}</b>
          <small>
            ${item.count} ${item.count === 1 ? "Fegedienst" : "Fegedienste"}
            <br>Zuletzt: ${item.lastDate
              ? esc(item.lastDate.toLocaleDateString("de-DE"))
              : "Noch nie"}
          </small>
        </div>
      </div>
    `).join("") || '<p class="muted">Keine Mitglieder vorhanden.</p>'}
  `;
}
  
function hideMemberPanels() {
  $("memberFormPanel").classList.add("hidden");
  $("memberDetailPanel").classList.add("hidden");
}

function openNewMemberForm() {
  if (!admin()) {
    msg("Nur Betreuer und Administratoren dürfen Mitglieder anlegen.");
    return;
  }

  hideMemberPanels();

  window.editingMemberId = null;
  $("memberForm").reset();
  $("memberFormTitle").textContent = "Neues Mitglied anlegen";
  $("memberFormPanel").classList.remove("hidden");
  $("cancelMemberEdit").hidden = false;

  $("memberFormPanel").scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}

function openMemberDetails(memberId) {
  const member = cache.members.find(
    item => String(item.id) === String(memberId)
  );

  if (!member) {
    msg("Mitglied konnte nicht gefunden werden.");
    return;
  }

  hideMemberPanels();

  const date = value => value
    ? new Date(value + "T00:00:00").toLocaleDateString("de-DE")
    : "–";

  $("memberDetailName").textContent =
    `${member.first_name} ${member.last_name}`;

  const details = [
    ["Vorname", member.first_name],
    ["Nachname", member.last_name],
    ["Geburtsdatum", date(member.birth_date)],
    ["Eintrittsdatum", date(member.join_date)],
    ["Austrittsdatum", date(member.leave_date)],
    ["Einsatzposition", member.known_position || "Keine angegeben"],
    ["Spindnummer", member.locker_number || "Keine angegeben"],
    ["E-Mail", member.email || "Keine hinterlegt"],
    ["Notiz", member.notes || "Keine Notiz"]
  ];

  $("memberDetailContent").innerHTML = details.map(([label, value]) => `
    <div class="entry">
      <div class="grow">
        <small class="muted">${esc(label)}</small>
        <b>${esc(value)}</b>
      </div>
    </div>
  `).join("");

  $("memberDetailPanel").dataset.memberId = member.id;
  $("memberDetailPanel").classList.remove("hidden");

  $("memberDetailPanel").scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}

function bindMemberCardButtons() {
  document.querySelectorAll("[data-open-member]").forEach(button => {
    button.onclick = () => {
      openMemberDetails(button.dataset.openMember);
    };
  });
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

$("memberList").innerHTML = cache.members
  .filter(member => !member.leave_date)
  .filter(member =>
    `${member.first_name} ${member.last_name}`
      .toLowerCase()
      .includes(search)
  )
  .map(member => `
    <button
      type="button"
      class="member-card"
      data-open-member="${esc(member.id)}"
    >
      <span class="member-card-icon">♙</span>
      <span class="member-card-info">
        <strong>${esc(member.first_name)} ${esc(member.last_name)}</strong>
        <small>
          ${member.leave_date ? "Ausgetreten" : "Aktives Mitglied"}
          · Spind ${esc(member.locker_number || "–")}
        </small>
      </span>
      <span class="member-card-arrow" aria-hidden="true">›</span>
    </button>
  `)
  .join("") ||
  '<p class="muted">Keine Mitglieder gefunden.</p>';

    const formerSearch = (
  $("formerMemberSearch").value || ""
).toLowerCase();

$("formerMemberList").innerHTML = cache.members
  .filter(member => !!member.leave_date)
  .filter(member =>
    `${member.first_name} ${member.last_name}`
      .toLowerCase()
      .includes(formerSearch)
  )
  .map(member => `
    <button
      type="button"
      class="member-card"
      data-open-member="${esc(member.id)}"
    >
      <span class="member-card-icon">♙</span>
      <span class="member-card-info">
        <strong>${esc(member.first_name)} ${esc(member.last_name)}</strong>
        <small>
          Ausgetreten am ${esc(member.leave_date)}
          · Spind ${esc(member.locker_number || "–")}
        </small>
      </span>
      <span class="member-card-arrow" aria-hidden="true">›</span>
    </button>
  `)
  .join("") ||
  '<p class="muted">Keine ausgetretenen Mitglieder gefunden.</p>'
    
bindMemberCardButtons();
    
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
    
const clothingMember = $("clothingMember");

if (clothingMember) {
  const selectedMember = clothingMember.value;

  clothingMember.innerHTML =
    '<option value="">Mitglied auswählen …</option>' +
    cache.members.map(member => `
      <option value="${esc(member.id)}">
        ${esc(member.first_name)} ${esc(member.last_name)}
      </option>
    `).join("");

  clothingMember.value = selectedMember;
}

if (clothingMember) {
  clothingMember.onchange = () => {
    const selectedMember = cache.members.find(
      member => String(member.id) === clothingMember.value
    );

    const lockerInput = $("clothingForm").elements.locker_number;

    if (selectedMember && lockerInput) {
      lockerInput.value = selectedMember.locker_number || "";
    }
  };
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
        <button
          type="button"
          class="secondary"
          data-open-service-book="${esc(event.id)}"
          style="margin-top:10px;">
          Dienstbuch öffnen
        </button>
      </div>
      ${removeButton("events", event.id)}
    </div>
  `).join("") ||
  '<p class="muted">Keine Dienste vorhanden.</p>';

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
          <div class="clothing-actions">
            <button type="button" class="secondary" data-edit-clothing="${esc(item.id)}">Bearbeiten</button>
            ${removeButton("clothing", item.id)}
          </div>
          </div>
        `;
          }).join("") ||
    '<p class="muted">Keine Mitglieder vorhanden.</p>';

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
    bindDeleteButtons();
    bindEditClothingButtons();
    renderFegedienst();
  }

function setupClothingSizes() {
  const itemSelect = $("clothingItem");
  const sizeSelect = $("clothingSize");

  if (!itemSelect || !sizeSelect) return;

  const clothingSizes = [
    "104", "110", "116", "122", "128", "134", "140",
    "146", "152", "158", "164", "170", "176",
    "XS", "S", "M", "L", "XL", "XXL", "XXXL"
  ];

  const jacketAndTrouserSizes = [
    ...clothingSizes.slice(0, 13),
    "2XS", "3XS",
    ...clothingSizes.slice(13)
  ];

  const shoeSizes = [
    "28", "29", "30", "31", "32", "33", "34", "35",
    "36", "37", "38", "39", "40", "41", "42", "43",
    "44", "45", "46", "47", "48"
  ];

  const gloveSizes = [
    "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"
  ];

  const oneSize = ["Einheitsgröße"];

  function getSizes(item) {
    if (item === "JF-Jacke" || item === "JF-Hose") {
      return jacketAndTrouserSizes;
    }

    if (item === "JF-Sicherheitsstiefel") return shoeSizes;
    if (item === "JF-Handschuhe") return gloveSizes;

    if (
      item === "JF-Helm" ||
      item === "JF-Schutzbrille" ||
      item === "JF-Cap" ||
      item === "JF-Mütze"
    ) {
      return oneSize;
    }

    return clothingSizes;
  }

  function updateSizes(selectedSize = "") {
    const item = itemSelect.value;
    const sizes = item ? getSizes(item) : [];

    sizeSelect.innerHTML =
      '<option value="">Größe auswählen …</option>' +
      sizes.map(size =>
        `<option value="${size}">${size}</option>`
      ).join("");

    if (sizes.includes(String(selectedSize))) {
      sizeSelect.value = String(selectedSize);
    }
  }

  itemSelect.addEventListener("change", () => updateSizes());

  updateSizes();

  window.updateClothingSizes = updateSizes;
}

function bindEditClothingButtons() {
  document.querySelectorAll("[data-edit-clothing]").forEach(button => {
    button.onclick = () => {
      const item = cache.clothing.find(
        entry => String(entry.id) === button.dataset.editClothing
      );

      if (!item) {
        msg("Bekleidungseintrag konnte nicht gefunden werden.");
        return;
      }

      window.editingClothingId = item.id;
      msg("Bearbeitungsmodus aktiv: " + window.editingClothingId);
      $("cancelClothingEdit").hidden = false;

      const form = $("clothingForm");
      
form.elements.member_id.value = item.member_id || "";

form.querySelector('[name="item"]').value = item.item || "";

if (window.updateClothingSizes) {
  window.updateClothingSizes(item.size || "");
}

form.elements.locker_number.value = item.locker_number || "";

      form.scrollIntoView({ behavior: "smooth", block: "start" });
      msg("Bekleidung geladen. Änderungen sind noch nicht gespeichert.");
    };
  });
}
  
  

function renderAttendance() {
  const list = $("attendanceList");
  const saveButton = $("saveAttendance");
  const eventId = $("attendanceEvent")?.value;

  if (!list) return;

  if (!admin()) {
    list.innerHTML = '<p class="muted">Nur Betreuer und Administratoren dürfen Anwesenheit erfassen.</p>';
    if (saveButton) saveButton.hidden = true;
    return;
  }

  if (!eventId) {
    list.innerHTML = '<p class="muted">Bitte zuerst einen Dienst auswählen.</p>';
    if (saveButton) saveButton.hidden = false;
    return;
  }

  if (saveButton) saveButton.hidden = false;

  list.innerHTML = cache.members
    .filter(member => !member.leave_date)
    .slice()
    .sort((a, b) =>
      `${a.last_name} ${a.first_name}`.localeCompare(
        `${b.last_name} ${b.first_name}`, "de"
      )
    )
    .map(member => {
      const record = cache.attendance.find(entry =>
        String(entry.event_id) === String(eventId) &&
        String(entry.member_id) === String(member.id)
      );

      const status = record?.status || "present";
      const lateMinutes = Number(record?.late_minutes || 0);
      const reason = record?.excuse_reason || "";

      const present = status === "present";
      const late = status === "late";
      const absent = status === "absent";

      const statusText = late ? "Verspätet" :
        present ? "Anwesend" : "Abwesend";

      const statusColor = absent ? "#ef4444" :
        late ? "#f59e0b" : "#22c55e";

      const statusBackground = absent ? "#592327" :
        late ? "#493718" : "#183b2b";

      const subtitle = late
        ? `${lateMinutes} Minuten verspätet`
        : absent
          ? (reason || "Unentschuldigt")
          : present && lateMinutes > 0
            ? `${lateMinutes} Minuten verspätet`
            : "Pünktlich";

      return `
        <div class="entry attendance-entry"
             style="touch-action:pan-y;">

          <div class="icon">♙</div>

          <div class="grow attendance-member">
            <strong class="attendance-name">
              ${esc(member.first_name)} ${esc(member.last_name)}
            </strong>

            <small class="attendance-subtitle">
              ${esc(subtitle)}
            </small>

            <div data-attendance-label
              style="
                display:inline-block;
                margin-top:7px;
                padding:6px 10px;
                border-radius:8px;
                font-weight:600;
                color:${statusColor};
                background:${statusBackground};
              ">
              ${statusText}
            </div>
          </div>

          <div class="attendance-status">
            <select
              data-attendance-member="${esc(member.id)}"
              style="display:none!important;"
              aria-hidden="true"
              tabindex="-1">
              <option value="present" ${present ? "selected" : ""}></option>
              <option value="late" ${late ? "selected" : ""}></option>
              <option value="absent" ${absent ? "selected" : ""}></option>
            </select>

            <input type="hidden"
              data-late-minutes-input="${esc(member.id)}"
              value="${lateMinutes}">

            <input type="hidden"
              data-excuse-reason="${esc(member.id)}"
              value="${esc(reason)}">

            <button type="button"
              class="secondary"
              data-attendance-details="${esc(member.id)}"
              title="Anwesenheit bearbeiten"
              style="font-size:22px;padding:10px 13px;">
              ◷
            </button>
          </div>
        </div>
      `;
    })
    .join("") || '<p class="muted">Keine Mitglieder vorhanden.</p>';

  const dialog = $("attendanceDialog");
  const closeButton = $("attendanceDialogClose");
  const cancelButton = $("attendanceDialogCancel");
  const saveDialogButton = $("attendanceDialogSave");
  const lateArea = $("attendanceDialogLate");
  const absentArea = $("attendanceDialogAbsent");
  const lateField = $("attendanceLateMinutes");
  const reasonField = $("attendanceExcuseReason");
  const freeTextWrap = $("attendanceFreeTextWrap");
  const freeTextField = $("attendanceFreeText");

  let activeEntry = null;

  function closeDialog() {
    if (dialog.open) dialog.close();
    activeEntry = null;
  }

  function openDialog(entry, mode) {
    activeEntry = entry;

    const name = entry.querySelector(".attendance-name").textContent.trim();
    const select = entry.querySelector("[data-attendance-member]");
    const lateInput = entry.querySelector("[data-late-minutes-input]");
    const reasonInput = entry.querySelector("[data-excuse-reason]");

    $("attendanceDialogMember").textContent = name;

    lateArea.hidden = mode !== "late";
    absentArea.hidden = mode !== "absent";

    if (mode === "late") {
      $("attendanceDialogTitle").textContent = "Verspätung eintragen";
      lateField.value = lateInput.value || "";
    } else {
      $("attendanceDialogTitle").textContent = "Abwesenheit eintragen";

      const savedReason = reasonInput.value || "";
      const isFreeText = savedReason.startsWith("Freitext: ");

      reasonField.value = isFreeText ? "Freitext" : savedReason;
      freeTextField.value = isFreeText
        ? savedReason.substring(10)
        : "";

      freeTextWrap.hidden = !isFreeText;
    }

    if (!dialog.open) dialog.showModal();
  }

  closeButton.onclick = closeDialog;
  cancelButton.onclick = closeDialog;

  reasonField.onchange = () => {
    freeTextWrap.hidden = reasonField.value !== "Freitext";
  };

  saveDialogButton.onclick = () => {
    if (!activeEntry) return;

    const select = activeEntry.querySelector("[data-attendance-member]");
    const lateInput = activeEntry.querySelector("[data-late-minutes-input]");
    const reasonInput = activeEntry.querySelector("[data-excuse-reason]");
    const subtitle = activeEntry.querySelector(".attendance-subtitle");
    const badge = activeEntry.querySelector("[data-attendance-label]");

    if (!lateArea.hidden) {
      const minutes = Number(lateField.value);

      if (!Number.isInteger(minutes) || minutes < 1) {
        $("attendanceDialogTitle").textContent =
          "Bitte gültige Verspätungsminuten eintragen";
        return;
      }

      select.value = "late";
      lateInput.value = minutes;
      reasonInput.value = "";

      subtitle.textContent = `${minutes} Minuten verspätet`;
      badge.textContent = "Verspätet";
      badge.style.color = "#f59e0b";
      badge.style.background = "#493718";

    } else {
      const reason = reasonField.value;

      if (reason === "Freitext") {
        const freeText = freeTextField.value.trim();

        if (!freeText) {
          $("attendanceDialogTitle").textContent =
            "Bitte einen Freitext eintragen";
          return;
        }

        reasonInput.value = `Freitext: ${freeText}`;
      } else {
        reasonInput.value = reason;
      }

      select.value = "absent";
      lateInput.value = "0";

      subtitle.textContent = reasonInput.value || "Unentschuldigt";
      badge.textContent = "Abwesend";
      badge.style.color = "#ef4444";
      badge.style.background = "#592327";
    }

    closeDialog();
  };

  list.querySelectorAll("[data-attendance-details]").forEach(button => {
    button.onclick = () => {
      const entry = button.closest(".attendance-entry");
      const select = entry.querySelector("[data-attendance-member]");

      openDialog(entry, select.value === "absent" ? "absent" : "late");
    };
  });

  list.querySelectorAll(".attendance-entry").forEach(entry => {
    let startX = 0;
    let startY = 0;

    entry.addEventListener("touchstart", event => {
      startX = event.changedTouches[0].clientX;
      startY = event.changedTouches[0].clientY;
    }, { passive: true });

    entry.addEventListener("touchend", event => {
      if (event.target.closest("button, input, select, label")) return;

      const deltaX = event.changedTouches[0].clientX - startX;
      const deltaY = event.changedTouches[0].clientY - startY;

      if (Math.abs(deltaX) < 60 ||
          Math.abs(deltaX) < Math.abs(deltaY)) return;

      const select = entry.querySelector("[data-attendance-member]");
      const lateInput = entry.querySelector("[data-late-minutes-input]");
      const reasonInput = entry.querySelector("[data-excuse-reason]");
      const badge = entry.querySelector("[data-attendance-label]");
      const subtitle = entry.querySelector(".attendance-subtitle");

      if (deltaX < 0) {
        select.value = "absent";
        lateInput.value = "0";

        badge.textContent = "Abwesend";
        badge.style.color = "#ef4444";
        badge.style.background = "#592327";

        subtitle.textContent = reasonInput.value || "Unentschuldigt";

        openDialog(entry, "absent");

      } else {
        select.value = "present";
        lateInput.value = "0";
        reasonInput.value = "";

        badge.textContent = "Anwesend";
        badge.style.color = "#22c55e";
        badge.style.background = "#183b2b";

        subtitle.textContent = "Pünktlich";
      }
    }, { passive: true });
  });
}

async function renderServiceBook() {
  const eventId = window.currentServiceBookEventId;

  const title = $("serviceBookTitle");
  const info = $("serviceBookInfo");
  const attendance = $("serviceBookAttendance");
  const entries = $("serviceBookEntries");
  const form = $("serviceBookForm");

  if (!eventId) {
    title.textContent = "Kein Dienst ausgewählt";
    return;
  }

  if (!admin()) {
    info.textContent = "Nur Betreuer und Administratoren dürfen das Dienstbuch öffnen.";
    form.hidden = true;
    return;
  }

  form.hidden = false;

  const service = cache.events.find(
    event => String(event.id) === String(eventId)
  );

  if (!service) {
    title.textContent = "Dienst nicht gefunden";
    return;
  }

  title.textContent = service.title;

  info.textContent =
    `${new Date(service.starts_at).toLocaleString("de-DE")}` +
    (service.location ? ` · ${service.location}` : "");

  attendance.innerHTML = cache.members
    .filter(member => !member.leave_date)
    .slice()
    .sort((a, b) =>
      `${a.last_name} ${a.first_name}`.localeCompare(
        `${b.last_name} ${b.first_name}`, "de"
      )
    )
    .map(member => {
      const record = cache.attendance.find(entry =>
        String(entry.event_id) === String(eventId) &&
        String(entry.member_id) === String(member.id)
      );

      const status = record?.status || "present";

      const text = status === "late"
        ? `Verspätet (${record.late_minutes || 0} Min.)`
        : status === "absent"
          ? `Abwesend – ${record.excuse_reason || "Unentschuldigt"}`
          : "Anwesend";

      return `
        <div class="entry">
          <div class="grow">
            <strong>${esc(member.first_name)} ${esc(member.last_name)}</strong>
            <small>${esc(text)}</small>
          </div>
        </div>
      `;
    })
    .join("") || '<p class="muted">Keine Mitglieder vorhanden.</p>';

  entries.textContent = "Dienstbucheinträge werden geladen …";

  const { data, error } = await sb
    .from("service_book_entries")
    .select("*")
    .eq("event_id", eventId)
    .order("created_at", { ascending: false });

  if (error) {
    entries.textContent = "Fehler beim Laden: " + error.message;
    return;
  }

  entries.innerHTML = (data || []).map(entry => `
  <div class="entry">
    <div class="grow">
      <small>${esc(new Date(entry.created_at).toLocaleString("de-DE"))}</small>
      <p style="white-space:pre-wrap;">${esc(entry.entry)}</p>
    </div>

    <button type="button" class="tiny"
      data-edit-service-entry="${esc(entry.id)}">
      Bearbeiten
    </button>

    <button type="button" class="tiny"
      data-delete-service-entry="${esc(entry.id)}">
      Löschen
    </button>
  </div>
`).join("") || '<p class="muted">Noch keine Einträge vorhanden.</p>';
  
  const noteMember = $("serviceBookNoteMember");
  const noteList = $("serviceBookMemberNotes");

  if (noteMember && noteList) {
    const selectedMember = noteMember.value;

    noteMember.innerHTML =
      '<option value="">Mitglied auswählen</option>' +
      cache.members
        .filter(member => !member.leave_date)
        .slice()
        .sort((a, b) =>
          `${a.last_name} ${a.first_name}`.localeCompare(
            `${b.last_name} ${b.first_name}`, "de"
          )
        )
        .map(member => `
          <option value="${esc(member.id)}">
            ${esc(member.first_name)} ${esc(member.last_name)}
          </option>
        `).join("");

    noteMember.value = selectedMember;

    noteList.textContent = "Mitgliedsvermerke werden geladen …";

    const { data: notes, error: notesError } = await sb
      .from("service_book_member_notes")
      .select("*")
      .eq("event_id", eventId)
      .order("created_at", { ascending: false });

    if (notesError) {
      noteList.textContent =
        "Fehler beim Laden: " + notesError.message;
    } else {
      noteList.innerHTML = (notes || []).map(note => {
        const member = cache.members.find(
          item => String(item.id) === String(note.member_id)
        );

        return `
          <div class="entry">
            <div class="grow">
              <strong>${member
                ? esc(member.first_name + " " + member.last_name)
                : "Unbekanntes Mitglied"}</strong>
              <small>${esc(new Date(note.created_at).toLocaleString("de-DE"))}</small>
              <p style="white-space:pre-wrap;">${esc(note.note)}</p>
            </div>
            <button type="button" class="tiny"
              data-edit-service-note="${esc(note.id)}">Bearbeiten</button>
            <button type="button" class="tiny"
              data-delete-service-note="${esc(note.id)}">Löschen</button>
          </div>
        `;
      }).join("") || '<p class="muted">Noch keine Mitgliedsvermerke vorhanden.</p>';
    }
  }
}

$("serviceBookForm").addEventListener("submit", async event => {
  event.preventDefault();

  if (!admin()) return;

  const input = $("serviceBookEntry");
  const message = $("serviceBookMessage");
  const button = $("serviceBookForm").querySelector(
    'button[type="submit"]'
  );

  const entry = input.value.trim();
  const eventId = window.currentServiceBookEventId;

  if (!entry || !eventId) return;

  button.disabled = true;
  message.textContent = "Eintrag wird gespeichert …";

  try {
    const { error } = await sb
      .from("service_book_entries")
      .insert({
        event_id: eventId,
        entry: entry,
        created_by: user.id
      });

    if (error) throw error;

    input.value = "";
    message.textContent = "Eintrag erfolgreich gespeichert.";

    await renderServiceBook();
  } catch (error) {
    message.textContent = "Fehler: " + error.message;
  } finally {
    button.disabled = false;
  }
});

$("serviceBookMemberNoteForm").addEventListener("submit", async event => {
  event.preventDefault();

  if (!admin()) return;

  const memberId = $("serviceBookNoteMember").value;
  const noteInput = $("serviceBookNoteText");
  const message = $("serviceBookNoteMessage");
  const button = $("serviceBookMemberNoteForm").querySelector(
    'button[type="submit"]'
  );

  const note = noteInput.value.trim();
  const eventId = window.currentServiceBookEventId;

  if (!memberId || !note || !eventId) {
    message.textContent = "Bitte Mitglied und Vermerk angeben.";
    return;
  }

  button.disabled = true;
  message.textContent = "Vermerk wird gespeichert …";

  try {
    const { error } = await sb
      .from("service_book_member_notes")
      .insert({
        event_id: eventId,
        member_id: memberId,
        note: note,
        created_by: user.id,
        updated_by: user.id
      });

    if (error) throw error;

    noteInput.value = "";
    $("serviceBookNoteMember").value = "";
    message.textContent = "Vermerk erfolgreich gespeichert.";

    await renderServiceBook();
  } catch (error) {
    message.textContent = "Fehler beim Speichern: " + error.message;
  } finally {
    button.disabled = false;
  }
});

$("serviceBookMemberNotes").addEventListener("click", async event => {
  const editButton = event.target.closest("[data-edit-service-note]");
  const deleteButton = event.target.closest("[data-delete-service-note]");

  if (!editButton && !deleteButton) return;
  if (!admin()) return;

  const id = editButton
    ? editButton.dataset.editServiceNote
    : deleteButton.dataset.deleteServiceNote;

  const message = $("serviceBookNoteMessage");

  if (editButton) {
    const { data, error } = await sb
      .from("service_book_member_notes")
      .select("note")
      .eq("id", id)
      .single();

    if (error) {
      message.textContent = "Fehler: " + error.message;
      return;
    }

    const updated = prompt("Mitgliedsvermerk bearbeiten:", data.note);

    if (updated === null) return;

    if (!updated.trim()) {
      message.textContent = "Der Vermerk darf nicht leer sein.";
      return;
    }

    const { error: updateError } = await sb
      .from("service_book_member_notes")
      .update({
        note: updated.trim(),
        updated_by: user.id,
        updated_at: new Date().toISOString()
      })
      .eq("id", id);

    if (updateError) {
      message.textContent = "Fehler: " + updateError.message;
      return;
    }

    message.textContent = "Vermerk erfolgreich geändert.";
  } else {
    if (!confirm("Mitgliedsvermerk wirklich löschen?")) return;

    const { error } = await sb
      .from("service_book_member_notes")
      .delete()
      .eq("id", id);

    if (error) {
      message.textContent = "Fehler: " + error.message;
      return;
    }

    message.textContent = "Vermerk erfolgreich gelöscht.";
  }

  await renderServiceBook();
});
  
$("serviceBookBack").onclick = () => {
  showPage("events");
};

$("serviceBookGoAttendance").onclick = () => {
  $("attendanceEvent").value = window.currentServiceBookEventId;
  showPage("attendance");
  renderAttendance();
};

$("attendanceOpenServiceBook").onclick = () => {
  const eventId = $("attendanceEvent").value;

  if (!eventId) {
    $("attendanceMessage").textContent =
      "Bitte zuerst einen Dienst auswählen.";
    return;
  }

  window.currentServiceBookEventId = eventId;

  showPage("serviceBook");
  renderServiceBook();
};

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
      window.editingMemberId = member.id;
      $("cancelMemberEdit").hidden = false;
      
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

      let lastPage = "home";

try {
  lastPage = localStorage.getItem("juvis_last_page") || "home";
} catch (error) {
  console.warn("Gespeicherter Reiter konnte nicht geladen werden:", error);
}

const allowedPages = [
  "home",
  "members",
  "events",
  "serviceBook",
  "fegedienst",
  "clothing",
  "docs",
  "scanner",
  "admin"
];

if (!allowedPages.includes(lastPage)) {
  lastPage = "home";
}

if (lastPage === "admin" && !isAdmin()) {
  lastPage = "home";
}

showPage(lastPage);
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

  const username = $("username").value.trim().toLowerCase();
  const password = $("password").value;

  if (!username || !password) {
    msg("Bitte Benutzername und Passwort eingeben.", true);
    return;
  }

  const button = $("authSubmit");
  button.disabled = true;

  try {
    const { data, error } = await sb.functions.invoke(
      "juvis-username-login",
      {
        body: { username, password }
      }
    );

    if (error) throw error;

    if (!data?.session?.access_token || !data?.session?.refresh_token) {
      throw new Error("Die Anmeldung konnte nicht abgeschlossen werden.");
    }

    const { error: sessionError } = await sb.auth.setSession({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token
    });

    if (sessionError) throw sessionError;
  } catch (error) {
    console.error("Anmeldefehler:", error);
    msg("Anmeldefehler: " + (error?.message || String(error)), true);
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

$("eventList").addEventListener("click", event => {
  const button = event.target.closest("[data-open-service-book]");
  if (!button) return;

  window.currentServiceBookEventId = button.dataset.openServiceBook;

  showPage("serviceBook");
  renderServiceBook();
});

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

      const lateInput = document.querySelector(
        `[data-late-minutes-input="${memberId}"]`
      );

      const reasonInput = document.querySelector(
        `[data-excuse-reason="${memberId}"]`
      );

      const lateMinutes = Number(lateInput?.value || 0);
      const excuseReason = reasonInput?.value.trim() || "";

      if (
  !Number.isInteger(lateMinutes) ||
  lateMinutes < 0 ||
  (status === "late" && lateMinutes < 1) ||
  (status !== "late" && lateMinutes > 0)
) {
  throw new Error(
    "Bitte prüfe den Anwesenheitsstatus und die Verspätungsminuten."
  );
}

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
          late_minutes: lateMinutes,
          excuse_reason: status === "absent" ? excuseReason : null,
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
$("addMemberButton").onclick = openNewMemberForm;

  $("showFormerMembersButton").onclick = () => {
  hideMemberPanels();
  $("formerMembersPanel").classList.remove("hidden");
};

$("closeFormerMembersButton").onclick = () => {
  $("formerMembersPanel").classList.add("hidden");
};

$("formerMemberSearch").addEventListener("input", () => {
  render();
});
  
$("closeMemberDetail").onclick = () => {
  $("memberDetailPanel").classList.add("hidden");
};

$("deleteMemberButton").onclick = async () => {
  if (!admin()) {
    msg("Nur Betreuer und Administratoren dürfen Mitglieder löschen.");
    return;
  }

  const memberId = $("memberDetailPanel").dataset.memberId;

  const member = cache.members.find(
    item => String(item.id) === String(memberId)
  );

  if (!member) {
    msg("Mitglied konnte nicht gefunden werden.");
    return;
  }

  const fullName =
    `${member.first_name} ${member.last_name}`;

  const confirmed = confirm(
    `Möchtest du das Mitglied ${fullName} wirklich endgültig löschen?\n\n` +
    "Dieser Vorgang kann nicht rückgängig gemacht werden."
  );

  if (!confirmed) return;

  const button = $("deleteMemberButton");
  button.disabled = true;

  try {
    const { error } = await sb
      .from("members")
      .delete()
      .eq("id", member.id);

    if (error) throw error;

    $("memberDetailPanel").classList.add("hidden");

    msg(`Mitglied ${fullName} wurde gelöscht.`);
    await load();
  } catch (error) {
    msg(
      "Mitglied konnte nicht gelöscht werden: " +
      error.message
    );
  } finally {
    button.disabled = false;
  }
};

$("editMemberButton").onclick = () => {
  const memberId = $("memberDetailPanel").dataset.memberId;
  const member = cache.members.find(
    item => String(item.id) === String(memberId)
  );

  if (!member) {
    msg("Mitglied konnte nicht gefunden werden.");
    return;
  }

  if (!admin()) {
    msg("Nur Betreuer und Administratoren dürfen Mitglieder bearbeiten.");
    return;
  }

  hideMemberPanels();

  window.editingMemberId = member.id;
  $("memberFormTitle").textContent = "Mitglied bearbeiten";

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

  $("memberFormPanel").classList.remove("hidden");
  $("cancelMemberEdit").hidden = false;

  $("memberFormPanel").scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
};

$("cancelMemberEdit").onclick = () => {
  window.editingMemberId = null;
  $("memberForm").reset();
  $("memberFormPanel").classList.add("hidden");
  $("cancelMemberEdit").hidden = true;
  $("memberFormTitle").textContent = "Neues Mitglied anlegen";
  msg("Vorgang abgebrochen.");
};
  $("memberForm").onsubmit = async event => {
    event.preventDefault();

    const form = event.target;
    const data = formObj(form);

    const memberData = {
      first_name: data.first_name.trim(),
      last_name: data.last_name.trim(),
      birth_date: data.birth_date || null,
      join_date: data.join_date || null,
      leave_date: data.leave_date || null,
      known_position: data.known_position.trim() || null,
      locker_number: data.locker_number.trim() || null,
      email: data.email || null,
      notes: data.notes || null
    };

    try {
      const editingId = window.editingMemberId;

      if (editingId) {
        const { error } = await sb
          .from("members")
          .update(memberData)
          .eq("id", editingId);

        if (error) throw error;

        window.editingMemberId = null;
        msg("Mitglied erfolgreich aktualisiert.");
      } else {
        const saved = await add("members", memberData);

        if (!saved) return;

        msg("Mitglied erfolgreich angelegt.");
      }

      form.reset();
$("cancelMemberEdit").hidden = true;
$("memberFormPanel").classList.add("hidden");
$("memberDetailPanel").classList.add("hidden");
$("memberFormTitle").textContent = "Neues Mitglied anlegen";
await load();
    } catch (error) {
      msg("Speichern fehlgeschlagen: " + error.message);
    }
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

function setupFegedienstForm() {
  const nobody = $("fegedienstNobody");
  const form = $("fegedienstForm");
  const memberList = $("fegedienstMemberList");

  if (!nobody || !form || !memberList) return;

  const allowed = admin();

  function updateMemberCheckboxes() {
    memberList
      .querySelectorAll('input[name="fegedienst_member"]')
      .forEach(checkbox => {
        checkbox.disabled = !allowed || nobody.checked;
        if (nobody.checked) {
          checkbox.checked = false;
        }
      });
  }

  nobody.onchange = updateMemberCheckboxes;

  memberList.addEventListener("change", event => {
  if (
    event.target.matches('input[name="fegedienst_member"]') &&
    event.target.checked
  ) {
    nobody.checked = false;
    updateMemberCheckboxes();
  }
});

  form.querySelectorAll("input, select, textarea, button").forEach(control => {
    control.disabled = !allowed;
  });

  updateMemberCheckboxes();
}

$("fegedienstForm").onsubmit = async event => {
  event.preventDefault();

  if (!admin()) {
    msg("Keine Berechtigung für den Fegedienst.");
    return;
  }

  const form = event.target;
  const eventId = form.event_id.value;
  const nobodySwept = $("fegedienstNobody").checked;
  const notes = $("fegedienstNotes").value.trim();

  const selectedMembers = [
    ...form.querySelectorAll('input[name="fegedienst_member"]:checked')
  ].map(input => input.value);

  if (!eventId) {
    msg("Bitte wähle einen Dienst aus.");
    return;
  }

  if (nobodySwept && selectedMembers.length > 0) {
    msg("Wähle entweder Mitglieder oder „Niemand hat gefegt“.");
    return;
  }

  if (!nobodySwept && selectedMembers.length === 0) {
    msg("Wähle mindestens ein Mitglied oder „Niemand hat gefegt“.");
    return;
  }

  try {
    const { data: existing, error: findError } = await sb
      .from("fegedienst_records")
      .select("id")
      .eq("event_id", eventId)
      .maybeSingle();

    if (findError) throw findError;

    let recordId;

    if (existing) {
      const { error: updateError } = await sb
        .from("fegedienst_records")
        .update({
          nobody_swept: nobodySwept,
          notes: notes || null,
          recorded_by: user.id,
          updated_at: new Date().toISOString()
        })
        .eq("id", existing.id);

      if (updateError) throw updateError;
      recordId = existing.id;

      const { error: deleteError } = await sb
        .from("fegedienst_members")
        .delete()
        .eq("record_id", recordId);

      if (deleteError) throw deleteError;
    } else {
      const { data: inserted, error: insertError } = await sb
        .from("fegedienst_records")
        .insert({
          event_id: eventId,
          nobody_swept: nobodySwept,
          notes: notes || null,
          recorded_by: user.id
        })
        .select("id")
        .single();

      if (insertError) throw insertError;
      recordId = inserted.id;
    }

    if (selectedMembers.length > 0) {
      const rows = selectedMembers.map(memberId => ({
        record_id: recordId,
        member_id: memberId
      }));

      const { error: membersError } = await sb
        .from("fegedienst_members")
        .insert(rows);

      if (membersError) throw membersError;
    }

    msg("Fegedienst wurde gespeichert.");
    form.reset();
    await load();
  } catch (error) {
    msg("Fegedienst konnte nicht gespeichert werden: " + error.message);
  }
};

$("cancelClothingEdit").onclick = () => {
  window.editingClothingId = null;

  const form = $("clothingForm");
  form.reset();

  $("cancelClothingEdit").hidden = true;
  msg("Bearbeitung abgebrochen. Du kannst einen neuen Eintrag erstellen.");
};

$("clothingForm").onsubmit = async event => {
  event.preventDefault();

  const form = event.target;
  const data = formObj(form);
  const editingId = window.editingClothingId;

  const clothingData = {
    member_id: data.member_id || null,
    item: form.elements.namedItem("item").value.trim(),
    size: data.size || null,
    locker_number: data.locker_number || null
  };

  try {
    if (!admin()) {
      msg("Du hast keine Berechtigung, Bekleidung zu speichern.");
      return;
    }

    if (editingId) {
      const { error } = await sb
        .from("clothing")
        .update(clothingData)
        .eq("id", editingId);

      if (error) throw error;

      window.editingClothingId = null;
      msg("Bekleidungseintrag erfolgreich aktualisiert.");
    } else {
      const code =
        "JUV-" +
        crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();

      const { error } = await sb
        .from("clothing")
        .insert({
          ...clothingData,
          qr_code: code,
          created_by: user.id
        });

      if (error) throw error;

      msg("Bekleidungseintrag erfolgreich angelegt.");
    }

    form.reset();
    $("cancelClothingEdit").hidden = true;
    await load();
  } catch (error) {
    msg("Speichern fehlgeschlagen: " + error.message);
  }
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

  setupClothingSizes();
  boot();
})();
