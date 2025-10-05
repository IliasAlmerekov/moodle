# Copilot Instructions

## Project Context

This is a Moodle + Ollama AI assistant project running on Raspberry Pi 5 with Docker.

**Current Stack:**

- **Moodle**: Running in Docker (port 8080), German localization configured
- **MariaDB**: Database backend
- **Fastify Proxy**: Node.js service that bridges Moodle and Ollama
- **Ollama**: LLM server running on external Windows laptop (192.168.178.35)

**Project Structure:**

- `compose/docker-compose.yml` - Docker services configuration
- `proxy/src/server.mjs` - Fastify proxy server (basic routes implemented)
- `data/` - Persistent data volumes

## Current State

✅ Docker stack is running  
✅ Moodle is configured with webservice tokens  
✅ Fastify proxy has health checks and placeholder routes  
⏳ **Next Goal**: Integrate Ollama for AI chat functionality

## Coding Guidelines

### SOLID Principles (Keep It Simple)

- **Single Responsibility**: One function = one clear purpose
- **Open/Closed**: Use configuration (env vars) for extensibility
- **Liskov Substitution**: Not critical for this project yet
- **Interface Segregation**: Keep route handlers focused and small
- **Dependency Inversion**: Inject dependencies (URLs, tokens) via config

### KISS (Keep It Simple, Stupid)

- Write clear, readable code - you're a beginner with Fastify and Ollama
- Prefer small functions over large ones
- Avoid over-engineering - solve the current problem first
- Use descriptive variable names
- Add comments for complex logic only

### Fastify Best Practices

- Use async/await (already doing this ✓)
- Validate request bodies with schemas when needed
- Use `fastify.log` for logging (already doing this ✓)
- Keep route handlers thin - extract business logic to separate functions
- Handle errors gracefully with proper status codes

### Ollama Integration Focus

- Use the `/api/generate` or `/api/chat` endpoints from Ollama
- Stream responses when possible for better UX
- Handle connection failures gracefully (Ollama might be offline)
- Keep the model name configurable (OLLAMA_MODEL env var)

## Current Implementation Notes

- Environment variables are already set up in `.env`
- Health check route at `/health` confirms config
- Placeholder `/api/chat` route needs Ollama integration
- `/ollama/models` route already fetches available models from Ollama

## Next Steps

1. Implement actual Ollama chat logic in `/api/chat` route
2. Add request/response streaming for better performance
3. Optionally integrate Moodle context (fetch course data, user info) to enhance AI responses
4. Add error handling for when Ollama is unavailable

## Example Code Style

```javascript
// Good: Simple, focused function
async function callOllama(prompt, model) {
  const response = await fetch(`${ollamaBaseUrl}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, prompt }),
  });
  return response.json();
}

// Bad: Doing too much in one function
async function doEverything(data) {
  // validates, calls API, transforms, logs, etc.
}
```

**Remember**: You're learning. Keep code simple and understandable!
