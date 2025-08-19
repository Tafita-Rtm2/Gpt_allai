import express from "express";
import fetch from "node-fetch";
import bodyParser from "body-parser";
import dotenv from "dotenv";

dotenv.config();
const app = express();
app.use(bodyParser.json());

// Route GET "/" -> message d'accueil
app.get("/", (req, res) => {
  res.json({ status: "ok", message: "Proxy actif. Utilisez /v1/chat/completions ou /v1/messages" });
});

// Mapping des modèles (alias)
const modelMap = {
  "claude-opus-4.1": "claude-opus-4-20250514",
  "claude-opus-4-0": "claude-opus-4-20250514",
  "claude-sonnet-4-0": "claude-sonnet-4-20250514",
  "claude-3-7-sonnet-latest": "claude-3-7-sonnet-20250219",
  "claude-3-5-sonnet-latest": "claude-3-5-sonnet-20241022",
  "claude-3-5-haiku-latest": "claude-3-5-haiku-20241022",
  "claude-3-opus-latest": "claude-3-opus-20240229"
};

// Fonction proxy
async function callGleeze(ask, model) {
  const targetModel = modelMap[model] || model;

  const url = `https://haji-mix-api.gleeze.com/api/anthropic?ask=${encodeURIComponent(ask)}&model=${targetModel}&uid=2&roleplay=&max_tokens=&stream=false&img_url=&api_key=${process.env.GLEEZE_API_KEY}`;

  const response = await fetch(url, { method: "GET" });
  return response.json();
}

// Route compatible OpenAI : /v1/chat/completions
app.post("/v1/chat/completions", async (req, res) => {
  try {
    const { messages, model } = req.body;
    const ask = messages && messages.length > 0 ? messages[messages.length - 1].content : "";

    const data = await callGleeze(ask, model);

    res.json({
      id: "chatcmpl-" + Date.now(),
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: model,
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: data.answer },
          finish_reason: "stop"
        }
      ]
    });
  } catch (err) {
    res.status(500).json({ error: "Proxy error", details: err.message });
  }
});

// Route compatible Anthropic : /v1/messages
app.post("/v1/messages", async (req, res) => {
  try {
    const { messages, model } = req.body;
    const ask = messages && messages.length > 0 ? messages[messages.length - 1].content : "";

    const data = await callGleeze(ask, model);

    res.json({
      id: "msg-" + Date.now(),
      type: "message",
      role: "assistant",
      content: [{ type: "text", text: data.answer }],
      model: model,
      stop_reason: "end_turn",
      stop_sequence: null
    });
  } catch (err) {
    res.status(500).json({ error: "Proxy error", details: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Proxy actif sur http://localhost:${PORT}`));
