import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

type HttpRoute = {
  controller: string;
  method: string;
  path: string;
  file: string;
  line: number;
  authorizationMarkers: string[];
  exportRelated: boolean;
};

type WebSocketHandler = {
  gateway: string;
  event: string;
  file: string;
  line: number;
  authorizationMarkers: string[];
};

const sourceRoot = resolve(process.cwd(), 'src');
const outputArgument = process.argv.find((argument) => argument.startsWith('--output='));
const verify = process.argv.includes('--verify');

const walk = (directory: string): string[] => readdirSync(directory, { withFileTypes: true })
  .flatMap((entry) => {
    const absolutePath = join(directory, entry.name);
    return entry.isDirectory() ? walk(absolutePath) : [absolutePath];
  });

const literal = (raw: string | undefined): string => String(raw || '')
  .trim()
  .replace(/^['"`]|['"`]$/g, '') || '/';

const markersNear = (lines: string[], lineIndex: number, classMarkers: string[]): string[] => {
  const methodDecorators = lines
    // Nest permits decorators on either side of the HTTP decorator.  A small
    // symmetric window catches both forms without pretending to prove the
    // authorization semantics.
    .slice(Math.max(0, lineIndex - 14), lineIndex + 15)
    .filter((line) => /@(UseGuards|Roles|Public|SkipAuth|AllowAnonymous)\b/.test(line))
    .map((line) => line.trim());
  return [...new Set([...classMarkers, ...methodDecorators])];
};

const controllerFiles = walk(sourceRoot).filter((file) => file.endsWith('.controller.ts'));
const gatewayFiles = walk(sourceRoot).filter((file) => file.endsWith('.gateway.ts'));
const routes: HttpRoute[] = [];
const websocketHandlers: WebSocketHandler[] = [];

for (const file of controllerFiles) {
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  const controllerLine = lines.findIndex((line) => /@Controller\b/.test(line));
  const classLine = lines.findIndex((line) => /export\s+class\s+\w+Controller\b/.test(line));
  const classMarkers = lines
    .slice(Math.max(0, (classLine >= 0 ? classLine : controllerLine) - 30), classLine >= 0 ? classLine : controllerLine + 1)
    .filter((line) => /@(UseGuards|Roles|Public|SkipAuth|AllowAnonymous)\b/.test(line))
    .map((line) => line.trim());
  const controller = relative(sourceRoot, file).replace(/\\/g, '/');

  lines.forEach((line, index) => {
    const route = line.match(/@(Get|Post|Put|Patch|Delete)\s*\(([^)]*)\)/);
    if (!route) return;
    const path = literal(route[2]);
    routes.push({
      controller,
      method: route[1].toUpperCase(),
      path,
      file: relative(process.cwd(), file).replace(/\\/g, '/'),
      line: index + 1,
      authorizationMarkers: markersNear(lines, index, classMarkers),
      exportRelated: /export|report|download|print/i.test(path),
    });
  });
}

for (const file of gatewayFiles) {
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  const classLine = lines.findIndex((line) => /export\s+class\s+\w+Gateway\b/.test(line));
  const classMarkers = lines
    .slice(0, Math.max(0, classLine))
    .filter((line) => /@(UseGuards|Roles|Public|SkipAuth|AllowAnonymous)\b/.test(line))
    .map((line) => line.trim());
  const gateway = relative(sourceRoot, file).replace(/\\/g, '/');
  lines.forEach((line, index) => {
    const handler = line.match(/@SubscribeMessage\s*\(([^)]*)\)/);
    if (!handler) return;
    websocketHandlers.push({
      gateway,
      event: literal(handler[1]),
      file: relative(process.cwd(), file).replace(/\\/g, '/'),
      line: index + 1,
      authorizationMarkers: markersNear(lines, index, classMarkers),
    });
  });
}

const unmarkedHttpRoutes = routes.filter((route) => route.authorizationMarkers.length === 0);
const permittedPublicRoutes = new Set([
  'health/health.controller.ts:GET:live',
  'health/health.controller.ts:GET:ready',
]);
const unexpectedUnmarkedHttpRoutes = unmarkedHttpRoutes.filter(
  (route) => !permittedPublicRoutes.has(`${route.controller}:${route.method}:${route.path}`),
);
const notificationsGateway = gatewayFiles.find((file) => file.endsWith('notifications.gateway.ts'));
const notificationsGatewaySource = notificationsGateway
  ? readFileSync(notificationsGateway, 'utf8')
  : '';
const webSocketHandshakeIsExplicit = /async\s+handleConnection\s*\(/.test(notificationsGatewaySource)
  && /verifyAsync/.test(notificationsGatewaySource)
  && /pinLockedAt/.test(notificationsGatewaySource)
  && /clinicId/.test(notificationsGatewaySource);

const result = {
  generatedAt: new Date().toISOString(),
  scope: 'Static inventory only. Every entry still requires service-level tenant and role review; this file is not a production authorization attestation.',
  controllers: controllerFiles.length,
  httpRoutes: routes.length,
  websocketGateways: gatewayFiles.length,
  websocketHandlerCount: websocketHandlers.length,
  exportRelatedRoutes: routes.filter((route) => route.exportRelated),
  routes,
  websocketEvents: websocketHandlers,
  jobs: walk(sourceRoot)
    .filter((file) => file.endsWith('.ts'))
    .flatMap((file) => readFileSync(file, 'utf8').split(/\r?\n/).map((line, index) => ({ file, line, index })))
    .filter(({ line }) => /@(Cron|Interval|Timeout)\s*\(/.test(line))
    .map(({ file, line, index }) => ({ file: relative(process.cwd(), file).replace(/\\/g, '/'), line: index + 1, decorator: line.trim() })),
  verification: {
    permittedPublicRoutes: [...permittedPublicRoutes],
    unexpectedUnmarkedHttpRoutes,
    webSocketHandshakeIsExplicit,
  },
};

const json = `${JSON.stringify(result, null, 2)}\n`;
if (outputArgument) {
  writeFileSync(resolve(process.cwd(), outputArgument.slice('--output='.length)), json, 'utf8');
} else {
  process.stdout.write(json);
}

if (verify && (!webSocketHandshakeIsExplicit || unexpectedUnmarkedHttpRoutes.length > 0)) {
  throw new Error('Route surface verification failed: an unexpected HTTP route lacks an authorization marker or the Socket.IO handshake is not explicit.');
}
