import express from "express";
import fetch from "node-fetch";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import cors from "cors";

dotenv.config();
const app = express();

// Middlewares
app.use(cors());
app.use(bodyParser.json());

// Helper pour formater les erreurs comme OpenAI
const sendOpenAIError = (res, message, type, code, statusCode) => {
  res.status(statusCode).json({
    error: {
      message,
      type,
      param: null,
      code,
    },
  });
};

// Middleware d'authentification flexible
const authenticateKey = (req, res, next) => {
  let token = null;

  if (req.headers.authorization) {
    const parts = req.headers.authorization.split(' ');
    if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
      token = parts[1];
    } else {
      token = req.headers.authorization;
    }
  } else if (req.headers['x-api-key']) {
    token = req.headers['x-api-key'];
  } else if (req.headers['api-key']) {
    token = req.headers['api-key'];
  }

  if (!token) {
    return sendOpenAIError(res, "Vous n'avez pas fourni de clé API. Vous devez en fournir une dans un en-tête 'Authorization'.", "invalid_request_error", "api_key_missing", 401);
  }

  const validKeys = (process.env.PROXY_API_KEYS || "").split(',');
  if (!validKeys.includes(token)) {
    return sendOpenAIError(res, "Clé API incorrecte fournie. Vous pouvez en générer une sur notre site.", "invalid_request_error", "invalid_api_key", 401);
  }

  next();
};

// Route GET "/" -> message d'accueil
app.get("/", (req, res) => {
  res.json({ status: "ok", message: "Proxy actif. Utilisez /chat/completions ou /messages" });
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

  try {
    const response = await fetch(url, { method: "GET" });
    if (!response.ok) {
      // Retourne un objet d'erreur que l'appelant peut utiliser
      return { error: true, message: `L'API distante a répondu avec le statut ${response.status}`, type: 'downstream_api_error', code: 'http_error' };
    }
    const data = await response.json();
    // Vérification de la réponse de l'API distante
    if (!data.answer || typeof data.answer !== 'string' || data.answer.startsWith(',,,') || data.answer.includes('tokens used')) {
        return { error: true, message: "L'API distante a retourné une réponse invalide ou un message d'erreur.", type: 'downstream_api_error', code: 'bad_response' };
    }
    return data;
  } catch (error) {
    return { error: true, message: `Impossible de contacter l'API distante. Détails: ${error.message}`, type: 'downstream_api_error', code: 'network_error' };
  }
}

// Route compatible OpenAI : /chat/completions
app.post("/chat/completions", authenticateKey, async (req, res) => {
  try {
    const { messages, model } = req.body;
    const ask = messages && messages.length > 0 ? messages[messages.length - 1].content : "";

    const data = await callGleeze(ask, model);

    if (data.error) {
        return sendOpenAIError(res, data.message, data.type, data.code, 500);
    }

    res.json({
      id: "chatcmpl-" + Date.now(),
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: model,
      choices: [ { index: 0, message: { role: "assistant", content: data.answer }, finish_reason: "stop" } ]
    });
  } catch (err) {
    sendOpenAIError(res, `Une erreur interne inattendue s'est produite. Détails: ${err.message}`, 'internal_server_error', 'proxy_error', 500);
  }
});

// Route compatible Anthropic : /messages
app.post("/messages", authenticateKey, async (req, res) => {
  try {
    const { messages, model } = req.body;
    const ask = messages && messages.length > 0 ? messages[messages.length - 1].content : "";

    const data = await callGleeze(ask, model);

    if (data.error) {
        return sendOpenAIError(res, data.message, data.type, data.code, 500);
    }

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
    sendOpenAIError(res, `Une erreur interne inattendue s'est produite. Détails: ${err.message}`, 'internal_server_error', 'proxy_error', 500);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Proxy actif sur http://localhost:${PORT}`));
