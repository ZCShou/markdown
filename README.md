# Markdown Parser

A simple and lightweight markdown to HTML converter for Node.js.

## Features

- Convert markdown syntax to HTML
- Support for common markdown elements:
  - Headers (H1-H6)
  - Bold text (`**text**` or `__text__`)
  - Italic text (`*text*` or `_text_`)
  - Links (`[text](url)`)
  - Inline code (`` `code` ``)
  - Paragraph breaks
- Zero dependencies
- Easy to use API

## Installation

```bash
npm install @zcshou/markdown
```

## Usage

### Basic Usage

```javascript
const MarkdownParser = require('@zcshou/markdown');

// Using static methods
const html = MarkdownParser.parse('# Hello World');
console.log(html); // <h1>Hello World</h1>

// Using class instance
const parser = new MarkdownParser();
const result = parser.toHtml('**Bold text**');
console.log(result); // <p><strong>Bold text</strong></p>
```

### Examples

```javascript
const MarkdownParser = require('@zcshou/markdown');

// Headers
MarkdownParser.parse('# Heading 1');        // <h1>Heading 1</h1>
MarkdownParser.parse('## Heading 2');       // <h2>Heading 2</h2>
MarkdownParser.parse('### Heading 3');      // <h3>Heading 3</h3>

// Bold
MarkdownParser.parse('**bold text**');      // <p><strong>bold text</strong></p>
MarkdownParser.parse('__bold text__');      // <p><strong>bold text</strong></p>

// Italic
MarkdownParser.parse('*italic text*');      // <p><em>italic text</em></p>
MarkdownParser.parse('_italic text_');      // <p><em>italic text</em></p>

// Links
MarkdownParser.parse('[GitHub](https://github.com)');  
// <p><a href="https://github.com">GitHub</a></p>

// Inline code
MarkdownParser.parse('`code snippet`');     
// <p><code>code snippet</code></p>

// Combined
const markdown = `# My Title

This is **bold** and *italic* text with a [link](https://example.com).`;

const html = MarkdownParser.toHtml(markdown);
```

## API

### `MarkdownParser`

The main class for parsing markdown.

#### Constructor

```javascript
const parser = new MarkdownParser();
```

#### Instance Methods

##### `parse(markdown)`

Converts markdown string to HTML.

- **Parameters**: `markdown` (string) - The markdown text to parse
- **Returns**: (string) - The HTML output

##### `toHtml(markdown)`

Alias for `parse()`. Converts markdown string to HTML.

- **Parameters**: `markdown` (string) - The markdown text to convert
- **Returns**: (string) - The HTML output

#### Static Methods

##### `MarkdownParser.parse(markdown)`

Static method to parse markdown without creating an instance.

- **Parameters**: `markdown` (string) - The markdown text to parse
- **Returns**: (string) - The HTML output

##### `MarkdownParser.toHtml(markdown)`

Static method to convert markdown to HTML without creating an instance.

- **Parameters**: `markdown` (string) - The markdown text to convert
- **Returns**: (string) - The HTML output

## Testing

Run the test suite:

```bash
npm test
```

## License

MIT
