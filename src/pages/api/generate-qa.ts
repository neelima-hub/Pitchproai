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
        predictedJudgeQuestions: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: {
                type: Type.STRING,
                description: 'A unique identifier for this question (e.g., Q1, Q2, etc.)',
              },
              question: {
                type: Type.STRING,
                description: 'A tough, direct question probing a vulnerability or gap in the business model or tech.',
              },
              reasonForAsking: {
                type: Type.STRING,
                description: 'The specific weakness, gap, or missing metric in the deck that prompted this question.',
              },
              idealAnswerFramework: {
                type: Type.STRING,
                description: 'Strategic advice on how the founder should structure their response to defend and defuse the point.',
              },
            },
            required: ['id', 'question', 'reasonForAsking', 'idealAnswerFramework'],
          },
          description: 'A list of highly targeted questions predicting what a VC or judge will ask.',
        },
      },
      required: ['predictedJudgeQuestions'],
    };

    // System instruction forcing the model to act as a highly critical VC / judge
    const systemInstruction =
      'You are a highly critical, elite venture capital investor and startup competition judge. ' +
      'Your job is to thoroughly analyze the provided startup pitch deck structure, identify critical gaps, ' +
      'vulnerabilities, and missing business metrics (such as unit economics, customer acquisition costs, ' +
      'defensibility, tech complexity, or market sizing), and ask tough, direct, and challenging questions. ' +
      'For each question, explain the vulnerability that triggered it and provide a strategic answering framework ' +
      'showing the founder how to address it successfully.';

    // Execute generation with gemini-2.5-flash
    const response = await client.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Analyze the following pitch deck and predict judge questions:\n\n${JSON.stringify(deckJSON, null, 2)}`,
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
    console.error('API Error in /api/generate-qa:', error);
    return new Response(
      JSON.stringify({
        error: 'Internal Server Error',
        details: error?.message || String(error),
      }),
      { status: 500, headers }
    );
  }
};
