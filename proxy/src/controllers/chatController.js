import config from "../config/env.js";
import { appendMessage, getHistory } from "../services/chatMemory.service.js";
import { smartSearch } from "../services/courseSearch.service.js";
import { getUserInfo, getUserCourses } from "../services/moodle.service.js";
import { callOllamaStream } from "../services/ollama.service.js";
import { getCachedUser, setCachedUser } from "../services/userCache.service.js";

const API_BASE_URL = "http://192.168.178.49"; // ip raspi

export async function handleChatStream(request, reply) {
  const { message, userId, chatId } = request.body || {};

  if (!message) {
    reply.code(400);
    return { error: "Message is required" };
  }

  const numericUserId = Number(userId);
  const validUserId = Number.isInteger(numericUserId) && numericUserId > 0;

  let userProfile = validUserId ? getCachedUser(numericUserId) : null;
  if (!userProfile && validUserId) {
    try {
      const [info, courses] = await Promise.all([
        getUserInfo(numericUserId),
        getUserCourses(numericUserId),
      ]);

      userProfile = {
        id: info.id,
        firstname: info.firstname,
        lastname: info.lastname,
        fullname: `${info.firstname} ${info.lastname}`.trim(),
        email: info.email,
        courses: (courses || []).map((course) => ({
          id: course.id,
          fullname: course.fullname,
          shortname: course.shortname,
        })),
      };

      setCachedUser(numericUserId, userProfile);
    } catch (error) {
      request.log.warn(
        { error },
        "Proceeding without user profile (Moodle fetch failed)"
      );
    }
  }

  if (!userProfile) {
    userProfile = {
      id: validUserId ? numericUserId : 0,
      firstname: "",
      lastname: "",
      fullname: "Student",
      email: "",
      courses: [],
    };
  }

  const sessionId = chatId || `moodle-${userProfile.id || 0}`;

  const history = getHistory(sessionId)
    .map(
      (turn) => `${turn.role === "user" ? "Student" : "Tutor"}: ${turn.content}`
    )
    .join("\n");

  const searchResult = await smartSearch(message, request.log);
  const context = searchResult.found ? formatSearchResult(searchResult) : "";

  // Log URLs being passed to AI for debugging
  if (searchResult.found) {
    request.log.info(
      {
        courseUrl: searchResult.course.url,
        sampleModuleUrls:
          searchResult.section[0]?.modules?.slice(0, 2).map((m) => m.url) || [],
        sampleFileUrls:
          searchResult.section[0]?.modules?.[0]?.files
            ?.slice(0, 2)
            .map((f) => f.url) || [],
      },
      "URLs being passed to AI"
    );
  }

  // Build system prompt with Moodle context
  const systemPrompt = buildSystemPrompt(context, userProfile);
  const fullPrompt = `${systemPrompt}\n\n${history}\ndie Frage von ${userProfile.fullname}: ${message}`;

  appendMessage(sessionId, "user", message);

  try {
    let assistantReply = "";
    const ollamaStream = await callOllamaStream(
      fullPrompt,
      config.ollama.model
    );

    // Set streaming headers
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });

    // Stream response to client
    await streamOllamaResponse(
      ollamaStream,
      reply,
      request.log,
      (chunk) => {
        assistantReply += chunk;
      },
      sessionId
    );
    appendMessage(sessionId, "assistant", assistantReply);
  } catch (error) {
    request.log.error(
      { error },
      "Failed to get streaming response from Ollama"
    );

    if (!reply.sent) {
      reply.code(502);
      return {
        error: "Unable to reach AI service",
        detail: error.message,
      };
    }
  }
}

function formatSearchResult(searchResult) {
  const formatLink = (url, label) =>
    url ? `<a href="${url}" target="_blank">${label}</a>` : label;

  // Build structured context with EXACT URLs for AI
  let context = `\n🎓 KURS: ${searchResult.course.name}\n`;
  context += `📎 KURS-URL: ${searchResult.course.url}\n`;
  context += `📖 Beschreibung: ${
    searchResult.course.summary
      ? searchResult.course.summary.substring(0, 400)
      : "Keine Beschreibung"
  }\n\n`;

  context += `📚 RELEVANTE ABSCHNITTE:\n\n`;

  searchResult.section.forEach((section, idx) => {
    context += `${idx + 1}. Abschnitt: ${section.name}\n`;
    if (section.summary) {
      context += `   Zusammenfassung: ${section.summary.substring(0, 200)}\n`;
    }

    if (section.modules && section.modules.length > 0) {
      context += `   \n   📝 Materialien:\n`;

      section.modules.forEach((mod, modIdx) => {
        context += `   ${modIdx + 1}. ${mod.name} (${mod.type})\n`;

        if (mod.url) {
          context += `      🔗 MODUL-URL: ${mod.url}\n`;
        }

        if (mod.description) {
          context += `      Beschreibung: ${mod.description.substring(
            0,
            200
          )}\n`;
        }

        if (mod.files && mod.files.length > 0) {
          context += `      \n      📎 Dateien:\n`;
          mod.files.forEach((file, fileIdx) => {
            context += `      ${fileIdx + 1}. ${file.filename}${
              file.mimetype ? ` (${file.mimetype})` : ""
            }\n`;
            context += `         📥 DATEI-URL: ${file.url}\n`;
          });
        }
        context += `\n`;
      });
    }
    context += `\n`;
  });

  return context;
}

