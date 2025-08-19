import express from "express";
import fetch from "node-fetch";
import bodyParser from "body-parser";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(bodyParser.json());

// Endpoint compatible ChatBox
app.post("/v1/chat", async (req, res) => {
  try {
    const { messages, model, max_tokens, stream, img_url } = req.body;

    // On prend le dernier message de l'utilisateur
    const ask = messages && messages.length > 0 ? messages[messages.length - 1].content : "";

    // Appel vers ton API Gleeze
    const url = `https://haji-mix-api.gleeze.com/api/anthropic?ask=${encodeURIComponent(ask)}&model=${model || "claude-opus-4-20250514"}&uid=2&roleplay=&max_tokens=${max_tokens || ""}&stream=${stream || false}&img_url=${img_url || ""}&api_key=${process.env.GLEEZE_API_KEY}`;

    const response = await fetch(url, { method: "GET" });
    const data = await response.json();

    // Réponse au format attendu par ChatBox APK
    res.json({
      id: "chatcmpl-" + Date.now(),
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: model || "claude-opus-4-20250514",
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: data.answer
          },
          finish_reason: "stop"
        }
      ]
    });
  } catch (err) {
    res.status(500).json({ error: "Erreur proxy", details: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Proxy ChatBox actif sur http://localhost:${PORT}`));

