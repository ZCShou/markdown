/**
 * Simple Markdown to HTML converter
 */

class MarkdownParser {
  constructor() {
    this.rules = [
      // Headers (h1-h6)
      { pattern: /^######\s+(.+)$/gm, replacement: '<h6>$1</h6>' },
      { pattern: /^#####\s+(.+)$/gm, replacement: '<h5>$1</h5>' },
      { pattern: /^####\s+(.+)$/gm, replacement: '<h4>$1</h4>' },
      { pattern: /^###\s+(.+)$/gm, replacement: '<h3>$1</h3>' },
      { pattern: /^##\s+(.+)$/gm, replacement: '<h2>$1</h2>' },
      { pattern: /^#\s+(.+)$/gm, replacement: '<h1>$1</h1>' },
      
      // Bold
      { pattern: /\*\*(.+?)\*\*/g, replacement: '<strong>$1</strong>' },
      { pattern: /__(.+?)__/g, replacement: '<strong>$1</strong>' },
      
      // Italic
      { pattern: /\*(.+?)\*/g, replacement: '<em>$1</em>' },
      { pattern: /_(.+?)_/g, replacement: '<em>$1</em>' },
      
      // Links
      { pattern: /\[([^\]]+)\]\(([^)]+)\)/g, replacement: '<a href="$2">$1</a>' },
      
      // Inline code
      { pattern: /`([^`]+)`/g, replacement: '<code>$1</code>' },
      
      // Line breaks
      { pattern: /\n\n/g, replacement: '</p><p>' },
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

    // Wrap in paragraph tags if not already wrapped
    if (!html.startsWith('<h') && !html.startsWith('<p>')) {
      html = '<p>' + html + '</p>';
    }

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
