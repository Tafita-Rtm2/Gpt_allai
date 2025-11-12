require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const { MongoClient, ObjectId } = require('mongodb');
const multer = require('multer');
const session = require('express-session');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const mongoUri = process.env.MONGO_URI;
let db;

async function connectToDb() {
  if (!mongoUri) {
    console.error('MONGO_URI is not defined in .env file');
    process.exit(1);
  }
  const client = new MongoClient(mongoUri);
  try {
    await client.connect();
    db = client.db();
    console.log('Connected to MongoDB');
  } catch (err) {
    console.error('Failed to connect to MongoDB', err);
    process.exit(1);
  }
}

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: process.env.SESSION_SECRET || 'a_very_secret_key',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: 'auto' }
}));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Auth routes
app.post('/register', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required.' });
  }

  const users = db.collection('users');
  const existingUser = await users.findOne({ email });

  if (existingUser) {
    return res.status(409).json({ message: 'User with this email already exists.' });
  }

  const saltRounds = 10;
  const hashedPassword = await bcrypt.hash(password, saltRounds);

  const newUser = {
    email,
    password: hashedPassword,
    createdAt: new Date()
  };

  await users.insertOne(newUser);

  res.status(201).json({ message: 'User registered successfully.' });
});

app.post('/login', async (req, res) => {
  const { email, password, rememberMe } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required.' });
  }

  const users = db.collection('users');
  const user = await users.findOne({ email });

  if (!user) {
    return res.status(401).json({ message: 'Invalid credentials.' });
  }

  const isPasswordValid = await bcrypt.compare(password, user.password);

  if (!isPasswordValid) {
    return res.status(401).json({ message: 'Invalid credentials.' });
  }

  req.session.userId = user._id;

  if (rememberMe) {
    req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
  }

  res.status(200).json({ message: 'Logged in successfully.' });
});

app.get('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      return res.status(500).json({ message: 'Could not log out, please try again.' });
    }
    res.redirect('/login.html');
  });
});

app.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  const users = db.collection('users');
  const user = await users.findOne({ email });

  if (!user) {
    // We send a success message even if the user doesn't exist to prevent email enumeration attacks
    return res.status(200).json({ message: 'If a user with that email exists, a password reset link has been sent.' });
  }

  const resetToken = crypto.randomBytes(32).toString('hex');
  const resetTokenExpiry = Date.now() + 3600000; // 1 hour from now

  await users.updateOne({ _id: user._id }, {
    $set: {
      resetToken,
      resetTokenExpiry
    }
  });

  // TODO: Implement actual email sending here
  // You would use a library like Nodemailer and an SMTP service.
  const resetLink = `http://localhost:${PORT}/reset-password.html?token=${resetToken}`;
  console.log(`Password reset link (for testing): ${resetLink}`);

  res.status(200).json({ message: 'If a user with that email exists, a password reset link has been sent.' });
});

app.post('/reset-password', async (req, res) => {
  const { token, password } = req.body;

  if (!token || !password) {
    return res.status(400).json({ message: 'Token and new password are required.' });
  }

  const users = db.collection('users');
  const user = await users.findOne({
    resetToken: token,
    resetTokenExpiry: { $gt: Date.now() }
  });

  if (!user) {
    return res.status(400).json({ message: 'Password reset token is invalid or has expired.' });
  }

  const saltRounds = 10;
  const hashedPassword = await bcrypt.hash(password, saltRounds);

  await users.updateOne({ _id: user._id }, {
    $set: { password: hashedPassword },
    $unset: { resetToken: "", resetTokenExpiry: "" }
  });

  res.status(200).json({ message: 'Password has been reset successfully.' });
});

// Middleware to protect routes
const requireAuth = (req, res, next) => {
  if (req.session.userId) {
    next();
  } else {
    res.status(401).json({ message: 'Unauthorized' });
  }
};

app.get('/api/session', (req, res) => {
  if (req.session.userId) {
    res.json({ loggedIn: true, userId: req.session.userId });
  } else {
    res.json({ loggedIn: false });
  }
});

