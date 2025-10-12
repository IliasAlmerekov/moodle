import config from "../config/env.js";
import { appendMessage, getHistory } from "../services/chatMemory.service.js";
import { smartSearch } from "../services/courseSearch.service.js";
import { getUserInfo, getUserCourses } from "../services/moodle.service.js";
import { callOllamaStream } from "../services/ollama.service.js";
import { getCachedUser, setCachedUser } from "../services/userCache.service.js";

export async function handleChatStream(request, reply) {
  const { message, userId } = request.body;

  if (!message || !userId) {
    reply.code(400);
    return { error: "Message and user ID are required" };
  }

  const numericUserId = Number(userId);
  if (!Number.isInteger(numericUserId) || numericUserId <= 0) {
    reply.code(400);
    return { error: "Invalid user ID" };
  }

  let userProfile = getCachedUser(numericUserId);
  if (!userProfile) {
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
        courses: courses.map((course) => ({
          id: course.id,
          fullname: course.fullname,
          shortname: course.shortname,
        })),
      };

      setCachedUser(numericUserId, userProfile);
    } catch (error) {
      request.log.error({ error }, "Failed to resolve Moodle user");
      reply.code(502);
      return { error: "Failed to fetch user data from Moodle" };
    }
  }

  const sessionId = `moodle-${userProfile.id}`;

  const history = getHistory(sessionId)
    .map(
      (turn) => `${turn.role === "user" ? "Student" : "Tutor"}: ${turn.content}`
    )
    .join("\n");

  const searchResult = await smartSearch(message, request.log);
  const context = searchResult.found ? formatSearchResult(searchResult) : "";

  // Build system prompt with Moodle context
  const systemPrompt = await buildSystemPrompt(context, userProfile);
  const fullPrompt = `${systemPrompt}\n\n${history}\nStudent: ${message}`;

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
    await streamOllamaResponse(ollamaStream, reply, request.log, (chunk) => {
      assistantReply += chunk;
    });
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
  return `
  Kurs: ${searchResult.course.name}
  Link: ${searchResult.course.url}
  
  Relelvant Abschnitte:
  ${searchResult.section
    .map(
      (section) => `
    ### ${section.name}
    ${section.summary}
    
    Materialen:
    ${section.modules
      .map(
        (mod) => `
      - ${mod.name} (${mod.type})
      ${mod.description.substring(0, 300)}
      Link: ${mod.url}
      `
      )
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

  Benutzer:
  - Name: ${user.fullname || "Student"}
  - E-Mail: ${user.email || "Nicht verfügbar"}
  - Eingeschriebene Kurse: ${courseLines || "- (keine Daten)"}

  Verfügbare Kursinformationen:
  ${context || "- (keine relevanten Kursinformationen gefunden)"}

### Deine Rolle und Aufgaben:
- Du unterstützt ${user.fullname} beim Verständnis von Kursmaterialien und Aufgaben
- Bei Begrüßung nutze den Namen des Benutzers, z.B. "Hallo ${user.fullname}, wie kann ich dir helfen?"
- Hilf bei Lernstrategien und Zeitmanagement
- Beantworte Fragen zu Kursthemen basierend auf den verfügbaren Kursmaterialien

### Kommunikationsstil:
- Sei professionell und freundlich
- Erkläre klar und verständlich
- Sei ermutigend und motivierend
- Zeige, dass du den Benutzerkontext kennst (Kurse)
- Nutze Markdown-Links wenn hilfreich: [Linktext](URL)
- Verlinke auf relevante Moodle-Kurse oder externe Lernressourcen

### Datenschutz und Einschränkungen:
- Du hast KEINEN Zugriff auf:
  - Noten und Bewertungen
  - Persönliche Daten anderer Studierender
  - Administrative Systeminformationen
  - Prüfungslösungen und Musterlösungen
- Bei Fragen zu sensiblen Daten verweise auf die zuständigen Dozierenden

### Beispiel-Antworten:
Wenn du auf einen Kurs verweist, nutze <a href="URL">Kursname</a> tag."

### Antwortformat:
1. Verstehe die Frage im Kontext von Kursen
2. Beziehe dich auf relevante Kursmaterialien
3. Gib klare, strukturierte Erklärungen
4. Nutze Beispiele zur Veranschaulichung
5. Ermutige zu eigenständigem Denken

### Sicherheitsrichtlinien:
- Keine Weitergabe von Login-Daten oder Zugangscodes
- Keine Hilfe bei der Umgehung von Moodle-Sicherheitsmaßnahmen
- Keine Unterstützung bei unethischem Verhalten
- Bei Sicherheitsbedenken auf Moodle-Support verweisen`;
}

// stream response from Ollama to client
async function streamOllamaResponse(stream, reply, logger, onChunk) {
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
            `data: ${JSON.stringify({ text: json.response })}\n\n`
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
