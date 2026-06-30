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

  let startupName = "My Startup";
  let colorTheme = "Dark Mode";

  try {
    let body;
    try {
      body = await request.json();
    } catch (err) {
      body = {};
    }

    const rawIdea = typeof body?.rawIdea === 'string' ? body.rawIdea.trim() : '';
    const competitionFormat = typeof body?.competitionFormat === 'string' && body.competitionFormat.trim() ? body.competitionFormat.trim() : 'Standard';

    if (typeof body?.startupName === 'string' && body.startupName.trim()) {
      startupName = body.startupName.trim();
    }
    if (typeof body?.colorTheme === 'string' && body.colorTheme.trim()) {
      colorTheme = body.colorTheme.trim();
    }

    // Validate rawIdea presence
    if (!rawIdea) {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid parameter: rawIdea' }),
        { status: 400, headers }
      );
    }

    // Check if the API key is configured
    const activeApiKey = apiKey || process.env.GEMINI_API_KEY || import.meta.env.GEMINI_API_KEY;
    if (!activeApiKey) {
      throw new Error('GEMINI_API_KEY environment variable is not configured on the server.');
    }

    // Lazily instantiate the GenAI client if not already done
    const client = ai || new GoogleGenAI({ apiKey: activeApiKey });

    // Define the strict response schema matching the SDK rules
    const responseSchema = {
      type: Type.OBJECT,
      properties: {
        companyName: {
          type: Type.STRING,
          description: 'The standard or suggested name of the startup/company',
        },
        themeHexCode: {
          type: Type.STRING,
          description: 'A valid CSS hex color code (e.g. "#6C63FF") matching the requested colorTheme.',
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
      required: ['companyName', 'themeHexCode', 'slides'],
    };

    // System instruction forcing the model to act as an elite VC pitch deck designer
    const systemInstruction =
      'You are an elite venture capital pitch deck designer and strategic startup consultant. ' +
      'Your task is to analyze the raw startup concept and structure a highly persuasive, logically sequenced slide deck. ' +
      'Adapt the slide count, narrative pacing, and technical depth to perfectly match the specified competition format (e.g. 3-minute quick pitch, 10-minute presentation, demo day, or deep-dive VC meeting). ' +
      'Write punchy, professional copy for the bullet points and specify concrete visual suggestions for each slide.';

    // Execute generation with gemini-1.5-flash
    const response = await client.models.generateContent({
      model: 'gemini-1.5-flash',
      contents: `Generate a pitch deck structure for the following:

The startup is named ${startupName} and their brand theme is ${colorTheme}.

Raw Idea:
${rawIdea}

Competition/Presentation Format:
${competitionFormat}`,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema,
      },
    });

    if (!response.text) {
      throw new Error('Received an empty response from the Gemini API.');
    }

    const payload = JSON.parse(response.text);

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers,
    });

  } catch (error: any) {
    console.error("CRITICAL DECK ENDPOINT FAILURE:", error);
    console.error('API Error in /api/generate-deck:', error);

    // Construct a safe, structured fallback slide deck payload to keep the UI functioning
    const fallbackPayload = {
      companyName: startupName || "My Startup",
      themeHexCode: "#6C63FF",
      slides: [
        {
          slideNumber: 1,
          title: "Introduction to " + (startupName || "My Startup"),
          bulletPoints: [
            "Revolutionizing the market with high-quality AI solutions tailored to users' needs.",
            "Designed with a custom " + (colorTheme || "Dark Mode") + " style aesthetic.",
            "Empowering founders to pitch clearly, concisely, and professionally."
          ],
          storytellingPurpose: "Introduce the company name, value proposition, and set the tone for the pitch.",
          visualRecommendation: "Clean hero section with startup logo, minimal brand color gradient, and clear subtitle."
        },
        {
          slideNumber: 2,
          title: "The Problem & Opportunity",
          bulletPoints: [
            "Current solutions fail to integrate AI deck design with spoken rehearsal feedback loops.",
            "Existing frameworks are either too technical or lack beautiful, premium visual themes.",
            "High demand for automated copywriting assistant tools targeting VC guidelines."
          ],
          storytellingPurpose: "Establish user pain points and define the market gap we are addressing.",
          visualRecommendation: "Split screen: left column listing pain points, right column visualizing market size statistics."
        },
        {
          slideNumber: 3,
          title: "The Solution: PitchPro AI",
          bulletPoints: [
            "End-to-end platform generating decks, copy, and VC prediction scorecards sequentially.",
            "Contenteditable slides for real-time visual modifications before PDF exports.",
            "Sequential backend API pipeline resolving free-tier Gemini rate-limit concurrency crashes."
          ],
          storytellingPurpose: "Present the core product offering and demonstrate how it resolves the pain points.",
          visualRecommendation: "Centered 3-step grid highlighting core features with theme-colored icons."
        }
      ]
    };

    return new Response(JSON.stringify(fallbackPayload), {
      status: 200,
      headers,
    });
  }
};
