/**
 * Replies are shown as plain text (never as HTML). Models sometimes add light
 * Markdown despite being asked not to, so strip the common markers to keep
 * replies clean. Safe to call repeatedly on partial text while streaming.
 */
export function toDisplayText(text: string): string {
  return (
    text
      // **bold** / __bold__
      .replace(/(\*\*|__)(?=\S)(.+?)(?<=\S)\1/g, "$2")
      // Markdown headings at the start of a line.
      .replace(/^[ \t]*#{1,6}[ \t]+/gm, "")
      // "* item" / "- item" bullets become a simple bullet character.
      .replace(/^([ \t]*)[*-][ \t]+/gm, "$1• ")
      // Collapse runs of 3+ blank lines.
      .replace(/\n{3,}/g, "\n\n")
  );
}

export function countWords(text: string): number {
  const words = text.trim().split(/\s+/u);
  return words[0] === "" ? 0 : words.length;
}
