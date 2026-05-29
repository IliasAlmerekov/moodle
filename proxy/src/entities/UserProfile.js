export function createUserProfile({ id, firstname, lastname, email, courses }) {
  if (id == null) {
    throw Object.assign(new Error("UserProfile id is required"), { statusCode: 400 });
  }
  const fullname = `${firstname ?? ""} ${lastname ?? ""}`.trim() || "Student";
  return Object.freeze({
    id,
    firstname: firstname ?? "",
    lastname: lastname ?? "",
    email: email ?? "",
    fullname,
    courses: Object.freeze([...(courses ?? [])]),
  });
}
