# Technische Anforderungen
## 1. Systemarchitektur
### Hardware-Anforderungen
- Raspberry Pi 5 
- Mindestens 4GB RAM
- Stabile Netzwerkverbindung
- Windows 11 Laptop für Ollama-Server
### Software-Stack
- Raspberry Pi OS 64-bit
- Docker & Docker Compose v2
- Portainer für Container-Management
- MariaDB als Datenbank
- Moodle LMS
- Fastify-basierter Proxy-Server
- Ollama_gemma3 LLM-Server
## 2. User Stories
### Als Student möchte ich...
- einen KI-Lernassistenten direkt in Moodle nutzen können
- schnell relevante Lerninhalte finden und verstehen
- Unterstützung bei Verständnisproblemen erhalten
- mehrsprachige Erklärungen bekommen (DE/EN)
- klare Lernziele erkennen und verfolgen können
### Als Lehrkraft möchte ich...
- weniger Zeit mit der Beantwortung wiederkehrender Fragen verbringen
- automatisierte Unterstützung bei Routineaufgaben erhalten
- mehr Zeit für individuelle Betreuung haben
- die Qualität der KI-Antworten überwachen können
- Einblick in den Lernfortschritt der Schüler haben
## 3. Funktionale Anforderungen
### Moodle-Integration
- Nahtlose Einbettung in die Moodle-Oberfläche
- Nutzung der Moodle-Authentifizierung
- Zugriff auf Kurs- und Benutzerdaten über Webservice-API
- Rollenbasierte Zugriffssteuerung
### KI-Funktionalitäten
- Echtzeit-Chat-Interface
- Kontextbewusstes Antwortverhalten
- Streaming von KI-Antworten für bessere UX
- Unterstützung verschiedener Sprachen
- Verarbeitung von Dokumenten und Kursinhalten
### Proxy-Server
- RESTful API-Endpunkte
- Effiziente Kommunikation zwischen Moodle und Ollama
- Fehlerbehandlung und Logging
- Skalierbarkeit und Performance-Monitoring
## 4. Use Cases
### UC1: KI-gestützte Lernunterstützung
**Akteur:** Student
**Beschreibung:** Student stellt Frage zu Lerninhalten
1. Student öffnet Chat-Interface in Moodle
2. System lädt Kontext (Kurs, Materialien)
3. Student formuliert Frage
4. System generiert kontextbezogene Antwort
5. Student erhält Echtzeit-Feedback
### UC2: Automatisierte Lehrerassistenz
**Akteur:** Lehrkraft
**Beschreibung:** KI unterstützt bei Routineaufgaben
1. System erkennt häufig gestellte Fragen
2. KI beantwortet Standardfragen automatisch
3. Lehrkraft erhält Überblick über KI-Interaktionen
4. System lernt aus Feedback und verbessert Antworten
### UC3: Mehrsprachige Unterstützung
**Akteur:** Student (nicht-muttersprachlich)
**Beschreibung:** Zugriff auf mehrsprachige Erklärungen
1. Student wählt bevorzugte Sprache
2. System übersetzt Erklärungen automatisch
3. KI passt Sprachniveau an
4. Student erhält verständliche Erklärungen
## 5. Entwicklungsphasen
### Phase 1 (MVP)
- Grundlegende Moodle-Integration
- Basis-Chat-Funktionalität
- Einfache Kontextberücksichtigung
- Bessere Prompt schreiben 
### Phase 2
- Erweiterte Lehrerassistenz
- Verbessertes Antwortverhalten
- Performance-Optimierungen
### Phase 3
- Adaptive Lernunterstützung
- Erweiterte Analysen
- Mehrsprachige Funktionen
