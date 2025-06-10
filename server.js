require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cache = require('memory-cache');
const cors = require('cors');
const app = express();

// Middleware
app.use(cors()); // Allow requests from your React app
app.use(express.json());

// Speechify API configuration
const apiUrl = 'https://api.sws.speechify.com/v1/audio/generate'; // Verify in Speechify docs
const apiKey = process.env.SPEECHIFY_API_KEY;

// Cache configuration (2 hours = 7200 seconds)
const CACHE_DURATION = 2 * 60 * 60 * 1000;

// Endpoint to generate audio
app.post('/generate-audio', async (req, res) => {
    const { text, voice = 'jesse', speed = 1.0, format = 'mp3' } = req.body;

    // Validate request
    if (!text) {
        return res.status(400).json({ error: 'Text is required' });
    }

    // Create cache key
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

        // Cache the audio
        cache.put(cacheKey, response.data, CACHE_DURATION);
        console.log('Audio generated and cached');

        res.set('Content-Type', `audio/${format}`);
        res.send(response.data);
    } catch (error) {
        console.error('Error:', error.response ? error.response.data : error.message);
        res.status(500).json({ error: 'Failed to generate audio' });
    }
});

// Health check
app.get('/health', (req, res) => res.send('Server is running'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));