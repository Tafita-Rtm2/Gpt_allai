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
const HAJI_PUTER_API_KEY = process.env.HAJI_PUTER_API_KEY;
const HAJI_OPENAI_API_KEY = process.env.HAJI_OPENAI_API_KEY;
const IMGBB_API_KEY = process.env.IMGBB_API_KEY;

// New provider-specific keys
const CLAUDE_API_KEYS = (process.env.CLAUDE_API_KEYS || '').split(',').filter(Boolean);
const GEMINI_API_KEYS = (process.env.GEMINI_API_KEYS || '').split(',').filter(Boolean);
const OPENAI_GPT_API_KEYS = (process.env.OPENAI_GPT_API_KEYS || '').split(',').filter(Boolean);
const PUTER_API_KEYS = (process.env.PUTER_API_KEYS || '').split(',').filter(Boolean);
const DEEPSEEK_API_KEYS = (process.env.DEEPSEEK_API_KEYS || '').split(',').filter(Boolean);

const VALID_API_KEYS = [
    ...CLAUDE_API_KEYS.map(k => `claude_${k}`),
    ...GEMINI_API_KEYS.map(k => `gemini_${k}`),
    ...OPENAI_GPT_API_KEYS.map(k => `openai_gpt_${k}`),
    ...PUTER_API_KEYS.map(k => `puter_${k}`),
    ...DEEPSEEK_API_KEYS.map(k => `deepseek_${k}`),
];

if (VALID_API_KEYS.length === 0) {
    console.warn('Warning: No provider-specific API keys found in .env. All API requests will be rejected.');
}
// API URLs from .env for security. No fallbacks for better security.
const HAJI_ANTHROPIC_URL = process.env.HAJI_ANTHROPIC_URL;
const HAJI_FLUX_URL = process.env.HAJI_FLUX_URL;
const HAJI_GPTOSS_URL = process.env.HAJI_GPTOSS_URL;
const HAJI_GEMINI_URL = process.env.HAJI_GEMINI_URL;
const HAJI_PUTER_URL = process.env.HAJI_PUTER_URL;
const HAJI_OPENAI_URL = process.env.HAJI_OPENAI_URL;
const HAJI_IMAGEN_URL = process.env.HAJI_IMAGEN_URL;
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
    const { provider } = req.body;
    let keyPool;

    switch (provider) {
        case 'claude':
            keyPool = CLAUDE_API_KEYS;
            break;
        case 'gemini':
            keyPool = GEMINI_API_KEYS;
            break;
        case 'openai_gpt':
            keyPool = OPENAI_GPT_API_KEYS;
            break;
        case 'puter':
            keyPool = PUTER_API_KEYS;
            break;
        case 'deepseek':
            keyPool = DEEPSEEK_API_KEYS;
            break;
        default:
            return res.status(400).json({ error: 'Invalid provider specified.' });
    }

    if (!keyPool || keyPool.length === 0) {
        return res.status(503).json({ error: `No API keys are available for the ${provider} provider at this time.` });
    }

    // For simplicity, we'll just dispense the first key from the provider's pool.
    // A more robust solution might involve rotation or random selection.
    const key = keyPool[0];
    const prefixedKey = `${provider}_${key}`;

    res.json({ apiKey: prefixedKey });
});

app.use('/v1', authenticate);

