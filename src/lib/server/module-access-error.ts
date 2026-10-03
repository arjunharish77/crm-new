// Thrown by requireCurrentUser when the user's role doesn't allow this module action (see
// lib/module-access.ts); serverError turns it into a 403 for every route.
export class ModuleAccessError extends Error {
  constructor(public readonly moduleLabel: string, public readonly need: "read" | "write" | "full") {
    super(`MODULE_ACCESS_DENIED:${moduleLabel}:${need}`);
    this.name = "ModuleAccessError";
  }

  get userMessage() {
    const what = this.need === "read" ? "see" : this.need === "write" ? "add or change" : "delete";
    return `Your role can't ${what} ${this.moduleLabel.toLowerCase()}. Ask an admin if you need access.`;
  }
}
