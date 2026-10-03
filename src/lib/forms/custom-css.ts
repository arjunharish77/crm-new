// A form's custom CSS goes into a <style> element on the public form. CSS never needs a raw "<",
// but "</style>" in it would end the element early if the page were ever server-rendered with it,
// so "<" is written as its CSS escape instead (Section 8 #22). Strings that used "<" (e.g. in
// `content: "<"`) still show it.
export function safeFormCss(css: string | null | undefined) {
    return String(css ?? "").replace(/</g, "\\3C ");
}
