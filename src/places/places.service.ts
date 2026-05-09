import { Injectable, NotFoundException } from '@nestjs/common';
import { Place } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface PlaceDto {
  id: string;
  name: string;
  tagline: string;
  kind: string;
  latitude: number;
  longitude: number;
  address: string;
  phone: string;
  hours: string;
  rating: number;
  priceLabel: string;
  images: string[];
  tags: string[];
  about: string;
  venueRef: string | null;
  experienceAdultUsd: number;
}

@Injectable()
export class PlacesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(kind?: string): Promise<PlaceDto[]> {
    const rows = await this.prisma.place.findMany({
      where: kind ? { kind } : undefined,
      orderBy: { name: 'asc' },
    });
    return rows.map((r) => this.toDto(r));
  }

  async findOne(id: string): Promise<PlaceDto> {
    const row = await this.prisma.place.findUnique({ where: { id } });
    if (!row) {
      throw new NotFoundException(`Place '${id}' not found`);
    }
    return this.toDto(row);
  }

  private toDto(p: Place): PlaceDto {
    return {
      id: p.id,
      name: p.name,
      tagline: p.tagline,
      kind: p.kind,
      latitude: p.latitude,
      longitude: p.longitude,
      address: p.address,
      phone: p.phone,
      hours: p.hours,
      rating: p.rating,
      priceLabel: p.priceLabel,
      images: p.images,
      tags: p.tags,
      about: p.about,
      venueRef: p.venueRef,
      experienceAdultUsd: p.experienceAdultUsd,
    };
  }
}