app.get('/webhook', (req, res) => {
  const VERIFY_TOKEN = "midevprod";

  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token) {
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('WEBHOOK_VERIFIED');
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  }
});

app.post('/webhook', async (req, res) => {
    const body = req.body;

    if (body.object === 'page') {
        for (const entry of body.entry) {
            const pageId = entry.id;
            const webhookEvent = entry.messaging[0];
            if (!webhookEvent || !webhookEvent.sender) {
                console.warn('Received an incomplete webhook event:', entry);
                continue;
            }
            const senderPsid = webhookEvent.sender.id;

            // Find the page access token from the database
            const account = await db.collection('accounts').findOne({ pageId: pageId });
            if (!account || !account.pageAccessToken) {
                console.error(`No access token found for page ${pageId}. Make sure the page is connected.`);
                continue; // Skip to the next entry
            }
            const pageAccessToken = account.pageAccessToken;
            const userId = account.userId; // Get the userId associated with the page

            if (!userId) {
                console.error(`No userId found for account with pageId ${pageId}.`);
                continue;
            }

            if (webhookEvent.message) {
                if (webhookEvent.message.quick_reply) {
                    await handleQuickReply(senderPsid, webhookEvent.message.quick_reply, pageAccessToken, userId);
                } else {
                    await handleMessage(senderPsid, webhookEvent.message, pageAccessToken, userId);
                }
            }
        }
        res.status(200).send('Événement reçu');
    } else {
        res.sendStatus(404);
    }
});

app.get('/api/users', requireAuth, async (req, res) => {
    // In a real app, you'd have a proper role system.
    // For now, we'll consider the first registered user as the admin.
    const usersCollection = db.collection('users');
    const firstUser = await usersCollection.findOne({}, { sort: { createdAt: 1 } });

    if (req.session.userId !== firstUser._id.toString()) {
        return res.status(403).json({ message: 'Forbidden' });
    }

    try {
        const users = await usersCollection.find({}, { projection: { email: 1, createdAt: 1 } }).toArray();
        res.json(users);
    } catch (error) {
        console.error('Error fetching user list:', error);
        res.status(500).json({ message: 'Error fetching user list.' });
    }
});

