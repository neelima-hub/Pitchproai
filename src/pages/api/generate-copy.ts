import type { APIRoute } from 'astro';
import { GoogleGenAI, Type } from '@google/genai';

// Retrieve the Gemini API key from environment variables
const apiKey = process.env.GEMINI_API_KEY || import.meta.env.GEMINI_API_KEY;

// Initialize the GoogleGenAI client (will fail request if key is missing)
let ai: GoogleGenAI | null = null;
if (apiKey) {
  ai = new GoogleGenAI({ apiKey });
}

export const POST: APIRoute = async ({ request }) => {
  const headers = {
    'Content-Type': 'application/json',
  };

  try {
    // Parse the JSON request body
    let body;
    try {
      body = await request.json();
    } catch (err: any) {
      return new Response(
        JSON.stringify({
          error: 'Invalid JSON request body',
          details: err?.message || String(err),
        }),
        { status: 400, headers }
      );
    }

    const { deckJSON } = body;

    // Validate request parameters
    if (!deckJSON || typeof deckJSON !== 'object') {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid parameter: deckJSON' }),
        { status: 400, headers }
      );
    }

    // Check if the API key is configured
    const activeApiKey = apiKey || process.env.GEMINI_API_KEY || import.meta.env.GEMINI_API_KEY;
    if (!activeApiKey) {
      return new Response(
        JSON.stringify({ error: 'GEMINI_API_KEY environment variable is not configured on the server.' }),
        { status: 500, headers }
      );
    }

    // Lazily instantiate the GenAI client if not already done
    const client = ai || new GoogleGenAI({ apiKey: activeApiKey });

    // Define the strict response schema
    const responseSchema = {
      type: Type.OBJECT,
      properties: {
        elevatorPitch: {
          type: Type.STRING,
          description: 'A punchy, engaging 30-second elevator pitch hook.',
        },
        executiveSummary: {
          type: Type.STRING,
          description: 'A professional, investor-ready ~300-word executive summary.',
        },
        presentationScripts: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              slideNumber: {
                type: Type.INTEGER,
                description: 'The corresponding slide number from the input deck.',
              },
              spokenText: {
                type: Type.STRING,
                description: 'The exact script the founder should read aloud when this slide is displayed.',
              },
            },
            required: ['slideNumber', 'spokenText'],
          },
          description: 'A list of spoken scripts matching each slide in the deck.',
        },
      },
      required: ['elevatorPitch', 'executiveSummary', 'presentationScripts'],
    };

    // System instruction forcing the model to act as an elite startup copywriter
    const systemInstruction =
      'You are an elite startup copywriter, investor relations expert, and presentation speech coach. ' +
      'Your task is to write high-converting copy based on a startup pitch deck structure. ' +
      'Generate a compelling 30-second elevator pitch hook, a thorough ~300-word professional executive summary, ' +
      'and slide-by-slide spoken scripts for the founder to read aloud. Ensure the scripts match the logic, content, ' +
      'and slide numbering of the provided deck.';

    // Execute generation with gemini-2.5-flash
    const response = await client.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Generate copy assets for the following pitch deck:\n\n${JSON.stringify(deckJSON, null, 2)}`,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema,
      },
    });

    if (!response.text) {
      throw new Error('Received an empty response from the Gemini API.');
    }

    // Verify output structure by parsing the response
    const payload = JSON.parse(response.text);

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers,
    });

  } catch (error: any) {
    console.error('API Error in /api/generate-copy:', error);
    return new Response(
      JSON.stringify({
        error: 'Internal Server Error',
        details: error?.message || String(error),
      }),
      { status: 500, headers }
    );
  }
};
