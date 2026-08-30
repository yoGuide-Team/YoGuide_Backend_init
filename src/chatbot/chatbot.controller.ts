import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';

class AskChatbotDto {
  @IsString()
  @MinLength(1)
  message!: string;
}

interface ChatbotItem {
  title: string;
  price?: string;
  imageUrl?: string;
  route?: string;
}

const GREETING_RE = /\b(hi|hello|hey|jambo|muraho)\b/i;
const HOTEL_RE = /\b(hotel|stay|room|accommodation|lodge)\b/i;
const GUIDE_RE = /\b(guide|tour|trip|package|excursion)\b/i;
const WALLET_RE = /\b(wallet|balance|top ?up|money)\b/i;
const PRICE_RE = /\b(price|cost|cheap|budget|expensive)\b/i;

/// Rule-based keyword search over real catalog data — no LLM involved.
/// Public (no auth) to match the web client's pre-login fallback usage.
@ApiTags('Chatbot')
@Controller('chatbot')
export class ChatbotController {
  constructor(private readonly prisma: PrismaService) {}

  @Post('ask')
  @ApiOperation({
    summary: 'Ask the catalog chatbot (rule-based, no LLM)',
    description: 'Keyword-matches the message against real regions/packages/guides/hotels and returns matching results.',
  })
  async ask(@Body() dto: AskChatbotDto) {
    const message = dto.message.trim();
    if (!message) {
      return { reply: "I didn't catch that — try asking about a tour, guide, or hotel." };
    }

    if (GREETING_RE.test(message) && message.length < 30) {
      return { reply: 'Hi! Ask me about tours, guides, hotels, or your wallet — e.g. "hotels in Musanze" or "guides for gorilla trekking".' };
    }

    const region = await this.matchRegion(message);

    if (WALLET_RE.test(message)) {
      return {
        reply: 'You can check your balance and top up from the Wallet tab.',
        action: { label: 'Open wallet', route: '/wallet' },
      };
    }

    if (HOTEL_RE.test(message)) {
      const hotels = await this.prisma.hotel.findMany({
        where: { isVerified: true, city: region ? { contains: region, mode: 'insensitive' } : undefined },
        include: { rooms: true },
        take: 5,
        orderBy: { name: 'asc' },
      });
      if (hotels.length === 0) {
        return { reply: region ? `I couldn't find any hotels in ${region} yet.` : "I couldn't find any hotels matching that." };
      }
      const items: ChatbotItem[] = hotels.map((h) => ({
        title: h.name,
        price: h.rooms.length ? `From $${Math.min(...h.rooms.map((r) => r.nightlyRateCents)) / 100}/night` : undefined,
        route: `/hotels/${h.id}`,
      }));
      return { reply: `Here are ${hotels.length} hotel${hotels.length > 1 ? 's' : ''}${region ? ` in ${region}` : ''}:`, items };
    }

    if (GUIDE_RE.test(message) || PRICE_RE.test(message)) {
      const packages = await this.prisma.package.findMany({
        where: {
          isCustom: false,
          ...(region ? { tourType: { region: { name: { contains: region, mode: 'insensitive' } } } } : {}),
        },
        include: { media: true },
        orderBy: PRICE_RE.test(message) ? { price: 'asc' } : { createdAt: 'desc' },
        take: 5,
      });
      if (packages.length === 0) {
        return { reply: region ? `I couldn't find any tours in ${region} yet.` : "I couldn't find any tours matching that." };
      }
      const items: ChatbotItem[] = packages.map((p) => ({
        title: p.name,
        price: `$${p.price.toFixed(0)}`,
        imageUrl: p.media.find((m) => m.type === 'IMAGE')?.url,
        route: `/tours/${p.id}`,
      }));
      return { reply: `Here are ${packages.length} tour${packages.length > 1 ? 's' : ''}${region ? ` in ${region}` : ''}:`, items };
    }

    return {
      reply: "I can help with tours, guides, hotels, or your wallet. Try \"hotels in Kigali\" or \"cheapest tours\".",
    };
  }

  private async matchRegion(message: string): Promise<string | null> {
    const regions = await this.prisma.region.findMany({ select: { name: true } });
    const lower = message.toLowerCase();
    const hit = regions.find((r) => lower.includes(r.name.toLowerCase()));
    return hit?.name ?? null;
  }
}