async function handleMessage(senderPsid, receivedMessage, pageAccessToken, userId) {
    let response;
    let quickReplies = [];
    const user = await db.collection('messenger_users').findOne({ psid: senderPsid });

    if (user && user.midevIaMode) {
        try {
            const apiUrl = new URL(process.env.MIDEV_API_URL);
            apiUrl.searchParams.append('ask', receivedMessage.text);
            apiUrl.searchParams.append('model', user.claudeModel || 'claude-opus-4-20250514');
            const apiRes = await fetch(apiUrl.toString());
            const apiJson = await apiRes.json();
            const answer = apiJson.response || getValueFromSample(apiJson, '{"answer": "{{answer}}"}');
            response = { "text": answer };
        } catch (error) {
            console.error('Error calling MiDev API:', error);
            response = { "text": "Sorry, something went wrong with the MiDev AI." };
        }
    } else if (user && user.geminiIaMode) {
        const geminiResponse = await getGeminiResponse(receivedMessage.text, user.geminiPrompt);
        response = { "text": geminiResponse };
    } else {
        const flux = await db.collection('fluxes').findOne({ userId, keyword: receivedMessage.text });
        if (flux) {
            response = { "text": flux.response };
        } else {
            const flows = await db.collection('flows').find({ userId, isActive: true }).toArray();
            const triggeredFlow = flows.find(f =>
                f.flowData && f.flowData.nodes.some(n => n.type === 'trigger' && n.data.keyword === receivedMessage.text)
            );

            if (triggeredFlow) {
                const startNode = triggeredFlow.flowData.nodes.find(n => n.type === 'message' || n.type === 'image' || n.type === 'api' || n.type === 'ai');
                if (startNode) {
                    if (startNode.type === 'message') {
                        response = { "text": startNode.data.message };
                    } else if (startNode.type === 'image') {
                        response = {
                            "attachment": {
                                "type": "image",
                                "payload": {
                                    "url": startNode.data.url
                                }
                            }
                        };
                    } else if (startNode.type === 'api') {
                        const apiNode = startNode;
                        const apiUrl = apiNode.data.apiUrl;
                        const sampleResponse = apiNode.data.sampleResponse;

                        try {
                            const apiRes = await fetch(apiUrl);
                            const apiJson = await apiRes.json();
                            const answer = getValueFromSample(apiJson, sampleResponse);
                            response = { "text": answer };
                        } catch (error) {
                            console.error('Error calling API:', error);
                            response = { "text": "Sorry, something went wrong." };
                        }
                } else if (startNode.type === 'ai') {
                    const aiNode = startNode;
                    try {
                        const apiUrl = new URL(process.env.MIDEV_API_URL);
                        apiUrl.searchParams.append('ask', receivedMessage.text);
                        apiUrl.searchParams.append('model', aiNode.data.model);
                        apiUrl.searchParams.append('api_key', process.env.MIDEV_API_KEY);
                        if (aiNode.data.prompt) {
                            apiUrl.searchParams.append('roleplay', aiNode.data.prompt);
                        }
                        const apiRes = await fetch(apiUrl.toString());
                        const apiJson = await apiRes.json();
                        const answer = apiJson.response || apiJson.answer;
                        response = { "text": answer };
                    } catch (error) {
                        console.error('Error calling MiDev API:', error);
                        response = { "text": "Sorry, something went wrong with the AI." };
                    }
                    }
                    const connectedQrNodes = findConnectedNode(triggeredFlow.flowData, startNode.id);
                    if (connectedQrNodes.length > 0) {
                        quickReplies = connectedQrNodes
                            .filter(node => node.type === 'quick_reply')
                            .map(qrNode => ({
                                title: qrNode.data.text,
                                payload: `qr_${qrNode.id}`
                            }));
                    }
                } else {
                    response = { "text": "No starting node found in the flow." };
                }
            } else {
                const defaultFlow = await db.collection('flows').findOne({ userId, isDefault: true, isActive: true });
                if (defaultFlow) {
                    const startNode = defaultFlow.flowData.nodes.find(n => n.type === 'message' || n.type === 'image' || n.type === 'api' || n.type === 'ai');
                    if (startNode) {
                        if (startNode.type === 'message') {
                            response = { "text": startNode.data.message };
                        } else if (startNode.type === 'image') {
                            response = {
                                "attachment": {
                                    "type": "image",
                                    "payload": {
                                        "url": startNode.data.url
                                    }
                                }
                            };
                        } else if (startNode.type === 'api') {
                            const apiNode = startNode;
                            const apiUrl = apiNode.data.apiUrl;
                            const sampleResponse = apiNode.data.sampleResponse;
                            try {
                                const apiRes = await fetch(apiUrl);
                                const apiJson = await apiRes.json();
                                const answer = getValueFromSample(apiJson, sampleResponse);
                                response = { "text": answer };
                            } catch (error) {
                                console.error('Error calling API:', error);
                                response = { "text": "Sorry, something went wrong." };
                            }
                    } else if (startNode.type === 'ai') {
                        const aiNode = startNode;
                        try {
                            const apiUrl = new URL(process.env.MIDEV_API_URL);
                            apiUrl.searchParams.append('ask', receivedMessage.text);
                            apiUrl.searchParams.append('model', aiNode.data.model);
                            apiUrl.searchParams.append('api_key', process.env.MIDEV_API_KEY);
                            if (aiNode.data.prompt) {
                                apiUrl.searchParams.append('roleplay', aiNode.data.prompt);
                            }
                            const apiRes = await fetch(apiUrl.toString());
                            const apiJson = await apiRes.json();
                            response = { "text": apiJson.answer };
                        } catch (error) {
                            console.error('Error calling MiDev API:', error);
                            response = { "text": "Sorry, something went wrong with the AI." };
                        }
                        }
                        const connectedQrNodes = findConnectedNode(defaultFlow.flowData, startNode.id);
                        if (connectedQrNodes.length > 0) {
                            quickReplies = connectedQrNodes
                                .filter(node => node.type === 'quick_reply')
                                .map(qrNode => ({
                                    title: qrNode.data.text,
                                    payload: `qr_${qrNode.id}`
                                }));
                        }
                    } else {
                        response = { "text": "No starting node found in the default flow." };
                    }
                } else {
                    response = { "text": `Vous avez dit: "${receivedMessage.text}".` };
                }
            }
    }
}

    await callSendAPI(senderPsid, response, quickReplies, pageAccessToken);
}

