import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Initialize GoogleGenAI client (Server-Side only)
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

// Health check
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'online',
    timestamp: new Date().toISOString(),
    hasApiKey: !!process.env.GEMINI_API_KEY,
  });
});

// Chat endpoint for REA (Reverse Engineer Anything) & ROM Assistant
app.post('/api/gemini/chat', async (req, res) => {
  try {
    const { messages, systemInstruction, model = 'gemini-3.8-flash' } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Messages array is required' });
    }

    // Selected model per feature instructions (gemini-3.8-flash, gemini-4-argon, gemini-3.1-flash-lite)
    const validModels = ['gemini-3.8-flash', 'gemini-4-argon', 'gemini-3.1-flash-lite', 'models/gemini-3.8-flash'];
    const selectedModel = validModels.includes(model) ? model.replace('models/', '') : 'gemini-3.8-flash';

    const defaultSystemInstruction =
      systemInstruction ||
      `You are REA (Reverse Engineer Anything), an elite game-engine architect, binary reverse-engineer, emulator specialist, and static recompilation researcher.
You assist developers and preservationists in analyzing game ROMs (NES, SNES, Game Boy, GBA, Genesis, N64, PS1), disassembling opcodes (6502, Z80, SM83, ARM7TDMI, MIPS R4300i), planning static recompilations (like N64Recomp, Ship of Harkinian, sm64-port, OpenGOAL), inspecting memory maps, detecting compression/encryption, and preparing WebAssembly native ports.
Give accurate, technically rigorous, and structured engineering answers. Distinguish clearly between emulation, static binary translation, clean-room source ports, and dynamic recompilation. Never invent fake registers or fake opcode specs.`;

    const chatWithModel = async (mod: string) => {
      const chat = ai.chats.create({
        model: mod,
        config: {
          systemInstruction: defaultSystemInstruction,
        },
      });

      // Replay conversation history up to the latest message
      for (let i = 0; i < messages.length - 1; i++) {
        const msg = messages[i];
        if (msg.role === 'user') {
          await chat.sendMessage({ message: msg.content });
        }
      }

      const latestMessage = messages[messages.length - 1];
      const response = await chat.sendMessage({ message: latestMessage.content });
      return response.text || '';
    };

    let reply = '';
    try {
      reply = await chatWithModel(selectedModel);
    } catch (primaryErr: any) {
      console.warn(`Primary chat model ${selectedModel} failed (${primaryErr.message}), trying gemini-3.1-flash-lite fallback...`);
      // Fallback to flash-lite if 503, 429, or unavailable
      reply = await chatWithModel('gemini-3.1-flash-lite');
    }

    return res.json({ reply });
  } catch (error: any) {
    console.error('Gemini Chat error:', error);
    return res.status(500).json({
      error: error.message || 'Failed to process chat message with Gemini.',
    });
  }
});

// High-Quality Box Art / Game Cover Asset Generator using gemini-3-pro-image-preview
app.post('/api/gemini/image', async (req, res) => {
  try {
    const {
      prompt,
      imageSize = '1K',
      aspectRatio = '3:4',
      gameTitle = '',
      platform = '',
    } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    // Supported resolutions: 1K, 2K, 4K
    const validSizes = ['1K', '2K', '4K'];
    const selectedSize = validSizes.includes(imageSize) ? imageSize : '1K';

    const validAspectRatios = ['1:1', '3:4', '4:3', '16:9'];
    const selectedAspectRatio = validAspectRatios.includes(aspectRatio) ? aspectRatio : '3:4';

    const enrichedPrompt = `Authentic retro video game box art and cover illustration for the game "${gameTitle || 'Retro Classic'}" on platform "${platform || 'Console'}".
Art style and composition details: ${prompt}.
High-fidelity, vibrant vintage packaging aesthetic, iconic typography and character framing, dramatic lighting, collector quality, no modern watermarks.`;

    let generatedImageUrl = '';
    let responseText = '';

    // Primary model specified by instructions: gemini-3-pro-image-preview or gemini-nano-banana-2.1
    const modelToTry = 'gemini-3-pro-image-preview';

    try {
      const response = await ai.models.generateContent({
        model: modelToTry,
        contents: {
          parts: [{ text: enrichedPrompt }],
        },
        config: {
          imageConfig: {
            aspectRatio: selectedAspectRatio as any,
            imageSize: selectedSize as any,
          },
        },
      });

      for (const part of response.candidates?.[0]?.content?.parts ?? []) {
        if (part.inlineData?.data) {
          const base64Data = part.inlineData.data;
          const mime = part.inlineData.mimeType || 'image/png';
          generatedImageUrl = `data:${mime};base64,${base64Data}`;
        } else if (part.text) {
          responseText += part.text;
        }
      }
    } catch (primaryErr: any) {
      console.warn('Primary image model call failed, trying gemini-nano-banana-2.1 fallback:', primaryErr.message);
      // Fallback to gemini-nano-banana-2.1 or gemini-3.1-flash-lite-image
      try {
        const fallbackResponse = await ai.models.generateContent({
          model: 'gemini-nano-banana-2.1',
          contents: {
            parts: [{ text: enrichedPrompt }],
          },
          config: {
            imageConfig: {
              aspectRatio: selectedAspectRatio as any,
              imageSize: selectedSize as any,
            },
          },
        });

        for (const part of fallbackResponse.candidates?.[0]?.content?.parts ?? []) {
          if (part.inlineData?.data) {
            const base64Data = part.inlineData.data;
            const mime = part.inlineData.mimeType || 'image/png';
            generatedImageUrl = `data:${mime};base64,${base64Data}`;
          } else if (part.text) {
            responseText += part.text;
          }
        }
      } catch (fallbackErr: any) {
        console.warn('Fallback nano-banana failed, trying gemini-3.1-flash-lite-image:', fallbackErr.message);
        const liteResponse = await ai.models.generateContent({
          model: 'gemini-3.1-flash-lite-image',
          contents: {
            parts: [{ text: enrichedPrompt }],
          },
        });
        for (const part of liteResponse.candidates?.[0]?.content?.parts ?? []) {
          if (part.inlineData?.data) {
            const base64Data = part.inlineData.data;
            const mime = part.inlineData.mimeType || 'image/png';
            generatedImageUrl = `data:${mime};base64,${base64Data}`;
          }
        }
      }
    }

    if (!generatedImageUrl) {
      return res.status(500).json({
        error: 'No image was returned from the Gemini generation model.',
        detail: responseText,
      });
    }

    return res.json({
      imageUrl: generatedImageUrl,
      text: responseText,
      size: selectedSize,
      aspectRatio: selectedAspectRatio,
    });
  } catch (error: any) {
    console.error('Image generation error:', error);
    return res.status(500).json({
      error: error.message || 'Image generation failed.',
    });
  }
});

// Vite middleware in dev or static files in production
async function startServer() {
  const isDev = process.env.NODE_ENV !== 'production';

  if (isDev) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[RecompStation Server] Running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
