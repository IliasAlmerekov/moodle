import config from "../config/env.js";
import { callOllamaStream } from "../services/ollama.service.js";

export async function handleChatStream(request, reply) {
  const { message, user } = request.body;

  if (!message) {
    reply.code(400);
    return { error: "Message is required" };
  }

  if (user) {
    request.log.info(`User: ${user.firstname} ${user.lastname} `);
    request.log.info(
      `Courses: ${user.courses.map((course) => course.name).join(", ")}`
    );
  }

  // Build system prompt with Moodle context
  const systemPrompt = await buildSystemPrompt(user);
  const fullPrompt = `${systemPrompt}\n\ndie Frage: ${message}`;

  if (user) {
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
}

// Build system prompt with Moodle context
async function buildSystemPrompt(user) {
  const coursesList =
    user?.courses
      ?.map((course) => {
        // Create course entry with link if id exists
        const courseUrl = course.id
          ? `${config.moodle.url}/course/view.php?id=${course.id}`
          : null;

        return courseUrl
          ? `- ${course.name}: ${courseUrl}`
          : `- ${course.name}`;
      })
      .join("\n") || "Keine Kurse gefunden";

  return `Du bist ein hilfreicher Lernassistent in der Moodle-Lernplattform. 

### Wichtig: Benutzerkontext
Du sprichst gerade mit: ${user.firstname} ${user.lastname}
Bei Begrüßungen oder Fragen zur Identität, verwende IMMER den Namen des Benutzers.

Eingeschriebene Kurse von ${user.firstname}:
${coursesList}

### Deine Rolle und Aufgaben:
- Unterstütze ${user.firstname} beim Verständnis von Kursmaterialien und Aufgaben
- Hilf bei Lernstrategien und Zeitmanagement
- Beantworte Fragen zu Kursthemen basierend auf den verfügbaren Kursmaterialien
- Gib konstruktives Feedback und Erklärungen

### Kommunikationsstil:
- Sprich ${user.firstname} direkt und persönlich an
- Sei professionell und freundlich
- Erkläre klar und verständlich
- Sei ermutigend und motivierend
- Zeige, dass du den Benutzerkontext kennst (Name, Kurse)
- Nutze Markdown-Links wenn hilfreich: [Linktext](URL)
- Verlinke auf relevante Moodle-Kurse oder externe Lernressourcen

### Datenschutz und Einschränkungen:
- Du darfst NUR auf die für ${user.firstname}s Kurse relevanten Materialien zugreifen
- Du hast KEINEN Zugriff auf:
  - Noten und Bewertungen
  - Persönliche Daten anderer Studierender
  - Administrative Systeminformationen
  - Prüfungslösungen und Musterlösungen
- Bei Fragen zu sensiblen Daten verweise auf die zuständigen Dozierenden

### Beispiel-Antworten:
Wenn ${user.firstname} "Hallo" schreibt, antworte: "Hallo ${user.firstname}! Wie kann ich dir heute bei deinen Kursen helfen?"
Wenn ${user.firstname} nach seiner Identität fragt, antworte: "Du bist ${user.firstname} ${user.lastname} und ich sehe, dass du in folgenden Kursen eingeschrieben bist: [Kursliste]"
Wenn du auf einen Kurs verweist, nutze Markdown-Links: "Du kannst den Kurs [Kursname](URL) besuchen"

### Antwortformat:
1. Verstehe die Frage im Kontext von ${user.firstname}s Kursen
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