async function handleQuickReply(senderPsid, quickReply, pageAccessToken, userId) {
    const payload = quickReply.payload;
    const nodeId = payload.split('_')[1];

    // Find the flow this quick reply belongs to
    const flow = await db.collection('flows').findOne({ userId, "flowData.nodes.id": nodeId });
    if (flow && flow.flowData && flow.flowData.nodes) {
        const qrNode = flow.flowData.nodes.find(n => n.id === nodeId);
        if (qrNode) {
            const connectedNodes = findConnectedNode(flow.flowData, qrNode.id);
            if (connectedNodes.length > 0) {
                const messageNode = connectedNodes.find(n => n.type === 'message');
                if (messageNode) {
                    let response = { "text": messageNode.data.message };
                    let quickReplies = [];
                    const nextQrNodes = findConnectedNode(flow.flowData, messageNode.id);
                    if (nextQrNodes.length > 0) {
                        quickReplies = nextQrNodes.map(qr => ({
                            title: qr.data.text,
                            payload: `qr_${qr.id}`
                        }));
                    }
                    await callSendAPI(senderPsid, response, quickReplies, pageAccessToken);
                }
            }
        }
    }
}

function findConnectedNode(flowData, sourceNodeId) {
    const edges = flowData.edges.filter(e => e.source === sourceNodeId);
    if (edges.length > 0) {
        return edges.map(edge => flowData.nodes.find(n => n.id === edge.target));
    }
    return [];
}

function getValueFromSample(jsonResponse, sample) {
    const sampleKeys = Object.keys(JSON.parse(sample));
    const responseKeys = Object.keys(jsonResponse);
    const answerKey = sampleKeys.find(key => JSON.parse(sample)[key] === '{{answer}}');
    if (answerKey) {
        const answerIndex = sampleKeys.indexOf(answerKey);
        const responseKey = responseKeys[answerIndex];
        return jsonResponse[responseKey];
    }
    return "No answer found";
}

async function getGeminiResponse(message, prompt) {
  // Cette fonction est un placeholder. L'implémentation réelle dépend de la librairie utilisée pour Gemini.
  console.log(`Appel à Gemini avec le message : "${message}" et le prompt : "${prompt}"`);
  return `Réponse de l'IA pour : "${message}"`;
}

app.get('/api/user/:psid', requireAuth, async (req, res) => {
    const { psid } = req.params;
    // We could add a check here to ensure the psid is linked to the logged-in user if needed
    const user = await db.collection('messenger_users').findOne({ psid });
    res.json(user);
});

app.post('/api/user/ia', requireAuth, async (req, res) => {
    const { geminiIaMode, geminiApiKey, geminiPrompt, midevIaMode, claudeModel } = req.body;
    await db.collection('users').updateOne({ _id: new ObjectId(req.session.userId) }, { $set: {
        geminiIaMode,
        geminiApiKey,
        geminiPrompt,
        midevIaMode,
        claudeModel
    } });
    res.status(200).send('Mode IA mis à jour');
});

app.get('/api/user/settings', requireAuth, async (req, res) => {
    const user = await db.collection('users').findOne({ _id: new ObjectId(req.session.userId) });
    if (user) {
        res.json({
            geminiIaMode: user.geminiIaMode,
            geminiApiKey: user.geminiApiKey,
            geminiPrompt: user.geminiPrompt,
            midevIaMode: user.midevIaMode,
            claudeModel: user.claudeModel
        });
    } else {
        res.status(404).json({ message: 'User not found' });
    }
});

