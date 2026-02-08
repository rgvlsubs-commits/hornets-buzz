import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

// Simple markdown to HTML converter
function markdownToHtml(markdown: string): string {
  let html = markdown;

  // Escape HTML entities first (but preserve our markdown)
  html = html.replace(/&/g, '&amp;');

  // Code blocks (```...```)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    return `<pre><code class="language-${lang}">${code.trim()}</code></pre>`;
  });

  // Inline code (`...`)
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Headers
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  // Bold and italic
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Horizontal rules
  html = html.replace(/^---$/gm, '<hr />');

  // Tables
  html = html.replace(/^\|(.+)\|$/gm, (match, content) => {
    const cells = content.split('|').map((c: string) => c.trim());
    // Check if it's a separator row
    if (cells.every((c: string) => /^[-:]+$/.test(c))) {
      return '<!-- table separator -->';
    }
    const isHeader = cells.some((c: string) => c.includes('---'));
    const cellTag = isHeader ? 'th' : 'td';
    return '<tr>' + cells.map((c: string) => `<${cellTag}>${c}</${cellTag}>`).join('') + '</tr>';
  });

  // Wrap consecutive table rows in table tags
  html = html.replace(/((?:<tr>.*<\/tr>\n?)+)/g, '<table>$1</table>');
  html = html.replace(/<!-- table separator -->\n?/g, '');

  // Unordered lists
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>');

  // Checkboxes
  html = html.replace(/\[ \]/g, '<input type="checkbox" disabled />');
  html = html.replace(/\[x\]/gi, '<input type="checkbox" checked disabled />');

  // Paragraphs (lines not already wrapped)
  const lines = html.split('\n');
  const result: string[] = [];
  let inPre = false;

  for (const line of lines) {
    if (line.includes('<pre>')) inPre = true;
    if (line.includes('</pre>')) inPre = false;

    if (!inPre &&
        line.trim() &&
        !line.startsWith('<') &&
        !line.match(/^[\s]*$/)) {
      result.push(`<p>${line}</p>`);
    } else {
      result.push(line);
    }
  }

  return result.join('\n');
}

export async function GET() {
  try {
    const filePath = path.join(process.cwd(), 'docs', 'WHITE_PAPER.md');
    const markdown = fs.readFileSync(filePath, 'utf-8');
    const html = markdownToHtml(markdown);

    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
      },
    });
  } catch (error) {
    console.error('Error reading white paper:', error);
    return new NextResponse('<p>Failed to load methodology document.</p>', {
      status: 500,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
      },
    });
  }
}
