import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { PlacesService } from './places.service';
import { ApiErrorResponse, PlaceResponse } from '../common/responses';

@ApiTags('Public')
@Controller('places')
export class PlacesController {
  constructor(private readonly places: PlacesService) {}

  @Get()
  @ApiOperation({
    summary: 'List places',
    description:
      'Discovery catalogue served to both Flutter apps. Both maps hydrate from this endpoint at startup and fall back to a bundled list if the server is unreachable. Filterable by category.',
  })
  @ApiQuery({
    name: 'kind',
    required: false,
    description: 'Filter to a single category.',
    enum: ['hotel', 'restaurant', 'mall', 'landmark', 'experience'],
  })
  @ApiOkResponse({ type: [PlaceResponse] })
  list(@Query('kind') kind?: string) {
    return this.places.findAll(kind);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get one place',
    description:
      "Returns a single place by slug — the same shape the list endpoint returns one row of. 404 if the slug isn't in the catalogue.",
  })
  @ApiOkResponse({ type: PlaceResponse })
  @ApiNotFoundResponse({ description: 'Slug not in catalogue.', type: ApiErrorResponse })
  byId(@Param('id') id: string) {
    return this.places.findOne(id);
  }
}
