import express from "express";
import { handleGeminiStreamRoute } from "./gemini-stream-route";

const app = express();
const port = Number(process.env.API_PORT ?? 8787);

app.use(express.json({ limit: "32kb" }));
app.post("/api/gemini/stream", handleGeminiStreamRoute);

app.get("/api/health", (_request, response) => {
  response.json({ ok: true });
});

app.listen(port, "127.0.0.1", () => {
  console.log(`Gemini 代理已启动：http://127.0.0.1:${port}`);
});
