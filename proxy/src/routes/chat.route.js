import config from "../config/env.js";
import { getUserCourses, getUserInfo } from "../services/moodle.service.js";
import { callOllama, callOllamaStream } from "../services/ollama.service.js";

/**
 * @param {import('fastify').FastifyInstance} fastify
 */
export default async function chatRoutes(fastify) {
  // endpoint for non-streaming response
  fastify.post("/api/chat", async (request, reply) => {
    const { message } = request.body;

    if (!message) {
      reply.code(400);
      return { error: "Message is required" };
    }

    fastify.log.info(`Received message: ${message}`);

    try {
      const aiResponse = await callOllama(message, config.ollamaModel);
      return { reply: aiResponse };
    } catch (error) {
      // log error
      request.log.error({ error: error }, "Failed to get response from Ollama");

      // return a 502 Bad Gateway error
      reply.code(502);
      return {
        error: "Unable to reach AI service",
        details: error.message,
      };
    }
  });

  // endpoint for streaming response
  fastify.post("/api/chat-stream", async (request, reply) => {
    const { message, userId } = request.body;

    if (!message) {
      reply.code(400);
      return { error: "Message is required" };
    }

    fastify.log.info(
      `Received streaming message: ${message}, userId: ${userId}`
    );

    let systemPrompt =
    `Du bist ein hilfreicher Lernassistent in der Moodle-Lernplattform. Deine Aufgabe ist es, Studierenden beim Lernen und Verstehen ihrer Kursinhalte zu unterstützen.

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
- Verweise auf zusätzliche Ressourcen im Kurs`;

    if (userId) {
      try {
        fastify.log.info(`Fetching user info for userId: ${userId}`);

        // get info about user from moodle
        const userInfo = await getUserInfo(userId);
        fastify.log.info(`User: ${user.firstname} ${user.lastname}`);

        // get user courser
        const userCourses = await getUserCourses(userId);
        fastify.log.info(`Found ${userCourses.length} courses`);

        // context for ai
        const coursesList = userCourses
          .map((course) => `- ${course.fullname}`)
          .join("\n");

        systemPrompt = `You support ${userInfo.firstname} ${userInfo.lastname}.
        Currently, the user is enrolled in the following courses:
        ${coursesList}

        Answer the in German language if user ask in German, but you support all languages. Also support user with questions about learn fields on Moodle.
        `;

        fastify.log.info("Moodle context added to prompt");
      } catch (error) {
        fastify.log.warn(`Could not fetch Moodle context: ${error.message}`);
      }
    } else {
      fastify.log.info("No userId provided, using default system prompt");
    }

    const fullPrompt = `${systemPrompt}\n\nQuestion: ${message}`;

    try {
      // call ollama to get a response stream
      const ollamaStream = await callOllamaStream(
        fullPrompt,
        config.ollama.model
      );

      // set headers for streaming response
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
        // CORS headers - must be added manually for raw responses
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      });

      // create a reader to read the stream
      const reader = ollamaStream.getReader();
      const decoder = new TextDecoder();

      // function to read the stream
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          reply.raw.write("data: [DONE]\n\n");
          reply.raw.end();
          break;
        }

        // decode the chunk and send it to the client
        const chunk = decoder.decode(value, { stream: true });

        // chunk may contain multiple lines, split and send each line
        const lines = chunk.split("\n").filter((line) => line.trim());

        for (const line of lines) {
          try {
            const json = JSON.parse(line);

            // send each line as a separate event
            if (json && json.response) {
              reply.raw.write(
                `data: ${JSON.stringify({ text: json.response })}\n\n`
              );
            }

            // if generation is done, send [DONE] event
            if (json && json.done) {
              reply.raw.write("data: [DONE]\n\n");
              reply.raw.end();
              return;
            }
          } catch (e) {
            fastify.log.warn(`Failed to parse chunk: ${line}`);
            // ignore JSON parse errors for individual lines
          }
        }
      }
    } catch (error) {
      request.log.error(
        { error: error },
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
  });
}
