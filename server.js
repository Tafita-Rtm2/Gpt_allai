// Load environment variables from .env file
require('dotenv').config();

const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors()); // Enable CORS for all routes

// Logging middleware to see all incoming requests
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] Received ${req.method} request for ${req.url}`);
  next();
});

// --- CONFIGURATION ---
const PORT = process.env.PORT || 3000;
const HAJI_API_URL = 'https://haji-mix-api.gleeze.com/api/anthropic';
const HAJI_API_KEY = process.env.HAJI_API_KEY;
const MY_SERVER_API_KEY = process.env.MY_SERVER_API_KEY;

// --- AUTHENTICATION MIDDLEWARE ---
const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'Authorization header is missing' });
  }
  const token = authHeader.split(' ')[1];
  if (token !== MY_SERVER_API_KEY) {
    return res.status(403).json({ error: 'Invalid API key' });
  }
  next();
};

app.use('/v1', authenticate);

// --- API ENDPOINTS ---

app.get('/v1/models', async (req, res) => {
  try {
    const response = await axios.get(HAJI_API_URL, {
      params: { ask: 'hello', model: 'claude-3-opus-20240229', api_key: HAJI_API_KEY, uid: '1' },
    });
    const supportedModels = response.data.supported_models;
    if (!supportedModels || !Array.isArray(supportedModels)) {
      throw new Error('Could not retrieve supported models.');
    }
    const modelsData = supportedModels.map(modelId => ({
      id: modelId,
      object: 'model',
      created: Math.floor(Date.now() / 1000),
      owned_by: 'haji-mix-api',
    }));
    res.json({ object: 'list', data: modelsData });
  } catch (error) {
    console.error('Error fetching models:', error.message);
    res.status(500).json({ error: 'Failed to fetch models.' });
  }
});

app.post('/v1/chat/completions', async (req, res) => {
  const { model, messages, stream } = req.body;
  if (!messages || messages.length === 0) {
    return res.status(400).json({ error: 'Invalid messages array.' });
  }
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
      if (textPart) {
        ask = textPart.text;
      }
      if (imagePart && imagePart.image_url && imagePart.image_url.url) {
        imageUrl = imagePart.image_url.url;
      }
    }

    const apiParams = {
      ask: ask,
      model: model,
      api_key: HAJI_API_KEY,
      uid: '3' // Use a different UID for image requests for easier logging
    };

    if (imageUrl) {
      apiParams.img_url = imageUrl;
      console.log(`Sending image URL to external API: ${imageUrl}`);
    }
    
    console.log(`Attempting to call external API for model ${model}...`);
    const response = await axios.get(HAJI_API_URL, {
      params: apiParams,
      timeout: 120000 // Increased timeout to 2 minutes
    });

    console.log('External API call successful.');
    const apiResponse = response.data;

    if (!apiResponse || !apiResponse.answer) {
      console.error('Invalid response structure from external API:', apiResponse);
      return res.status(500).json({ error: 'Received an invalid response from the external API.' });
    }

    const modelUsed = apiResponse.model_used || model;
    const answer = apiResponse.answer;
    const completionId = `chatcmpl-${Date.now()}`;

    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      // Send a chunk for the role
      const roleChunk = {
        id: completionId,
        object: 'chat.completion.chunk',
        created: Math.floor(Date.now() / 1000),
        model: modelUsed,
        choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }],
      };
      res.write(`data: ${JSON.stringify(roleChunk)}\n\n`);

      // Send a chunk for the content
      const contentChunk = {
        id: completionId,
        object: 'chat.completion.chunk',
        created: Math.floor(Date.now() / 1000),
        model: modelUsed,
        choices: [{ index: 0, delta: { content: answer }, finish_reason: null }],
      };
      res.write(`data: ${JSON.stringify(contentChunk)}\n\n`);

      // Send the final chunk with the stop reason
      const stopChunk = {
        id: completionId,
        object: 'chat.completion.chunk',
        created: Math.floor(Date.now() / 1000),
        model: modelUsed,
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
      };
      res.write(`data: ${JSON.stringify(stopChunk)}\n\n`);
      
      // End the stream
      res.write('data: [DONE]\n\n');
      res.end();
    } else {
      // Non-streaming response
      const openAIFormattedResponse = {
        id: completionId,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: modelUsed,
        choices: [{
          index: 0,
          message: { role: 'assistant', content: answer },
          finish_reason: 'stop',
        }],
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      };
      res.json(openAIFormattedResponse);
    }
  } catch (error) {
    console.error('Error during chat completion:', error.message);
    if (error.response) {
      console.error('External API error details:', error.response.data);
      return res.status(error.response.status).json({
        error: 'An error occurred with the external API.',
        details: error.response.data
      });
    }
    res.status(500).json({ error: 'An internal server error occurred.' });
  }
});

// --- SERVER START ---
app.listen(PORT, () => {
  console.log(`OpenAI-compatible proxy server is running on http://localhost:${PORT}`);
  if (!HAJI_API_KEY || !MY_SERVER_API_KEY) {
    console.warn('Warning: API keys are not set. Please check your .env file.');
  }
});
