import config from "../config/env.js";
import { appendMessage, getHistory } from "../services/chatMemory.service.js";
import { smartSearch } from "../services/courseSearch.service.js";
import { getUserInfo, getUserCourses } from "../services/moodle.service.js";
import { callOllamaStream } from "../services/ollama.service.js";
import { getCachedUser, setCachedUser } from "../services/userCache.service.js";

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

  return `
  Kurs: ${formatLink(
    searchResult.course.url,
    searchResult.course.name
  )}\n\nKurzinfo: ${
    searchResult.course.summary
      ? searchResult.course.summary.substring(0, 400)
      : ""
  }\n\nRelevante Abschnitte:
  ${searchResult.section
    .map(
      (section) => `
    ### ${section.name}
    ${section.summary || ""}
    
    Materialien:
    ${section.modules
      .map((mod) => {
        const description = (mod.description || "").substring(0, 300);
        const moduleLink = formatLink(mod.url, "Zum Material");
        const fileLines =
          mod.files && mod.files.length
            ? `
      Dateien:
      ${mod.files
        .map((file) => {
          const fileLabel = file.filename || "Datei";
          return `
        * ${formatLink(file.url, fileLabel)}${
            file.mimetype ? ` (${file.mimetype})` : ""
          }
        `;
        })
        .join("\n")}
      `
            : "";

        return `
      - ${mod.name} (${mod.type})
      ${description}
      ${moduleLink}
      ${fileLines}
      `;
      })
      .join("\n")}
    `
    )
    .join("\n")}
  `;
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
✅ Wenn du Links teilst, nutze das vorgegebene HTML-Format
✅ Wenn ${
    user.fullname
  } einen url Link fragt, prüfe bitte den Link, ob es richtig ist bevor du antwortest.

### KRITISCH - Links Format:
🔗 WICHTIG: Schreibe HTML-Links KOMPLETT und KORREKT!
🔗 Format: <a href="VOLLSTÄNDIGE_URL" target="_blank">Linktext</a>
🔗 Beispiel richtig: <a href="https://docs.docker.com" target="_blank">Docker Docs</a>
🔗 Beispiel FALSCH: href="..." target="_blank">text</a> (fehlt <a am Anfang!)
🔗 NIEMALS Markdown-Links wie [text](url) verwenden!
🔗 Stelle sicher dass JEDER Link mit <a href= beginnt und mit </a> endet!

### Beispiel gute Antwort:
"Hallo ${user.fullname}! 👋

• Docker ist eine Container-Plattform
• Ermöglicht isolierte Anwendungen
• Leicht und portabel

📚 Mehr Infos: <a href="https://docs.docker.com" target="_blank">Docker Dokumentation</a>"

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
