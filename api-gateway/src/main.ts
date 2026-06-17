import { NestFactory } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import helmet from "helmet";
import { createProxyMiddleware } from "http-proxy-middleware";
import { AppModule } from "./app.module";

async function bootstrap() {
  // bodyParser is disabled so request bodies stream untouched to the upstream
  // services. If Nest parsed the body first, proxied POST/PUT requests would
  // forward an empty body.
  const app = await NestFactory.create(AppModule, { bodyParser: false });

  const config = app.get(ConfigService);
  const coreTarget = config.getOrThrow<string>("CORE_SERVICE_URL");
  const agentTarget = config.getOrThrow<string>("AGENT_SERVICE_URL");
  const port = config.get<number>("PORT", 3003);

  // core-service: authentication + admin
  const coreProxy = createProxyMiddleware({
    target: coreTarget,
    changeOrigin: true,
    logLevel: "warn",
  });

  // agent-service: AI REST endpoints + socket.io (WebSocket) transport
  const agentProxy = createProxyMiddleware({
    target: agentTarget,
    changeOrigin: true,
    ws: true,
    logLevel: "warn",
  });

  // Register proxies first so matched paths terminate here and never fall
  // through to Nest's own routes/middleware (e.g. helmet below).
  app.use("/auth", coreProxy);
  app.use("/admin", coreProxy);
  app.use("/agent", agentProxy);
  app.use("/socket.io", agentProxy);

  // helmet only applies to the gateway's own routes (e.g. /health); the proxied
  // upstream services already set their own security headers.
  app.use(helmet());

  await app.listen(port);

  // Proxy raw WebSocket upgrade requests (socket.io) to the agent service.
  app.getHttpServer().on("upgrade", agentProxy.upgrade);
}
void bootstrap();
