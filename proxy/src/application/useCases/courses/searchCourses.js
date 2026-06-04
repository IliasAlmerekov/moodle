import { STOP_WORDS, MAX_SECTIONS_IN_RESPONSE } from "../../../config/constants.js";

export function normalize(text) {
  return (text || "").toLowerCase().trim();
}

export function tokenize(text) {
  return text
    .split(/\s+/)
    .map((part) => normalize(part))
    .filter((part) => (part.length >= 2 || /^\d+$/.test(part)) && !STOP_WORDS.has(part));
}

export function pickRelevantSections(course, tokens) {
  const ids = new Set();
  for (const section of course.sections ?? []) {
    const sectionText = normalize(`${section.name ?? ""} ${section.summary ?? ""}`);
    const sectionMatch = tokens.some((t) => sectionText.includes(t));
    const moduleMatch = section.modules?.some((mod) => {
      const moduleText = normalize(`${mod.name ?? ""} ${mod.summary ?? ""} ${mod.description ?? ""}`);
      const nameMatch = tokens.some((t) => moduleText.includes(t));
      const fileMatch = mod.files?.some((file) =>
        tokens.some((t) => normalize(`${file.filename ?? ""} ${file.path ?? ""}`).includes(t)),
      );
      return nameMatch || fileMatch;
    });
    if (sectionMatch || moduleMatch) ids.add(section.id);
  }
  return ids;
}

function isCheckpointQuery(tokens) {
  return tokens.some((token) =>
    ["checkpoint", "checkpoints", "abgabe", "abgeben", "submit", "submission"].includes(token),
  );
}

function scoreCheckpointText(text, tokens) {
  if (!isCheckpointQuery(tokens) || !text.includes("checkpoint")) return 0;

  let score = 35;
  const requestedNumbers = tokens.filter((token) => /^\d+$/.test(token));
  if (requestedNumbers.some((number) => text.includes(number))) score += 45;
  if (
    text.includes("problem definition") ||
    text.includes("team organization") ||
    text.includes("ideate") ||
    text.includes("implementation") ||
    text.includes("abgabe") ||
    text.includes("submit") ||
    text.includes("submission")
  ) {
    score += 20;
  }
  return score;
}

function scoreCheckpointSprint(text, tokens) {
  if (!isCheckpointQuery(tokens)) return 0;

  const requestedNumbers = tokens.filter((token) => /^\d+$/.test(token));
  if (requestedNumbers.some((number) => text.includes(`sprint ${number}`))) return 250;
  return 0;
}

// Private: score a single section by token hits (used for sorting)
function scoreSection(section, tokens) {
  try {
    let s = 0;
    const secName = normalize(section.name ?? "");
    const secSummary = normalize(section.summary ?? "");
    s += scoreCheckpointSprint(`${secName} ${secSummary}`, tokens);
    for (const t of tokens) {
      if (t && secName.includes(t)) s += 5;
      if (t && secSummary.includes(t)) s += 3;
    }
    for (const mod of section.modules ?? []) {
      const mname = normalize(mod.name ?? "");
      const msummary = normalize(`${mod.summary ?? ""} ${mod.description ?? ""}`);
      for (const t of tokens) {
        if (t && mname.includes(t)) s += 8;
        if (t && msummary.includes(t)) s += 6;
      }
      for (const f of mod.files ?? []) {
        const fname = normalize(`${f.filename ?? ""} ${f.path ?? ""}`);
        for (const t of tokens) if (t && fname.includes(t)) s += 12;
      }
    }
    return s;
  } catch {
    return 0;
  }
}

