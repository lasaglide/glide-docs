const fs = require('fs');
const path = require('path');

// Read the export file
const exportFile = fs.readdirSync('.').find(f => f.startsWith('contentful-export'));
const data = JSON.parse(fs.readFileSync(exportFile, 'utf8'));

// Create output directory
const outputDir = './markdown-output';
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Helper to find entry by ID
function findEntry(id) {
  return data.entries.find(e => e.sys.id === id);
}

// Helper to find asset by ID
function findAsset(id) {
  return data.assets.find(a => a.sys.id === id);
}

// Convert rich text to markdown
function richTextToMarkdown(content) {
  if (!content || !content.content) return '';
  
  let markdown = '';
  
  function processNode(node) {
    if (!node) return '';
    
    switch (node.nodeType) {
      case 'document':
        return node.content.map(processNode).join('\n\n');
      
      case 'paragraph':
        return node.content.map(processNode).join('');
      
      case 'heading-2':
        return '## ' + node.content.map(processNode).join('');
      
      case 'heading-3':
        return '### ' + node.content.map(processNode).join('');
      
      case 'unordered-list':
        return node.content.map(item => '- ' + processNode(item)).join('\n');
      
      case 'ordered-list':
        return node.content.map((item, i) => `${i + 1}. ` + processNode(item)).join('\n');
      
      case 'list-item':
        return node.content.map(processNode).join('');
      
      case 'hyperlink':
        const linkText = node.content.map(processNode).join('');
        return `[${linkText}](${node.data.uri})`;
      
      case 'embedded-asset-block':
        const asset = findAsset(node.data.target.sys.id);
        if (asset && asset.fields.file) {
          const url = asset.fields.file['en-US'].url;
          const title = asset.fields.title ? asset.fields.title['en-US'] : '';
          return `\n\n![${title}](${url.startsWith('//') ? 'https:' + url : url})\n\n`;
        }
        return '';
      
      case 'text':
        let text = node.value;
        if (node.marks) {
          node.marks.forEach(mark => {
            if (mark.type === 'bold') text = `**${text}**`;
            if (mark.type === 'code') text = `\`${text}\``;
          });
        }
        return text;
      
      case 'table':
        return '\n\n' + processTable(node) + '\n\n';
      
      default:
        if (node.content) {
          return node.content.map(processNode).join('');
        }
        return '';
    }
  }
  
  function processTable(tableNode) {
    const rows = tableNode.content;
    let markdown = '';
    
    rows.forEach((row, rowIndex) => {
      const cells = row.content.map(cell => 
        cell.content.map(processNode).join('').trim()
      );
      markdown += '| ' + cells.join(' | ') + ' |\n';
      
      if (rowIndex === 0) {
        markdown += '| ' + cells.map(() => '---').join(' | ') + ' |\n';
      }
    });
    
    return markdown;
  }
  
  return processNode(content);
}

// Process Pages
const pages = data.entries.filter(e => e.sys.contentType.sys.id === 'page');

console.log(`Found ${pages.length} pages to convert`);

pages.forEach((page, index) => {
  try {
    const fields = page.fields;
    const title = fields.title ? fields.title['en-US'] : 'Untitled';
    const description = fields.description ? fields.description['en-US'] : '';
    
    let markdown = `---\ntitle: "${title}"\n`;
    if (description) {
      markdown += `description: "${description}"\n`;
    }
    markdown += `---\n\n`;
    
    markdown += `# ${title}\n\n`;
    
    if (description) {
      markdown += `${description}\n\n`;
    }
    
    // Process content blocks
    if (fields.content && fields.content['en-US']) {
      const contentRefs = fields.content['en-US'];
      
      contentRefs.forEach(ref => {
        const block = findEntry(ref.sys.id);
        if (block && block.fields) {
          const blockFields = block.fields;
          
          if (blockFields.title && blockFields.title['en-US']) {
            markdown += `### ${blockFields.title['en-US']}\n\n`;
          }
          
          if (blockFields.content && blockFields.content['en-US']) {
            markdown += richTextToMarkdown(blockFields.content['en-US']) + '\n\n';
          }
        }
      });
    }
    
    // Create filename
    const filename = title.toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') + '.mdx';
    
    const filepath = path.join(outputDir, filename);
    fs.writeFileSync(filepath, markdown);
    
    console.log(`✓ Converted: ${title} -> ${filename}`);
    
  } catch (error) {
    console.error(`✗ Error converting page ${index}:`, error.message);
  }
});

console.log(`\n✨ Done! Converted ${pages.length} pages to ${outputDir}/`);