// Build system prompt with Moodle context
function buildSystemPrompt(context, user) {
  const courseLines = (user.courses ?? [])
    .map((course) => `- ${course.fullname}`)
    .join("\n");

  return `Du bist ein hilfreicher Lernassistent in der Moodle-Lernplattform. 

Benutzer: ${user.fullname || "Student"} | Kurse: ${courseLines || "keine"}

${context ? `Verfügbare Kursinformationen:\n${context}` : ""}

### WICHTIG - Antwortformat:
✅ Antworte in der SPRACHE der FRAGE, wenn die letzte Nachricht in einer bestimmtem Sprache ist (DE, EN, RU); 
✅ Beziehe dich NUR auf Moodle-Kursinhalte, antworte NICHT wenn dich die Antwort nicht auf Kursinhalte oder über Moodle bezieht
✅ Wenn du die Antwort nicht kennst, sage "Das weiß ich leider nicht."
✅ Nutze Bullet Points (•, -, *) für Listen
✅ Maximal 6-8 Stichpunkte pro Antwort
✅ Vermeide lange Texte und Absätze, wenn es nicht nötig ist
✅ Verwende EINFACHE SPRACHE, erkläre komplexe Begriffe
✅ Nutze ALLGEMEINWISSEN nur zur Erklärung von Konzepten
✅ Vermeide Fachjargon und erkläre Abkürzungen

### ⚠️ KRITISCH - URL-VERWENDUNG:
🚨 NIEMALS SELBST URLs ERFINDEN ODER KONSTRUIEREN!
🚨 Verwende NUR die URLs aus den "Verfügbare Kursinformationen" oben!
🚨 Wenn im Context eine "KURS-URL", "MODUL-URL" oder "DATEI-URL" steht, kopiere diese EXAKT!
🚨 URLs haben das Format: ${API_BASE_URL}/...
🚨 NIEMALS URLs mit http://localhost oder anderen Adressen generieren!

### KRITISCH - Links Format:
🔗 Format: <a href="VOLLSTÄNDIGE_URL_AUS_CONTEXT" target="_blank">Linktext</a>
🔗 Beispiel richtig: <a href="${API_BASE_URL}:8080/course/view.php?id=5" target="_blank">Zum Kurs</a>
🔗 Beispiel FALSCH: href="..." target="_blank">text</a> (fehlt <a am Anfang!)
🔗 Beispiel FALSCH: <a href="http://localhost:8080/..." (falsche Basis-URL!)
🔗 NIEMALS Markdown-Links wie [text](url) verwenden!
🔗 Stelle sicher dass JEDER Link mit <a href= beginnt und mit </a> endet!

### Beispiel gute Antwort (mit Moodle-Link):
"Hallo ${user.fullname}! 👋

Zu deiner Frage über Docker:

• Docker ist eine Container-Plattform
• Ermöglicht isolierte Anwendungen
• Leicht und portabel

📚 Kursmaterial: <a href="${API_BASE_URL}:8080/course/view.php?id=5" target="_blank">Zum Kurs LF 07</a>

📄 Datei: <a href="${API_BASE_URL}:8080/pluginfile.php/123/mod_resource/content/1/docker-intro.pdf" target="_blank">Docker Einführung PDF</a>"

### Deine Aufgaben:
• Unterstütze beim Verstehen von Kursmaterialien
• Hilf bei Lernstrategien
• Beantworte Fragen klar und prägnant
• Nutze den Benutzerkontext (Name, Kurse)

### Was du NICHT darfst:
• Noten oder Bewertungen anzeigen
• Prüfungslösungen verraten
• Administrative Daten teilen

Antworte jetzt klar und mit klickbaren HTML-Links!`;
}

// stream response from Ollama to client
async function streamOllamaResponse(stream, reply, logger, onChunk, sessionId) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      reply.raw.write("data: [DONE]\n\n");
      reply.raw.end();
      break;
    }

    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split("\n").filter((line) => line.trim());

    for (const line of lines) {
      try {
        const json = JSON.parse(line);

        if (json && json.response) {
          onChunk?.(json.response);
          reply.raw.write(
            `data: ${JSON.stringify({ text: json.response, sessionId })}\n\n`
          );
        }

        if (json && json.done) {
          reply.raw.write("data: [DONE]\n\n");
          reply.raw.end();
          return;
        }
      } catch (e) {
        logger.warn(`Failed to parse chunk: ${line}`);
      }
    }
  }
}
