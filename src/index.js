/**
 * Simple Markdown to HTML converter
 */

class MarkdownParser {
  constructor() {
    this.rules = [
      // Headers (h1-h6) - process first
      { pattern: /^######\s+(.+)$/gm, replacement: '<h6>$1</h6>' },
      { pattern: /^#####\s+(.+)$/gm, replacement: '<h5>$1</h5>' },
      { pattern: /^####\s+(.+)$/gm, replacement: '<h4>$1</h4>' },
      { pattern: /^###\s+(.+)$/gm, replacement: '<h3>$1</h3>' },
      { pattern: /^##\s+(.+)$/gm, replacement: '<h2>$1</h2>' },
      { pattern: /^#\s+(.+)$/gm, replacement: '<h1>$1</h1>' },
      
      // Bold - process before italic to avoid conflicts
      { pattern: /\*\*(.+?)\*\*/g, replacement: '<strong>$1</strong>' },
      { pattern: /__(.+?)__/g, replacement: '<strong>$1</strong>' },
      
      // Italic - use negative lookahead to avoid matching bold markers
      { pattern: /(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, replacement: '<em>$1</em>' },
      { pattern: /(?<!_)_(?!_)(.+?)(?<!_)_(?!_)/g, replacement: '<em>$1</em>' },
      
      // Links
      { pattern: /\[([^\]]+)\]\(([^)]+)\)/g, replacement: '<a href="$2">$1</a>' },
      
      // Inline code
      { pattern: /`([^`]+)`/g, replacement: '<code>$1</code>' },
    ];
  }

  /**
   * Parse markdown text to HTML
   * @param {string} markdown - The markdown text to parse
   * @returns {string} HTML output
   */
  parse(markdown) {
    if (!markdown || typeof markdown !== 'string') {
      return '';
    }

    let html = markdown;

    // Apply all transformation rules
    this.rules.forEach(rule => {
      html = html.replace(rule.pattern, rule.replacement);
    });

    // Split into lines and wrap non-header lines in paragraphs
    const lines = html.split('\n\n');
    html = lines.map(line => {
      line = line.trim();
      if (!line) return '';
      // Don't wrap headers or already-wrapped content
      if (line.startsWith('<h') || line.startsWith('<p>')) {
        return line;
      }
      return '<p>' + line + '</p>';
    }).filter(line => line).join('\n');

    return html;
  }

  /**
   * Convert markdown to HTML
   * @param {string} markdown - The markdown text to convert
   * @returns {string} HTML output
   */
  toHtml(markdown) {
    return this.parse(markdown);
  }
}

// Export for CommonJS
module.exports = MarkdownParser;

// Export default instance methods
module.exports.parse = function(markdown) {
  const parser = new MarkdownParser();
  return parser.parse(markdown);
};

module.exports.toHtml = function(markdown) {
  const parser = new MarkdownParser();
  return parser.toHtml(markdown);
};
