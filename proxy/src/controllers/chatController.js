import config from "../config/env.js";
function rewriteOrigin(url, origin) {
  if (!url || !origin) return url;
  try {
    const u = new URL(url);
    const o = new URL(origin);
    u.protocol = o.protocol;
    u.host = o.host;
    return u.toString();
  } catch {
    return url;
  }
}

import { appendMessage, getHistory } from "../services/chatMemory.service.js";
import { smartSearch } from "../services/courseSearch.service.js";
import { getUserInfo, getUserCourses } from "../services/moodle.service.js";
import { callOllamaStream } from "../services/ollama.service.js";
import { getCachedUser, setCachedUser } from "../services/userCache.service.js";

export async function handleChatStream(request, reply) {
  const { message, userId, chatId } = request.body;

  if (!message || !userId || !chatId) {
    reply.code(400);
    return { error: "Message, user ID, and chat ID are required" };
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

  const sessionId = chatId || `moodle-${userProfile.id}`;

  const history = getHistory(sessionId)
    .map(
      (turn) => `${turn.role === "user" ? "Student" : "Tutor"}: ${turn.content}`
    )
    .join("\n");

  const searchResult = await smartSearch(message, request.log);
  const clientOrigin = request.headers.origin || (request.headers.referer ? new URL(request.headers.referer).origin : "");
  const context = searchResult.found ? formatSearchResult(searchResult, clientOrigin) : "";

  // Build system prompt with Moodle context
  const systemPrompt = buildSystemPrompt(context, userProfile);
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
    }, sessionId);
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

function formatSearchResult(searchResult, clientOrigin) {
  const formatLink = (url, label) =>
    url ? `<a href="${url}" target="_blank">${label}</a>` : label;

  return `
  Kurs: ${formatLink(rewriteOrigin(searchResult.course.url, clientOrigin), searchResult.course.name)}
  
  Relevante Abschnitte:
  ${searchResult.section
    .map(
      (section) => `
    ### ${section.name}
    ${section.summary || ""}
    
    Materialien:
    ${section.modules
      .map((mod) => {
        const description = (mod.description || "").substring(0, 300);
        const moduleLink = formatLink(rewriteOrigin(mod.url, clientOrigin), "Zum Material");
        const fileLines =
          mod.files && mod.files.length
            ? `
      Dateien:
      ${mod.files
        .map((file) => {
          const fileLabel = file.filename || "Datei";
          return `
        * ${formatLink(rewriteOrigin(file.url, clientOrigin), fileLabel)}${
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

${context ? `Verf√ºgbare Kursinformationen:\n${context}` : ""}

### Antwortregeln:\n- Antworte kurz und eindeutig.\n- Verwende HTML-Links: <a href="URL" target="_blank">Text</a> (kein Markdown).\n- Wenn Kurs/Datei im Kontext vorhanden ist, GIB IMMER den direkten Link aus.\n- Keine generischen Hinweise wie "Ich habe keinen Zugriff" ñ du bekommst Links im Kontext.\n\n### Kontext (falls vorhanden):\n`;
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
