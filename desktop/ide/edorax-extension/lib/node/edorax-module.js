'use strict';
const { ContainerModule } = require('@theia/core/shared/inversify');
const { BackendApplicationContribution, EarlyExpressMiddleware } = require('@theia/core/lib/node/backend-application');
const { WsRequestValidatorContribution } = require('@theia/core/lib/node/ws-request-validators');
const { timingSafeEqual } = require('node:crypto');
const token = process.env.EDORAX_IDE_TOKEN;
function authorized(request) {
  const provided = request.headers['x-edorax-ide-token'];
  if (!token || typeof provided !== 'string' || provided.length !== token.length) return false;
  if (!/^127\.0\.0\.1:\d+$/.test(request.headers.host || '')) return false;
  const origin = request.headers.origin;
  if (origin && origin !== `http://${request.headers.host}`) return false;
  return timingSafeEqual(Buffer.from(provided), Buffer.from(token));
}
exports.default = new ContainerModule(bind => {
  bind(BackendApplicationContribution).toDynamicValue(({container}) => ({
    initialize() {
      container.get(EarlyExpressMiddleware).handlers.push((request, response, next) => {
        if (!authorized(request)) return response.status(403).send('Open this workspace through Edorax.');
        response.setHeader('Referrer-Policy', 'no-referrer');
        response.setHeader('X-Frame-Options', 'DENY');
        next();
      });
    },
    onStart(server) {
      const ready = () => console.log(`EDORAX_IDE_READY:${server.address().port}`);
      if (server.listening) ready(); else server.once('listening', ready);
    }
  })).inSingletonScope();
  bind(WsRequestValidatorContribution).toConstantValue({allowWsUpgrade: authorized});
});
