# JUVIS – Jugendfeuerwehr-Verwaltung

iPad-freundliches Web-App-Grundgerüst mit Anmeldung, Supabase-Datenbankanbindung und QR-Scanner.

## Web-Link
https://juvis-web.github.io/JUViS/

## Enthalten
- Anmeldung / Registrierung über Supabase Auth
- Rollenmodell `admin`, `leader`, `member`
- Mitgliederverwaltung
- Dienstplan
- Übungsplanung
- Bekleidung und Spinde
- Dokumenten-/Linkverzeichnis
- Kamera-QR-Scanner (HTTPS oder localhost erforderlich)
- SQL-Schema und Row Level Security (RLS)

## Noch erforderlich
Dieses Paket ist ein Projektgerüst, nicht bereits online gehostet. Es enthält keine Supabase-Zugangsdaten. Vor dem Einsatz müssen Supabase eingerichtet, die Policies geprüft und die Web-App gehostet werden.

## Einrichtung
1. Lege ein Projekt bei Supabase an.
2. Öffne den SQL Editor und führe `schema.sql` aus.
3. Kopiere Projekt-URL und den **anon/public key** in `config.js`.
4. Öffne `index.html` über einen lokalen Webserver oder hoste die Dateien über HTTPS. Kamera-Zugriff funktioniert nicht zuverlässig bei direktem `file://`-Öffnen.
5. Registriere das Konto einer verantwortlichen erwachsenen Person.
6. Weise diesem Konto über den Supabase SQL Editor die Admin-Rolle zu (siehe Kommentar am Ende von `schema.sql`).
7. Teste Berechtigungen mit separaten Konten und kontrolliere die RLS-Regeln vor echten Daten.

## Sicherheit / Datenschutz
- Niemals `service_role`-Keys im Browser verwenden.
- Keine echten personenbezogenen Daten vor Sicherheitsprüfung eingeben.
- Da Jugendfeuerwehrmitglieder minderjährig sein können, müssen verantwortliche Erwachsene die Datenschutz-, Einwilligungs-, Aufbewahrungs- und Zugriffsregeln prüfen.
- Die Beispielrichtlinien erlauben angemeldeten Nutzern das Lesen der Mitglieder- und Verwaltungslisten. Wenn das nicht gewünscht ist, Policies enger fassen.
- Der Datei-Upload ist noch nicht umgesetzt; das Verzeichnis speichert nur Titel, optionale URL und Beschreibung.
- QR-Scanner sucht nach einem vorhandenen QR-Code in der Bekleidungstabelle. Das Feld `qr_code` kann derzeit über die UI noch nicht befüllt werden; dafür ist eine Erweiterung nötig.

## Lokal testen
Für ein einfaches lokales Hosting z. B. im Projektordner:
`python -m http.server 8000`
Dann `http://localhost:8000` öffnen. Die Supabase-Daten müssen vorher konfiguriert sein.
