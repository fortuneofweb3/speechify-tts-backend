require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cache = require('memory-cache');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const app = express();

app.set('trust proxy', 1); // Fix X-Forwarded-For error

app.use(cors());
app.use(express.json());

const limiter = rateLimit({
    windowMs: 10 * 1000, // 10 seconds
    max: 1, // 1 request per window
    message: { error: 'Too many requests, please try again after 10 seconds' }
});
app.use('/generate-audio', limiter);

const apiUrl = process.env.SPEECHIFY_API_URL || 'https://api.sws.speechify.com/v1/audio/stream';
const apiKey = process.env.SPEECHIFY_API_KEY;
const CACHE_DURATION = 2 * 60 * 60 * 1000;

app.post('/generate-audio', async (req, res) => {
    const { text, voice = 'oliver', speed = 1.0, emotion = 0, format = 'mp3' } = req.body;
    if (!text) {
        return res.status(400).json({ error: 'Text is required' });
    }

    // Map emotion (0 to 100) to SSML pitch (-10% to +10%)
    const pitch = `${(emotion - 50) / 5}%`; // 0 -> -10%, 100 -> +10%
    // Map speed (0.5 to 2.0) to SSML rate
    const rate = `${speed * 100}%`; // 1.0 -> 100%, 0.5 -> 50%, 2.0 -> 200%
    // Generate SSML input
    const ssmlInput = `
        <speak>
            <prosody pitch="${pitch}" rate="${rate}">
                ${text}
            </prosody>
        </speak>
    `;

    const cacheKey = `${text}:${voice}:${speed}:${emotion}:${format}`;
    const cachedAudio = cache.get(cacheKey);

    if (cachedAudio) {
        console.log('Serving from cache');
        res.set('Content-Type', `audio/${format}`);
        return res.send(cachedAudio);
    }

    try {
        const response = await axios.post(apiUrl, {
            input: ssmlInput,
            voice_id: voice,
            language: 'en-US',
            model: 'simba-english'
        }, {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'Accept': 'audio/mpeg'
            },
            responseType: 'arraybuffer'
        });

        const audioData = Buffer.from(response.data);
        cache.put(cacheKey, audioData, CACHE_DURATION);
        console.log('Audio generated and cached');
        res.set('Content-Type', `audio/${format}`);
        res.send(audioData);
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
