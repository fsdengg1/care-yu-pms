import fs from 'node:fs';
import path from 'node:path';

const srcDir = path.join(process.cwd(), 'src');

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(full));
    else if (/\.(tsx?|jsx?)$/.test(entry.name)) files.push(full);
  }
  return files;
}

function migrateFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  const original = content;

  if (!content.includes('next/link') && !content.includes('next/navigation')) {
    return false;
  }

  const navImports = new Set();

  if (content.includes("from 'next/link'") || content.includes('from "next/link"')) {
    navImports.add('Link');
    content = content.replace(/import Link from ['"]next\/link['"];\n?/g, '');
  }

  const navMatch = content.match(/import\s+\{([^}]+)\}\s+from\s+['"]next\/navigation['"];\n?/);
  if (navMatch) {
    navMatch[1]
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
      .forEach((name) => {
        if (name === 'redirect') return;
        navImports.add(name);
      });
    content = content.replace(/import\s+\{[^}]+\}\s+from\s+['"]next\/navigation['"];\n?/g, '');
  }

  if (navImports.size > 0) {
    const importLine = `import { ${[...navImports].sort().join(', ')} } from '@/lib/navigation';\n`;
    const useClientMatch = content.match(/^['"]use client['"];\n\n?/);
    if (useClientMatch) {
      content = content.replace(useClientMatch[0], `${useClientMatch[0]}${importLine}`);
    } else {
      const firstImport = content.search(/^import /m);
      if (firstImport >= 0) {
        content = content.slice(0, firstImport) + importLine + content.slice(firstImport);
      } else {
        content = importLine + content;
      }
    }
  }

  content = content.replace(/import\s+\{\s*redirect\s*\}\s+from\s+['"]next\/navigation['"];\n?/g, '');
  content = content.replace(/^import\s+\{\s*redirect\s*\}\s+from\s+['"]next\/navigation['"];\n?/g, '');

  if (content !== original) {
    fs.writeFileSync(filePath, content, 'utf8');
    return true;
  }
  return false;
}

let count = 0;
for (const file of walk(srcDir)) {
  if (file.includes('navigation.tsx')) continue;
  if (migrateFile(file)) {
    count++;
    console.log('migrated', path.relative(process.cwd(), file));
  }
}
console.log(`Done. Updated ${count} files.`);
