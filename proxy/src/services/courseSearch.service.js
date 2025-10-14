import { getCoursesStructure } from "./courseCache.service.js";
import { getCourseContents } from "./moodle.service.js";
import config from "../config/env.js";
import { toUserFacingFileUrl, withForcedDownload } from "./url.service.js";

export function findCourse(searchTerm) {
  const courses = getCoursesStructure();
  const term = searchTerm.toLowerCase();

  return courses.find(
    (course) =>
      course.name.toLowerCase().includes(term) ||
      course.shortname.toLowerCase().includes(term)
  );
}

export function findModuleInCourse(course, moduleName) {
  const term = moduleName.toLowerCase();

  for (const section of course.sections) {
    const module = section.modules.find((mod) =>
      mod.name.toLowerCase().includes(term)
    );
    if (module) {
      return { section, module };
    }
  }
  return null;
}

export async function smartSearch(query, logger, options) {
  try {
    const allCourses = getCoursesStructure();
    const allowedIds = options?.allowedCourseIds || [];
    const courses = Array.isArray(allowedIds) && allowedIds.length
      ? allCourses.filter((c) => allowedIds.includes(c.id))
      : allCourses;
    const tokens = tokenize(query);
    const phrases = extractQuotedPhrases(query);
    const fallbackTokens = tokens.length ? tokens : [normalize(query)];

    // Score all courses by name + content; prefer phrase matches
    const ranked = rankCourses(courses, fallbackTokens, phrases);
    const best = ranked[0];

    logger?.info(
      {
        query,
        tokens,
        phrases,
        filteredByUserCourses: Array.isArray(allowedIds) && allowedIds.length ? allowedIds : null,
        rankedTop: ranked
          .slice(0, 3)
          .map((r) => ({ id: r.course.id, name: r.course.name, score: r.score })),
      },
      "smartSearch ranking"
    );
    const course = best?.course;
    if (!course) {
      return { found: false, message: "Course not found" };
    }

    const sectionIds = best.sectionIds?.size
      ? best.sectionIds
      : pickSectionIds(course, fallbackTokens);

    const selectedSections = course.sections
      .filter((section) => sectionIds.has(section.id))
      .sort((a, b) => scoreSection(b, fallbackTokens) - scoreSection(a, fallbackTokens));

    const limitedSections = (selectedSections.length
      ? selectedSections
      : course.sections
    )
      .sort((a, b) => scoreSection(b, fallbackTokens) - scoreSection(a, fallbackTokens))
      .slice(0, 3);

    const fullContents = await getCourseContents(course.id);
    const detailedSections = limitedSections.map((section) =>
      enrichSection(section, fullContents)
    );

    logger?.info(
      {
        selectedCourse: { id: course.id, name: course.name, url: course.url },
        sectionIds: Array.from(sectionIds),
        limitedSections: limitedSections.map((s) => ({ id: s.id, name: s.name })),
      },
      "smartSearch selected course/sections"
    );

    return {
      found: true,
      course: {
        name: course.name,
        url: course.url,
        summary: course.summary || "",
      },
      section: detailedSections,
    };
  } catch (error) {
    logger?.warn("Smart search failed, cache not loaded:", error.message);
    return {
      found: false,
      message:
        "Course search unavailable - cache not loaded. Please create a valid Moodle token first.",
    };
  }
}

function enrichSection(section, fullContents) {
  const fullSection = fullContents.find((s) => s.id === section.id) ?? {};
  const modules = fullSection.modules ?? [];

  return {
    name: section.name,
    summary: fullSection.summary || "",
    modules: modules.map(formatModule),
  };
}

function formatModule(module) {
  return {
    name: module.name,
    type: module.modname || module.type || "",
    description: module.description || "",
    url:
      module.url ||
      (module.id && (module.modname || module.type)
        ? `${config.moodle.url}/mod/${module.modname || module.type}/view.php?id=${module.id}`
        : null),
    files:
      module.contents
        ?.filter((content) => content.type === "file")
        ?.map((file) => ({
          filename: file.filename,
          mimetype: file.mimetype,
          url: withForcedDownload(toUserFacingFileUrl(file.fileurl)),
        })) || [],
  };
}

function pickSectionIds(course, tokens, includeAllOnEmpty = true) {
  const ids = new Set();

  course.sections.forEach((section) => {
    const sectionName = normalize(section.name);
    const sectionMatches = tokens.some((token) =>
      sectionName.includes(token)
    );

    const moduleMatches = section.modules?.some((module) => {
      const moduleName = normalize(module.name);
      const matchesName = tokens.some((token) =>
        moduleName.includes(token)
      );

      const fileMatches = module.files?.some((file) => {
        const fileName = normalize(file.filename);
        return tokens.some((token) => fileName.includes(token));
      });

      return matchesName || fileMatches;
    });

    if (sectionMatches || moduleMatches) {
      ids.add(section.id);
    }
  });

  if (!ids.size && includeAllOnEmpty) {
    course.sections.forEach((section) => ids.add(section.id));
  }

  return ids;
}