app.get('/v1/models', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        const token = authHeader.split(' ')[1];
        const provider = token.split('_')[0];

        let modelsList = [];
        let owner = 'rtm-mix-api';

        switch (provider) {
            case 'claude':
                const response = await axios.get(HAJI_ANTHROPIC_URL, {
                    params: { ask: 'hello', model: 'claude-3-opus-20240229', api_key: HAJI_API_KEY, uid: '1' },
                });
                if (!response.data.supported_models || !Array.isArray(response.data.supported_models)) {
                    throw new Error('Could not retrieve supported models from Claude API.');
                }
                modelsList = response.data.supported_models;
                owner = 'anthropic';
                break;
            case 'gemini':
                modelsList = geminiModels;
                owner = 'google';
                break;
            case 'openai_gpt':
                modelsList = openAiGptModels;
                owner = 'openai';
                break;
            case 'puter':
                modelsList = puterModels;
                owner = 'puter';
                break;
            case 'deepseek':
                modelsList = deepseekModels;
                owner = 'deepseek';
                break;
            default:
                return res.status(400).json({ error: 'Invalid provider derived from API key.' });
        }

        const modelsData = modelsList.map(modelId => ({
            id: modelId,
            object: 'model',
            created: Math.floor(Date.now() / 1000),
            owned_by: owner,
        }));

        res.json({ object: 'list', data: modelsData });
    } catch (error) {
        console.error('Error fetching models:', error.message);
        res.status(500).json({ error: 'Failed to fetch models.' });
    }
});

// --- Model Lists by Provider ---

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
    "gemma-3n-e2b-it", "gemini-2.5-flash-lite", "gemini-2.5-flash-image-preview", "google/gemini-2.5-flash-image-preview",
    "google/gemini-2.5-flash-lite", "google/gemini-2.5-flash-lite-preview-06-17", "google/gemini-2.5-flash", "google/gemini-2.5-pro",
    "google/gemini-2.5-pro-preview", "google/gemma-2b-it", "google/gemma-3n-e4b-it", "google/gemini-2.5-flash-preview-05-20",
    "google/gemini-2.5-pro-preview-05-06", "google/gemini-2.5-flash-preview", "google/gemini-2.5-pro-exp-03-25",
    "google/gemma-3-1b-it", "google/gemma-3-4b-it", "google/gemma-3-12b-it", "google/gemma-3-27b-it", "google/gemini-2.0-flash-lite-001",
    "google/gemini-2.0-flash-001", "google/gemini-2.0-flash-exp", "google/gemini-exp-1121", "google/gemini-exp-1114", "google/gemini-flash-1.5-8b",
    "google/gemini-flash-1.5-exp", "google/gemini-pro-1.5-exp", "google/gemini-flash-1.5", "google/gemini-pro-1.5", "google/gemma-7b-it",
    "google/palm-2-codechat-bison-32k", "google/palm-2-chat-bison-32k", "google/palm-2-chat-bison", "google/palm-2-codechat-bison"
];

const deepseekModels = [
    "deepseek/deepseek-chat-v3.1", "deepseek/deepseek-v3.1-base", "tngtech/deepseek-r1t2-chimera",
    "deepseek/deepseek-r1-distill-qwen-7b", "deepseek/deepseek-r1-0528-qwen3-8b", "deepseek/deepseek-r1-0528",
    "deepseek/deepseek-prover-v2", "tngtech/deepseek-r1t-chimera", "deepseek/deepseek-v3-base", "deepseek/deepseek-chat-v3-0324",
    "deepseek/deepseek-r1-zero", "deepseek/deepseek-r1-distill-llama-8b", "deepseek/deepseek-r1-distill-qwen-1.5b",
    "deepseek/deepseek-r1-distill-qwen-32b", "deepseek/deepseek-r1-distill-qwen-14b", "deepseek/deepseek-r1-distill-llama-70b",
    "deepseek/deepseek-r1", "deepseek/deepseek-chat", "deepseek/deepseek-chat-v2.5"
];

