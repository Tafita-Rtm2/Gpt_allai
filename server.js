// Load environment variables from .env file
require('dotenv').config();

const express = require('express');
const axios = require('axios');
const cors = require('cors');
const FormData = require('form-data');
const { db, initializeDatabase } = require('./database');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const cluster = require('cluster');
const os = require('os');

const numCPUs = os.cpus().length;

if (cluster.isPrimary) {
    console.log(`Primary ${process.pid} is running`);

    // Fork workers.
    for (let i = 0; i < numCPUs; i++) {
        cluster.fork();
    }

    cluster.on('exit', (worker, code, signal) => {
        console.log(`worker ${worker.process.pid} died`);
        console.log("Forking a new worker");
        cluster.fork();
    });
} else {
    const app = express();
    app.use(express.json({ limit: '50mb' }));
app.use(cors());
app.use(express.static('public'));

const apiKeyCache = new Map();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] Received ${req.method} request for ${req.url}`);
  next();
});

// --- AUTHENTICATION ROUTES ---

// User Registration
app.post('/auth/register', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required.' });
    }

    try {
        const existingUserResult = await db.query('SELECT email FROM users WHERE email = $1', [email]);
        if (existingUserResult.rows.length > 0) {
            return res.status(409).json({ error: 'User with this email already exists.' });
        }

        const saltRounds = 10;
        const passwordHash = await bcrypt.hash(password, saltRounds);

        await db.query('INSERT INTO users (email, password_hash) VALUES ($1, $2)', [email, passwordHash]);
        res.status(201).json({ message: 'User registered successfully.' });

    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'An internal server error occurred during registration.' });
    }
});

// User Login
app.post('/auth/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required.' });
    }

    try {
        const userResult = await db.query('SELECT * FROM users WHERE email = $1', [email]);
        if (userResult.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials.' });
        }
        const user = userResult.rows[0];

        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            return res.status(401).json({ error: 'Invalid credentials.' });
        }

        const authToken = crypto.randomBytes(30).toString('hex');
        await db.query('UPDATE users SET auth_token = $1 WHERE id = $2', [authToken, user.id]);
        res.json({ message: 'Login successful.', token: authToken });

    } catch (error) {
        console.error('Database error during login:', error);
        return res.status(500).json({ error: 'Internal server error.' });
    }
});

// --- CONFIGURATION ---
const PORT = process.env.PORT || 3000;
// API Keys
const HAJI_API_KEY = process.env.HAJI_API_KEY;
const HAJI_GEMINI_API_KEY = process.env.HAJI_GEMINI_API_KEY;
const HAJI_PUTER_API_KEY = process.env.HAJI_PUTER_API_KEY;
const HAJI_OPENAI_API_KEY = process.env.HAJI_OPENAI_API_KEY;
const HAJI_RTM_API_KEY = process.env.HAJI_RTM_API_KEY;
const IMGBB_API_KEY = process.env.IMGBB_API_KEY;

const backendKeys = {
    claude: HAJI_API_KEY,
    gemini: HAJI_GEMINI_API_KEY,
    puter: HAJI_PUTER_API_KEY,
    openai: HAJI_OPENAI_API_KEY,
    rtm: HAJI_RTM_API_KEY,
};

// API URLs from .env
const HAJI_ANTHROPIC_URL = process.env.HAJI_ANTHROPIC_URL;
const HAJI_FLUX_URL = process.env.HAJI_FLUX_URL;
const HAJI_GPTOSS_URL = process.env.HAJI_GPTOSS_URL;
const HAJI_GEMINI_URL = process.env.HAJI_GEMINI_URL;
const HAJI_PUTER_URL = process.env.HAJI_PUTER_URL;
const HAJI_OPENAI_URL = process.env.HAJI_OPENAI_URL;
const HAJI_IMAGEN_URL = process.env.HAJI_IMAGEN_URL;
const HAJI_POLLINATION_URL = process.env.HAJI_POLLINATION_URL;
const HAJI_FLUXWEBUI_URL = process.env.HAJI_FLUXWEBUI_URL;
const HAJI_RTM_URL = process.env.HAJI_RTM_URL;
const IMGBB_UPLOAD_URL = process.env.IMGBB_UPLOAD_URL;

// --- MODEL DATA ---
const gpt5Models = [...new Set([
    "openai/gpt-5-chat", "openai/gpt-5", "openai/gpt-5-mini", "openai/gpt-5-nano",
    "gpt-5-nano", "gpt-5-chat-latest", "gpt-5-2025-08-07", "gpt-5", "gpt-5-mini-2025-08-07",
    "gpt-5-mini", "gpt-5-nano-2025-08-07",
])];

const openAIModels = [
    ...gpt5Models,
    "gpt-4-0613", "gpt-4", "gpt-3.5-turbo", "gpt-3.5-turbo-instruct", "gpt-3.5-turbo-instruct-0914",
    "gpt-4-1106-preview", "gpt-3.5-turbo-1106", "gpt-4-0125-preview", "gpt-4-turbo-preview", "gpt-3.5-turbo-0125",
    "gpt-4-turbo", "gpt-4-turbo-2024-04-09", "gpt-4o", "gpt-4o-2024-05-13", "gpt-4o-mini-2024-07-18", "gpt-4o-mini",
    "gpt-4o-2024-08-06", "chatgpt-4o-latest", "o1-mini-2024-09-12", "o1-mini", "o1-2024-12-17", "o1", "o3-mini",
    "o3-mini-2025-01-31", "gpt-4o-2024-11-20", "gpt-4o-search-preview", "gpt-4o-mini-search-preview", "o1-pro", "o3", "o4-mini",
    "gpt-4.1", "gpt-4.1-mini", "gpt-4.1-nano", "gpt-3.5-turbo-16k", "openai/gpt-4o-audio-preview", "openai/gpt-oss-120b",
    "openai/gpt-oss-20b", "openai/o3-pro", "openai/codex-mini", "openai/o4-mini-high", "openai/o3", "openai/o4-mini",
    "openai/gpt-4.1", "openai/gpt-4.1-mini", "openai/gpt-4.1-nano", "openai/o1-pro", "openai/gpt-4o-mini-search-preview",
    "openai/gpt-4o-search-preview", "openai/gpt-4.5-preview", "openai/o3-mini-high", "openai/o3-mini", "openai/o1",
    "openai/gpt-4o-2024-11-20", "openai/o1-mini", "openai/o1-preview", "openai/chatgpt-4o-latest", "openai/gpt-4o-2024-08-06",
    "openai/gpt-4o-mini", "openai/gpt-4o-mini-2024-07-18", "openai/gpt-4o", "openai/gpt-4o-2024-05-13", "openai/gpt-4-turbo",
    "openai/gpt-3.5-turbo-0613", "openai/gpt-4-turbo-preview", "openai/gpt-4-vision-preview", "openai/gpt-3.5-turbo-1106",
    "openai/gpt-4-1106-preview", "openai/gpt-3.5-turbo-instruct", "openai/gpt-3.5-turbo-16k", "openai/gpt-4-32k-0314",
    "openai/gpt-4-32k", "openai/gpt-4", "openai/gpt-3.5-turbo-0125", "openai/gpt-4-0314", "openai/gpt-3.5-turbo-0301",
    "openai/gpt-3.5-turbo"
];
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
const puterModels = [
    "openrouter/sonoma-dusk-alpha", "openai/gpt-5-chat", "openai/gpt-5", "openai/gpt-5-mini", "openai/gpt-5-nano",
    "gpt-5-nano", "openrouter/sonoma-sky-alpha", "qwen/qwen3-max", "moonshotai/kimi-k2-0905",
    "bytedance/seed-oss-36b-instruct", "deepcogito/cogito-v2-preview-llama-109b-moe", "deepcogito/cogito-v2-preview-deepseek-671b",
    "stepfun-ai/step3", "qwen/qwen3-30b-a3b-thinking-2507", "x-ai/grok-code-fast-1", "nousresearch/hermes-4-70b",
    "nousresearch/hermes-4-405b", "google/gemini-2.5-flash-image-preview", "deepseek/deepseek-chat-v3.1",
    "deepseek/deepseek-v3.1-base", "openai/gpt-4o-audio-preview", "mistralai/mistral-medium-3.1", "baidu/ernie-4.5-21b-a3b",
    "baidu/ernie-4.5-vl-28b-a3b", "z-ai/glm-4.5v", "ai21/jamba-mini-1.7", "ai21/jamba-large-1.7", "openai/gpt-5-chat",
    "openai/gpt-5", "openai/gpt-5-mini", "openai/gpt-5-nano", "openai/gpt-oss-120b", "openai/gpt-oss-20b",
    "anthropic/claude-opus-4.1", "openrouter/horizon-beta", "mistralai/codestral-2508", "qwen/qwen3-coder-30b-a3b-instruct",
    "openrouter/horizon-alpha", "qwen/qwen3-30b-a3b-instruct-2507", "z-ai/glm-4.5", "z-ai/glm-4.5-air",
    "qwen/qwen3-235b-a22b-thinking-2507", "z-ai/glm-4-32b", "qwen/qwen3-coder", "bytedance/ui-tars-1.5-7b",
    "google/gemini-2.5-flash-lite", "qwen/qwen3-235b-a22b-2507", "switchpoint/router", "moonshotai/kimi-k2",
    "thudm/glm-4.1v-9b-thinking", "mistralai/devstral-medium", "mistralai/devstral-small",
    "cognitivecomputations/dolphin-mistral-24b-venice-edition", "x-ai/grok-4", "google/gemma-3n-e2b-it",
    "tencent/hunyuan-a13b-instruct", "tngtech/deepseek-r1t2-chimera", "morph/morph-v3-large", "morph/morph-v3-fast",
    "openrouter/cypher-alpha", "baidu/ernie-4.5-vl-424b-a47b", "baidu/ernie-4.5-300b-a47b", "thedrummer/anubis-70b-v1.1",
    "inception/mercury", "morph/morph-v2", "mistralai/mistral-small-3.2-24b-instruct", "minimax/minimax-m1",
    "google/gemini-2.5-flash-lite-preview-06-17", "google/gemini-2.5-flash", "google/gemini-2.5-pro",
    "moonshotai/kimi-dev-72b", "openai/o3-pro", "x-ai/grok-3-mini", "x-ai/grok-3", "mistralai/magistral-small-2506",
    "mistralai/magistral-medium-2506", "google/gemini-2.5-pro-preview", "sentientagi/dobby-mini-unhinged-plus-llama-3.1-8b",
    "deepseek/deepseek-r1-distill-qwen-7b", "deepseek/deepseek-r1-0528-qwen3-8b", "google/gemma-2b-it", "deepseek/deepseek-r1-0528",
    "sarvamai/sarvam-m", "thedrummer/valkyrie-49b-v1", "anthropic/claude-opus-4", "anthropic/claude-sonnet-4",
    "mistralai/devstral-small-2505", "google/gemma-3n-e4b-it", "google/gemini-2.5-flash-preview-05-20", "openai/codex-mini",
    "meta-llama/llama-3.3-8b-instruct", "nousresearch/deephermes-3-mistral-24b-preview", "mistralai/mistral-medium-3",
    "google/gemini-2.5-pro-preview-05-06", "arcee-ai/caller-large", "arcee-ai/spotlight", "arcee-ai/maestro-reasoning",
    "arcee-ai/virtuoso-large", "arcee-ai/coder-large", "arcee-ai/virtuoso-medium-v2", "arcee-ai/arcee-blitz",
    "microsoft/phi-4-reasoning-plus", "microsoft/phi-4-reasoning", "qwen/qwen3-0.6b-04-28", "inception/mercury-coder",
    "qwen/qwen3-1.7b", "qwen/qwen3-4b", "opengvlab/internvl3-14b", "opengvlab/internvl3-2b", "deepseek/deepseek-prover-v2",
    "meta-llama/llama-guard-4-12b", "qwen/qwen3-30b-a3b", "qwen/qwen3-8b", "qwen/qwen3-14b", "qwen/qwen3-32b",
    "qwen/qwen3-235b-a22b", "tngtech/deepseek-r1t-chimera", "thudm/glm-z1-rumination-32b", "thudm/glm-z1-9b",
    "thudm/glm-4-9b", "microsoft/mai-ds-r1", "thudm/glm-z1-32b", "thudm/glm-4-32b", "google/gemini-2.5-flash-preview",
    "openai/o4-mini-high", "openai/o3", "openai/o4-mini", "shisa-ai/shisa-v2-llama3.3-70b", "qwen/qwen2.5-coder-7b-instruct",
    "openai/gpt-4.1", "openai/gpt-4.1-mini", "openai/gpt-4.1-nano", "eleutherai/llemma_7b",
    "alfredpros/codellama-7b-instruct-solidity", "arliai/qwq-32b-arliai-rpr-v1", "agentica-org/deepcoder-14b-preview",
    "moonshotai/kimi-vl-a3b-thinking", "openrouter/optimus-alpha", "x-ai/grok-3-mini-beta", "x-ai/grok-3-beta",
    "nvidia/llama-3.1-nemotron-nano-8b-v1", "nvidia/llama-3.3-nemotron-super-49b-v1", "nvidia/llama-3.1-nemotron-ultra-253b-v1",
    "tokyotech-llm/llama-3.1-swallow-8b-instruct-v0.3", "meta-llama/llama-4-maverick", "meta-llama/llama-4-scout",
    "openrouter/quasar-alpha", "all-hands/openhands-lm-32b-v0.1", "deepseek/deepseek-v3-base",
    "scb10x/llama3.1-typhoon2-8b-instruct", "scb10x/llama3.1-typhoon2-70b-instruct", "allenai/molmo-7b-d",
    "bytedance-research/ui-tars-72b", "qwen/qwen2.5-vl-3b-instruct", "google/gemini-2.5-pro-exp-03-25",
    "qwen/qwen2.5-vl-32b-instruct", "deepseek/deepseek-chat-v3-0324", "featherless/qwerky-72b", "openai/o1-pro",
    "mistralai/mistral-small-3.1-24b-instruct", "open-r1/olympiccoder-32b", "steelskull/l3.3-electra-r1-70b",
    "allenai/olmo-2-0325-32b-instruct", "google/gemma-3-1b-it", "google/gemma-3-4b-it", "ai21/jamba-1.6-large",
    "ai21/jamba-1.6-mini", "google/gemma-3-12b-it", "cohere/command-a", "openai/gpt-4o-mini-search-preview",
    "openai/gpt-4o-search-preview", "rekaai/reka-flash-3", "google/gemma-3-27b-it", "thedrummer/anubis-pro-105b-v1",
    "latitudegames/wayfarer-large-70b-llama-3.3", "thedrummer/skyfall-36b-v2", "microsoft/phi-4-multimodal-instruct",
    "perplexity/sonar-reasoning-pro", "perplexity/sonar-pro", "perplexity/sonar-deep-research", "deepseek/deepseek-r1-zero",
    "qwen/qwq-32b", "qwen/qwen2.5-32b-instruct", "moonshotai/moonlight-16b-a3b-instruct",
    "nousresearch/deephermes-3-llama-3-8b-preview", "openai/gpt-4.5-preview", "google/gemini-2.0-flash-lite-001",
    "anthropic/claude-3.7-sonnet", "perplexity/r1-1776", "mistralai/mistral-saba",
    "cognitivecomputations/dolphin3.0-r1-mistral-24b", "cognitivecomputations/dolphin3.0-mistral-24b",
    "meta-llama/llama-guard-3-8b", "openai/o3-mini-high", "allenai/llama-3.1-tulu-3-405b",
    "deepseek/deepseek-r1-distill-llama-8b", "google/gemini-2.0-flash-001", "qwen/qwen-vl-plus", "aion-labs/aion-1.0",
    "aion-labs/aion-1.0-mini", "aion-labs/aion-rp-llama-3.1-8b", "qwen/qwen-vl-max", "qwen/qwen-turbo",
    "qwen/qwen2.5-vl-72b-instruct", "qwen/qwen-plus", "qwen/qwen-max", "openai/o3-mini",
    "deepseek/deepseek-r1-distill-qwen-1.5b", "mistralai/mistral-small-24b-instruct-2501",
    "deepseek/deepseek-r1-distill-qwen-32b", "deepseek/deepseek-r1-distill-qwen-14b", "perplexity/sonar-reasoning",
    "perplexity/sonar", "liquid/lfm-7b", "liquid/lfm-3b", "deepseek/deepseek-r1-distill-llama-70b", "deepseek/deepseek-r1",
    "minimax/minimax-01", "mistralai/codestral-2501", "microsoft/phi-4", "sao10k/l3.1-70b-hanami-x1",
    "deepseek/deepseek-chat", "sao10k/l3.3-euryale-70b", "inflatebot/mn-mag-mell-r1", "openai/o1",
    "eva-unit-01/eva-llama-3.33-70b", "x-ai/grok-2-vision-1212", "x-ai/grok-2-1212", "cohere/command-r7b-12-2024",
    "google/gemini-2.0-flash-exp", "meta-llama/llama-3.3-70b-instruct", "amazon/nova-lite-v1", "amazon/nova-micro-v1",
    "amazon/nova-pro-v1", "qwen/qwq-32b-preview", "google/gemini-exp-1121", "eva-unit-01/eva-qwen-2.5-72b",
    "openai/gpt-4o-2024-11-20", "mistralai/mistral-large-2411", "mistralai/mistral-large-2407", "mistralai/pixtral-large-2411",
    "x-ai/grok-vision-beta", "google/gemini-exp-1114", "infermatic/mn-inferor-12b", "qwen/qwen-2.5-coder-32b-instruct",
    "raifle/sorcererlm-8x22b", "eva-unit-01/eva-qwen-2.5-32b", "thedrummer/unslopnemo-12b",
    "anthropic/claude-3.5-haiku-20241022", "anthropic/claude-3.5-haiku", "anthropic/claude-3.5-sonnet",
    "neversleep/llama-3.1-lumimaid-70b", "anthracite-org/magnum-v4-72b", "x-ai/grok-beta", "mistralai/ministral-3b",
    "mistralai/ministral-8b", "qwen/qwen-2.5-7b-instruct", "nvidia/llama-3.1-nemotron-70b-instruct", "x-ai/grok-2",
    "x-ai/grok-2-mini", "inflection/inflection-3-pi", "inflection/inflection-3-productivity",
    "google/gemini-flash-1.5-8b", "anthracite-org/magnum-v2-72b", "thedrummer/rocinante-12b", "liquid/lfm-40b",
    "eva-unit-01/eva-qwen-2.5-14b", "meta-llama/llama-3.2-3b-instruct", "meta-llama/llama-3.2-11b-vision-instruct",
    "meta-llama/llama-3.2-90b-vision-instruct", "meta-llama/llama-3.2-1b-instruct", "qwen/qwen-2.5-72b-instruct",
    "neversleep/llama-3.1-lumimaid-8b", "openai/o1-mini-2024-09-12", "openai/o1-preview-2024-09-12", "openai/o1-preview",
    "openai/o1-mini", "mistralai/pixtral-12b", "mattshumer/reflection-70b", "cohere/command-r-08-2024",
    "cohere/command-r-plus-08-2024", "sao10k/l3.1-euryale-70b", "google/gemini-flash-1.5-exp",
    "qwen/qwen-2.5-vl-7b-instruct", "lynn/soliloquy-v3", "01-ai/yi-1.5-34b-chat", "ai21/jamba-1-5-large",
    "ai21/jamba-1-5-mini", "microsoft/phi-3.5-mini-128k-instruct", "nousresearch/hermes-3-llama-3.1-70b",
    "nousresearch/hermes-3-llama-3.1-405b", "openai/chatgpt-4o-latest", "sao10k/l3-lunaris-8b",
    "aetherwiing/mn-starcannon-12b", "openai/gpt-4o-2024-08-06", "meta-llama/llama-3.1-405b", "01-ai/yi-large-fc",
    "nothingiisreal/mn-celeste-12b", "01-ai/yi-large-turbo", "01-ai/yi-vision",
    "perplexity/llama-3.1-sonar-large-128k-online", "perplexity/llama-3.1-sonar-small-128k-online",
    "google/gemini-pro-1.5-exp", "meta-llama/llama-3.1-405b-instruct", "meta-llama/llama-3.1-70b-instruct",
    "meta-llama/llama-3.1-8b-instruct", "mistralai/mistral-nemo", "cognitivecomputations/dolphin-llama-3-70b",
    "mistralai/codestral-mamba", "openai/gpt-4o-mini", "openai/gpt-4o-mini-2024-07-18", "qwen/qwen-2-7b-instruct",
    "google/gemma-2-27b-it", "nousresearch/hermes-2-theta-llama-3-8b", "alpindale/magnum-72b", "google/gemma-2-9b-it",
    "sao10k/l3-stheno-8b", "01-ai/yi-large", "ai21/jamba-instruct", "nvidia/nemotron-4-340b-instruct",
    "anthropic/claude-3.5-sonnet-20240620", "sao10k/l3-euryale-70b", "microsoft/phi-3-medium-4k-instruct",
    "bigcode/starcoder2-15b-instruct", "cognitivecomputations/dolphin-mixtral-8x22b", "qwen/qwen-2-72b-instruct",
    "openchat/openchat-8b", "mistralai/mistral-7b-instruct", "mistralai/mistral-7b-instruct-v0.3",
    "nousresearch/hermes-2-pro-llama-3-8b", "microsoft/phi-3-mini-128k-instruct", "microsoft/phi-3-medium-128k-instruct",
    "neversleep/llama-3-lumimaid-70b", "deepseek/deepseek-chat-v2.5", "perplexity/llama-3-sonar-large-32k-online",
    "perplexity/llama-3-sonar-large-32k-chat", "perplexity/llama-3-sonar-small-32k-chat",
    "perplexity/llama-3-sonar-small-32k-online", "google/gemini-flash-1.5", "meta-llama/llama-guard-2-8b",
    "meta-llama/llama-3-8b", "meta-llama/llama-3-70b", "openai/gpt-4o-2024-05-13", "openai/gpt-4o",
    "liuhaotian/llava-yi-34b", "allenai/olmo-7b-instruct", "qwen/qwen-7b-chat", "qwen/qwen-4b-chat", "qwen/qwen-14b-chat",
    "qwen/qwen-32b-chat", "qwen/qwen-110b-chat", "qwen/qwen-72b-chat", "neversleep/llama-3-lumimaid-8b",
    "snowflake/snowflake-arctic-instruct", "fireworks/firellava-13b", "lynn/soliloquy-l3", "sao10k/fimbulvetr-11b-v2",
    "meta-llama/llama-3-70b-instruct", "meta-llama/llama-3-8b-instruct", "mistralai/mixtral-8x22b-instruct",
    "microsoft/wizardlm-2-7b", "microsoft/wizardlm-2-8x22b", "huggingfaceh4/zephyr-orpo-141b-a35b",
    "mistralai/mixtral-8x22b", "openai/gpt-4-turbo", "google/gemini-pro-1.5", "cohere/command-r-plus",
    "cohere/command-r-plus-04-2024", "databricks/dbrx-instruct", "sophosympatheia/midnight-rose-70b", "cohere/command",
    "cohere/command-r", "anthropic/claude-3-haiku", "anthropic/claude-3-opus", "anthropic/claude-3-sonnet",
    "cohere/command-r-03-2024", "mistralai/mistral-large", "google/gemma-7b-it",
    "nousresearch/nous-hermes-2-mistral-7b-dpo", "meta-llama/codellama-70b-instruct", "recursal/eagle-7b",
    "openai/gpt-4-turbo-preview", "openai/gpt-3.5-turbo-0613", "01-ai/yi-34b-200k",
    "nousresearch/nous-hermes-2-mixtral-8x7b-dpo", "nousresearch/nous-hermes-2-mixtral-8x7b-sft",
    "mistralai/mistral-medium", "mistralai/mistral-small", "mistralai/mistral-tiny", "austism/chronos-hermes-13b",
    "jondurbin/bagel-34b", "neversleep/noromaid-mixtral-8x7b-instruct", "nousresearch/nous-hermes-yi-34b",
    "mistralai/mistral-7b-instruct-v0.2", "cognitivecomputations/dolphin-mixtral-8x7b", "rwkv/rwkv-5-world-3b",
    "mistralai/mixtral-8x7b-instruct", "recursal/rwkv-5-3b-ai-town", "togethercomputer/stripedhyena-nous-7b",
    "togethercomputer/stripedhyena-hessian-7b", "koboldai/psyfighter-13b-2", "nousresearch/nous-hermes-2-vision-7b",
    "01-ai/yi-34b-chat", "01-ai/yi-34b", "gryphe/mythomist-7b", "01-ai/yi-6b", "openrouter/cinematika-7b",
    "nousresearch/nous-capybara-7b", "jebcarter/psyfighter-13b", "openchat/openchat-7b", "neversleep/noromaid-20b",
    "intel/neural-chat-7b", "anthropic/claude-instant-1.1", "anthropic/claude-2.1", "anthropic/claude-2",
    "teknium/openhermes-2.5-mistral-7b", "liuhaotian/llava-13b", "nousresearch/nous-capybara-34b",
    "openai/gpt-4-vision-preview", "lizpreciatior/lzlv-70b-fp16-hf", "undi95/toppy-m-7b", "alpindale/goliath-120b",
    "openrouter/auto", "openai/gpt-3.5-turbo-1106", "openai/gpt-4-1106-preview", "google/palm-2-codechat-bison-32k",
    "google/palm-2-chat-bison-32k", "teknium/openhermes-2-mistral-7b", "open-orca/mistral-7b-openorca",
    "jondurbin/airoboros-l2-70b", "nousresearch/nous-hermes-llama2-70b", "xwin-lm/xwin-lm-70b",
    "openai/gpt-3.5-turbo-instruct", "mistralai/mistral-7b-instruct-v0.1", "migtissera/synthia-70b",
    "pygmalionai/mythalion-13b", "openai/gpt-3.5-turbo-16k", "openai/gpt-4-32k", "openai/gpt-4-32k-0314",
    "meta-llama/codellama-34b-instruct", "nousresearch/nous-hermes-llama2-13b", "phind/phind-codellama-34b",
    "mancer/weaver", "huggingfaceh4/zephyr-7b-beta", "anthropic/claude-1.2", "anthropic/claude-instant-1",
    "anthropic/claude-2.0", "anthropic/claude-1", "anthropic/claude-instant-1.0", "undi95/remm-slerp-l2-13b",
    "google/palm-2-chat-bison", "google/palm-2-codechat-bison", "gryphe/mythomax-l2-13b",
    "meta-llama/llama-2-13b-chat", "meta-llama/llama-2-70b-chat", "openai/gpt-3.5-turbo-0125", "openai/gpt-4-0314",
    "openai/gpt-4", "openai/gpt-3.5-turbo-0301", "openai/gpt-3.5-turbo"
];

let rtmModels = [];

const fetchRtmModels = async () => {
    try {
        const response = await axios.get(`${HAJI_RTM_URL}/models`);
        rtmModels = response.data.map(model => model.name);
        console.log('RTM models fetched successfully.');
    } catch (error) {
        console.error('Could not fetch RTM models:', error.message);
    }
};

const imageGenerationKeywords = [
    'generate image of', 'cree une image', 'generate an image of', 'generate image', 'generate an image', 'generate',
    'create image of', 'create an image of', 'create image', 'create an image', 'create',
    'draw image of', 'draw an image of', 'draw image', 'draw an image', 'draw',
    'génère une image de', 'génère image de', 'génère une image', 'génère image', 'génère',
    'crée une image de', 'crée image de', 'crée une image', 'crée image', 'crée',
    'dessine une image de', 'dessine image de', 'dessine une image', 'dessine image', 'dessine',
];

const authenticateApiKey = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authorization header is missing or malformed.' });
    }
    const compoundKey = authHeader.split(' ')[1];

    // Check cache first
    if (apiKeyCache.has(compoundKey)) {
        req.authInfo = apiKeyCache.get(compoundKey);
        console.log(`[Cache] HIT for key: ...${compoundKey.slice(-4)}`);
        return next();
    }
     console.log(`[Cache] MISS for key: ...${compoundKey.slice(-4)}`);

    try {
        const keyResult = await db.query('SELECT user_id, provider FROM api_keys WHERE api_key = $1', [compoundKey]);
        if (keyResult.rows.length === 0) {
            return res.status(403).json({ error: 'Invalid API key.' });
        }
        const keyRecord = keyResult.rows[0];

        const keyParts = compoundKey.split('--');
        const filter = keyParts[0];
        const backendKey = keyParts.length > 1 ? keyParts.slice(1).join('--') : null;

        const authInfo = {
            userId: keyRecord.user_id,
            providerContext: keyRecord.provider,
            filter: filter,
            backendKey: backendKey,
        };

        // Store in cache with TTL
        apiKeyCache.set(compoundKey, authInfo);
        setTimeout(() => {
            apiKeyCache.delete(compoundKey);
            console.log(`[Cache] Expired and removed key: ...${compoundKey.slice(-4)}`);
        }, CACHE_TTL);

        req.authInfo = authInfo;

        if (keyRecord.provider === 'rtm' && rtmModels.length === 0) {
            await fetchRtmModels();
        }
        next();
    } catch (error) {
        console.error('Database error during API key authentication:', error);
        return res.status(500).json({ error: 'Database error during API key authentication.' });
    }
};

// Middleware to protect routes that require a logged-in user session
const authenticateWebSession = async (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
        return res.status(401).json({ error: 'No authentication token provided.' });
    }

    try {
        const userResult = await db.query('SELECT id, email FROM users WHERE auth_token = $1', [token]);
        if (userResult.rows.length === 0) {
            return res.status(403).json({ error: 'Invalid or expired token.' });
        }
        req.user = userResult.rows[0];
        next();
    } catch (error) {
        console.error('Database error during authentication:', error);
        return res.status(500).json({ error: 'Database error during authentication.' });
    }
};

app.post('/api/generate-key', authenticateWebSession, async (req, res) => {
    const { provider, sub_provider } = req.body;
    let backendKey;
    let prefix = provider;
    switch (provider) {
        case 'claude':
            backendKey = backendKeys.claude;
            break;
        case 'gemini':
            backendKey = backendKeys.gemini;
            break;
        case 'openai':
            backendKey = backendKeys.openai;
            break;
        case 'chatgpt5':
            backendKey = backendKeys.puter;
            prefix = 'gpt5';
            break;
        case 'puter':
            backendKey = backendKeys.puter;
            if (sub_provider) {
                prefix = sub_provider;
            }
            break;
        case 'rtm':
            backendKey = backendKeys.rtm;
            break;
        default:
            return res.status(400).json({ error: 'Invalid provider specified.' });
    }
    if (!backendKey) {
        return res.status(503).json({ error: `No backend API key configured for the '${provider}' provider.` });
    }
    const compoundKey = `${prefix}--${backendKey}`;

    try {
        await db.query('INSERT INTO api_keys (user_id, provider, api_key) VALUES ($1, $2, $3)', [req.user.id, provider, compoundKey]);
        res.json({ apiKey: compoundKey });
    } catch (error) {
        console.error('Error saving API key:', error);
        return res.status(500).json({ error: 'Failed to save API key.' });
    }
});

app.use('/v1', authenticateApiKey);

app.get('/api/puter-families', (req, res) => {
    const families = [...new Set(puterModels.map(model => model.split('/')[0]))];
    res.json(families.sort());
});

// --- API Key Management ---
app.get('/api/keys', authenticateWebSession, async (req, res) => {
    const userId = req.user.id;
    try {
        const keysResult = await db.query('SELECT id, provider, api_key, created_at FROM api_keys WHERE user_id = $1 ORDER BY created_at DESC', [userId]);
        res.json(keysResult.rows);
    } catch (error) {
        console.error('Error fetching API keys:', error);
        return res.status(500).json({ error: 'Failed to retrieve API keys.' });
    }
});

app.delete('/api/keys/:id', authenticateWebSession, async (req, res) => {
    const keyId = req.params.id;
    const userId = req.user.id;
    try {
        const deleteResult = await db.query('DELETE FROM api_keys WHERE id = $1 AND user_id = $2', [keyId, userId]);
        if (deleteResult.rowCount === 0) {
            return res.status(404).json({ error: 'API key not found or you do not have permission to delete it.' });
        }
        res.status(200).json({ message: 'API key deleted successfully.' });
    } catch (error) {
        console.error('Error deleting API key:', error);
        return res.status(500).json({ error: 'Failed to delete API key.' });
    }
});

app.get('/v1/models', async (req, res) => {
    try {
        const { filter, providerContext, backendKey } = req.authInfo;
        if (!backendKey) {
            return res.status(400).json({ error: 'The API key is missing the backend key part.' });
        }

        let modelsList = [];
        let owner = filter;

        switch (providerContext) {
            case 'claude':
                try {
                    const response = await axios.get(HAJI_ANTHROPIC_URL, {
                        params: { ask: 'hello', model: 'claude-3-opus-20240229', api_key: backendKey, uid: req.authInfo.userId },
                        timeout: 600000,
                    });
                    if (response.data && Array.isArray(response.data.supported_models)) {
                        modelsList = response.data.supported_models;
                    } else {
                        throw new Error('Could not retrieve supported models from Claude API.');
                    }
                } catch (e) {
                    console.error("Failed to fetch dynamic models for Claude, falling back to hardcoded list.", e.message);
                    // Fallback for claude can be a smaller hardcoded list if needed
                    modelsList = ["claude-3-opus-20240229", "claude-3-sonnet-20240229", "claude-3-haiku-20240307"];
                }
                owner = 'anthropic';
                break;
            case 'gemini':
                try {
                     const response = await axios.get(HAJI_GEMINI_URL, {
                        params: { ask: 'hello', model: 'gemini-1.5-pro-latest', api_key: backendKey, uid: req.authInfo.userId },
                        timeout: 600000,
                    });
                    if (response.data && Array.isArray(response.data.supported_models)) {
                        modelsList = response.data.supported_models;
                    } else {
                        // If the proxy doesn't return a model list, use the hardcoded one.
                        modelsList = geminiModels;
                    }
                } catch(e) {
                    console.error("Failed to fetch dynamic models for Gemini, falling back to hardcoded list.", e.message);
                    modelsList = geminiModels;
                }
                owner = 'google';
                break;
            case 'openai':
                 try {
                     const response = await axios.get(HAJI_OPENAI_URL, {
                        params: { ask: 'hello', model: 'gpt-4', api_key: backendKey, uid: req.authInfo.userId },
                        timeout: 600000,
                    });
                    if (response.data && Array.isArray(response.data.supported_models)) {
                        modelsList = response.data.supported_models;
                    } else {
                        modelsList = openAIModels;
                    }
                } catch(e) {
                    console.error("Failed to fetch dynamic models for OpenAI, falling back to hardcoded list.", e.message);
                    modelsList = openAIModels;
                }
                owner = 'openai';
                break;
            case 'chatgpt5':
                modelsList = gpt5Models
                    .filter(m => m.includes('gpt-5'))
                    .map(m => m.replace('openai/', ''));
                owner = 'openai';
                break;
            case 'puter':
                // Puter has a different logic based on sub-providers, keep as is for now.
                if (filter === 'puter') {
                    modelsList = puterModels;
                } else {
                    modelsList = puterModels.filter(m => m.startsWith(`${filter}/`));
                }
                break;
            case 'rtm':
                modelsList = rtmModels;
                owner = 'rtm';
                break;
            default:
                return res.status(500).json({ error: 'Internal server error: Invalid provider context.' });
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

app.post('/v1/chat/completions', async (req, res) => {
  const { userId } = req.authInfo;
  const { model, messages, stream, max_tokens, google_api_key } = req.body;

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
    const uid = userId;
    if (gpt5Models.includes(model)) {
        const lowerCaseAsk = ask.toLowerCase().trim();
        const triggerKeyword = imageGenerationKeywords.find(keyword => lowerCaseAsk === keyword || lowerCaseAsk.startsWith(keyword + ' '));
        if (triggerKeyword && !imageUrl) {
            const prompt = ask.substring(triggerKeyword.length).trim();
            const imageResponse = await axios.get(HAJI_FLUXWEBUI_URL, { params: { prompt, width: 1024, height: 1820, seed: 1757183203232, nologo: true, nofeed: true, api_key: HAJI_PUTER_API_KEY }, responseType: 'arraybuffer', timeout: 600000 });
            const base64Data = Buffer.from(imageResponse.data, 'binary').toString('base64');
            const form = new FormData();
            form.append('image', base64Data);
            const imgbbResponse = await axios.post(`${IMGBB_UPLOAD_URL}?key=${IMGBB_API_KEY}`, form, { headers: form.getHeaders(), timeout: 600000 });
            if (!imgbbResponse.data || !imgbbResponse.data.success) { throw new Error('Failed to upload generated image to ImgBB.'); }
            const generatedImageUrl = imgbbResponse.data.data.url;
            const responseContent = `![Generated Image](${generatedImageUrl})`;
            const completionId = `chatcmpl-gen-${Date.now()}`;
            if (stream) {
                res.setHeader('Content-Type', 'text/event-stream');
                res.write(`data: ${JSON.stringify({ id: completionId, object: 'chat.completion.chunk', created: Math.floor(Date.now() / 1000), model: model, choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }] })}\n\n`);
                res.write(`data: ${JSON.stringify({ id: completionId, object: 'chat.completion.chunk', created: Math.floor(Date.now() / 1000), model: model, choices: [{ index: 0, delta: { content: responseContent }, finish_reason: null }] })}\n\n`);
                res.write(`data: ${JSON.stringify({ id: completionId, object: 'chat.completion.chunk', created: Math.floor(Date.now() / 1000), model: model, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\n`);
                res.write('data: [DONE]\n\n');
                res.end();
            } else {
                res.json({ id: completionId, object: 'chat.completion', created: Math.floor(Date.now() / 1000), model: model, choices: [{ index: 0, message: { role: 'assistant', content: responseContent }, finish_reason: 'stop' }], usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 } });
            }
            return;
        }

        const fullModelName = model.startsWith('openai/') ? model : `openai/${model}`;
        const apiParams = { ask: ask, model: fullModelName, api_key: HAJI_PUTER_API_KEY, uid, roleplay, stream: false, };
        const response = await axios.get(HAJI_PUTER_URL, { params: apiParams, timeout: 600000 });
        const apiResponse = response.data;
        if (!apiResponse || !apiResponse.answer) { throw new Error('Received an invalid response from the external Puter API for a GPT-5 model.'); }
        const modelUsed = apiResponse.model_used || model;
        const answer = apiResponse.answer;
        const completionId = `chatcmpl-${Date.now()}`;
        if (stream) {
            res.setHeader('Content-Type', 'text/event-stream');
            res.write(`data: ${JSON.stringify({ id: completionId, object: 'chat.completion.chunk', created: Math.floor(Date.now() / 1000), model: modelUsed, choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }] })}\n\n`);
            res.write(`data: ${JSON.stringify({ id: completionId, object: 'chat.completion.chunk', created: Math.floor(Date.now() / 1000), model: modelUsed, choices: [{ index: 0, delta: { content: answer }, finish_reason: null }] })}\n\n`);
            res.write(`data: ${JSON.stringify({ id: completionId, object: 'chat.completion.chunk', created: Math.floor(Date.now() / 1000), model: modelUsed, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\n`);
            res.write('data: [DONE]\n\n');
            res.end();
        } else {
            res.json({ id: completionId, object: 'chat.completion', created: Math.floor(Date.now() / 1000), model: modelUsed, choices: [{ index: 0, message: { role: 'assistant', content: answer }, finish_reason: 'stop' }], usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 } });
        }
        return;
    }
    const lowerCaseAsk = ask.toLowerCase().trim();
    const triggerKeyword = imageGenerationKeywords.find(keyword => lowerCaseAsk === keyword || lowerCaseAsk.startsWith(keyword + ' '));
    if (triggerKeyword && !imageUrl) {
      const prompt = ask.substring(triggerKeyword.length).trim();
      let imageResponse;
      if (openAIModels.includes(model)) {
        imageResponse = await axios.get(HAJI_IMAGEN_URL, { params: { prompt: prompt, model: 'dall-e-3', api_key: HAJI_OPENAI_API_KEY, }, responseType: 'arraybuffer', timeout: 600000 });
      } else if (geminiModels.includes(model)) {
        imageResponse = await axios.get(HAJI_POLLINATION_URL, { params: { prompt, width: 1024, height: 1820, seed: 1757183203234, model: 'flux', nologo: true, enhance: false, api_key: HAJI_GEMINI_API_KEY }, responseType: 'arraybuffer', timeout: 600000 });
      } else {
        imageResponse = await axios.get(HAJI_FLUX_URL, { params: { prompt, api_key: HAJI_API_KEY, uid }, responseType: 'arraybuffer', timeout: 600000 });
      }
      const base64Data = Buffer.from(imageResponse.data, 'binary').toString('base64');
      const form = new FormData();
      form.append('image', base64Data);
      const imgbbResponse = await axios.post(`${IMGBB_UPLOAD_URL}?key=${IMGBB_API_KEY}`, form, { headers: form.getHeaders(), timeout: 600000 });
      if (!imgbbResponse.data || !imgbbResponse.data.success) { throw new Error('Failed to upload generated image to ImgBB.'); }
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
    if (geminiModels.includes(model)) {
        let finalImageUrl = null;
        if (imageUrl) {
            if (imageUrl.startsWith('data:image')) {
                const base64Data = imageUrl.replace(/^data:image\/[a-z]+;base64,/, "");
                const form = new FormData();
                form.append('image', base64Data);
                const imgbbResponse = await axios.post(`${IMGBB_UPLOAD_URL}?key=${IMGBB_API_KEY}`, form, { headers: form.getHeaders(), timeout: 600000 });
                if (imgbbResponse.data && imgbbResponse.data.success) { finalImageUrl = imgbbResponse.data.data.url; } else { throw new Error('Failed to upload image to ImgBB.'); }
            } else {
                finalImageUrl = imageUrl;
            }
        }
        const apiParams = { ask: ask, model: model, api_key: HAJI_GEMINI_API_KEY, uid, roleplay, max_tokens: max_tokens || '', google_api_key: google_api_key || '', };
        if (finalImageUrl) apiParams.file_url = finalImageUrl;
        const response = await axios.get(HAJI_GEMINI_URL, { params: apiParams, timeout: 600000 });
        const apiResponse = response.data;
        if (!apiResponse || !apiResponse.answer) { console.error('Invalid response from Gemini API. Full response:', JSON.stringify(apiResponse, null, 2)); throw new Error('Received an invalid response from the external Gemini API.'); }
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
        const apiParams = { ask: ask, model: model, api_key: HAJI_PUTER_API_KEY, uid, roleplay, stream: false, };
        const response = await axios.get(HAJI_PUTER_URL, { params: apiParams, timeout: 600000 });
        const apiResponse = response.data;
        if (!apiResponse || !apiResponse.answer) { console.error('Invalid response from Puter API. Full response:', JSON.stringify(apiResponse, null, 2)); throw new Error('Received an invalid response from the external Puter API.'); }
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
    } else if (rtmModels.includes(model)) {
        const response = await axios.get(`${HAJI_RTM_URL}/${encodeURIComponent(ask)}?model=${model}`, { timeout: 600000 });
        const answer = response.data;
        const completionId = `chatcmpl-${Date.now()}`;
        res.json({ id: completionId, object: 'chat.completion', created: Math.floor(Date.now() / 1000), model: model, choices: [{ index: 0, message: { role: 'assistant', content: answer }, finish_reason: 'stop' }], usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 } });
        return;
    } else if (openAIModels.includes(model)) {
        let finalImageUrl = null;
        if (imageUrl) {
            if (imageUrl.startsWith('data:image')) {
                const base64Data = imageUrl.replace(/^data:image\/[a-z]+;base64,/, "");
                const form = new FormData();
                form.append('image', base64Data);
                const imgbbResponse = await axios.post(`${IMGBB_UPLOAD_URL}?key=${IMGBB_API_KEY}`, form, { headers: form.getHeaders(), timeout: 600000 });
                if (imgbbResponse.data && imgbbResponse.data.success) { finalImageUrl = imgbbResponse.data.data.url; } else { throw new Error('Failed to upload image to ImgBB.'); }
            } else {
                finalImageUrl = imageUrl;
            }
        }
        const apiParams = { ask: ask, model: model, api_key: HAJI_OPENAI_API_KEY, uid, roleplay, max_tokens: max_tokens || '', };
        if (finalImageUrl) apiParams.img_url = finalImageUrl;
        const response = await axios.get(HAJI_OPENAI_URL, { params: apiParams, timeout: 600000 });
        const apiResponse = response.data;
        if (!apiResponse || !apiResponse.answer) { console.error('Invalid response from OpenAI API. Full response:', JSON.stringify(apiResponse, null, 2)); throw new Error('Received an invalid response from the external OpenAI API.'); }
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
    }
    let finalImageUrl = null;
    if (imageUrl) {
      if (imageUrl.startsWith('data:image')) {
        const base64Data = imageUrl.replace(/^data:image\/[a-z]+;base64,/, "");
        const form = new FormData();
        form.append('image', base64Data);
        const imgbbResponse = await axios.post(`${IMGBB_UPLOAD_URL}?key=${IMGBB_API_KEY}`, form, { headers: form.getHeaders(), timeout: 600000 });
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
    const response = await axios.get(HAJI_ANTHROPIC_URL, { params: apiParams, timeout: 600000 });
    const apiResponse = response.data;
    if (!apiResponse || !apiResponse.answer) { throw new Error('Received an invalid response from the external API.'); }
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
      responseType: 'arraybuffer',
      timeout: 600000
    });
    const base64Data = Buffer.from(fluxResponse.data, 'binary').toString('base64');
    const form = new FormData();
    form.append('image', base64Data);
    const imgbbResponse = await axios.post(`${IMGBB_UPLOAD_URL}?key=${IMGBB_API_KEY}`, form, { headers: form.getHeaders(), timeout: 600000 });
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

// Initialize the database and create tables
initializeDatabase().then(() => {
    fetchRtmModels();
});

const server = app.listen(PORT, () => {
  console.log(`OpenAI-compatible proxy server is running on http://localhost:${PORT}`);
  const requiredVars = [
    'HAJI_API_KEY', 'IMGBB_API_KEY', 'HAJI_GEMINI_API_KEY', 'HAJI_PUTER_API_KEY', 'HAJI_OPENAI_API_KEY',
    'HAJI_ANTHROPIC_URL', 'HAJI_FLUX_URL', 'IMGBB_UPLOAD_URL', 'HAJI_GPTOSS_URL', 'HAJI_GEMINI_URL', 'HAJI_PUTER_URL', 'HAJI_OPENAI_URL', 'HAJI_IMAGEN_URL'
  ];
  const missingVars = requiredVars.filter(v => !process.env[v]);
  if (missingVars.length > 0) {
    console.warn(`\n!!! WARNING: The following required environment variables are not set in your .env file:`);
    missingVars.forEach(v => console.warn(`- ${v}`));
    console.warn('The application will likely fail without them.\n');
  }
});

process.on('SIGINT', () => {
    console.log('SIGINT signal received: closing HTTP server');
    server.close(() => {
        console.log('HTTP server closed');
    });
});
}
