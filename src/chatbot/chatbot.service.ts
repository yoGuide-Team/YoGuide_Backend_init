import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ChatbotService {
  private readonly logger = new Logger(ChatbotService.name);
  private readonly ai: GoogleGenAI;
  private readonly model = 'gemini-2.5-flash';

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    if (!apiKey) {
      this.logger.warn('GEMINI_API_KEY is not set. The chatbot will return a fallback response.');
    }
    this.ai = new GoogleGenAI({ apiKey: apiKey ?? '' });
  }

  async handleUserQuery(query: string, userId?: string) {
    try {
      const context = await this.buildDatabaseContext(query, userId);
      const prompt = this.buildPrompt(query, context);

      const response = await this.ai.models.generateContent({
        model: this.model,
        contents: prompt,
        config: {
          temperature: 0.55,
          topP: 0.95,
          maxOutputTokens: 800,
          systemInstruction: this.buildSystemInstruction(),
        },
      });

      const reply = response.text?.trim() || 'How can I assist you with yoGuide today?';

      return {
        text: reply,
        grounded: true,
        contextSummary: context.summary,
      };
    } catch (error) {
      this.logger.error('Error processing chatbot query', error);
      return {
        text: 'I’m having trouble reaching the AI assistant right now. Please try again in a moment.',
        grounded: false,
      };
    }
  }

  private buildSystemInstruction() {
    return `You are yoGuide AI, the official digital travel assistant for yoGuide.

Persona:
- Speak like a friendly, knowledgeable Rwandan travel expert.
- Use plain, warm language and make recommendations with confidence.
- Offer useful suggestions for hotels, tours, guides, restaurants, transport, and local culture.
- If the user asks for a suggestion, provide one or two clear options.

Grounding rules:
- Always base your answer on the database context below.
- Do not invent any detail that is not supported by the context.
- If the context does not include enough information, say you do not have the exact answer and offer to help with a related recommendation.
- If the user asks about bookings, accounts, wallet balance, or orders, explain that you can only provide general help unless they share the specific information.

Style rules:
- Keep replies concise but friendly.
- Use first-person plural occasionally ("we") to sound collaborative.
- Mention Rwanda and local experiences when relevant.
- If answering about a location, include a brief reason why it is worth visiting.`;
  }

  private buildPrompt(query: string, context: { summary: string; records: string[] }) {
    return `User question: ${query}

Database context:
${context.summary}

Relevant records:
${context.records.join('\n')}

Answer as yoGuide AI.
- Be friendly, helpful, and travel-savvy.
- Use the context for every factual statement.
- If the context is too sparse, say so clearly and offer a nearby or related recommendation.
- Keep the tone human and confirm when you cannot answer a specific booking or account question.`;
  }

  private async buildDatabaseContext(query: string, userId?: string) {
    const normalized = query.toLowerCase();
    const records: string[] = [];

    const addRecord = (entry: string) => {
      if (entry) records.push(entry);
    };

    const places = await this.prisma.place.findMany({
      where: {
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { tagline: { contains: query, mode: 'insensitive' } },
          { address: { contains: query, mode: 'insensitive' } },
          { about: { contains: query, mode: 'insensitive' } },
          { tags: { hasSome: normalized.split(/\s+/).filter(Boolean) } },
        ],
      },
      take: 5,
      orderBy: { rating: 'desc' },
    });

    places.forEach((place) => {
      addRecord(`Place: ${place.name} | Kind: ${place.kind} | Address: ${place.address} | Price: ${place.priceLabel || 'Not listed'} | Rating: ${place.rating} | Tags: ${place.tags.join(', ') || 'none'} | About: ${place.about}`);
    });

    const guides = await this.prisma.guide.findMany({
      where: {
        OR: [
          { fullName: { contains: query, mode: 'insensitive' } },
          { bio: { contains: query, mode: 'insensitive' } },
          { specialties: { hasSome: normalized.split(/\s+/).filter(Boolean) } },
          { city: { contains: query, mode: 'insensitive' } },
        ],
      },
      take: 5,
      orderBy: { rating: 'desc' },
    });

    guides.forEach((guide) => {
      addRecord(`Guide: ${guide.fullName} | City: ${guide.city || 'Not listed'} | Rating: ${guide.rating} | Hourly rate: ${guide.hourlyRateCents ? `$${(guide.hourlyRateCents / 100).toFixed(2)}` : 'Not listed'} | Specialties: ${guide.specialties.join(', ') || 'none'} | Verified: ${guide.isVerified}`);
    });

    const tours = await this.prisma.tour.findMany({
      where: {
        OR: [
          { title: { contains: query, mode: 'insensitive' } },
          { description: { contains: query, mode: 'insensitive' } },
          { highlights: { hasSome: normalized.split(/\s+/).filter(Boolean) } },
        ],
      },
      take: 5,
      orderBy: { priceCents: 'asc' },
    });

    tours.forEach((tour) => {
      addRecord(`Tour: ${tour.title} | Price: $${(tour.priceCents / 100).toFixed(2)} | Duration: ${tour.durationMinutes} mins | Vehicle: ${tour.vehicleType} | Highlights: ${tour.highlights.join(', ') || 'none'}`);
    });

    const events = await this.prisma.event.findMany({
      where: {
        OR: [
          { title: { contains: query, mode: 'insensitive' } },
          { description: { contains: query, mode: 'insensitive' } },
          { tags: { hasSome: normalized.split(/\s+/).filter(Boolean) } },
        ],
      },
      take: 5,
      orderBy: { startsAt: 'asc' },
    });

    events.forEach((event) => {
      addRecord(`Event: ${event.title} | Venue: ${event.venue || 'Not listed'} | Price: ${event.priceLabel} | Starts: ${event.startsAt.toISOString()} | Tags: ${event.tags.join(', ') || 'none'}`);
    });

    const products = await this.prisma.product.findMany({
      where: {
        OR: [
          { title: { contains: query, mode: 'insensitive' } },
          { description: { contains: query, mode: 'insensitive' } },
          { category: { contains: query, mode: 'insensitive' } },
        ],
      },
      take: 5,
      orderBy: { priceCents: 'asc' },
    });

    products.forEach((product) => {
      addRecord(`Product: ${product.title} | Category: ${product.category} | Price: $${(product.priceCents / 100).toFixed(2)} | Description: ${product.description}`);
    });

    if (userId) {
      const bookings = await this.prisma.booking.findMany({
        where: { userId, status: { not: 'cancelled' } },
        take: 5,
        orderBy: { createdAt: 'desc' },
      });

      if (bookings.length > 0) {
        bookings.forEach((booking) => {
          addRecord(`Booking: ${booking.type} | Status: ${booking.status} | Total: $${(booking.totalCents / 100).toFixed(2)} | Scheduled: ${booking.scheduledAt?.toISOString() || 'Not scheduled'}`);
        });
      }
    }

    return {
      summary: records.length > 0
        ? `Found ${records.length} relevant records from the yoGuide platform.`
        : 'No matching records were found in the yoGuide database for this request.',
      records,
    };
  }
}