export function scoreCourse(course, tokens, phrases) {
  const name = normalize(course.name ?? "");
  const shortname = normalize(course.shortname ?? "");
  let score = 0;
  let tokenMatches = 0;

  for (const ph of phrases) {
    if (ph && (name.includes(ph) || shortname.includes(ph))) {
      score += 200 + ph.length;
    }
  }

  for (const t of tokens) {
    if (name.includes(t) || shortname.includes(t)) {
      tokenMatches++;
      score += 20;
    }
    if (t === "lf" && shortname.includes("lf")) score += 15;
    if (/^\d+$/.test(t) && shortname.includes(t)) score += 25;
  }

  // Boost bilingual Hackathon courses when "bili" is in the query
  if (tokens.includes("bili") && (name.includes("hackathon") || shortname.includes("hackathon"))) {
    if (name.includes("ki") || shortname.includes("ki")) score += 25;
    if (name.includes("moodle") || shortname.includes("moodle")) score += 25;
  }

  const sectionIds = pickRelevantSections(course, tokens);
  score += Math.min(50, sectionIds.size * 10);

  try {
    for (const section of course.sections ?? []) {
      const sectionText = normalize(`${section.name ?? ""} ${section.summary ?? ""}`);
      for (const t of tokens) if (t && sectionText.includes(t)) score += 5;
      score += scoreCheckpointText(sectionText, tokens);
      for (const mod of section.modules ?? []) {
        const modText = normalize(`${mod.name ?? ""} ${mod.summary ?? ""} ${mod.description ?? ""}`);
        for (const t of tokens) if (t && modText.includes(t)) score += 8;
        score += scoreCheckpointText(modText, tokens);
        for (const f of mod.files ?? []) {
          const fname = normalize(`${f.filename ?? ""} ${f.path ?? ""}`);
          if (!fname) continue;
          let hits = 0;
          for (const t of tokens) if (t && fname.includes(t)) hits++;
          if (hits > 0) {
            score += hits * 25;
            if (tokens.length > 0 && hits === tokens.length) score += 50;
          }
        }
      }
    }
  } catch {
    // malformed course data — skip file scoring
  }

  return { score, tokenMatches, sectionIds };
}

export function rankCourses(courses, tokens, phrases) {
  const results = [];
  for (const course of courses) {
    const { score, tokenMatches, sectionIds } = scoreCourse(course, tokens, phrases);
    if (score === 0) continue;
    results.push({ course, score, tokenMatches, sectionIds });
  }
  results.sort(
    (a, b) =>
      b.score - a.score ||
      b.tokenMatches - a.tokenMatches ||
      (b.sectionIds?.size ?? 0) - (a.sectionIds?.size ?? 0),
  );
  return results;
}

function extractQuotedPhrases(text) {
  const matches = text.match(/"([^"]+)"/g) ?? [];
  return matches.map((m) => normalize(m.replace(/^"|"$/g, ""))).filter(Boolean);
}

function shouldIncludeRelatedCourses(tokens) {
  return isCheckpointQuery(tokens);
}

async function selectSections(courseRepository, course, sectionIds, tokens) {
  const allSections = await courseRepository.getCourseContents(course.id);

  const selected = allSections
    .filter((s) => sectionIds.has(s.id))
    .sort((a, b) => scoreSection(b, tokens) - scoreSection(a, tokens));

  return (selected.length ? selected : allSections)
    .sort((a, b) => scoreSection(b, tokens) - scoreSection(a, tokens))
    .slice(0, MAX_SECTIONS_IN_RESPONSE);
}

export async function searchCourses({ query, courseRepository, allowedIds }) {
  // Fail-closed authorization: callers must explicitly enumerate the courses
  // the user is allowed to see. Omitting or emptying `allowedIds` means the
  // user has no authorized courses, so we never touch the repository and never
  // leak any course contents.
  if (!Array.isArray(allowedIds) || allowedIds.length === 0) {
    return { found: false, message: "Course not found" };
  }

  try {
    const allCourses = await courseRepository.getAllCourses();
    const courses = allCourses.filter((c) => allowedIds.includes(c.id));

    const tokens = tokenize(query);
    const phrases = extractQuotedPhrases(query);
    const normalizedQuery = normalize(query);
    const fallbackTokens = tokens.length ? tokens : normalizedQuery ? [normalizedQuery] : [];

    const ranked = rankCourses(courses, fallbackTokens, phrases);
    const best = ranked[0];

    if (!best?.course) {
      return { found: false, message: "Course not found" };
    }

    const course = best.course;
    const sectionIds = best.sectionIds?.size
      ? best.sectionIds
      : pickRelevantSections(course, fallbackTokens);

    const sections = await selectSections(courseRepository, course, sectionIds, fallbackTokens);
    const relatedCourses = [];

    if (shouldIncludeRelatedCourses(fallbackTokens)) {
      for (const related of ranked.slice(1, 3)) {
        const relatedSectionIds = related.sectionIds?.size
          ? related.sectionIds
          : pickRelevantSections(related.course, fallbackTokens);
        const relatedSections = await selectSections(
          courseRepository,
          related.course,
          relatedSectionIds,
          fallbackTokens,
        );

        relatedCourses.push({
          course: {
            name: related.course.name,
            url: related.course.url,
            summary: related.course.summary ?? "",
          },
          sections: relatedSections,
        });
      }
    }

    return {
      found: true,
      course: { name: course.name, url: course.url, summary: course.summary ?? "" },
      sections,
      relatedCourses,
    };
  } catch {
    return { found: false, message: "Course search unavailable" };
  }
}
