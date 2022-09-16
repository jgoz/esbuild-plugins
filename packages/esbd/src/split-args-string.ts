// Adapted from https://github.com/evanlucas/argsplit
export function splitArgsString(args: string): string[] {
  if (!args) return [];
  const out = [];
  let quoteChar = '';
  let current = '';

  args = args.replace(/[\s]{2}/g, ' ');
  for (let i = 0, len = args.length; i < len; i++) {
    const c = args[i];
    if (c === ' ') {
      if (quoteChar.length) {
        current += c;
      } else {
        if (current) {
          out.push(current);
          current = '';
        }
      }
    } else if (c === '"' || c === "'") {
      if (quoteChar) {
        if (quoteChar === c) {
          current += c;
          out.push(current.slice(1, -1));
          quoteChar = '';
          current = '';
        } else if (quoteChar === '"' || quoteChar === "'") {
          current += c;
        } else {
          current += c;
          quoteChar = c;
        }
      } else {
        current += c;
        quoteChar = c;
      }
    } else {
      current += c;
    }
  }
  if (current) out.push(current);

  return out;
}
