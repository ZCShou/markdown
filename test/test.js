const MarkdownParser = require('../src/index.js');

// Test helper
function assert(condition, message) {
  if (!condition) {
    console.error('❌ FAIL:', message);
    process.exit(1);
  } else {
    console.log('✓ PASS:', message);
  }
}

console.log('Running Markdown Parser Tests...\n');

// Test 1: Headers
const parser = new MarkdownParser();
let result = parser.parse('# Heading 1');
assert(result === '<h1>Heading 1</h1>', 'H1 header conversion');

result = parser.parse('## Heading 2');
assert(result === '<h2>Heading 2</h2>', 'H2 header conversion');

result = parser.parse('### Heading 3');
assert(result === '<h3>Heading 3</h3>', 'H3 header conversion');

// Test 2: Bold text
result = parser.parse('**bold text**');
assert(result === '<p><strong>bold text</strong></p>', 'Bold with **');

result = parser.parse('__bold text__');
assert(result === '<p><strong>bold text</strong></p>', 'Bold with __');

// Test 3: Italic text
result = parser.parse('*italic text*');
assert(result === '<p><em>italic text</em></p>', 'Italic with *');

result = parser.parse('_italic text_');
assert(result === '<p><em>italic text</em></p>', 'Italic with _');

// Test 4: Links
result = parser.parse('[GitHub](https://github.com)');
assert(result === '<p><a href="https://github.com">GitHub</a></p>', 'Link conversion');

// Test 5: Inline code
result = parser.parse('`code snippet`');
assert(result === '<p><code>code snippet</code></p>', 'Inline code conversion');

// Test 6: Empty input
result = parser.parse('');
assert(result === '', 'Empty string handling');

result = parser.parse(null);
assert(result === '', 'Null input handling');

// Test 7: Static methods
result = MarkdownParser.parse('**test**');
assert(result === '<p><strong>test</strong></p>', 'Static parse method');

result = MarkdownParser.toHtml('*test*');
assert(result === '<p><em>test</em></p>', 'Static toHtml method');

// Test 8: Combined markdown
result = parser.parse('# Title\n\nThis is **bold** and *italic* text.');
assert(result.includes('<h1>Title</h1>'), 'Combined markdown - header');
assert(result.includes('<strong>bold</strong>'), 'Combined markdown - bold');
assert(result.includes('<em>italic</em>'), 'Combined markdown - italic');

// Test 9: Bold and italic shouldn't conflict
result = parser.parse('**bold** and *italic*');
assert(result.includes('<strong>bold</strong>'), 'Bold without italic interference');
assert(result.includes('<em>italic</em>'), 'Italic without bold interference');
assert(!result.includes('<em>*</em>'), 'No residual asterisks in italic');

console.log('\n✅ All tests passed!');
