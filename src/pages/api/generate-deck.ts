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
    } catch {
      return new Response(
        JSON.stringify({ error: 'Invalid JSON request body' }),
        { status: 400, headers }
      );
    }

    const { rawIdea, competitionFormat } = body;

    // Validate request parameters
    if (!rawIdea || typeof rawIdea !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid parameter: rawIdea' }),
        { status: 400, headers }
      );
    }

    if (!competitionFormat || typeof competitionFormat !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid parameter: competitionFormat' }),
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
        companyName: {
          type: Type.STRING,
          description: 'The standard or suggested name of the startup/company',
        },
        slides: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              slideNumber: {
                type: Type.INTEGER,
                description: 'The 1-based index of this slide in the deck sequence',
              },
              title: {
                type: Type.STRING,
                description: 'The impact-driven slide title or headline',
              },
              bulletPoints: {
                type: Type.ARRAY,
                items: {
                  type: Type.STRING,
                },
                description: '3-4 concise, high-value bullet points detailing core metrics or arguments',
              },
              storytellingPurpose: {
                type: Type.STRING,
                description: 'The strategic narrative purpose explaining why this slide is here',
              },
              visualRecommendation: {
                type: Type.STRING,
                description: 'A layout or graphical recommendation for designing this slide',
              },
            },
            required: [
              'slideNumber',
              'title',
              'bulletPoints',
              'storytellingPurpose',
              'visualRecommendation',
            ],
          },
        },
      },
      required: ['companyName', 'slides'],
    };

    // System instruction forcing the model to act as an elite VC pitch deck designer
    const systemInstruction =
      'You are an elite venture capital pitch deck designer and strategic startup consultant. ' +
      'Your task is to analyze the raw startup concept and structure a highly persuasive, logically sequenced slide deck. ' +
      'Adapt the slide count, narrative pacing, and technical depth to perfectly match the specified competition format (e.g. 3-minute quick pitch, 10-minute presentation, demo day, or deep-dive VC meeting). ' +
      'Write punchy, professional copy for the bullet points and specify concrete visual suggestions for each slide.';

    // Execute generation with gemini-2.5-flash
    const response = await client.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Generate a pitch deck structure for the following:\n\nRaw Idea:\n${rawIdea}\n\nCompetition/Presentation Format:\n${competitionFormat}`,
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
    console.error('API Error in /api/generate-deck:', error);
    return new Response(
      JSON.stringify({
        error: 'Internal Server Error',
        details: error?.message || String(error),
      }),
      { status: 500, headers }
    );
  }
};
