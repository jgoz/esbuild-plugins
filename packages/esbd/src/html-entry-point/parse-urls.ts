const closingToken: Record<string, string> = {
  '(': ')',
  '"': '"',
  "'": "'",
};

function skipWhitespace(text: string, index: number): number {
  let offset = 0;
  while (/\s/.test(text[index + offset])) offset++;
  return offset;
}

export function parseURLs(text: string): string[] {
  const urls: string[] = [];
  const length = text.length;
  let index = 0;

  const stack: string[] = [];
  while ((index = text.indexOf('url', index)) > 0) {
    // Skip over "url"
    index += 3;
    index += skipWhitespace(text, index);

    // Find opening "("
    if (text[index] !== '(') continue;
    stack.push(text[index++]);
    index += skipWhitespace(text, index);

    // Quotes are optional, but need to balance
    switch (text[index]) {
      case `'`:
      case `"`:
        stack.push(text[index++]);
        break;
    }
    index += skipWhitespace(text, index);

    // Start capturing the actual URL
    const start = index;
    let end = index;
    while (stack.length > 0 && index < length) {
      if (text[index] === closingToken[stack[stack.length - 1]]) {
        stack.pop();
        index += skipWhitespace(text, index);
      } else {
        end++;
      }
      index++;
    }

    urls.push(text.slice(start, end).trim());
  }

  return urls;
}