function findCourseByContent(courses, tokens) {
  for (const course of courses) {
    const sectionIds = pickSectionIds(course, tokens, false);
    if (sectionIds.size) {
      return { course, sectionIds };
    }
  }
  return null;
}

function courseMatchesTokens(course, tokens) {
  const courseName = normalize(course.name);
  const shortName = normalize(course.shortname);

  return tokens.some(
    (token) => courseName.includes(token) || shortName.includes(token)
  );
}

function tokenize(text) {
  const STOP = new Set([
    // de
    "ich","du","er","sie","es","wir","ihr","sie",
    "und","oder","aber","auch","nur","noch","schon",
    "der","die","das","den","dem","des","ein","eine","einer","einem","eines",
    "zu","zum","zur","mit","ohne","für","im","in","am","an","auf","von","nach","bei",
    "bitte","hallo","danke","hi","servus","moin",
    "brauche","need","ichbrauche","hilfe",
    "link","links","url","kurslink",
    // en
    "i","you","we","they","and","or","the","a","an","to","for","with","without","of",
    // ru
    "я","мне","мои","мой","тебе","ты","и","или","но","это","в","на","для","с","без","до","после",
  ]);
  return text
    .split(/\s+/)
    .map((part) => normalize(part))
    .filter((part) => part.length >= 2 && !STOP.has(part));
}

function normalize(text) {
  return (text || "").toLowerCase().trim();
}

function scoreSection(section, tokens) {
  try {
    let s = 0;
    const secName = normalize(section.name || "");
    for (const t of tokens) if (t && secName.includes(t)) s += 5;
    for (const mod of section.modules || []) {
      const mname = normalize(mod.name || "");
      for (const t of tokens) if (t && mname.includes(t)) s += 8;
      for (const f of mod.files || []) {
        const fname = normalize(f.filename || "");
        for (const t of tokens) if (t && fname.includes(t)) s += 12;
      }
    }
    return s;
  } catch {
    return 0;
  }
}

// Extract phrases in quotes to improve precision, e.g. "Hackathon - Lernformat ..."
function extractQuotedPhrases(text) {
  const matches = text.match(/"([^"]+)"/g) || [];
  return matches.map((m) => normalize(m.replace(/^"|"$/g, ""))).filter(Boolean);
}

function rankCourses(courses, tokens, phrases) {
  const results = [];

  for (const course of courses) {
    const name = normalize(course.name || "");
    const shortname = normalize(course.shortname || "");

    let score = 0;
    let tokenMatches = 0;

    // Strong weight on quoted phrases in title/shortname
    for (const ph of phrases) {
      if (ph && (name.includes(ph) || shortname.includes(ph))) {
        score += 200 + ph.length; // very strong signal
      }
    }

    // Token matches in title/shortname
    for (const t of tokens) {
      const matchInName = name.includes(t);
      const matchInShort = shortname.includes(t);
      if (matchInName || matchInShort) {
        tokenMatches++;
        score += 20; // strong signal on course title
      }
      // Boost typical LF patterns (e.g., "lf" or numbers like "07") when present in shortname
      if (t === "lf" && shortname.includes("lf")) {
        score += 15;
      }
      if (/^\d+$/.test(t) && shortname.includes(t)) {
        score += 25;
      }
    }

    // If user mentions 'bili', prefer Hackathon courses that also include KI & Moodle
    if (tokens.includes("bili") && (name.includes("hackathon") || shortname.includes("hackathon"))) {
      if (name.includes("ki") || shortname.includes("ki")) score += 25;
      if (name.includes("moodle") || shortname.includes("moodle")) score += 25;
    }

    // Content-based hints via sections/modules/files
    let sectionScore = 0;
    const sectionIds = pickSectionIds(course, tokens, false);
    if (sectionIds.size) {
      // weight by how many sections match
      sectionScore += Math.min(50, sectionIds.size * 10);
    }

    // Extra boost for filename matches of all tokens (e.g., "problem_tree.pdf")
    let fileBoost = 0;
    try {
      for (const section of course.sections || []) {
        for (const mod of section.modules || []) {
          const files = mod.files || [];
          for (const f of files) {
            const fname = normalize(f.filename || "");
            if (!fname) continue;
            let perFileHits = 0;
            for (const t of tokens) {
              if (t && fname.includes(t)) perFileHits++;
            }
            if (perFileHits > 0) {
              fileBoost += perFileHits * 25; // strong per-token hit in filename
              if (tokens.length > 0 && perFileHits === tokens.length) {
                fileBoost += 50; // all tokens appear in single filename
              }
            }
          }
        }
      }
    } catch {}

    score += sectionScore + fileBoost;

    // If no tokens matched anywhere, skip
    if (score === 0 && !tokens.length && !phrases.length) continue;

    results.push({ course, score, tokenMatches, sectionIds });
  }

  // Highest score first; tie-breaker: more token matches; then more sections
  results.sort((a, b) =>
    b.score - a.score || b.tokenMatches - a.tokenMatches || (b.sectionIds?.size || 0) - (a.sectionIds?.size || 0)
  );

  return results;
}
