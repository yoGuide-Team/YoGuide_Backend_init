import { Injectable, Logger } from '@nestjs/common';
import { GoogleGenAI, Type } from '@google/genai';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ChatbotService {
  private readonly logger = new Logger(ChatbotService.name);
  private ai: GoogleGenAI;

  constructor(private prisma: PrismaService) {
    this.ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }

  async handleUserQuery(query: string, userId?: string) {
    try {
      // 1. Declare tool with typed schema using Type enum from @google/genai
      const searchYoGuideTool = {
        functionDeclarations: [
          {
            name: 'queryInternalPlatform',
            description: 'Query database for places, guides, tours, products, or events.',
            parameters: {
              type: Type.OBJECT,
              properties: {
                entityType: {
                  type: Type.STRING,
                  description: 'Entity target: "place" | "guide" | "tour" | "event" | "product"',
                },
                searchTerm: {
                  type: Type.STRING,
                  description: 'Keyword, place name, category, or city',
                },
              },
              required: ['entityType', 'searchTerm'],
            },
          },
        ],
      };

      // 2. Call Gemini model with tool + Google Search grounding fallback
      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: query,
        config: {
          systemInstruction: `You are the official yoGuide AI Assistant.

CORE MANDATE:
1. ALWAYS prioritize our internal database entities first (Places, Hotels, Guides, Tours, Events, Shops/Products, Cities, and User Bookings/Wallet).
2. Use the provided tools to query the database before answering queries related to travel, stays, activities, bookings, or user accounts.
3. If an item exists in our platform, generate structured output (titles, prices, images, and app navigation routes) matching our Flutter UI layout.
4. If a user asks a general question completely outside our app's scope (e.g., global news, international flight information, general facts), rely on Google Search Grounding to provide accurate information.

SUPPORTED PLATFORM DOMAINS:
- Places & Accommodations (Hotel, Resort, Restaurant, Park)
- Local Guides (Tour Guides, Specialties, Hourly Rates)
- Tours & Itineraries (Motorbike tours, EV tours, City Walks)
- Events & Whats On (Concerts, Festivals)
- Marketplace & Vendor Products (Souvenirs, Artisans, Local Goods)
- User Profile Details (Active Bookings, Wallet Balance, eSIM Orders)`,
          tools: [
            searchYoGuideTool,
            { googleSearch: {} },
          ],
        },
      });

      // 3. Handle Function Execution with Schema Fields Matched
      const functionCalls = response.functionCalls;
      if (functionCalls && functionCalls.length > 0) {
        const call = functionCalls[0];

        if (call.name === 'queryInternalPlatform') {
          const { entityType, searchTerm } = call.args as { entityType: string; searchTerm: string };

          // --- PLACES & ACCOMMODATIONS ---
          if (entityType === 'place') {
            const places = await this.prisma.place.findMany({
              where: {
                OR: [
                  { name: { contains: searchTerm, mode: 'insensitive' } },
                  { tagline: { contains: searchTerm, mode: 'insensitive' } },
                  { address: { contains: searchTerm, mode: 'insensitive' } },
                  { about: { contains: searchTerm, mode: 'insensitive' } },
                ],
              },
              take: 5,
            });

            if (places.length > 0) {
              return {
                text: `Here are matching places on yoGuide:`,
                items: places.map((p) => ({
                  title: p.name,
                  price: p.priceLabel || 'Contact for price',
                  imageUrl: p.images[0] || 'https://images.unsplash.com/photo-1579783902614-a3fb3927b6a5',
                  route: `/hotel-details/${p.id}`,
                })),
                action: { label: 'Explore Places', type: 'ROUTE_NAV', route: '/explore' },
              };
            }
          }

          // --- GUIDES ---
          if (entityType === 'guide') {
            const guides = await this.prisma.guide.findMany({
              where: {
                OR: [
                  { fullName: { contains: searchTerm, mode: 'insensitive' } },
                  { city: { contains: searchTerm, mode: 'insensitive' } },
                  { bio: { contains: searchTerm, mode: 'insensitive' } },
                ],
              },
              take: 5,
            });

            if (guides.length > 0) {
              return {
                text: `Here are guides available on yoGuide:`,
                items: guides.map((g) => ({
                  title: `${g.fullName} ${g.emoji || '🚩'}`,
                  price: `$${(g.hourlyRateCents / 100).toFixed(2)} / hr`,
                  imageUrl: g.avatarUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde',
                  route: `/guide-profile/${g.id}`,
                })),
                action: { label: 'View Guides', type: 'ROUTE_NAV', route: '/guides' },
              };
            }
          }

          // --- TOURS ---
          if (entityType === 'tour') {
            const tours = await this.prisma.tour.findMany({
              where: {
                OR: [
                  { title: { contains: searchTerm, mode: 'insensitive' } },
                  { description: { contains: searchTerm, mode: 'insensitive' } },
                ],
              },
              take: 5,
            });

            if (tours.length > 0) {
              return {
                text: `Here are curated tours matching your query:`,
                items: tours.map((t) => ({
                  title: t.title,
                  price: `$${(t.priceCents / 100).toFixed(2)}`,
                  imageUrl: t.coverImage || 'https://images.unsplash.com/photo-1544620347-c4fd4a3d5957',
                  route: `/tour-details/${t.id}`,
                })),
                action: { label: 'Browse Tours', type: 'ROUTE_NAV', route: '/tours' },
              };
            }
          }

          // --- PRODUCTS ---
          if (entityType === 'product') {
            const products = await this.prisma.product.findMany({
              where: {
                OR: [
                  { title: { contains: searchTerm, mode: 'insensitive' } },
                  { description: { contains: searchTerm, mode: 'insensitive' } },
                  { category: { contains: searchTerm, mode: 'insensitive' } },
                ],
              },
              take: 5,
            });

            if (products.length > 0) {
              return {
                text: `Here are products from our shop:`,
                items: products.map((prod) => ({
                  title: prod.title,
                  price: `$${(prod.priceCents / 100).toFixed(2)}`,
                  imageUrl: prod.images[0] || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30',
                  route: `/product/${prod.id}`,
                })),
                action: { label: 'Open Shop', type: 'ROUTE_NAV', route: '/shop' },
              };
            }
          }
        }
      }

      // Default fallback response
      return {
        text: response.text || 'How can I assist you on yoGuide today?',
      };
    } catch (error) {
      this.logger.error('Error processing query', error);
      return {
        text: 'I ran into an issue finding that information right now. Please try again.',
      };
    }
  }
}