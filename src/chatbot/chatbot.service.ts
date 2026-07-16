import { GoogleGenAI, FunctionDeclaration } from '@google/genai';
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ChatbotService {
  private ai: GoogleGenAI;

  constructor(private prisma: PrismaService) {
    // Force the SDK to use the API key directly instead of Google Application Default Credentials (ADC)
    this.ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  
  // ... rest of the service logic remains exactly as we wrote it

  // Matches 'processQuery' expected by your chatbot.controller.ts
  async processQuery(userPrompt: string, userId?: string) {
    try {
      const history: any[] = []; 

      // 1. Define the DB search tool for Gemini
      const searchDatabaseTool: FunctionDeclaration = {
        name: 'searchRwandaAccommodations',
        description: 'Queries the PostgreSQL database to find real hotels, lodges, markets, or places to stay/visit in Rwanda.',
        parametersJsonSchema: {
          type: 'object',
          properties: {
            searchQuery: {
              type: 'string',
              description: 'The query keyword (e.g., "Musanze", "hotel", "market", "volcanoes").',
            },
          },
          required: ['searchQuery'],
        },
      };

      const systemInstruction = 
        "You are the yoGuide Assistant, a hospitality and travel companion for tourists in Rwanda. " +
        "Your ONLY job is to help users find accommodations, local shops, tour guides, and plan trips. " +
        "CRITICAL RULE: If the user asks you to write code (like HTML, CSS, Javascript, Python), solve math, " +
        "or perform tasks completely unrelated to traveling in Rwanda, DO NOT write the code or do the task. " +
        "Instead, politely decline in a friendly, conversational manner and tell them that as the yoGuide Assistant, " +
        "you are dedicated only to helping them explore Rwanda, book accommodations, or find local experiences. " +
        "Use the 'searchRwandaAccommodations' tool whenever they ask for suggestions of where to stay, what to visit, or things to do.";

      // 2. Query Gemini
      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          ...history, 
          { role: 'user', parts: [{ text: userPrompt }] }
        ],
        config: {
          systemInstruction,
          tools: [{ functionDeclarations: [searchDatabaseTool] }],
        }
      });

      const candidate = response.candidates?.[0];
      const functionCalls = candidate?.content?.parts 
        ? candidate.content.parts.filter(part => part.functionCall) 
        : [];

      // 3. Case A: Search Tool Triggered
      if (functionCalls.length > 0) {
        const call = functionCalls[0].functionCall;
        
        if (call && call.name === 'searchRwandaAccommodations') {
          const args = call.args as { searchQuery: string };
          
          // Use real Prisma schema fields ('name', 'tagline', 'address', 'about') to query database
          const dbResults = await this.prisma.place.findMany({
            where: {
              OR: [
                { name: { contains: args.searchQuery, mode: 'insensitive' } },
                { tagline: { contains: args.searchQuery, mode: 'insensitive' } },
                { address: { contains: args.searchQuery, mode: 'insensitive' } },
                { about: { contains: args.searchQuery, mode: 'insensitive' } },
              ],
            },
            take: 3, 
          });

          if (dbResults.length === 0) {
            return {
              text: `I searched our system for "${args.searchQuery}" but couldn't find any matching accommodations or attractions. Would you like to look up something else?`,
              items: [],
            };
          }

          return {
            text: `Here is what I found in our system matching "${args.searchQuery}":`,
            // Safely maps the Prisma columns to match the JSON layout contract your Flutter UI needs
            items: dbResults.map(place => {
              // Extract the first image from string[] array if available
              const firstImage = place.images && place.images.length > 0 
                ? place.images[0] 
                : 'https://images.unsplash.com/photo-1579783902614-a3fb3927b6a5';

              // Decide which price details look best for your UI cards
              const displayPrice = place.experienceAdultUsd > 0 
                ? `${place.experienceAdultUsd} USD` 
                : (place.priceLabel || 'Free Entry');

              return {
                title: place.name,
                price: displayPrice,
                imageUrl: firstImage,
                route: `/places/${place.id}`,
              };
            }),
          };
        }
      }

      // 4. Case B: Standard conversational output from Gemini
      return {
        text: candidate?.content?.parts?.[0]?.text || "I'm here to help you explore Rwanda! What are you planning to do today?",
        items: [],
      };

    } catch (error) {
      console.error("Error with Gemini Assistant:", error);
      throw new InternalServerErrorException("Assistant failed to generate a response");
    }
  }
}