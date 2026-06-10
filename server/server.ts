import express from "express";
import { handleGeminiStreamAccessRoute, handleGeminiStreamRoute } from "./gemini-stream-route.js";

const app = express();
const port = Number(process.env.API_PORT ?? 8787);

app.post("/api/gemini/stream", handleGeminiStreamAccessRoute, express.json({ limit: "32kb" }), handleGeminiStreamRoute);

app.get("/api/health", (_request, response) => {
  response.json({ ok: true });
});

app.listen(port, "127.0.0.1", () => {
  console.log(`Gemini 代理已启动：http://127.0.0.1:${port}`);
});
