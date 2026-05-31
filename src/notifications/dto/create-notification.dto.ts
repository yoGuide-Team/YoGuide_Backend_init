import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

 
export enum NotificationType {
  WALLET_DEPOSIT    = 'wallet_deposit',
  TRIP_PREFERENCE   = 'trip_preference',
  TOUR_INTEREST     = 'tour_interest',
  STAY_PREFERENCE   = 'stay_preference',
  LANGUAGE_SELECTED = 'language_selected',
  CITY_SELECTED     = 'city_selected',
  GENERAL           = 'general',
}
 
export class CreateNotificationDto {
  @IsUUID()
  userId!: string;

  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsNotEmpty()
  body!: string;

  @IsEnum(NotificationType)
  type!: NotificationType;

  @IsOptional()
  @IsString()
  metadata?: string;
}