const openAiGptModels = [
    "openai/gpt-4o-audio-preview", "openai/gpt-oss-120b", "openai/gpt-oss-20b", "openai/o3-pro", "openai/codex-mini",
    "openai/o4-mini-high", "openai/o3", "openai/o4-mini", "openai/gpt-4.1", "openai/gpt-4.1-mini", "openai/gpt-4.1-nano",
    "openai/o1-pro", "openai/gpt-4o-mini-search-preview", "openai/gpt-4o-search-preview", "openai/gpt-4.5-preview",
    "openai/o3-mini-high", "openai/o3-mini", "openai/o1", "openai/gpt-4o-2024-11-20", "openai/o1-mini", "openai/o1-mini-2024-09-12",
    "openai/o1-preview", "openai/o1-preview-2024-09-12", "openai/chatgpt-4o-latest", "openai/gpt-4o-2024-08-06",
    "openai/gpt-4o-mini", "openai/gpt-4o-mini-2024-07-18", "openai/gpt-4o", "openai/gpt-4o-2024-05-13", "openai/gpt-4-turbo",
    "openai/gpt-3.5-turbo-0613", "openai/gpt-4-turbo-preview", "openai/gpt-4-vision-preview", "openai/gpt-3.5-turbo-1106",
    "openai/gpt-4-1106-preview", "openai/gpt-3.5-turbo-instruct", "openai/gpt-3.5-turbo-16k", "openai/gpt-4-32k-0314",
    "openai/gpt-4-32k", "openai/gpt-4", "openai/gpt-3.5-turbo-0125", "openai/gpt-4-0314", "openai/gpt-3.5-turbo-0301",
    "openai/gpt-3.5-turbo", "gpt-4-0613", "gpt-4", "gpt-3.5-turbo", "gpt-3.5-turbo-instruct", "gpt-3.5-turbo-instruct-0914",
    "gpt-4-1106-preview", "gpt-3.5-turbo-1106", "gpt-4-0125-preview", "gpt-4-turbo-preview", "gpt-3.5-turbo-0125",
    "gpt-4-turbo", "gpt-4-turbo-2024-04-09", "gpt-4o", "gpt-4o-2024-05-13", "gpt-4o-mini-2024-07-18", "gpt-4o-mini",
    "gpt-4o-2024-08-06", "chatgpt-4o-latest", "o1-mini-2024-09-12", "o1-mini", "o1-2024-12-17", "o1", "o3-mini",
    "o3-mini-2025-01-31", "gpt-4o-2024-11-20", "gpt-4o-search-preview-2025-03-11", "gpt-4o-search-preview",
    "gpt-4o-mini-search-preview-2025-03-11", "gpt-4o-mini-search-preview", "o1-pro-2025-03-19", "o1-pro", "o3-2025-04-16",
    "o4-mini-2025-04-16", "o3", "o4-mini", "gpt-4.1-2025-04-14", "gpt-4.1", "gpt-4.1-mini-2025-04-14", "gpt-4.1-mini",
    "gpt-4.1-nano-2025-04-14", "gpt-4.1-nano", "gpt-3.5-turbo-16k"
];

