import { STOP_WORDS, MAX_SECTIONS_IN_RESPONSE } from "../../../config/constants.js";

export function normalize(text) {
  return (text || "").toLowerCase().trim();
}

export function tokenize(text) {
  return text
    .split(/\s+/)
    .map((part) => normalize(part))
    .filter((part) => part.length >= 2 && !STOP_WORDS.has(part));
}

export function pickRelevantSections(course, tokens) {
  const ids = new Set();
  for (const section of course.sections ?? []) {
    const sectionMatch = tokens.some((t) => normalize(section.name).includes(t));
    const moduleMatch = section.modules?.some((mod) => {
      const nameMatch = tokens.some((t) => normalize(mod.name).includes(t));
      const fileMatch = mod.files?.some((file) =>
        tokens.some((t) => normalize(file.filename).includes(t)),
      );
      return nameMatch || fileMatch;
    });
    if (sectionMatch || moduleMatch) ids.add(section.id);
  }
  return ids;
}

// Private: score a single section by token hits (used for sorting)
function scoreSection(section, tokens) {
  try {
    let s = 0;
    const secName = normalize(section.name ?? "");
    for (const t of tokens) if (t && secName.includes(t)) s += 5;
    for (const mod of section.modules ?? []) {
      const mname = normalize(mod.name ?? "");
      for (const t of tokens) if (t && mname.includes(t)) s += 8;
      for (const f of mod.files ?? []) {
        const fname = normalize(f.filename ?? "");
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
      for (const mod of section.modules ?? []) {
        for (const f of mod.files ?? []) {
          const fname = normalize(f.filename ?? "");
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

export async function searchCourses({ query, courseRepository, allowedIds }) {
  try {
    const allCourses = await courseRepository.getAllCourses();
    const courses =
      Array.isArray(allowedIds) && allowedIds.length
        ? allCourses.filter((c) => allowedIds.includes(c.id))
        : allCourses;

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

    const allSections = await courseRepository.getCourseContents(course.id);

    const selected = allSections
      .filter((s) => sectionIds.has(s.id))
      .sort((a, b) => scoreSection(b, fallbackTokens) - scoreSection(a, fallbackTokens));

    const sections = (selected.length ? selected : allSections)
      .sort((a, b) => scoreSection(b, fallbackTokens) - scoreSection(a, fallbackTokens))
      .slice(0, MAX_SECTIONS_IN_RESPONSE);

    return {
      found: true,
      course: { name: course.name, url: course.url, summary: course.summary ?? "" },
      sections,
    };
  } catch {
    return { found: false, message: "Course search unavailable" };
  }
}
