import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ChatbotService {
  private readonly logger = new Logger(ChatbotService.name);
  private readonly ai: GoogleGenAI;
  private readonly model = 'gemini-2.0-flash';

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
          temperature: 0.2,
          topP: 0.9,
          maxOutputTokens: 700,
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
    return `You are yoGuide AI, the official assistant for the yoGuide tourism platform.

Rules:
- Always answer using the database context provided below.
- Never invent prices, locations, availability, or booking details.
- If the supplied context does not contain enough information, say you do not have those details and invite the user to ask again.
- Keep answers short, helpful, and tourism-focused.
- Prefer clear recommendations for destinations, tours, guides, stays, and activities on yoGuide.
- If the user asks about a booking or account detail, mention that you can help with general platform info and ask them to confirm the specific record if needed.`;
  }

  private buildPrompt(query: string, context: { summary: string; records: string[] }) {
    return `User question: ${query}

Database context:
${context.summary}

Relevant records:
${context.records.join('\n')}

Answer as yoGuide AI. Be concise, grounded in the provided records, and clearly state when information is missing.`;
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