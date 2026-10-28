import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./_core/oauth";
import { publicPlatformScript } from "./_core/publicConfig";
import { appRouter } from "./routers";
import { createContext } from "./_core/context";
import { checkMongoHealth } from "./mongo";

const port = Number(process.env.PORT || "5000");
const hostname = "0.0.0.0";

async function start() {
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid PORT");

  // Production configuration and environment validation
  const isProduction = process.env.NODE_ENV === "production";
  if (!process.env.MONGODB_URI) {
    throw new Error("[Startup] Missing required environment variable: MONGODB_URI");
  }
  if (isProduction && !process.env.MANUS_JWT_SECRET && !process.env.SESSION_SECRET) {
    throw new Error("[Startup] Production deployment requires SESSION_SECRET or MANUS_JWT_SECRET for secure session management.");
  }
  
  const app = express();
  const server = createServer(app);

  // CORS middleware with trusted origin restrictions
  const allowedOrigins = process.env.CORS_ALLOWED_ORIGINS
    ? process.env.CORS_ALLOWED_ORIGINS.split(",").map((s) => s.trim())
    : [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        process.env.FRONTEND_URL,
      ].filter(Boolean);

  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
      if (!isProduction || allowedOrigins.includes(origin) || allowedOrigins.includes("*")) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Access-Control-Allow-Credentials", "true");
      }
    } else {
      res.setHeader("Access-Control-Allow-Origin", isProduction ? allowedOrigins[0] || "*" : "*");
    }
    res.setHeader("Access-Control-Allow-Methods", "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
    next();
  });

  // Structured logging middleware without secret exposure
  app.use((req, res, next) => {
    const start = Date.now();
    const url = req.path;
    res.on("finish", () => {
      const duration = Date.now() - start;
      const log = {
        timestamp: new Date().toISOString(),
        method: req.method,
        path: url,
        status: res.statusCode,
        durationMs: duration,
      };
      if (url !== "/api/health" || res.statusCode >= 400) {
        console.log(JSON.stringify(log));
      }
    });
    next();
  });

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  app.get("/", (_req, res) => res.json({ status: "ok", service: "Nexcore — Consultant Utilization & Billing API", version: "1.0.0" }));
  
  app.get("/api/health", async (_req, res) => {
    const mongoHealth = await checkMongoHealth();
    const uptimeSec = Math.floor(process.uptime());
    const memory = process.memoryUsage();

    const response = {
      status: mongoHealth.connected ? "ok" : "degraded",
      service: "Nexcore ERP API",
      version: "1.0.0",
      environment: process.env.NODE_ENV || "development",
      uptimeSeconds: uptimeSec,
      timestamp: new Date().toISOString(),
      database: {
        engine: "MongoDB",
        ...mongoHealth,
      },
      memory: {
        rssMb: Math.round(memory.rss / (1024 * 1024)),
        heapUsedMb: Math.round(memory.heapUsed / (1024 * 1024)),
      },
    };

    const statusCode = mongoHealth.connected ? 200 : 503;
    res.status(statusCode).json(response);
  });

  app.get("/api/platform/config.js", (_req, res) => res.set("Cache-Control", "no-store").type("application/javascript").send(publicPlatformScript()));
  
  registerOAuthRoutes(app);
  app.use("/api/trpc", createExpressMiddleware({ router: appRouter, createContext }));

  server.on("error", (error) => {
    console.error("Server failed:", error.message);
    process.exit(1);
  });

  server.listen(port, hostname, async () => {
    console.log(`[NEXOR] Backend API server listening on http://${hostname}:${port} (env: ${process.env.NODE_ENV || "development"})`);
    const mongoHealth = await checkMongoHealth();
    if (mongoHealth.connected) {
      console.log(`[NEXOR] Database connected: ${mongoHealth.database} (${mongoHealth.topology}, transactions: ${mongoHealth.transactionsSupported ? "supported" : "standalone compensating fallback"})`);
      if (isProduction && !mongoHealth.transactionsSupported && process.env.ALLOW_STANDALONE_IN_PROD !== "true") {
        console.warn(`[NEXOR WARNING] Standalone MongoDB detected in production. Multi-document transactions require a replica set (e.g. MongoDB Atlas).`);
      }
    } else {
      console.error(`[NEXOR ERROR] Database connection failed:`, mongoHealth.error);
    }
  });
}

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