async function callSendAPI(senderPsid, response, quickReplies = [], pageAccessToken) {
    let requestBody;
    if (response.text) {
        requestBody = {
            "recipient": { "id": senderPsid },
            "message": { "text": response.text },
        };
    } else if (response.attachment) {
        requestBody = {
            "recipient": { "id": senderPsid },
            "message": {
                "attachment": {
                    "type": "image",
                    "payload": {
                        "url": `${process.env.BASE_URL}${response.attachment.payload.url}`,
                        "is_reusable": true
                    }
                }
            }
        };
    }

    if (quickReplies.length > 0) {
        requestBody.message.quick_replies = quickReplies.map(qr => ({
            "content_type": "text",
            "title": qr.title,
            "payload": qr.payload,
        }));
    }

    await fetch(`https://graph.facebook.com/v19.0/me/messages?access_token=${pageAccessToken}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
    });
}


app.post('/api/facebook/save-connection', requireAuth, async (req, res) => {
    const { pageId, pageAccessToken } = req.body;
    if (!pageId || !pageAccessToken) {
        return res.status(400).json({ message: 'Page ID and Page Access Token are required.' });
    }

    try {
        const accounts = db.collection('accounts');
        // Associate the connection with the logged-in user
        await accounts.updateOne(
            { pageId: pageId, userId: req.session.userId },
            { $set: { pageAccessToken: pageAccessToken, connectedAt: new Date() } },
            { upsert: true }
        );

        req.session.connectedPageId = pageId;
        res.status(200).json({ message: 'Connection saved successfully.' });

    } catch (error) {
        console.error('Error saving connection:', error);
        res.status(500).json({ message: 'Internal server error while saving connection.' });
    }
});

// This route does not need to be protected as it only returns a public app ID
app.get('/api/config', (req, res) => {
    if (!process.env.FACEBOOK_APP_ID) {
        return res.status(500).json({ error: 'Facebook App ID not configured on the server.' });
    }
    res.json({ facebookAppId: process.env.FACEBOOK_APP_ID });
});

app.get('/api/connection-status', requireAuth, async (req, res) => {
    // Find connection based on the logged-in user
    const account = await db.collection('accounts').findOne({ userId: req.session.userId });

    if (account && account.pageId) {
        try {
            // For status, we might need a user-level access token stored in the session after FB login
            const accessToken = req.session.userAccessToken || account.pageAccessToken;
            const response = await fetch(`https://graph.facebook.com/${account.pageId}?fields=name&access_token=${accessToken}`);
            const data = await response.json();
            if (data.name) {
                 res.json({ connected: true, pageId: account.pageId, pageName: data.name });
            } else {
                res.json({ connected: true, pageId: account.pageId, pageName: `Page ${account.pageId}` });
            }
        } catch (error) {
            console.error("Error fetching connection status:", error);
            res.json({ connected: true, pageId: account.pageId, pageName: `Page ${account.pageId}` });
        }
    } else {
        res.json({ connected: false });
    }
});

app.post('/api/facebook/disconnect', requireAuth, async (req, res) => {
    const account = await db.collection('accounts').findOne({ userId: req.session.userId });

    if (account) {
        const pageId = account.pageId;

        if (account.pageAccessToken) {
            try {
                await fetch(`https://graph.facebook.com/${pageId}/subscribed_apps?access_token=${account.pageAccessToken}`, {
                    method: 'DELETE'
                });
            } catch (error) {
                console.warn(`Could not unsubscribe page ${pageId}, it might have been disconnected already.`, error);
            }
        }

        await db.collection('accounts').deleteOne({ userId: req.session.userId });
        delete req.session.connectedPageId;
    }
    res.status(200).json({ message: 'Disconnected successfully.' });
});

