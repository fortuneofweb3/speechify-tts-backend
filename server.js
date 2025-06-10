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

const apiUrl = process.env.SPEECHIFY_API_URL || 'https://api.sws.speechify.com/v1/audio/speech';
const apiKey = process.env.SPEECHIFY_API_KEY;
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
            input: text,
            voice_id: voice, // Use voice_id as per Speechify API
            speed_rate: speed, // Map speed to speed_rate for SSML (if needed)
            audio_format: format,
            language: 'en-US' // Default to en-US; adjust as needed
        }, {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            }
        });

        // Decode Base64 audio_data to binary
        const audioData = Buffer.from(response.data.audio_data, 'base64');
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
