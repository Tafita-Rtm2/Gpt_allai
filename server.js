// Load environment variables from .env file
require('dotenv').config();

const express = require('express');
const axios = require('axios');
const cors = require('cors');
const FormData = require('form-data'); // Added for image uploads

const app = express();
// Increased body limit to handle large Base64 image strings
app.use(express.json({ limit: '50mb' }));
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
const IMGBB_API_KEY = process.env.IMGBB_API_KEY; // API key for ImgBB

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

    // 1. Extract text and image_url from the incoming message
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
    
    // 2. If an image is present, process it
    let finalImageUrl = null;
    if (imageUrl) {
      if (imageUrl.startsWith('data:image')) {
        // This is Base64 data, so we upload it to ImgBB
        console.log('Detected Base64 image data. Uploading to ImgBB...');
        if (!IMGBB_API_KEY) {
          throw new Error('IMGBB_API_KEY is not set in .env file. Cannot upload image.');
        }
        
        const base64Data = imageUrl.replace(/^data:image\/[a-z]+;base64,/, "");
        const form = new FormData();
        form.append('image', base64Data);
        
        const imgbbResponse = await axios.post(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, form, {
          headers: form.getHeaders(),
        });
        
        if (imgbbResponse.data && imgbbResponse.data.success) {
          finalImageUrl = imgbbResponse.data.data.url;
          console.log(`Image uploaded successfully. URL: ${finalImageUrl}`);
        } else {
          console.error('ImgBB upload failed:', imgbbResponse.data);
          throw new Error('Failed to upload image to ImgBB.');
        }
      } else {
        // This is a standard URL, so we can use it directly
        finalImageUrl = imageUrl;
      }
    }

    // 3. Prepare and call the haji-mix-api
    const apiParams = {
      ask: ask,
      model: model,
      api_key: HAJI_API_KEY,
      uid: '5' // Changed UID for easier log tracking
    };

    if (finalImageUrl) {
      apiParams.img_url = finalImageUrl;
    }
    
    console.log(`Calling haji-mix-api with model ${model}...`);
    const response = await axios.get(HAJI_API_URL, {
      params: apiParams,
      timeout: 120000 // 2 minutes timeout
    });

    // 4. Format and send the response to the client
    const apiResponse = response.data;
    if (!apiResponse || !apiResponse.answer) {
      console.error('Invalid response from haji-mix-api:', apiResponse);
      throw new Error('Received an invalid response from the external API.');
    }

    const modelUsed = apiResponse.model_used || model;
    const answer = apiResponse.answer;
    const completionId = `chatcmpl-${Date.now()}`;

    if (stream) {
      // Handle streaming response
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      
      const roleChunk = { id: completionId, object: 'chat.completion.chunk', created: Math.floor(Date.now() / 1000), model: modelUsed, choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }] };
      res.write(`data: ${JSON.stringify(roleChunk)}\n\n`);

      const contentChunk = { id: completionId, object: 'chat.completion.chunk', created: Math.floor(Date.now() / 1000), model: modelUsed, choices: [{ index: 0, delta: { content: answer }, finish_reason: null }] };
      res.write(`data: ${JSON.stringify(contentChunk)}\n\n`);

      const stopChunk = { id: completionId, object: 'chat.completion.chunk', created: Math.floor(Date.now() / 1000), model: modelUsed, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] };
      res.write(`data: ${JSON.stringify(stopChunk)}\n\n`);
      
      res.write('data: [DONE]\n\n');
      res.end();
    } else {
      // Handle non-streaming response
      const openAIFormattedResponse = { id: completionId, object: 'chat.completion', created: Math.floor(Date.now() / 1000), model: modelUsed, choices: [{ index: 0, message: { role: 'assistant', content: answer }, finish_reason: 'stop' }], usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }};
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
    console.warn('Warning: HAJI_API_KEY or MY_SERVER_API_KEY are not set. Please check your .env file.');
  }
  if (!IMGBB_API_KEY) {
    console.warn('Warning: IMGBB_API_KEY is not set. Image uploads will fail.');
  }
});