// API routes for fluxes
app.get('/api/fluxes', requireAuth, async (req, res) => {
  const allFluxes = await db.collection('fluxes').find({ userId: req.session.userId }).toArray();
  res.json(allFluxes);
});

app.post('/api/fluxes', requireAuth, async (req, res) => {
  const { keyword, response } = req.body;
  const newFlux = { keyword, response, userId: req.session.userId };
  await db.collection('fluxes').insertOne(newFlux);
  res.status(201).json(newFlux);
});

app.delete('/api/fluxes/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  await db.collection('fluxes').deleteOne({ _id: new ObjectId(id), userId: req.session.userId });
  res.status(204).send();
});

// API routes for flows
app.get('/api/flows', requireAuth, async (req, res) => {
  const allFlows = await db.collection('flows').find({ userId: req.session.userId }).toArray();
  res.json(allFlows);
});

app.get('/api/flows/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const flow = await db.collection('flows').findOne({ _id: new ObjectId(id), userId: req.session.userId });
  res.json(flow);
});

app.post('/api/flows', requireAuth, async (req, res) => {
  const { name, flowData } = req.body;
  const newFlow = { name, flowData, isActive: false, isDefault: false, userId: req.session.userId };
  await db.collection('flows').insertOne(newFlow);
  res.status(201).json(newFlow);
});

app.put('/api/flows/:id', requireAuth, async (req, res) => {
    const { id } = req.params;
    const { name, flowData, isActive, isDefault } = req.body;

    if (isDefault) {
        await db.collection('flows').updateMany({ userId: req.session.userId }, { $set: { isDefault: false } });
    }

    await db.collection('flows').updateOne({ _id: new ObjectId(id), userId: req.session.userId }, { $set: { name, flowData, isActive, isDefault } });
    res.status(200).send('Flow updated');
});

app.delete('/api/flows/:id', requireAuth, async (req, res) => {
    const { id } = req.params;
    await db.collection('flows').deleteOne({ _id: new ObjectId(id), userId: req.session.userId });
    res.status(204).send();
});

app.get('/api/models', requireAuth, async (req, res) => {
    try {
        const apiUrl = new URL(process.env.MIDEV_API_URL);
        apiUrl.searchParams.append('api_key', process.env.MIDEV_API_KEY);
        const apiRes = await fetch(apiUrl.toString());
        const apiJson = await apiRes.json();
        res.json(apiJson.supported_models);
    } catch (error) {
        console.error('Error fetching models:', error);
        res.status(500).json({ error: 'Error fetching models' });
    }
});

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'public/uploads/')
    },
    filename: function (req, file, cb) {
        cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname))
    }
});

const upload = multer({ storage: storage });

app.post('/api/upload', requireAuth, upload.single('image'), (req, res) => {
    if (!req.file) {
        return res.status(400).send('No file uploaded.');
    }
    res.json({ url: `/uploads/${req.file.filename}` });
});

app.get('/api/analytics/users-over-time', requireAuth, async (req, res) => {
    // For now, allow any logged in user to see analytics
    // In a real app, you'd add role-based access control here

    const users = db.collection('users');
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    try {
        const result = await users.aggregate([
            { $match: { createdAt: { $gte: sevenDaysAgo } } },
            {
                $group: {
                    _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                    count: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } }
        ]).toArray();

        // Create a map of dates to counts
        const dataMap = new Map(result.map(item => [item._id, item.count]));
        const labels = [];
        const data = [];

        // Fill in missing days with 0 counts
        for (let i = 0; i < 7; i++) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dateString = d.toISOString().split('T')[0];
            labels.unshift(dateString);
            data.unshift(dataMap.get(dateString) || 0);
        }

        res.json({ labels, data });
    } catch (error) {
        console.error('Error fetching user analytics:', error);
        res.status(500).json({ message: 'Error fetching analytics data.' });
    }
});

connectToDb().then(() => {
  app.listen(PORT, () => {
    console.log(`Serveur démarré sur http://localhost:${PORT}`);
  });
});
