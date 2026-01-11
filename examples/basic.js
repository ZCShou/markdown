const MarkdownParser = require('../src/index.js');

console.log('Markdown Parser Examples\n');
console.log('='.repeat(50));

// Example 1: Simple header
console.log('\nExample 1: Header');
console.log('Input:  # Welcome to Markdown');
console.log('Output:', MarkdownParser.parse('# Welcome to Markdown'));

// Example 2: Bold and Italic
console.log('\nExample 2: Bold and Italic');
console.log('Input:  **Bold** and *italic* text');
console.log('Output:', MarkdownParser.parse('**Bold** and *italic* text'));

// Example 3: Links
console.log('\nExample 3: Link');
console.log('Input:  Visit [GitHub](https://github.com)');
console.log('Output:', MarkdownParser.parse('Visit [GitHub](https://github.com)'));

// Example 4: Code
console.log('\nExample 4: Inline Code');
console.log('Input:  Use `console.log()` to print');
console.log('Output:', MarkdownParser.parse('Use `console.log()` to print'));

// Example 5: Complex document
console.log('\nExample 5: Complex Document');
const complexDoc = `# Getting Started

Welcome to our **markdown parser**! 

This is a simple tool for converting *markdown* to HTML.

Visit [our repo](https://github.com/ZCShou/markdown) for more info.`;

console.log('Input:\n' + complexDoc);
console.log('\nOutput:\n' + MarkdownParser.parse(complexDoc));

console.log('\n' + '='.repeat(50));