const puterModels = [
    "openai/gpt-5-chat", "openai/gpt-5", "openai/gpt-5-mini", "openai/gpt-5-nano", "gpt-5-nano", "gpt-5-chat-latest",
    "gpt-5-2025-08-07", "gpt-5", "gpt-5-mini-2025-08-07", "gpt-5-mini", "gpt-5-nano-2025-08-07",
    // The rest of the original 'puterModels' are actually from various providers,
    // so we will list them here under 'puter' as a generic/mixed provider.
    "qwen/qwen3-30b-a3b-thinking-2507", "x-ai/grok-code-fast-1", "nousresearch/hermes-4-70b", "nousresearch/hermes-4-405b",
    "mistralai/mistral-medium-3.1", "baidu/ernie-4.5-21b-a3b", "baidu/ernie-4.5-vl-28b-a3b", "z-ai/glm-4.5v", "ai21/jamba-mini-1.7",
    "ai21/jamba-large-1.7", "anthropic/claude-opus-4.1", "openrouter/horizon-beta", "mistralai/codestral-2508", "qwen/qwen3-coder-30b-a3b-instruct",
    "openrouter/horizon-alpha", "qwen/qwen3-30b-a3b-instruct-2507", "z-ai/glm-4.5", "z-ai/glm-4.5-air", "qwen/qwen3-235b-a22b-thinking-2507",
    "z-ai/glm-4-32b", "qwen/qwen3-coder", "bytedance/ui-tars-1.5-7b", "qwen/qwen3-235b-a22b-2507",
    "switchpoint/router", "moonshotai/kimi-k2", "thudm/glm-4.1v-9b-thinking", "mistralai/devstral-medium", "mistralai/devstral-small",
    "cognitivecomputations/dolphin-mistral-24b-venice-edition", "x-ai/grok-4", "tencent/hunyuan-a13b-instruct",
    "morph/morph-v3-large", "morph/morph-v3-fast", "openrouter/cypher-alpha", "baidu/ernie-4.5-vl-424b-a47b",
    "baidu/ernie-4.5-300b-a47b", "thedrummer/anubis-70b-v1.1", "inception/mercury", "morph/morph-v2", "mistralai/mistral-small-3.2-24b-instruct",
    "minimax/minimax-m1", "moonshotai/kimi-dev-72b", "x-ai/grok-3-mini", "x-ai/grok-3", "mistralai/magistral-small-2506", "mistralai/magistral-medium-2506",
    "sentientagi/dobby-mini-unhinged-plus-llama-3.1-8b", "sarvamai/sarvam-m", "thedrummer/valkyrie-49b-v1",
    "anthropic/claude-opus-4", "anthropic/claude-sonnet-4", "mistralai/devstral-small-2505",
    "meta-llama/llama-3.3-8b-instruct", "nousresearch/deephermes-3-mistral-24b-preview",
    "mistralai/mistral-medium-3", "arcee-ai/caller-large", "arcee-ai/spotlight", "arcee-ai/maestro-reasoning",
    "arcee-ai/virtuoso-large", "arcee-ai/coder-large", "arcee-ai/virtuoso-medium-v2", "arcee-ai/arcee-blitz", "microsoft/phi-4-reasoning-plus",
    "microsoft/phi-4-reasoning", "qwen/qwen3-0.6b-04-28", "inception/mercury-coder", "qwen/qwen3-1.7b", "qwen/qwen3-4b", "opengvlab/internvl3-14b",
    "opengvlab/internvl3-2b", "meta-llama/llama-guard-4-12b", "qwen/qwen3-30b-a3b", "qwen/qwen3-8b",
    "qwen/qwen3-14b", "qwen/qwen3-32b", "qwen/qwen3-235b-a22b", "thudm/glm-z1-rumination-32b", "thudm/glm-z1-9b",
    "thudm/glm-4-9b", "microsoft/mai-ds-r1", "thudm/glm-z1-32b", "thudm/glm-4-32b", "shisa-ai/shisa-v2-llama3.3-70b", "qwen/qwen2.5-coder-7b-instruct",
    "eleutherai/llemma_7b", "alfredpros/codellama-7b-instruct-solidity", "arliai/qwq-32b-arliai-rpr-v1",
    "agentica-org/deepcoder-14b-preview", "moonshotai/kimi-vl-a3b-thinking", "openrouter/optimus-alpha", "x-ai/grok-3-mini-beta",
    "x-ai/grok-3-beta", "nvidia/llama-3.1-nemotron-nano-8b-v1", "nvidia/llama-3.3-nemotron-super-49b-v1", "nvidia/llama-3.1-nemotron-ultra-253b-v1",
    "tokyotech-llm/llama-3.1-swallow-8b-instruct-v0.3", "meta-llama/llama-4-maverick", "meta-llama/llama-4-scout", "openrouter/quasar-alpha",
    "all-hands/openhands-lm-32b-v0.1", "scb10x/llama3.1-typhoon2-8b-instruct", "scb10x/llama3.1-typhoon2-70b-instruct",
    "allenai/molmo-7b-d", "bytedance-research/ui-tars-72b", "qwen/qwen2.5-vl-3b-instruct",
    "qwen/qwen2.5-vl-32b-instruct", "featherless/qwerky-72b", "mistralai/mistral-small-3.1-24b-instruct",
    "open-r1/olympiccoder-32b", "steelskull/l3.3-electra-r1-70b", "allenai/olmo-2-0325-32b-instruct",
    "ai21/jamba-1.6-large", "ai21/jamba-1.6-mini", "cohere/command-a",
    "rekaai/reka-flash-3", "thedrummer/anubis-pro-105b-v1",
    "latitudegames/wayfarer-large-70b-llama-3.3", "thedrummer/skyfall-36b-v2", "microsoft/phi-4-multimodal-instruct", "perplexity/sonar-reasoning-pro",
    "perplexity/sonar-pro", "perplexity/sonar-deep-research", "qwen/qwq-32b", "qwen/qwen2.5-32b-instruct",
    "moonshotai/moonlight-16b-a3b-instruct", "nousresearch/deephermes-3-llama-3-8b-preview",
    "anthropic/claude-3.7-sonnet", "perplexity/r1-1776", "mistralai/mistral-saba", "cognitivecomputations/dolphin3.0-r1-mistral-24b",
    "cognitivecomputations/dolphin3.0-mistral-24b", "meta-llama/llama-guard-3-8b", "allenai/llama-3.1-tulu-3-405b",
    "qwen/qwen-vl-plus", "aion-labs/aion-1.0", "aion-labs/aion-1.0-mini",
    "aion-labs/aion-rp-llama-3.1-8b", "qwen/qwen-vl-max", "qwen/qwen-turbo", "qwen/qwen2.5-vl-72b-instruct", "qwen/qwen-plus", "qwen/qwen-max",
    "mistralai/mistral-small-24b-instruct-2501", "perplexity/sonar-reasoning", "perplexity/sonar", "liquid/lfm-7b", "liquid/lfm-3b",
    "minimax/minimax-01", "mistralai/codestral-2501", "microsoft/phi-4",
    "sao10k/l3.1-70b-hanami-x1", "sao10k/l3.3-euryale-70b", "inflatebot/mn-mag-mell-r1",
    "eva-unit-01/eva-llama-3.33-70b", "x-ai/grok-2-vision-1212", "x-ai/grok-2-1212", "cohere/command-r7b-12-2024",
    "meta-llama/llama-3.3-70b-instruct", "amazon/nova-lite-v1", "amazon/nova-micro-v1", "amazon/nova-pro-v1", "qwen/qwq-32b-preview",
    "eva-unit-01/eva-qwen-2.5-72b", "mistralai/mistral-large-2411", "mistralai/mistral-large-2407",
    "mistralai/pixtral-large-2411", "x-ai/grok-vision-beta", "infermatic/mn-inferor-12b", "qwen/qwen-2.5-coder-32b-instruct",
    "raifle/sorcererlm-8x22b", "eva-unit-01/eva-qwen-2.5-32b", "thedrummer/unslopnemo-12b", "anthropic/claude-3.5-haiku-20241022",
    "anthropic/claude-3.5-haiku", "anthracite-org/magnum-v4-72b", "anthropic/claude-3.5-sonnet", "neversleep/llama-3.1-lumimaid-70b",
    "x-ai/grok-beta", "mistralai/ministral-3b", "mistralai/ministral-8b", "qwen/qwen-2.5-7b-instruct", "nvidia/llama-3.1-nemotron-70b-instruct",
    "x-ai/grok-2", "x-ai/grok-2-mini", "inflection/inflection-3-productivity", "inflection/inflection-3-pi",
    "liquid/lfm-40b", "eva-unit-01/eva-qwen-2.5-14b", "thedrummer/rocinante-12b", "anthracite-org/magnum-v2-72b", "meta-llama/llama-3.2-3b-instruct",
    "meta-llama/llama-3.2-1b-instruct", "meta-llama/llama-3.2-11b-vision-instruct", "meta-llama/llama-3.2-90b-vision-instruct",
    "qwen/qwen-2.5-72b-instruct", "neversleep/llama-3.1-lumimaid-8b", "mistralai/pixtral-12b", "mattshumer/reflection-70b", "cohere/command-r-plus-08-2024", "cohere/command-r-08-2024",
    "qwen/qwen-2.5-vl-7b-instruct", "sao10k/l3.1-euryale-70b", "lynn/soliloquy-v3", "ai21/jamba-1-5-mini",
    "01-ai/yi-1.5-34b-chat", "ai21/jamba-1-5-large", "microsoft/phi-3.5-mini-128k-instruct", "nousresearch/hermes-3-llama-3.1-70b",
    "nousresearch/hermes-3-llama-3.1-405b", "aetherwiing/mn-starcannon-12b", "sao10k/l3-lunaris-8b",
    "nothingiisreal/mn-celeste-12b", "01-ai/yi-vision", "01-ai/yi-large-fc", "01-ai/yi-large-turbo",
    "meta-llama/llama-3.1-405b", "perplexity/llama-3.1-sonar-large-128k-online", "perplexity/llama-3.1-sonar-small-128k-online",
    "meta-llama/llama-3.1-8b-instruct", "meta-llama/llama-3.1-70b-instruct", "meta-llama/llama-3.1-405b-instruct", "mistralai/codestral-mamba",
    "mistralai/mistral-nemo", "cognitivecomputations/dolphin-llama-3-70b",
    "qwen/qwen-2-7b-instruct", "google/gemma-2-27b-it", "alpindale/magnum-72b", "nousresearch/hermes-2-theta-llama-3-8b", "google/gemma-2-9b-it",
    "sao10k/l3-stheno-8b", "ai21/jamba-instruct", "01-ai/yi-large", "nvidia/nemotron-4-340b-instruct", "anthropic/claude-3.5-sonnet-20240620",
    "sao10k/l3-euryale-70b", "microsoft/phi-3-medium-4k-instruct", "bigcode/starcoder2-15b-instruct", "cognitivecomputations/dolphin-mixtral-8x22b",
    "qwen/qwen-2-72b-instruct", "openchat/openchat-8b", "mistralai/mistral-7b-instruct-v0.3", "nousresearch/hermes-2-pro-llama-3-8b",
    "mistralai/mistral-7b-instruct", "microsoft/phi-3-mini-128k-instruct", "microsoft/phi-3-medium-128k-instruct", "neversleep/llama-3-lumimaid-70b",
    "perplexity/llama-3-sonar-small-32k-chat", "perplexity/llama-3-sonar-small-32k-online",
    "perplexity/llama-3-sonar-large-32k-chat", "perplexity/llama-3-sonar-large-32k-online",
    "meta-llama/llama-3-8b", "meta-llama/llama-3-70b", "meta-llama/llama-guard-2-8b", "liuhaotian/llava-yi-34b",
    "allenai/olmo-7b-instruct", "qwen/qwen-7b-chat", "qwen/qwen-4b-chat", "qwen/qwen-110b-chat", "qwen/qwen-32b-chat", "qwen/qwen-72b-chat",
    "qwen/qwen-14b-chat", "neversleep/llama-3-lumimaid-8b", "snowflake/snowflake-arctic-instruct", "fireworks/firellava-13b", "lynn/soliloquy-l3",
    "sao10k/fimbulvetr-11b-v2", "meta-llama/llama-3-70b-instruct", "meta-llama/llama-3-8b-instruct", "mistralai/mixtral-8x22b-instruct",
    "microsoft/wizardlm-2-8x22b", "microsoft/wizardlm-2-7b", "huggingfaceh4/zephyr-orpo-141b-a35b", "mistralai/mixtral-8x22b",
    "cohere/command-r-plus", "cohere/command-r-plus-04-2024", "databricks/dbrx-instruct",
    "sophosympatheia/midnight-rose-70b", "cohere/command", "cohere/command-r", "anthropic/claude-3-haiku", "anthropic/claude-3-sonnet",
    "anthropic/claude-3-opus", "cohere/command-r-03-2024", "mistralai/mistral-large", "nousresearch/nous-hermes-2-mistral-7b-dpo",
    "meta-llama/codellama-70b-instruct", "recursal/eagle-7b", "01-ai/yi-34b-200k",
    "nousresearch/nous-hermes-2-mixtral-8x7b-sft", "nousresearch/nous-hermes-2-mixtral-8x7b-dpo", "mistralai/mistral-medium",
    "mistralai/mistral-tiny", "mistralai/mistral-small", "austism/chronos-hermes-13b", "jondurbin/bagel-34b", "nousresearch/nous-hermes-yi-34b",
    "neversleep/noromaid-mixtral-8x7b-instruct", "mistralai/mistral-7b-instruct-v0.2", "cognitivecomputations/dolphin-mixtral-8x7b",
    "recursal/rwkv-5-3b-ai-town", "rwkv/rwkv-5-world-3b", "mistralai/mixtral-8x7b-instruct", "togethercomputer/stripedhyena-nous-7b",
    "togethercomputer/stripedhyena-hessian-7b", "koboldai/psyfighter-13b-2", "01-ai/yi-6b", "01-ai/yi-34b", "01-ai/yi-34b-chat",
    "gryphe/mythomist-7b", "nousresearch/nous-hermes-2-vision-7b", "openrouter/cinematika-7b", "nousresearch/nous-capybara-7b",
    "jebcarter/psyfighter-13b", "openchat/openchat-7b", "neversleep/noromaid-20b", "intel/neural-chat-7b", "anthropic/claude-2.1",
    "anthropic/claude-2", "anthropic/claude-instant-1.1", "teknium/openhermes-2.5-mistral-7b", "liuhaotian/llava-13b",
    "nousresearch/nous-capybara-34b", "lizpreciatior/lzlv-70b-fp16-hf", "alpindale/goliath-120b",
    "undi95/toppy-m-7b", "openrouter/auto",
    "teknium/openhermes-2-mistral-7b", "open-orca/mistral-7b-openorca", "jondurbin/airoboros-l2-70b",
    "nousresearch/nous-hermes-llama2-70b", "xwin-lm/xwin-lm-70b", "mistralai/mistral-7b-instruct-v0.1",
    "migtissera/synthia-70b", "pygmalionai/mythalion-13b",
    "nousresearch/nous-hermes-llama2-13b", "meta-llama/codellama-34b-instruct", "phind/phind-codellama-34b", "huggingfaceh4/zephyr-7b-beta",
    "mancer/weaver", "anthropic/claude-1.2", "anthropic/claude-instant-1.0", "anthropic/claude-1", "anthropic/claude-instant-1",
    "anthropic/claude-2.0", "undi95/remm-slerp-l2-13b", "gryphe/mythomax-l2-13b",
    "meta-llama/llama-2-13b-chat", "meta-llama/llama-2-70b-chat"
];

