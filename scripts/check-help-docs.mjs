import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const DOC_FILE = 'recorra-web/src/content/help-catalog.ts';
const SKIP_MARKER = '[docs-nao-aplicavel]';

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

function functional(path) {
  if (path === DOC_FILE || path.includes('/ajuda/')) return false;
  if (/^(recorra|recorra-web)\/(test|tests)\//.test(path)) return false;
  if (/\.(spec|test)\.[jt]sx?$/.test(path)) return false;
  if (/^recorra\/prisma\/migrations\/.+\/migration\.sql$/.test(path)) return true;
  if (path === 'recorra/prisma/schema.prisma') return true;
  return /^recorra\/src\//.test(path) || /^recorra-web\/src\//.test(path);
}

function commitsFromCiEvent() {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (eventPath && existsSync(eventPath)) {
    const event = JSON.parse(readFileSync(eventPath, 'utf8'));
    const base = event.pull_request?.base?.sha || event.before;
    if (base && !/^0+$/.test(base)) {
      try { return git(['rev-list', '--reverse', `${base}..HEAD`]).split('\n').filter(Boolean); } catch { /* fallback abaixo */ }
    }
  }
  try { return git(['rev-list', '--reverse', 'HEAD^..HEAD']).split('\n').filter(Boolean); } catch { return [git(['rev-parse', 'HEAD'])]; }
}

const staged = process.argv.includes('--staged');
const failures = [];

if (staged) {
  const files = git(['diff', '--cached', '--name-only']).split('\n').filter(Boolean);
  const subject = process.env.HELP_DOCS_COMMIT_MESSAGE || '';
  if (files.some(functional) && !files.includes(DOC_FILE) && !subject.includes(SKIP_MARKER)) {
    failures.push('As alterações preparadas modificam funcionalidades, mas não atualizam o catálogo da Central de Ajuda.');
  }
} else {
  for (const commit of commitsFromCiEvent()) {
    const files = git(['diff-tree', '--no-commit-id', '--name-only', '-r', commit]).split('\n').filter(Boolean);
    if (!files.some(functional) || files.includes(DOC_FILE)) continue;
    const subject = git(['show', '-s', '--format=%s', commit]);
    if (subject.includes(SKIP_MARKER)) continue;
    failures.push(`${commit.slice(0, 8)} ${subject}`);
  }
}

if (failures.length) {
  console.error('\n❌ Central de Ajuda desatualizada.\n');
  for (const failure of failures) console.error(`- ${failure}`);
  console.error(`\nAtualize ${DOC_FILE} no mesmo commit funcional.`);
  console.error(`Se a mudança for exclusivamente técnica e não alterar comportamento, use ${SKIP_MARKER} no título do commit e justifique no corpo.\n`);
  process.exit(1);
}

console.log('✓ Central de Ajuda compatível com os commits funcionais verificados.');
