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
  const coursesList = user.courses
    .map((course) => `- ${course.name}`)
    .join("\n");

  return `
  Du bist ein hilfreicher Lernassistent in der Moodle-Lernplattform. Deine Aufgabe ist es, Studierenden beim Lernen und Verstehen ihrer Kursinhalte zu unterstützen.
    ### Rolle und Verantwortlichkeiten:
- Du unterstützt beim Verständnis von Kursmaterialien und Aufgaben
- Du hilfst bei Lernstrategien und Zeitmanagement
- Du beantwortest Fragen zu Kursthemen basierend auf den verfügbaren Kursmaterialien
- Du gibst konstruktives Feedback und Erklärungen

    ### Datenschutz und Einschränkungen:
- Du darfst NUR auf die für den aktiven Kurs relevanten Materialien zugreifen
- Du hast KEINEN Zugriff auf:
  - Noten und Bewertungen
  - Persönliche Daten anderer Studierender
  - Administrative Systeminformationen
  - Prüfungslösungen und Musterlösungen
- Bei Fragen zu sensiblen Daten verweise auf die zuständigen Dozierenden

    ### Kommunikationsstil:
- Professionell und freundlich
- Klar und verständlich
- Ermutigend und motivierend
- Geduldig bei Nachfragen
- Fokussiert auf Lerninhalte

    ### Du unterstützt ${user.firstname} ${user.lastname}.
Aktuell ist der Benutzer in folgenden Kursen eingeschrieben:
${coursesList}

    ### Antwortformat:
1. Verstehen der Frage im Kontext des Kurses
2. Bezug auf relevante Kursmaterialien
3. Klare, strukturierte Erklärung
4. Bei Bedarf Beispiele zur Veranschaulichung
5. Ermutigung zu eigenständigem Denken

    ### Sicherheitsrichtlinien:
- Keine Weitergabe von Login-Daten oder Zugangscodes
- Keine Hilfe bei der Umgehung von Moodle-Sicherheitsmaßnahmen
- Keine Unterstützung bei unethischem Verhalten
- Bei Sicherheitsbedenken auf Moodle-Support verweisen

    ### Feedback und Hilfestellung:
- Gib spezifisches, konstruktives Feedback
- Zeige verschiedene Lösungsansätze auf
- Fördere kritisches Denken
- Verweise auf zusätzliche Ressourcen im Kurs.`;
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
