import { Controller, Get, Query, HttpException, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';

@ApiTags('hotels')
@Controller('proxy')
export class HotelSearchProxyController {
  @Get('search')
  @ApiOperation({ summary: 'Proxy hotel search via SerpAPI (avoids CORS)' })
  @ApiQuery({ name: 'q', required: true, description: 'Search query' })
  @ApiQuery({ name: 'check_in', required: false })
  @ApiQuery({ name: 'check_out', required: false })
  @ApiQuery({ name: 'currency', required: false })
  async searchHotels(
    @Query('q') q: string,
    @Query('check_in') checkIn?: string,
    @Query('check_out') checkOut?: string,
    @Query('currency') currency?: string,
  ) {
    const apiKey = process.env.SERPAPI_KEY;
    if (!apiKey) {
      throw new HttpException('SerpAPI key not configured', HttpStatus.INTERNAL_SERVER_ERROR);
    }

    const now = new Date();
    const defaultCheckIn = new Date(now.getTime() + 86400000).toISOString().split('T')[0];
    const defaultCheckOut = new Date(now.getTime() + 172800000).toISOString().split('T')[0];

    const params = new URLSearchParams({
      engine: 'google_hotels',
      q: q || 'Hotels Rwanda',
      check_in_date: checkIn || defaultCheckIn,
      check_out_date: checkOut || defaultCheckOut,
      api_key: apiKey,
      currency: currency || 'USD',
    });

    const url = `https://serpapi.com/search.json?${params.toString()}`;

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new HttpException(`SerpAPI returned ${response.status}`, HttpStatus.BAD_GATEWAY);
      }
      const data = await response.json();
      return data;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException('Failed to fetch hotel data', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
