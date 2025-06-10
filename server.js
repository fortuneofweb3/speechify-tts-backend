require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cache = require('memory-cache');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const app = express();

// Enable trust proxy for Render's load balancer
app.set('trust proxy', 1);

// Middleware
app.use(cors());
app.use(express.json());

// Rate limiter: 1 request per 10 seconds per IP
const limiter = rateLimit({
    windowMs: 10 * 1000, // 10 seconds
    max: 1, // 1 request per window
    message: { error: 'Too many requests, please try again after 10 seconds' }
});
app.use('/generate-audio', limiter);

// Speechify API configuration
const apiUrl = process.env.SPEECHIFY_API_URL || 'https://api.sws.speechify.com/v1/audio/generate'; // Fallback endpoint
const apiKey = process.env.SPEECHIFY_API_KEY;

// Cache configuration (2 hours = 7200 seconds)
const CACHE_DURATION = 2 * 60 * 60 * 1000;

app.post('/generate-audio', async (req, res) => {
    const { text, voice = 'jesse', speed = 1.0, format = 'mp3' } = req.body;

    if (!text) {
        return res.status(400).json({ error: 'Text is required' });
    }

    const cacheKey = `${text}:${voice}:${speed}:${format}`;
    const cachedAudio = cache.get(cacheKey);

    if (cachedAudio) {
        console.log('Serving from cache');
        res.set('Content-Type', `audio/${format}`);
        return res.send(cachedAudio);
    }

    try {
        const response = await axios.post(apiUrl, {
            text,
            voice,
            speed,
            audioFormat: format
        }, {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            responseType: 'arraybuffer'
        });

        cache.put(cacheKey, response.data, CACHE_DURATION);
        console.log('Audio generated and cached');
        res.set('Content-Type', `audio/${format}`);
        res.send(response.data);
    } catch (error) {
        const status = error.response?.status || 500;
        const message = error.response?.data?.error || error.message || 'Failed to generate audio';
        console.error(`Error: ${status} - ${message}`);
        res.status(status).json({ error: message });
    }
});

app.get('/health', (req, res) => res.send('Server is running'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
