import fs from 'node:fs';
import { ServerResponse } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NotFoundError, ValidationError } from '../security/errors.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

export function resolveUiDir(): string {
  const localUi = path.resolve(__dirname, '..', 'ui');
  if (fs.existsSync(localUi)) return localUi;
  return path.resolve(process.cwd(), 'src', 'ui');
}

/**
 * Serves whitelisted UI static files cleanly across nested modules (/js/*, /styles/*)
 * while blocking directory traversal, symlinks outside UI root, and dotfiles.
 */
export function serveStatic(res: ServerResponse, uiDir: string, reqPath: string): void {
  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(reqPath);
  } catch {
    throw new ValidationError('Malformed request path');
  }

  if (decodedPath.includes('\0') || decodedPath.includes('\\')) {
    throw new NotFoundError();
  }

  const relRaw = decodedPath === '/' ? 'index.html' : decodedPath.replace(/^\/+/, '');
  const segments = relRaw.split('/').filter((s) => s.length > 0);
  if (segments.length === 0 || segments.some((seg) => seg === '.' || seg === '..' || seg.startsWith('.'))) {
    throw new NotFoundError();
  }

  let resolvedRoot: string;
  try {
    resolvedRoot = fs.realpathSync(uiDir);
  } catch {
    throw new NotFoundError();
  }

  const fullPath = path.resolve(resolvedRoot, ...segments);
  const relCheck = path.relative(resolvedRoot, fullPath);
  if (!relCheck || relCheck.startsWith('..') || path.isAbsolute(relCheck) || !fs.existsSync(fullPath)) {
    throw new NotFoundError();
  }

  let realTarget: string;
  try {
    realTarget = fs.realpathSync(fullPath);
  } catch {
    throw new NotFoundError();
  }

  const realRel = path.relative(resolvedRoot, realTarget);
  if (!realRel || realRel.startsWith('..') || path.isAbsolute(realRel) || fs.statSync(realTarget).isDirectory()) {
    throw new NotFoundError();
  }

  const ext = path.extname(realTarget).toLowerCase();
  const mime = MIME_TYPES[ext];
  if (!mime) {
    throw new NotFoundError();
  }

  res.writeHead(200, {
    'Content-Type': mime,
    'Cache-Control': 'no-store',
  });

  const stream = fs.createReadStream(realTarget);
  stream.on('error', () => {
    if (!res.writableEnded) {
      res.destroy();
    }
  });
  stream.pipe(res);
}

