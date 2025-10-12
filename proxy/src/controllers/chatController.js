import config from "../config/env.js";
import { callOllamaStream } from "../services/ollama.service.js";
import { smartSearch } from "../services/courseSearch.service.js";
import { getUserInfo, getUserCourses } from "../services/moodle.service.js";

export async function handleChatStream(request, reply) {
  const { message, user } = request.body;

  if (!message) {
    reply.code(400);
    return { error: "Message is required" };
  }

  if (user) {
    request.log.info(`Chat request from user ID: ${user.id}`);
  }

  // Build system prompt with Moodle context
  const systemPrompt = await buildSystemPrompt(user?.id || null);
  const fullPrompt = `${systemPrompt}\n\nFrage des Stedentes: ${message}`;

  try {
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
    await streamOllamaResponse(ollamaStream, reply, request.log);
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

// Build system prompt with Moodle context
async function buildSystemPrompt(userId) {
  // Default values if user not logged in
  let userName = "Student";
  let fullName = "Student";
  let coursesList = "Keine Kursinformationen verfügbar.";

  if (userId) {
    try {
      // Fetch user info and courses from Moodle API using admin token
      const userInfo = await getUserInfo(userId);
      const courses = await getUserCourses(userId);

      userName = userInfo.firstname || "Student";
      fullName = `${userInfo.firstname} ${userInfo.lastname}` || "Student";
      coursesList = courses.length
        ? courses.map((course) => `- ${course.fullname}`).join("\n")
        : "Keine Kurse gefunden.";
    } catch (error) {
      console.error(
        `Failed to get user info or courses for user ${userId}:`,
        error
      );
    }
  }

  return `Du bist ein hilfreicher Lernassistent in der Moodle-Lernplattform. 

### Deine Rolle und Aufgaben:
- Du unterstützt ${fullName} beim Verständnis von Kursmaterialien und Aufgaben
- Bei Begrüßung nutze den Namen des Benutzers, z.B. "Hallo ${userName}, wie kann ich dir helfen?"
- Hilf bei Lernstrategien und Zeitmanagement
- Beantworte Fragen zu Kursthemen basierend auf den verfügbaren Kursmaterialien

Eingeschriebene Kurse von ${userName}:
${coursesList}

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
async function streamOllamaResponse(ollamaStream, reply, logger) {
  const reader = ollamaStream.getReader();
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
