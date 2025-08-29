// Load environment variables from .env file
require('dotenv').config();

const express = require('express');
const axios = require('axios');
const cors = require('cors');
const FormData = require('form-data');

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(cors());
app.use(express.static('public'));

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] Received ${req.method} request for ${req.url}`);
  next();
});

// --- CONFIGURATION ---
const PORT = process.env.PORT || 3000;
// API Keys
const HAJI_API_KEY = process.env.HAJI_API_KEY;
const HAJI_GEMINI_API_KEY = process.env.HAJI_GEMINI_API_KEY;
const IMGBB_API_KEY = process.env.IMGBB_API_KEY;
const VALID_API_KEYS = (process.env.VALID_API_KEYS || '').split(',').filter(Boolean);
if (VALID_API_KEYS.length === 0) {
    console.warn('Warning: No VALID_API_KEYS found in .env. All API requests will be rejected.');
}
// API URLs from .env for security. No fallbacks for better security.
const HAJI_ANTHROPIC_URL = process.env.HAJI_ANTHROPIC_URL;
const HAJI_FLUX_URL = process.env.HAJI_FLUX_URL;
const HAJI_GPTOSS_URL = process.env.HAJI_GPTOSS_URL;
const HAJI_GEMINI_URL = process.env.HAJI_GEMINI_URL;
const IMGBB_UPLOAD_URL = process.env.IMGBB_UPLOAD_URL;

// Create a pool of available keys to be dispensed.
// This is a copy of the original list. As keys are dispensed, they are removed from this pool.
// Note: This pool will reset every time the server restarts.
let availableKeys = [...VALID_API_KEYS];

const imageGenerationKeywords = [
    'generate image of', 'cree une image', 'generate an image of', 'generate image', 'generate an image', 'generate',
    'create image of', 'create an image of', 'create image', 'create an image', 'create',
    'draw image of', 'draw an image of', 'draw image', 'draw an image', 'draw',
    'génère une image de', 'génère image de', 'génère une image', 'génère image', 'génère',
    'crée une image de', 'crée image de', 'crée une image', 'crée image', 'crée',
    'dessine une image de', 'dessine image de', 'dessine une image', 'dessine image', 'dessine',
];

const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'Authorization header is missing' });
  }
  const token = authHeader.split(' ')[1];
  if (!VALID_API_KEYS.includes(token)) {
    return res.status(403).json({ error: 'Invalid API key' });
  }
  next();
};

// Endpoint to dispense an API key from the pool.
app.post('/api/generate-key', (req, res) => {
    if (availableKeys.length === 0) {
        return res.status(503).json({ error: 'No more API keys are available at this time.' });
    }
    // Get the last key from the array.
    const keyToDispense = availableKeys.pop();
    console.log(`Dispensed key. Keys remaining: ${availableKeys.length}`);
    res.json({ apiKey: keyToDispense });
});

app.use('/v1', authenticate);

app.get('/v1/models', async (req, res) => {
  try {
    const response = await axios.get(HAJI_ANTHROPIC_URL, {
      params: { ask: 'hello', model: 'claude-3-opus-20240229', api_key: HAJI_API_KEY, uid: '1' },
    });
    const supportedModels = response.data.supported_models;
    if (!supportedModels || !Array.isArray(supportedModels)) {
      throw new Error('Could not retrieve supported models.');
    }
    let modelsData = supportedModels.map(modelId => ({
      id: modelId,
      object: 'model',
      created: Math.floor(Date.now() / 1000),
      owned_by: 'rtm-mix-api',
    }));

    // Add the hardcoded Gemini models to the list
    const geminiModelsToAdd = geminiModels.map(modelId => ({
        id: modelId,
        object: 'model',
        created: Math.floor(Date.now() / 1000),
        owned_by: 'rtm-mix-api',
    }));

    modelsData = modelsData.concat(geminiModelsToAdd);

    res.json({ object: 'list', data: modelsData });
  } catch (error) {
    console.error('Error fetching models:', error.message);
    res.status(500).json({ error: 'Failed to fetch models.' });
  }
});
const geminiModels = [
    "gemini-1.5-pro-latest", "gemini-1.5-pro-002", "gemini-1.5-pro", "gemini-1.5-flash-latest",
    "gemini-1.5-flash", "gemini-1.5-flash-002", "gemini-1.5-flash-8b", "gemini-1.5-flash-8b-001",
    "gemini-1.5-flash-8b-latest", "gemini-2.5-pro-preview-03-25", "gemini-2.5-flash-preview-05-20",
    "gemini-2.5-flash", "gemini-2.5-flash-lite-preview-06-17", "gemini-2.5-pro-preview-05-06",
    "gemini-2.5-pro-preview-06-05", "gemini-2.5-pro", "gemini-2.0-flash-exp", "gemini-2.0-flash",
    "gemini-2.0-flash-001", "gemini-2.0-flash-exp-image-generation", "gemini-2.0-flash-lite-001",
    "gemini-2.0-flash-lite", "gemini-2.0-flash-preview-image-generation", "gemini-2.0-flash-lite-preview-02-05",
    "gemini-2.0-flash-lite-preview", "gemini-2.0-pro-exp", "gemini-2.0-pro-exp-02-05", "gemini-exp-1206",
    "gemini-2.0-flash-thinking-exp-01-21", "gemini-2.0-flash-thinking-exp", "gemini-2.0-flash-thinking-exp-1219",
    "gemini-2.5-flash-preview-tts", "gemini-2.5-pro-preview-tts", "learnlm-2.0-flash-experimental",
    "gemma-3-1b-it", "gemma-3-4b-it", "gemma-3-12b-it", "gemma-3-27b-it", "gemma-3n-e4b-it",
    "gemma-3n-e2b-it", "gemini-2.5-flash-lite", "gemini-2.5-flash-image-preview"
];

app.post('/v1/chat/completions', async (req, res) => {
  const { model, messages, stream, user, max_tokens, google_api_key } = req.body;
  if (!messages || messages.length === 0) {
    return res.status(400).json({ error: 'Invalid messages array.' });
  }
  const systemMessage = messages.find(m => m.role === 'system');
  const roleplay = systemMessage ? systemMessage.content : '';
  const userMessage = messages.filter(m => m.role === 'user').pop();
  if (!userMessage) {
    return res.status(400).json({ error: 'No user message found.' });
  }

  try {
    let ask = '';
    let imageUrl = null;

    if (typeof userMessage.content === 'string') {
      ask = userMessage.content;
    } else if (Array.isArray(userMessage.content)) {
      const textPart = userMessage.content.find(part => part.type === 'text');
      const imagePart = userMessage.content.find(part => part.type === 'image_url');
      if (textPart) ask = textPart.text;
      if (imagePart && imagePart.image_url && imagePart.image_url.url) {
        imageUrl = imagePart.image_url.url;
      }
    }

    const uid = user || `anonymous-user-${Date.now()}`;
    const lowerCaseAsk = ask.toLowerCase().trim();
    const triggerKeyword = imageGenerationKeywords.find(keyword => lowerCaseAsk === keyword || lowerCaseAsk.startsWith(keyword + ' '));

    if (geminiModels.includes(model)) {
        // --- Start of Gemini Logic (mirrors Claude's logic) ---
        let finalImageUrl = null;
        if (imageUrl) {
            if (imageUrl.startsWith('data:image')) {
                const base64Data = imageUrl.replace(/^data:image\/[a-z]+;base64,/, "");
                const form = new FormData();
                form.append('image', base64Data);
                const imgbbResponse = await axios.post(`${IMGBB_UPLOAD_URL}?key=${IMGBB_API_KEY}`, form, { headers: form.getHeaders() });
                if (imgbbResponse.data && imgbbResponse.data.success) {
                    finalImageUrl = imgbbResponse.data.data.url;
                } else {
                    throw new Error('Failed to upload image to ImgBB.');
                }
            } else {
                finalImageUrl = imageUrl;
            }
        }

        const apiParams = {
            ask: ask,
            model: model,
            api_key: HAJI_GEMINI_API_KEY,
            uid,
            roleplay,
            max_tokens: max_tokens || '',
            google_api_key: google_api_key || '',
        };
        if (finalImageUrl) apiParams.file_url = finalImageUrl;

        const response = await axios.get(HAJI_GEMINI_URL, { params: apiParams, timeout: 120000 });
        const apiResponse = response.data;

        if (!apiResponse || !apiResponse.answer) {
            console.error('Invalid response from Gemini API. Full response:', JSON.stringify(apiResponse, null, 2));
            throw new Error('Received an invalid response from the external Gemini API.');
        }

        const modelUsed = apiResponse.model_used || model;
        const answer = apiResponse.answer;
        const completionId = `chatcmpl-${Date.now()}`;

        if (stream) {
            res.setHeader('Content-Type', 'text/event-stream');
            const roleChunk = { id: completionId, object: 'chat.completion.chunk', created: Math.floor(Date.now() / 1000), model: modelUsed, choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }] };
            res.write(`data: ${JSON.stringify(roleChunk)}\n\n`);
            const contentChunk = { id: completionId, object: 'chat.completion.chunk', created: Math.floor(Date.now() / 1000), model: modelUsed, choices: [{ index: 0, delta: { content: answer }, finish_reason: null }] };
            res.write(`data: ${JSON.stringify(contentChunk)}\n\n`);
            const stopChunk = { id: completionId, object: 'chat.completion.chunk', created: Math.floor(Date.now() / 1000), model: modelUsed, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] };
            res.write(`data: ${JSON.stringify(stopChunk)}\n\n`);
            res.write('data: [DONE]\n\n');
            res.end();
        } else {
            res.json({ id: completionId, object: 'chat.completion', created: Math.floor(Date.now() / 1000), model: modelUsed, choices: [{ index: 0, message: { role: 'assistant', content: answer }, finish_reason: 'stop' }], usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 } });
        }
        return;
        // --- End of Gemini Logic ---
    }

    if (triggerKeyword && !imageUrl) {
      const prompt = ask.substring(triggerKeyword.length).trim();
      const fluxResponse = await axios.get(HAJI_FLUX_URL, {
        params: { prompt, api_key: HAJI_API_KEY, uid },
        responseType: 'arraybuffer',
      });

      const base64Data = Buffer.from(fluxResponse.data, 'binary').toString('base64');
      const form = new FormData();
      form.append('image', base64Data);
      const imgbbResponse = await axios.post(`${IMGBB_UPLOAD_URL}?key=${IMGBB_API_KEY}`, form, {
        headers: form.getHeaders(),
      });

      if (!imgbbResponse.data || !imgbbResponse.data.success) {
        throw new Error('Failed to upload generated image to ImgBB.');
      }
      const generatedImageUrl = imgbbResponse.data.data.url;
      const responseContent = `![Generated Image](${generatedImageUrl})`;
      const completionId = `chatcmpl-gen-${Date.now()}`;

      if (stream) {
        const roleChunk = { id: completionId, object: 'chat.completion.chunk', created: Math.floor(Date.now() / 1000), model: model, choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }] };
        res.write(`data: ${JSON.stringify(roleChunk)}\n\n`);
        const contentChunk = { id: completionId, object: 'chat.completion.chunk', created: Math.floor(Date.now() / 1000), model: model, choices: [{ index: 0, delta: { content: responseContent }, finish_reason: null }] };
        res.write(`data: ${JSON.stringify(contentChunk)}\n\n`);
        const stopChunk = { id: completionId, object: 'chat.completion.chunk', created: Math.floor(Date.now() / 1000), model: model, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] };
        res.write(`data: ${JSON.stringify(stopChunk)}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
      } else {
        res.json({ id: completionId, object: 'chat.completion', created: Math.floor(Date.now() / 1000), model: model, choices: [{ index: 0, message: { role: 'assistant', content: responseContent }, finish_reason: 'stop' }], usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 } });
      }
      return;
    }
    let finalImageUrl = null;
    if (imageUrl) {
      if (imageUrl.startsWith('data:image')) {
        const base64Data = imageUrl.replace(/^data:image\/[a-z]+;base64,/, "");
        const form = new FormData();
        form.append('image', base64Data);
        const imgbbResponse = await axios.post(`${IMGBB_UPLOAD_URL}?key=${IMGBB_API_KEY}`, form, { headers: form.getHeaders() });
        if (imgbbResponse.data && imgbbResponse.data.success) {
          finalImageUrl = imgbbResponse.data.data.url;
        } else {
          throw new Error('Failed to upload image to ImgBB.');
        }
      } else {
        finalImageUrl = imageUrl;
      }
    }

    const apiParams = { ask, model, api_key: HAJI_API_KEY, uid };
    if (finalImageUrl) apiParams.img_url = finalImageUrl;

    // For Claude, we don't pass the stream parameter to the backend.
    // We get the full response and then manually create a stream if requested by the client.
    const response = await axios.get(HAJI_ANTHROPIC_URL, { params: apiParams, timeout: 120000 });
    const apiResponse = response.data;
    if (!apiResponse || !apiResponse.answer) {
      throw new Error('Received an invalid response from the external API.');
    }

    const modelUsed = apiResponse.model_used || model;
    const answer = apiResponse.answer;
    const completionId = `chatcmpl-${Date.now()}`;

    if (stream) {
      // Manually create the stream response
      res.setHeader('Content-Type', 'text/event-stream');
      const roleChunk = { id: completionId, object: 'chat.completion.chunk', created: Math.floor(Date.now() / 1000), model: modelUsed, choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }] };
      res.write(`data: ${JSON.stringify(roleChunk)}\n\n`);
      const contentChunk = { id: completionId, object: 'chat.completion.chunk', created: Math.floor(Date.now() / 1000), model: modelUsed, choices: [{ index: 0, delta: { content: answer }, finish_reason: null }] };
      res.write(`data: ${JSON.stringify(contentChunk)}\n\n`);
      const stopChunk = { id: completionId, object: 'chat.completion.chunk', created: Math.floor(Date.now() / 1000), model: modelUsed, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] };
      res.write(`data: ${JSON.stringify(stopChunk)}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
    } else {
      res.json({ id: completionId, object: 'chat.completion', created: Math.floor(Date.now() / 1000), model: modelUsed, choices: [{ index: 0, message: { role: 'assistant', content: answer }, finish_reason: 'stop' }], usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 } });
    }
  } catch (error) {
    console.error('Error during chat completion:', error.message);
    if (error.response) {
      return res.status(error.response.status).json({ error: 'An error occurred with the external API.', details: error.response.data });
    }
    res.status(500).json({ error: 'An internal server error occurred.' });
  }
});

app.post('/v1/images/generations', async (req, res) => {
  const { prompt, user } = req.body;
  if (!prompt) {
    return res.status(400).json({ error: 'Prompt is missing.' });
  }
  const uid = user || `anonymous-user-${Date.now()}`;
  try {
    const fluxResponse = await axios.get(HAJI_FLUX_URL, {
      params: { prompt, api_key: HAJI_API_KEY, uid },
      responseType: 'arraybuffer'
    });
    const base64Data = Buffer.from(fluxResponse.data, 'binary').toString('base64');
    const form = new FormData();
    form.append('image', base64Data);
    const imgbbResponse = await axios.post(`${IMGBB_UPLOAD_URL}?key=${IMGBB_API_KEY}`, form, { headers: form.getHeaders() });
    if (!imgbbResponse.data || !imgbbResponse.data.success) {
      throw new Error('Failed to upload generated image to ImgBB.');
    }
    const finalImageUrl = imgbbResponse.data.data.url;
    res.json({ created: Math.floor(Date.now() / 1000), data: [{ url: finalImageUrl }] });
  } catch (error) {
    console.error('Error during image generation:', error.message);
    if (error.response) {
      return res.status(error.response.status).json({ error: 'An error occurred with the external image generation API.', details: error.response.data });
    }
    res.status(500).json({ error: 'An internal server error occurred during image generation.' });
  }
});

app.listen(PORT, () => {
  console.log(`OpenAI-compatible proxy server is running on http://localhost:${PORT}`);

  const requiredVars = [
    'HAJI_API_KEY', 'IMGBB_API_KEY', 'VALID_API_KEYS', 'HAJI_GEMINI_API_KEY',
    'HAJI_ANTHROPIC_URL', 'HAJI_FLUX_URL', 'IMGBB_UPLOAD_URL', 'HAJI_GPTOSS_URL', 'HAJI_GEMINI_URL'
  ];
  const missingVars = requiredVars.filter(v => !process.env[v]);

  if (missingVars.length > 0) {
    console.warn(`\n!!! WARNING: The following required environment variables are not set in your .env file:`);
    missingVars.forEach(v => console.warn(`- ${v}`));
    console.warn('The application will likely fail without them.\n');
  }
});
