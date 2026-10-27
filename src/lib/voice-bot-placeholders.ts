// Mail-merge placeholders in a voice bot's lines, steps and rules (decision 31):
// {{lead.name}}, {{lead.<custom field key>}}, {{opportunity.stage}}, {{owner.name}}, with an
// optional fallback after "|": {{lead.name|there}}. Shared by the server (rendering at call time,
// checks on save) and the builder (highlighting and previews).

const PLACEHOLDER = /\{\{\s*(lead|opportunity|owner)\.([A-Za-z0-9_]+)\s*(?:\|([^{}]*))?\}\}/g;
const ANY_BRACES = /\{\{[^{}]*\}\}/g;

export type Placeholder = { token: string; key: string; fallback: string | null };

export function findPlaceholders(text: string | null | undefined): Placeholder[] {
    const found: Placeholder[] = [];
    for (const match of String(text ?? "").matchAll(PLACEHOLDER)) {
        found.push({ token: match[0], key: `${match[1]}.${match[2]}`, fallback: match[3] !== undefined ? match[3].trim() : null });
    }
    return found;
}

// Text in double braces that isn't a valid placeholder (a typo the builder should point out).
export function findMalformedPlaceholders(text: string | null | undefined) {
    const valid = new Set(findPlaceholders(text).map((placeholder) => placeholder.token));
    return [...String(text ?? "").matchAll(ANY_BRACES)].map((match) => match[0]).filter((token) => !valid.has(token));
}

// Placeholders whose field the bot hasn't been given (caller details), so they would always be empty.
export function placeholdersOutsideDetails(text: string | null | undefined, callerDetails: readonly string[]) {
    const allowed = new Set(callerDetails);
    return [...new Set(findPlaceholders(text).map((placeholder) => placeholder.key))].filter((key) => !allowed.has(key));
}

function display(value: unknown): string {
    if (value === null || value === undefined) return "";
    if (Array.isArray(value)) return value.map(display).filter(Boolean).join(", ");
    if (typeof value === "boolean") return value ? "yes" : "no";
    return String(value).trim();
}

// Fills placeholders from `values` ({ "lead.name": "Asha", ... }). A placeholder with no value uses
// its fallback; with neither, it is dropped and the spacing around it tidied.
export function renderPlaceholders(text: string | null | undefined, values: Record<string, unknown>) {
    const filled = String(text ?? "").replace(PLACEHOLDER, (_token, entity: string, key: string, fallback?: string) => {
        const value = display(values[`${entity}.${key}`]);
        return value || (fallback !== undefined ? fallback.trim() : "");
    });
    return filled.replace(/[ \t]{2,}/g, " ").replace(/\s+([,.!?;:])/g, "$1").replace(/^[ \t]+|[ \t]+$/gm, "");
}
