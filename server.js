import express from "express";
import fetch from "node-fetch";
import bodyParser from "body-parser";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(bodyParser.json());

// Proxy vers ton API Gleeze
app.post("/api/anthropic", async (req, res) => {
  try {
    const { ask, model, uid, roleplay, max_tokens, stream, img_url } = req.body;

    const url = `https://haji-mix-api.gleeze.com/api/anthropic?ask=${encodeURIComponent(ask)}&model=${model}&uid=${uid}&roleplay=${roleplay || ""}&max_tokens=${max_tokens || ""}&stream=${stream || false}&img_url=${img_url || ""}&api_key=${process.env.GLEEZE_API_KEY}`;

    const response = await fetch(url, { method: "GET" });
    const data = await response.json();

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "Erreur proxy", details: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Proxy actif sur http://localhost:${PORT}`));