const allModels = {
    gemini: geminiModels,
    puter: puterModels,
    openai: openAiGptModels,
    deepseek: deepseekModels
};

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

    // Handle image generation as a priority
    if (triggerKeyword && !imageUrl) {
      const prompt = ask.substring(triggerKeyword.length).trim();
      let imageResponse;

      if (openAiModels.includes(model)) {
        // Use the new Imagen API for OpenAI models
        imageResponse = await axios.get(HAJI_IMAGEN_URL, {
          params: {
            prompt: prompt,
            model: 'dall-e-3', // As per user's example
            api_key: HAJI_OPENAI_API_KEY,
          },
          responseType: 'arraybuffer',
        });
      } else {
        // Use the existing Flux API for all other models (Claude, Gemini, Puter, etc.)
        imageResponse = await axios.get(HAJI_FLUX_URL, {
          params: { prompt, api_key: HAJI_API_KEY, uid },
          responseType: 'arraybuffer',
        });
      }

      const base64Data = Buffer.from(imageResponse.data, 'binary').toString('base64');
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

    // --- Start of Standard Chat Logic ---

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

        const response = await axios.get(HAJI_GEMINI_URL, { params: apiParams, timeout: 240000 });
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
    } else if (deepseekModels.includes(model)) {
        // --- Start of Deepseek Logic (routes to Puter URL) ---
        const apiParams = {
            ask: ask,
            model: model,
            api_key: HAJI_PUTER_API_KEY, // Deepseek uses the Puter key and URL
            uid,
            roleplay,
            stream: false,
        };

        const response = await axios.get(HAJI_PUTER_URL, { params: apiParams, timeout: 240000 });
        const apiResponse = response.data;

        if (!apiResponse || !apiResponse.answer) {
            console.error('Invalid response from Puter API for Deepseek model. Full response:', JSON.stringify(apiResponse, null, 2));
            throw new Error('Received an invalid response from the external API for a Deepseek model.');
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
    } else if (puterModels.includes(model)) {
        // --- Start of Puter Logic ---
        const apiParams = {
            ask: ask,
            model: model,
            api_key: HAJI_PUTER_API_KEY,
            uid,
            roleplay,
            stream: false,
        };

        const response = await axios.get(HAJI_PUTER_URL, { params: apiParams, timeout: 240000 });
        const apiResponse = response.data;

        if (!apiResponse || !apiResponse.answer) {
            console.error('Invalid response from Puter API. Full response:', JSON.stringify(apiResponse, null, 2));
            throw new Error('Received an invalid response from the external Puter API.');
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
        // --- End of Puter Logic ---
    } else if (openAiModels.includes(model)) {
        // --- Start of OpenAI Logic (mirrors Gemini's logic) ---
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
            api_key: HAJI_OPENAI_API_KEY,
            uid,
            roleplay,
            max_tokens: max_tokens || '',
        };
        if (finalImageUrl) apiParams.img_url = finalImageUrl;

        const response = await axios.get(HAJI_OPENAI_URL, { params: apiParams, timeout: 240000 });
        const apiResponse = response.data;

        if (!apiResponse || !apiResponse.answer) {
            console.error('Invalid response from OpenAI API. Full response:', JSON.stringify(apiResponse, null, 2));
            throw new Error('Received an invalid response from the external OpenAI API.');
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
        // --- End of OpenAI Logic ---
    }

    // Fallback for Claude and other models
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
    const response = await axios.get(HAJI_ANTHROPIC_URL, { params: apiParams, timeout: 240000 });
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
    'HAJI_API_KEY', 'IMGBB_API_KEY', 'VALID_API_KEYS', 'HAJI_GEMINI_API_KEY', 'HAJI_PUTER_API_KEY', 'HAJI_OPENAI_API_KEY',
    'HAJI_ANTHROPIC_URL', 'HAJI_FLUX_URL', 'IMGBB_UPLOAD_URL', 'HAJI_GPTOSS_URL', 'HAJI_GEMINI_URL', 'HAJI_PUTER_URL', 'HAJI_OPENAI_URL', 'HAJI_IMAGEN_URL'
  ];
  const missingVars = requiredVars.filter(v => !process.env[v]);

  if (missingVars.length > 0) {
    console.warn(`\n!!! WARNING: The following required environment variables are not set in your .env file:`);
    missingVars.forEach(v => console.warn(`- ${v}`));
    console.warn('The application will likely fail without them.\n');
  }
});
