function createFile({ filename, mimetype, url }) {
  return Object.freeze({
    filename: filename ?? "",
    mimetype: mimetype ?? "",
    url: url ?? null,
  });
}

function createModule({ id, name, type, url, files }) {
  if (id === null || id === undefined) {
    throw Object.assign(new Error("Module id is required"), { statusCode: 400 });
  }
  return Object.freeze({
    id,
    name: name ?? "",
    type: type ?? "",
    url: url ?? null,
    files: Object.freeze((files ?? []).map(createFile)),
  });
}

function createSection({ id, name, modules }) {
  if (id === null || id === undefined) {
    throw Object.assign(new Error("Section id is required"), { statusCode: 400 });
  }
  return Object.freeze({
    id,
    name: name ?? "",
    modules: Object.freeze((modules ?? []).map(createModule)),
  });
}

export function createCourse({ id, name, shortname, summary, url, sections }) {
  if (id === null || id === undefined) {
    throw Object.assign(new Error("Course id is required"), { statusCode: 400 });
  }
  if (!name?.trim()) {
    throw Object.assign(new Error("Course name is required"), { statusCode: 400 });
  }
  return Object.freeze({
    id,
    name: name.trim(),
    shortname: shortname ?? "",
    summary: summary ?? "",
    url: url ?? null,
    sections: Object.freeze((sections ?? []).map(createSection)),
  });
}
