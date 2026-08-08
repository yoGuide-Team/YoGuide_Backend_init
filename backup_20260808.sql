--
-- PostgreSQL database dump
--

\restrict msg5vlnNUidskgSFb7WN5mhQq4lc27EoM8XfdO69TU7dBBVEI70lhMsvpkfXjc5

-- Dumped from database version 16.14
-- Dumped by pg_dump version 16.14

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: AnalyticsEvent; Type: TABLE; Schema: public; Owner: yoguide
--

CREATE TABLE public."AnalyticsEvent" (
    id text NOT NULL,
    "userId" text,
    "sessionId" text,
    name text NOT NULL,
    properties jsonb DEFAULT '{}'::jsonb NOT NULL,
    "occurredAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "receivedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."AnalyticsEvent" OWNER TO yoguide;

--
-- Name: AuditLog; Type: TABLE; Schema: public; Owner: yoguide
--

CREATE TABLE public."AuditLog" (
    id text NOT NULL,
    "actorId" text,
    "actorEmail" text,
    action text NOT NULL,
    entity text NOT NULL,
    "entityId" text,
    metadata jsonb,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."AuditLog" OWNER TO yoguide;

--
-- Name: Booking; Type: TABLE; Schema: public; Owner: yoguide
--

CREATE TABLE public."Booking" (
    id text NOT NULL,
    "userId" text NOT NULL,
    type text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    "totalCents" integer NOT NULL,
    currency text DEFAULT 'USD'::text NOT NULL,
    "placeId" text,
    details jsonb DEFAULT '{}'::jsonb NOT NULL,
    "scheduledAt" timestamp(3) without time zone,
    notes text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "guideId" text,
    quantity integer DEFAULT 1 NOT NULL,
    "tourId" text,
    "vendorId" text
);


ALTER TABLE public."Booking" OWNER TO yoguide;

--
-- Name: BookingTransaction; Type: TABLE; Schema: public; Owner: yoguide
--

CREATE TABLE public."BookingTransaction" (
    id text NOT NULL,
    "bookingId" text NOT NULL,
    kind text NOT NULL,
    method text NOT NULL,
    "amountCents" integer NOT NULL,
    currency text DEFAULT 'USD'::text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    "externalRef" text,
    notes text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."BookingTransaction" OWNER TO yoguide;

--
-- Name: City; Type: TABLE; Schema: public; Owner: yoguide
--

CREATE TABLE public."City" (
    id text NOT NULL,
    slug text NOT NULL,
    name text NOT NULL,
    country text NOT NULL,
    region text,
    description text,
    latitude double precision NOT NULL,
    longitude double precision NOT NULL,
    "imageUrl" text,
    "isFeatured" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."City" OWNER TO yoguide;

--
-- Name: EsimOrder; Type: TABLE; Schema: public; Owner: yoguide
--

CREATE TABLE public."EsimOrder" (
    id text NOT NULL,
    "userId" text NOT NULL,
    "bundleId" text NOT NULL,
    "deliveryEmail" text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."EsimOrder" OWNER TO yoguide;

--
-- Name: Event; Type: TABLE; Schema: public; Owner: yoguide
--

CREATE TABLE public."Event" (
    id text NOT NULL,
    "cityId" text NOT NULL,
    title text NOT NULL,
    description text NOT NULL,
    "startsAt" timestamp(3) without time zone NOT NULL,
    "endsAt" timestamp(3) without time zone,
    venue text,
    "priceLabel" text DEFAULT 'Free'::text NOT NULL,
    "coverImage" text,
    tags text[] DEFAULT ARRAY[]::text[],
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."Event" OWNER TO yoguide;

--
-- Name: EventInterest; Type: TABLE; Schema: public; Owner: yoguide
--

CREATE TABLE public."EventInterest" (
    id text NOT NULL,
    "userId" text NOT NULL,
    "eventIds" text[],
    "reminderEnabled" boolean DEFAULT false NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."EventInterest" OWNER TO yoguide;

--
-- Name: Favorite; Type: TABLE; Schema: public; Owner: yoguide
--

CREATE TABLE public."Favorite" (
    id text NOT NULL,
    "userId" text NOT NULL,
    "placeId" text,
    "guideId" text,
    "tourId" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."Favorite" OWNER TO yoguide;

--
-- Name: Guide; Type: TABLE; Schema: public; Owner: yoguide
--

CREATE TABLE public."Guide" (
    id text NOT NULL,
    "userId" text,
    "fullName" text NOT NULL,
    emoji text,
    bio text,
    "avatarUrl" text,
    rating double precision DEFAULT 0 NOT NULL,
    "reviewCount" integer DEFAULT 0 NOT NULL,
    "toursCompleted" integer DEFAULT 0 NOT NULL,
    "responseRatePct" integer DEFAULT 95 NOT NULL,
    "hourlyRateCents" integer DEFAULT 0 NOT NULL,
    currency text DEFAULT 'USD'::text NOT NULL,
    specialties text[] DEFAULT ARRAY[]::text[],
    languages text[] DEFAULT ARRAY[]::text[],
    "yearsExperience" integer DEFAULT 0 NOT NULL,
    "isVerified" boolean DEFAULT false NOT NULL,
    "isAvailable" boolean DEFAULT true NOT NULL,
    city text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "companyId" text,
    "rejectionReason" text,
    status text DEFAULT 'pending'::text NOT NULL,
    "restaurantName" text,
    "gastronomyCategory" text,
    "experienceName" text,
    "gastronomyArea" text,
    "chefTags" text[] DEFAULT '{}'::text[] NOT NULL,
    "menuCourses" jsonb,
    story jsonb
);


ALTER TABLE public."Guide" OWNER TO yoguide;

--
-- Name: GuideCompany; Type: TABLE; Schema: public; Owner: yoguide
--

CREATE TABLE public."GuideCompany" (
    id text NOT NULL,
    "ownerId" text,
    slug text NOT NULL,
    name text NOT NULL,
    description text,
    contact text,
    email text,
    phone text,
    website text,
    city text,
    status text DEFAULT 'pending'::text NOT NULL,
    "rejectionReason" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."GuideCompany" OWNER TO yoguide;

--
-- Name: GuideDocument; Type: TABLE; Schema: public; Owner: yoguide
--

CREATE TABLE public."GuideDocument" (
    id text NOT NULL,
    "guideId" text NOT NULL,
    kind text NOT NULL,
    url text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    "reviewedBy" text,
    notes text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."GuideDocument" OWNER TO yoguide;

--
-- Name: Itinerary; Type: TABLE; Schema: public; Owner: yoguide
--

CREATE TABLE public."Itinerary" (
    id text NOT NULL,
    "userId" text NOT NULL,
    title text NOT NULL,
    description text,
    "startDate" timestamp(3) without time zone,
    "endDate" timestamp(3) without time zone,
    "isPublic" boolean DEFAULT false NOT NULL,
    "coverImage" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."Itinerary" OWNER TO yoguide;

--
-- Name: ItineraryItem; Type: TABLE; Schema: public; Owner: yoguide
--

CREATE TABLE public."ItineraryItem" (
    id text NOT NULL,
    "itineraryId" text NOT NULL,
    ordinal integer NOT NULL,
    "placeId" text,
    notes text,
    "scheduledAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."ItineraryItem" OWNER TO yoguide;

--
-- Name: Message; Type: TABLE; Schema: public; Owner: yoguide
--

CREATE TABLE public."Message" (
    id text NOT NULL,
    "threadId" text NOT NULL,
    "senderId" text NOT NULL,
    body text NOT NULL,
    attachments text[] DEFAULT ARRAY[]::text[],
    "readAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."Message" OWNER TO yoguide;

--
-- Name: MessageThread; Type: TABLE; Schema: public; Owner: yoguide
--

CREATE TABLE public."MessageThread" (
    id text NOT NULL,
    "participantA" text NOT NULL,
    "participantB" text NOT NULL,
    subject text,
    "lastMessageAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."MessageThread" OWNER TO yoguide;

--
-- Name: Notification; Type: TABLE; Schema: public; Owner: yoguide
--

CREATE TABLE public."Notification" (
    id text NOT NULL,
    "userId" text NOT NULL,
    title text NOT NULL,
    body text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "isRead" boolean DEFAULT false NOT NULL,
    metadata text,
    type text DEFAULT 'general'::text NOT NULL
);


ALTER TABLE public."Notification" OWNER TO yoguide;

--
-- Name: Order; Type: TABLE; Schema: public; Owner: yoguide
--

CREATE TABLE public."Order" (
    id text NOT NULL,
    "userId" text NOT NULL,
    status text DEFAULT 'placed'::text NOT NULL,
    "totalCents" integer NOT NULL,
    currency text DEFAULT 'USD'::text NOT NULL,
    "shippingType" text,
    "shippingNote" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."Order" OWNER TO yoguide;

--
-- Name: OrderItem; Type: TABLE; Schema: public; Owner: yoguide
--

CREATE TABLE public."OrderItem" (
    id text NOT NULL,
    "orderId" text NOT NULL,
    "productId" text NOT NULL,
    quantity integer NOT NULL,
    "priceCents" integer NOT NULL,
    currency text DEFAULT 'USD'::text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."OrderItem" OWNER TO yoguide;

--
-- Name: Phrase; Type: TABLE; Schema: public; Owner: yoguide
--

CREATE TABLE public."Phrase" (
    id text NOT NULL,
    category text NOT NULL,
    english text NOT NULL,
    kinyarwanda text NOT NULL,
    french text NOT NULL,
    notes text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."Phrase" OWNER TO yoguide;

--
-- Name: Place; Type: TABLE; Schema: public; Owner: yoguide
--

CREATE TABLE public."Place" (
    id text NOT NULL,
    name text NOT NULL,
    tagline text NOT NULL,
    kind text NOT NULL,
    latitude double precision NOT NULL,
    longitude double precision NOT NULL,
    address text NOT NULL,
    phone text NOT NULL,
    hours text NOT NULL,
    rating double precision NOT NULL,
    "priceLabel" text NOT NULL,
    images text[] DEFAULT ARRAY[]::text[],
    tags text[] DEFAULT ARRAY[]::text[],
    about text NOT NULL,
    "venueRef" text,
    "experienceAdultUsd" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."Place" OWNER TO yoguide;

--
-- Name: Product; Type: TABLE; Schema: public; Owner: yoguide
--

CREATE TABLE public."Product" (
    id text NOT NULL,
    "vendorId" text,
    slug text NOT NULL,
    title text NOT NULL,
    description text NOT NULL,
    category text NOT NULL,
    "priceCents" integer NOT NULL,
    currency text DEFAULT 'USD'::text NOT NULL,
    images text[] DEFAULT ARRAY[]::text[],
    badge text,
    "inStock" boolean DEFAULT true NOT NULL,
    inventory integer,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."Product" OWNER TO yoguide;

--
-- Name: Review; Type: TABLE; Schema: public; Owner: yoguide
--

CREATE TABLE public."Review" (
    id text NOT NULL,
    "authorId" text NOT NULL,
    rating integer NOT NULL,
    title text,
    body text NOT NULL,
    "placeId" text,
    "guideId" text,
    "tourId" text,
    status text DEFAULT 'pending'::text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "vendorId" text
);


ALTER TABLE public."Review" OWNER TO yoguide;

--
-- Name: Role; Type: TABLE; Schema: public; Owner: yoguide
--

CREATE TABLE public."Role" (
    key text NOT NULL,
    label text NOT NULL,
    permissions text[] DEFAULT ARRAY[]::text[],
    "isSystem" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."Role" OWNER TO yoguide;

--
-- Name: ShuttleBooking; Type: TABLE; Schema: public; Owner: yoguide
--

CREATE TABLE public."ShuttleBooking" (
    id text NOT NULL,
    "userId" text NOT NULL,
    "dropOffPoint" text NOT NULL,
    "slotTime" timestamp(3) without time zone NOT NULL,
    status text DEFAULT 'confirmed'::text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."ShuttleBooking" OWNER TO yoguide;

--
-- Name: Tour; Type: TABLE; Schema: public; Owner: yoguide
--

CREATE TABLE public."Tour" (
    id text NOT NULL,
    "cityId" text,
    title text NOT NULL,
    description text NOT NULL,
    "vehicleType" text NOT NULL,
    "durationMinutes" integer NOT NULL,
    "priceCents" integer NOT NULL,
    currency text DEFAULT 'USD'::text NOT NULL,
    "isCustom" boolean DEFAULT false NOT NULL,
    "coverImage" text,
    highlights text[] DEFAULT ARRAY[]::text[],
    "isPublished" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "companyId" text,
    "guideId" text,
    category text
);


ALTER TABLE public."Tour" OWNER TO yoguide;

--
-- Name: TourStop; Type: TABLE; Schema: public; Owner: yoguide
--

CREATE TABLE public."TourStop" (
    id text NOT NULL,
    "tourId" text NOT NULL,
    ordinal integer NOT NULL,
    title text NOT NULL,
    description text,
    "durationMinutes" integer DEFAULT 30 NOT NULL,
    latitude double precision,
    longitude double precision,
    "placeId" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."TourStop" OWNER TO yoguide;

--
-- Name: TripProfile; Type: TABLE; Schema: public; Owner: yoguide
--

CREATE TABLE public."TripProfile" (
    id text NOT NULL,
    "userId" text NOT NULL,
    "destinationCity" text NOT NULL,
    "arrivalDate" timestamp(3) without time zone,
    "departureDate" timestamp(3) without time zone,
    "tripPurpose" text,
    nationality text,
    "freeSlots" text,
    "experienceTypes" text[],
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."TripProfile" OWNER TO yoguide;

--
-- Name: User; Type: TABLE; Schema: public; Owner: yoguide
--

CREATE TABLE public."User" (
    id text NOT NULL,
    email text NOT NULL,
    "passwordHash" text DEFAULT ''::text NOT NULL,
    "fullName" text,
    "roleKey" text DEFAULT 'user'::text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "cardNumber" text,
    phone text,
    "googleId" text,
    "avatarUrl" text,
    "passwordResetExpiresAt" timestamp(3) without time zone,
    "passwordResetToken" text,
    "emailVerified" boolean DEFAULT false NOT NULL,
    "otpCodeHash" text,
    "otpExpiresAt" timestamp(3) without time zone,
    "identityDocUrls" text[] DEFAULT ARRAY[]::text[],
    "identityRejectionReason" text,
    "identityStatus" text DEFAULT 'none'::text NOT NULL
);


ALTER TABLE public."User" OWNER TO yoguide;

--
-- Name: Vehicle; Type: TABLE; Schema: public; Owner: yoguide
--

CREATE TABLE public."Vehicle" (
    id text NOT NULL,
    "companyId" text NOT NULL,
    type text NOT NULL,
    label text NOT NULL,
    "plateNumber" text,
    seats integer,
    "photoUrl" text,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."Vehicle" OWNER TO yoguide;

--
-- Name: Vendor; Type: TABLE; Schema: public; Owner: yoguide
--

CREATE TABLE public."Vendor" (
    id text NOT NULL,
    slug text NOT NULL,
    name text NOT NULL,
    category text NOT NULL,
    description text,
    contact text,
    email text,
    phone text,
    website text,
    city text,
    "isVerified" boolean DEFAULT false NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    rating double precision DEFAULT 0 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    address text,
    amenities text[] DEFAULT ARRAY[]::text[],
    "checkInTime" text,
    "checkOutTime" text,
    "ownerId" text,
    "rejectionReason" text,
    status text DEFAULT 'pending'::text NOT NULL
);


ALTER TABLE public."Vendor" OWNER TO yoguide;

--
-- Name: Wallet; Type: TABLE; Schema: public; Owner: yoguide
--

CREATE TABLE public."Wallet" (
    id text NOT NULL,
    "userId" text NOT NULL,
    "balanceCents" integer DEFAULT 0 NOT NULL,
    currency text DEFAULT 'USD'::text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."Wallet" OWNER TO yoguide;

--
-- Name: WalletTransaction; Type: TABLE; Schema: public; Owner: yoguide
--

CREATE TABLE public."WalletTransaction" (
    id text NOT NULL,
    "walletId" text,
    kind text,
    "amountCents" integer,
    currency text DEFAULT 'USD'::text NOT NULL,
    "bookingId" text,
    "externalRef" text,
    notes text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "cardToken" text,
    method text,
    "rwfAmount" double precision,
    "sourceAmount" double precision,
    "sourceCurrency" text,
    status text DEFAULT 'pending'::text NOT NULL,
    "userId" text
);


ALTER TABLE public."WalletTransaction" OWNER TO yoguide;

--
-- Name: _prisma_migrations; Type: TABLE; Schema: public; Owner: yoguide
--

CREATE TABLE public._prisma_migrations (
    id character varying(36) NOT NULL,
    checksum character varying(64) NOT NULL,
    finished_at timestamp with time zone,
    migration_name character varying(255) NOT NULL,
    logs text,
    rolled_back_at timestamp with time zone,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    applied_steps_count integer DEFAULT 0 NOT NULL
);


ALTER TABLE public._prisma_migrations OWNER TO yoguide;

--
-- Data for Name: AnalyticsEvent; Type: TABLE DATA; Schema: public; Owner: yoguide
--

COPY public."AnalyticsEvent" (id, "userId", "sessionId", name, properties, "occurredAt", "receivedAt") FROM stdin;
\.


--
-- Data for Name: AuditLog; Type: TABLE DATA; Schema: public; Owner: yoguide
--

COPY public."AuditLog" (id, "actorId", "actorEmail", action, entity, "entityId", metadata, "createdAt") FROM stdin;
\.


--
-- Data for Name: Booking; Type: TABLE DATA; Schema: public; Owner: yoguide
--

COPY public."Booking" (id, "userId", type, status, "totalCents", currency, "placeId", details, "scheduledAt", notes, "createdAt", "updatedAt", "guideId", quantity, "tourId", "vendorId") FROM stdin;
\.


--
-- Data for Name: BookingTransaction; Type: TABLE DATA; Schema: public; Owner: yoguide
--

COPY public."BookingTransaction" (id, "bookingId", kind, method, "amountCents", currency, status, "externalRef", notes, "createdAt") FROM stdin;
\.


--
-- Data for Name: City; Type: TABLE DATA; Schema: public; Owner: yoguide
--

COPY public."City" (id, slug, name, country, region, description, latitude, longitude, "imageUrl", "isFeatured", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: EsimOrder; Type: TABLE DATA; Schema: public; Owner: yoguide
--

COPY public."EsimOrder" (id, "userId", "bundleId", "deliveryEmail", status, "createdAt") FROM stdin;
\.


--
-- Data for Name: Event; Type: TABLE DATA; Schema: public; Owner: yoguide
--

COPY public."Event" (id, "cityId", title, description, "startsAt", "endsAt", venue, "priceLabel", "coverImage", tags, "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: EventInterest; Type: TABLE DATA; Schema: public; Owner: yoguide
--

COPY public."EventInterest" (id, "userId", "eventIds", "reminderEnabled", "updatedAt") FROM stdin;
\.


--
-- Data for Name: Favorite; Type: TABLE DATA; Schema: public; Owner: yoguide
--

COPY public."Favorite" (id, "userId", "placeId", "guideId", "tourId", "createdAt") FROM stdin;
\.


--
-- Data for Name: Guide; Type: TABLE DATA; Schema: public; Owner: yoguide
--

COPY public."Guide" (id, "userId", "fullName", emoji, bio, "avatarUrl", rating, "reviewCount", "toursCompleted", "responseRatePct", "hourlyRateCents", currency, specialties, languages, "yearsExperience", "isVerified", "isAvailable", city, "createdAt", "updatedAt", "companyId", "rejectionReason", status, "restaurantName", "gastronomyCategory", "experienceName", "gastronomyArea", "chefTags", "menuCourses", story) FROM stdin;
\.


--
-- Data for Name: GuideCompany; Type: TABLE DATA; Schema: public; Owner: yoguide
--

COPY public."GuideCompany" (id, "ownerId", slug, name, description, contact, email, phone, website, city, status, "rejectionReason", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: GuideDocument; Type: TABLE DATA; Schema: public; Owner: yoguide
--

COPY public."GuideDocument" (id, "guideId", kind, url, status, "reviewedBy", notes, "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: Itinerary; Type: TABLE DATA; Schema: public; Owner: yoguide
--

COPY public."Itinerary" (id, "userId", title, description, "startDate", "endDate", "isPublic", "coverImage", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: ItineraryItem; Type: TABLE DATA; Schema: public; Owner: yoguide
--

COPY public."ItineraryItem" (id, "itineraryId", ordinal, "placeId", notes, "scheduledAt", "createdAt") FROM stdin;
\.


--
-- Data for Name: Message; Type: TABLE DATA; Schema: public; Owner: yoguide
--

COPY public."Message" (id, "threadId", "senderId", body, attachments, "readAt", "createdAt") FROM stdin;
\.


--
-- Data for Name: MessageThread; Type: TABLE DATA; Schema: public; Owner: yoguide
--

COPY public."MessageThread" (id, "participantA", "participantB", subject, "lastMessageAt", "createdAt") FROM stdin;
\.


--
-- Data for Name: Notification; Type: TABLE DATA; Schema: public; Owner: yoguide
--

COPY public."Notification" (id, "userId", title, body, "createdAt", "isRead", metadata, type) FROM stdin;
\.


--
-- Data for Name: Order; Type: TABLE DATA; Schema: public; Owner: yoguide
--

COPY public."Order" (id, "userId", status, "totalCents", currency, "shippingType", "shippingNote", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: OrderItem; Type: TABLE DATA; Schema: public; Owner: yoguide
--

COPY public."OrderItem" (id, "orderId", "productId", quantity, "priceCents", currency, "createdAt") FROM stdin;
\.


--
-- Data for Name: Phrase; Type: TABLE DATA; Schema: public; Owner: yoguide
--

COPY public."Phrase" (id, category, english, kinyarwanda, french, notes, "createdAt") FROM stdin;
\.


--
-- Data for Name: Place; Type: TABLE DATA; Schema: public; Owner: yoguide
--

COPY public."Place" (id, name, tagline, kind, latitude, longitude, address, phone, hours, rating, "priceLabel", images, tags, about, "venueRef", "experienceAdultUsd", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: Product; Type: TABLE DATA; Schema: public; Owner: yoguide
--

COPY public."Product" (id, "vendorId", slug, title, description, category, "priceCents", currency, images, badge, "inStock", inventory, "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: Review; Type: TABLE DATA; Schema: public; Owner: yoguide
--

COPY public."Review" (id, "authorId", rating, title, body, "placeId", "guideId", "tourId", status, "createdAt", "updatedAt", "vendorId") FROM stdin;
\.


--
-- Data for Name: Role; Type: TABLE DATA; Schema: public; Owner: yoguide
--

COPY public."Role" (key, label, permissions, "isSystem", "createdAt", "updatedAt") FROM stdin;
user	User	{}	f	2026-07-29 10:57:48.155	2026-07-29 10:57:48.155
admin	Administrator	{}	f	2026-07-29 10:57:48.155	2026-07-29 10:57:48.155
guide	Tour Guide	{}	f	2026-07-29 10:57:48.155	2026-07-29 10:57:48.155
vendor	Vendor	{}	f	2026-07-29 10:57:48.155	2026-07-29 10:57:48.155
USER	User	{}	f	2026-07-29 10:57:48.155	2026-07-29 10:57:48.155
ADMIN	Administrator	{}	f	2026-07-29 10:57:48.155	2026-07-29 10:57:48.155
GUIDE	Tour Guide	{}	f	2026-07-29 10:57:48.155	2026-07-29 10:57:48.155
VENDOR	Vendor	{}	f	2026-07-29 10:57:48.155	2026-07-29 10:57:48.155
TRAVELER	Traveler	{}	f	2026-07-29 10:57:48.155	2026-07-29 10:57:48.155
\.


--
-- Data for Name: ShuttleBooking; Type: TABLE DATA; Schema: public; Owner: yoguide
--

COPY public."ShuttleBooking" (id, "userId", "dropOffPoint", "slotTime", status, "createdAt") FROM stdin;
\.


--
-- Data for Name: Tour; Type: TABLE DATA; Schema: public; Owner: yoguide
--

COPY public."Tour" (id, "cityId", title, description, "vehicleType", "durationMinutes", "priceCents", currency, "isCustom", "coverImage", highlights, "isPublished", "createdAt", "updatedAt", "companyId", "guideId", category) FROM stdin;
\.


--
-- Data for Name: TourStop; Type: TABLE DATA; Schema: public; Owner: yoguide
--

COPY public."TourStop" (id, "tourId", ordinal, title, description, "durationMinutes", latitude, longitude, "placeId", "createdAt") FROM stdin;
\.


--
-- Data for Name: TripProfile; Type: TABLE DATA; Schema: public; Owner: yoguide
--

COPY public."TripProfile" (id, "userId", "destinationCity", "arrivalDate", "departureDate", "tripPurpose", nationality, "freeSlots", "experienceTypes", "updatedAt") FROM stdin;
\.


--
-- Data for Name: User; Type: TABLE DATA; Schema: public; Owner: yoguide
--

COPY public."User" (id, email, "passwordHash", "fullName", "roleKey", "createdAt", "updatedAt", "cardNumber", phone, "googleId", "avatarUrl", "passwordResetExpiresAt", "passwordResetToken", "emailVerified", "otpCodeHash", "otpExpiresAt", "identityDocUrls", "identityRejectionReason", "identityStatus") FROM stdin;
cms85p0au006lva0ivg9i17t8	juma03092022@gmail.com	$2a$10$dAoOU1YLddA1PuUfYZhfQ.ghZlsZ5HRdLeddjamN43LLGzk6b5vCi	juma Ally	user	2026-07-30 23:40:09.797	2026-07-30 23:40:09.797	\N	+250789456321	\N	\N	\N	\N	f	fce8da95818640b715d582f9cda3fc0e6573fd3f27990974b0897bd8f5a8c2e2	2026-07-30 23:50:09.795	{}	\N	none
cms60sq4m0001va0is1kfha4f	juma020224@gmail.com	$2a$10$13MmaHj0iZ7cBSaeeCvy7uZ8g5mMaJeTwi5PmiImIl.jGMgJPyDvi	Juma Ally	user	2026-07-29 11:47:32.805	2026-07-29 11:47:32.805	\N	+250789101112	\N	\N	\N	\N	f	909a42fcff88e421ba43a9be3330943fb79f9441d0adefb16f91d633a0424881	2026-07-29 11:57:32.804	{}	\N	none
cms608jm90001va0i07fprpyi	juma01092022@gmail.com	$2a$10$LH9EzbsZYYzC.MSl5whdGu4VMAbnCH5moKEmBIBJDDHSOCiECtA2q	Juma Ally	user	2026-07-29 11:31:51.248	2026-07-31 09:55:21.928	\N	+250789101112	101402016928228645642	https://lh3.googleusercontent.com/a/ACg8ocJyh6l0Q5tshcaK1ZZA_1MRIpXbOq1V--949X8efUAcGL4n8Q=s96-c	\N	\N	t	b34429f31e58916900a306622760d6318654bc0037a859e53b7b26eb4b0e22f1	2026-07-31 00:21:44.107	{}	\N	none
cms6dabyo000dva0ivcrcp86d	shemasebatunzi@gmail.com	$2a$10$0ckiTwmwZQ6SZB3C08m0GeYFsO8LIcTNO1QTm/05yT99XP7y4UoS2	Shema Seba	user	2026-07-29 17:37:09.648	2026-07-29 17:37:43.483	\N	+250783258278	\N	\N	\N	\N	t	\N	\N	{}	\N	none
cms7p4ljc0047va0ig91lj8bb	stevenlegendofficial@gmail.com	$2a$10$lWhf9HqO13x/8N0ijzDqf.85D9nI95n/TVwnRym38lqQU8cXOBV.O	Steven IRINGIRA	user	2026-07-30 15:56:23.688	2026-07-30 15:57:15.146	\N	+250stevenlegendofficial@gmail.com	\N	\N	\N	\N	t	\N	\N	{}	\N	none
cms7e5gco0021va0i52rru1zf	potoinnovationsgroup@gmail.com	$2a$10$xHINvJh6wU8d38uc0Yluy.0cCPsmQ9xTGBU8/J.wLzjTgGsoWS0s6	Josie Baloon	user	2026-07-30 10:49:07.848	2026-07-30 10:52:22.366	\N	+250794567232	\N	\N	\N	\N	t	\N	\N	{}	\N	none
cms799jx0000tva0ib8m84g7u	skatende@edupoto.com	$2a$10$EpOfYvBApPwszr0Lg0cMn.YHet1lD/UyngEEkeEeSaUZ6xRfPkYeC	sghema	user	2026-07-30 08:32:21.012	2026-07-30 13:24:18.151	\N	+250793903844	\N	\N	\N	\N	t	\N	\N	{}	\N	none
cms7afm25001hva0igj770sbd	info@travooz.com	$2a$10$gsdvM/fYDmCeCilIavkRHuVZKPoezMtzlP6kTgpSn5SMRaq2kyvs2	kelvin shayo	user	2026-07-30 09:05:03.34	2026-07-30 09:09:11.312	\N	+250795922165	\N	\N	\N	\N	t	\N	\N	{}	\N	none
cms7c4uhw001nva0i85em0aj5	eduboxafica@gmail.com	$2a$10$hdzUAUcHpHBJi7Fb5rBpROK0ngpM2OWvnYqSEbvwovA3GTe2HGvki	Edga Nsanzgwe	user	2026-07-30 09:52:40.292	2026-07-30 09:53:48.439	\N	+250794523434	\N	\N	\N	\N	t	\N	\N	{}	\N	none
cms7d6ovu001tva0ii88pxn44	shayoanton@gmail.com	$2a$10$4QdzPmMl0SlkwC6bInOJVuTyTM/l3kJafljgOfs8IHykdbCfXz9ha	Kelvin Shayo	user	2026-07-30 10:22:05.945	2026-07-30 10:22:05.945	\N	+250789235235	\N	\N	\N	\N	f	22ffacc3bad9708f59ea373a3f7e6bddfe5fe5fefef942e4f8a247731a528b77	2026-07-30 10:32:05.944	{}	\N	none
cms865muj006xva0i0mc7kllo	01092022@gmail.com	$2a$10$hFKTfDl8DJ5TYyggePwVReH4PSkCdTCUVPIptCvEd1a5wIFZPBXfq	yusufu asa	user	2026-07-30 23:53:05.514	2026-07-30 23:55:25.921	\N	+250789564324	\N	\N	\N	\N	f	0edfa54d7b13eee3e776d8941a1cd10e21ead73869b6db75407575c589cc6daf	2026-07-31 00:05:25.919	{}	\N	none
cms86og1v006zva0iho4xwnaz	kcshayo@edupoto.com	$2a$10$vFIsriL/Ecau/0prLz61cODAk0Awc6WhpoPeJTJb60oqBKgpcgLKK	jamax	user	2026-07-31 00:07:43.171	2026-07-31 00:07:43.171	\N	+250789544245	\N	\N	\N	\N	f	237cbd2a02ab9542be852437b16e961763cfbbffd6bd06fe848e8be14650eab2	2026-07-31 00:17:43.169	{}	\N	none
cms79hhjs0017va0i5o4kibn2	umutonipeace01@gmail.com	$2a$10$5G5b/F64GaFwmsKW1YO.kOvaANnOwTd6itGztVZ/GD6dgOuWtvEPO	NZAMBAZAMARIAYA	user	2026-07-30 08:38:31.192	2026-07-30 16:50:37.481	\N	+2500789577032	\N	\N	\N	\N	t	\N	\N	{}	\N	none
cms78k2qi000pva0is162qefa	katendeshema@gmail.com	$2a$10$scafmUZFl.r2mWc5FLdOmOKhN3PZQE8yTqKnL.slEtV8ml5zf9aGu	shema	user	2026-07-30 08:12:32.345	2026-07-31 10:03:22.383	\N	+250079390844	117293915674298188401	https://lh3.googleusercontent.com/a/ACg8ocLRo0ez_teBoEmDHoSTWW9bQKC-e1lthqwX9ZBVzf1YEqod6iMH=s96-c	\N	\N	t	\N	\N	{}	\N	none
cms7ncngr003tva0ix7bc80s8	cishimwe507@gmail.com	$2a$10$RGIjCzbIlAgs3DVB5jMhguZgyK46sECvpPGCo98y9.3ziuiQQn9gS	NZAMBAZAMARIAYA	user	2026-07-30 15:06:40.203	2026-07-30 15:07:25.961	\N	+2500789577032	\N	\N	\N	\N	t	\N	\N	{}	\N	none
cms7nljib0043va0i1tthgrmw	kelvinchristian048@gmail.com	$2a$10$mqqV4t8JhnADPE0OlUQX2.4c2OtUCpe/.iHYZ1psLM1EKr1MA637a	Juma Ally	user	2026-07-30 15:13:34.977	2026-07-30 15:14:31.213	\N	+250795922167	\N	\N	\N	\N	t	\N	\N	{}	\N	none
cms82fdow0065va0ir9ur601v	kelvincshayo@gmail.com		kelvin Shayo	user	2026-07-30 22:08:41.743	2026-07-30 22:08:41.743	\N	\N	112592314268732780774	https://lh3.googleusercontent.com/a/ACg8ocIukP7zu8mIfz9sPoBzjUkzTX1Bntf1Y88-cIiLwnYhNStbXA=s96-c	\N	\N	t	\N	\N	{}	\N	none
cms5z3shk0001va0ib4wwcja6	juma082022@gmail.com	$2a$10$awpYGkBPCnwllt/YonTv4OrOi21h39DhwP/tB23JKB6Fo/1dR8BLe	Juma Ally	user	2026-07-29 11:00:09.848	2026-07-30 23:07:16.585	\N	+250795922165	110110362781156951546	https://lh3.googleusercontent.com/a/ACg8ocI-sPPBzOXm8iAXQtb0RYljDGPxTwRFKvJ9rQrA5eqIccLb=s96-c	\N	\N	t	\N	\N	{}	\N	none
cms7d78l4001vva0is1n5o8k6	shayoanton96@gmail.com	$2a$10$2ZVdd369dgAqyDSwTNvbRu6rf6DQDx6gY/c0w9.0TuAuafLswFjJu	Kelvin Shayo	user	2026-07-30 10:22:31.479	2026-07-30 23:36:14.872	\N	+250789235235	107375871197825398227	https://lh3.googleusercontent.com/a/ACg8ocJrsOCPdK5lEQoe3moDXuNSaANHdvlAL0YIfP5uGKIaZQG_zA=s96-c	\N	\N	t	\N	\N	{}	\N	none
cms609l6b0003va0i3kktj8mn	juma02092022@gmail.com	$2a$10$BCd7a6/tSGN5JmvxG/EBFeIpRO22dxu2jFVRBhFNqW4Mm.sLYWFY6	Juma Ally	user	2026-07-29 11:32:39.923	2026-07-31 00:14:31.866	\N	+250789101112	\N	\N	\N	\N	f	6add76c0b3a69f51b308d1a6b97cd84f342ae8da9bf9a76bf198dedcebc6c939	2026-07-31 00:24:31.865	{}	\N	none
cms7nfwas003zva0iaqwkfzko	jamax255@gmail.com	$2a$10$5bulC0ECz6ZhZ.r1mHANT..cwYMTY0u8ZYBR..5GafS3QjlxgvRc6	Jamax	user	2026-07-30 15:09:11.619	2026-07-31 00:18:16.16	\N	+250752502460	\N	\N	\N	\N	f	87a59c650986d0cdf95a9733428f11e28621204eaaa7b6ba145ee5505eacbd46	2026-07-31 00:28:16.159	{}	\N	none
cms7mme1k0037va0isktnwkf9	yoguideafrica@gmail.com	$2a$10$TXXcpzuy.xgPlDRMROi7OOSliEXtTwvdqmACHft/ZoVdEJnUtOzfi	NZAMBAZAMARIAYA ROSINE	user	2026-07-30 14:46:14.935	2026-07-31 00:25:36.535	\N	+2500789577032	102896322334319904747	https://lh3.googleusercontent.com/a/ACg8ocJj5Hw4P2c-4wGCmHInJFb8fhSOoNXQY7td1LTT33gVEK7RYsQ=s96-c	\N	\N	t	3660d43f3266d10091ce99eea73f0942d87d21d748d3351307f732cbce12a57d	2026-07-30 14:56:14.933	{}	\N	none
cms8qncej007vva0itrmhs3tb	bing72981@gmail.com		Bless Ing	user	2026-07-31 09:26:44.107	2026-07-31 09:26:44.107	\N	\N	103337181732674249022	https://lh3.googleusercontent.com/a/ACg8ocK1IOpheG6SQGe3cHFY2CnlWJskQEOtoxSs_vEIMNIbE6uwGQ=s96-c	\N	\N	t	\N	\N	{}	\N	none
cms63dru50001va0ivklqq28j	eduboxafrica@gmail.com	$2a$10$8olZpHOvWRtW7Z6aH.51TOnPucLHDhTDD9f5QBqLtq0MIzBWc.cYC	Edubox Africa	user	2026-07-29 12:59:54.029	2026-07-31 09:44:50.624	\N	+250789101113	107938156498713041514	https://lh3.googleusercontent.com/a/ACg8ocLbzNzzk_Z7k5ZTL0Iseg9UgWPjO-ROwW66lXSdYXzp87TZpQ=s96-c	\N	\N	t	\N	\N	{}	\N	none
cmsam5zfo000vva0i1435xcyz	pndize@gmail.com	$2a$10$F.1jXnSrqf3i8r8Vc3HViODmrCQ3YVs9m7VgRfE4tPs0mGS/XlG1u	PNDIZE	user	2026-08-01 16:56:48.035	2026-08-01 16:57:40.864	\N	+250783787463	\N	\N	\N	\N	t	\N	\N	{}	\N	none
cmsccjd4e0017va0ipuysb1yg	iradukundafils1@gmail.com		Iradukunda Fils	user	2026-08-02 22:02:48.494	2026-08-02 22:02:48.494	\N	\N	101560548314379807975	https://lh3.googleusercontent.com/a/ACg8ocJtAvB-Q7JLaviHg23K333_8zDCY3kXx_ZaQLFH-cOQYR5_ejwQ=s96-c	\N	\N	t	\N	\N	{}	\N	none
cms7854vc000jva0ii47a87wv	gajurosine1@gmail.com	$2a$10$rryoo74C6ft6KImmNvNekud47D3D7Mjd.m0TuTUUqCfYM6u97BRYy	NZAMBAZAMARIYA Rosine	user	2026-07-30 08:00:55.272	2026-08-02 20:54:36.329	\N	+2500789577032	104435543133303563728	https://lh3.googleusercontent.com/a/ACg8ocJdqlsP4cMu997wGrP7RvCUU2qt5HwyDSqkqE7Yk_ywCZLmiqcT0g=s96-c	2026-08-02 21:24:36.328	a88441c191435e6cbbe3db2bf31b759ee17813834166466e971f840bed3dc1d4	t	\N	\N	{}	\N	none
cmsccrmr4001hva0inls5d6d8	rumanzibonheur@gmail.com		Rumanzi Bonheur	user	2026-08-02 22:09:14.224	2026-08-02 22:09:14.224	\N	\N	109305989877500189280	https://lh3.googleusercontent.com/a/ACg8ocLyB1ZxW3ziEhHXyDyR-KcMm1F07WO4gyXH7yN0LKWRn_bXi29Hkw=s96-c	\N	\N	t	\N	\N	{}	\N	none
cmsccza1o001lva0id1rbtm2s	niyonshutikenny@yahoo.com	$2a$10$6np9oYcOeKLxWr0adlnK5.6yZ9rVDvgb1uHcCWHPaAU4oeyGbXE5e	kenny	user	2026-08-02 22:15:11.004	2026-08-02 22:15:11.004	\N	+250789589794	\N	\N	\N	\N	f	73b78639e0f213de02ad6a393caf27fd860a26d0c63d129dc62adae3eb953ca8	2026-08-02 22:25:11.002	{}	\N	none
cmscd00t2001nva0ibby1rb5f	niyonshutikenny0@gmail.com		Kenny NIYONSHUTI	user	2026-08-02 22:15:45.686	2026-08-02 22:15:45.686	\N	\N	111423580774220384863	https://lh3.googleusercontent.com/a/ACg8ocIqcJWk_INIuvXsPpKcTlVGeI_Wot1X01u3Hv5GtXBO1VtzVpA=s96-c	\N	\N	t	\N	\N	{}	\N	none
cmscdznbk0023va0imjkx6veg	umwemubi@gmail.com		Umwe mubi	user	2026-08-02 22:43:27.824	2026-08-02 22:43:27.824	\N	\N	106409867151414971725	https://lh3.googleusercontent.com/a/ACg8ocKP_HgP1ZViS3-tEVMRefD13eJRy7isYKSpt0szNSUNSGSgPg=s96-c	\N	\N	t	\N	\N	{}	\N	none
cmscuush2002fva0i1lw308ja	shemasebatunzisamuel@gmail.com		Shema Sebatunzi samuel	user	2026-08-03 06:35:34.694	2026-08-03 06:35:34.694	\N	\N	104669424530047578288	https://lh3.googleusercontent.com/a/ACg8ocK_bXmapPXh9IShM2kxd20VIV5DXzRuvam9kwBFs8pZGbOF6fA86w=s96-c	\N	\N	t	\N	\N	{}	\N	none
cmscxchrc003tva0ilu9cfzhs	peaceamizero@gmail.com	$2a$10$JDfo7ikSQbRPxtqVjMRpsuiHbKzvL/eORU37xv7tgr9lq4Jq2Nk4i	T	user	2026-08-03 07:45:19.764	2026-08-03 07:45:45.41	\N	+250792999642	\N	\N	\N	\N	t	\N	\N	{}	\N	none
cmscxendi003vva0itkcyd2pb	wow@human.com	$2a$10$3fw87G2.02q49kgJRQozDexfg4fTKI02ZK0X1cXGbmDqkUA9pnOLe	wqo	user	2026-08-03 07:47:00.437	2026-08-03 07:47:00.437	\N	+250793254469	\N	\N	\N	\N	f	00678ac91405d95e9b833cd94c12842a9b925d8af50b80dc0438fe8dd4c9e420	2026-08-03 07:57:00.436	{}	\N	none
cmscxiw16003xva0iiar3ob5n	rcacatholique@gmail.com		RCA Catholique	user	2026-08-03 07:50:18.282	2026-08-03 07:50:18.282	\N	\N	106288506369592103893	https://lh3.googleusercontent.com/a/ACg8ocK5jfUMlbiaslNHUSQB6f86_CYeHACCfRmX4KvMWzMIVLqfuA=s96-c	\N	\N	t	\N	\N	{}	\N	none
cmscxo4bd0043va0in72abzop	dieze@gmail.com	$2a$10$s8xTsDkMAY3KiKZQg4MRqOGbCsWhFIgEInthIJbvQf6KZSWk0zhuG	Dieze	user	2026-08-03 07:54:22.296	2026-08-03 07:54:22.296	\N	+250792121210	\N	\N	\N	\N	f	44ead073bd1c65a6c53d25b77f5174a444daf989013b048ce03a2e019dd590ee	2026-08-03 08:04:22.295	{}	\N	none
cmscy1s9n0045va0i9ztao994	testuser12@yopmail.com	$2a$10$yRO72gQBbJrNZo.YgBktUe4UFEYm.svwMiAnGK6G03dyEcqESk0Ju	Test	user	2026-08-03 08:04:59.866	2026-08-03 08:05:54.74	\N	+250780302284	\N	\N	\N	\N	t	\N	\N	{}	\N	none
cmscyakuf004fva0i72t617rk	valensniyonsenga.2003@gmail.com	$2a$10$1XGxQeYhUbc5UVRD48nYGumIm0XlGSO/mDIEHDhr/HGq9KHHaDStK	Valens Niyonsenga	user	2026-08-03 08:11:50.151	2026-08-03 08:12:29.258	\N	+2500793045233	\N	\N	\N	\N	t	\N	\N	{}	\N	none
cmscydnv5004hva0i1y0j8dkc	rusimbiwilliam@gmail.com	$2a$10$hriCNzIoZ0qEKwEsEgmDA./JOIOYqI9PHoagLGs0372TVvdeZb0XK	Rusimbi	user	2026-08-03 08:14:14.033	2026-08-03 08:14:14.033	\N	+2500793413005	\N	\N	\N	\N	f	3a92f0b819fd2c3652de480c559eae1d75204644e049ddd3de183220548dcb98	2026-08-03 08:24:14.031	{}	\N	none
cmscyk8be004jva0i0yfsyxmt	ishimweemmy24@gmail.com		I. E	user	2026-08-03 08:19:20.474	2026-08-03 08:19:20.474	\N	\N	108233105651657814205	https://lh3.googleusercontent.com/a/ACg8ocIq1pjWg2SGFLNYTxsuqVRZ646nsB9FJvyQFunXAmKxUI1geRBI=s96-c	\N	\N	t	\N	\N	{}	\N	none
cmscyrzn8004tva0iosuzrmw1	precieuxmugisha@gmail.com	$2a$10$SZPA1jCbyiZiLOvs047SmugtO/PIbENkWl4NT1I4zVM38w13CNOfi	Precieux Mugisha	user	2026-08-03 08:25:22.484	2026-08-03 08:25:46.127	\N	+2500782307144	\N	\N	\N	\N	t	\N	\N	{}	\N	none
cmscyuxjp0051va0iagw1u7dq	nicklemykayiranga@gmail.com		Nick-Lemy K.	user	2026-08-03 08:27:39.733	2026-08-03 08:27:39.733	\N	\N	102321873860068586176	https://lh3.googleusercontent.com/a/ACg8ocIJ3FwjdOI0RTuUXAnh1wjnlkMDZfhYJiLSP9ZZIV57XI2XDAdV=s96-c	\N	\N	t	\N	\N	{}	\N	none
cmscz69rg005jva0ic9ty8x82	urchin463@goldfishgateway.com	$2a$10$vDfUxRCjogwtr7xVjcub/.Vi6GMZBuHL.rJkUMW0.V2gitmEWVaP.	Andres Brandon	user	2026-08-03 08:36:28.78	2026-08-03 08:37:54.606	\N	+250798980320	\N	\N	\N	\N	t	\N	\N	{}	\N	none
cmsdc0ldv0061va0itq3csi69	mireille.umutoni@wiredin.rw	$2a$10$lXHJNmqf.TAXIhpi6yJmC.Zg4qfwmJLDuyWDJ8qpx.QFtsRdArnf6	Mireille Umutoni	user	2026-08-03 14:35:58.916	2026-08-03 14:36:41.164	\N	+250788775163	\N	\N	\N	\N	t	\N	\N	{}	\N	none
cms8qgzuj007jva0i7x4ug778	mbabazilouangeliza@gmail.com	$2a$10$UPtDn0BY.mEYVlz9H.n4dOoWmz7to6HRJg9ZsrQWUzutTc1dd8p2y	Liza Louange	user	2026-07-31 09:21:47.898	2026-08-04 13:44:43.467	\N	+250791890953	100935502072258652055	https://lh3.googleusercontent.com/a/ACg8ocIBVudnMlhpS6qzwePgpZsBpNrAS9J3X5yBocKCD_fNDCcckiZ3=s96-c	\N	\N	t	\N	\N	{}	\N	none
cmser5kq6006vva0iu9uh5hmb	katemdeshema@gmail.com	$2a$10$2MDOj7fSwl.aGCeeTGc4keRBwYSsTtE3tGaRAWTDRpXROmpgXZok2	sahemna	user	2026-08-04 14:27:31.724	2026-08-04 14:27:31.724	\N	+250793903844	\N	\N	\N	\N	f	0737744929fee5dc3c7cba73c04982ac2d5a5b5e9e9dcd68940629d54ccf1383	2026-08-04 14:37:31.721	{}	\N	none
\.


--
-- Data for Name: Vehicle; Type: TABLE DATA; Schema: public; Owner: yoguide
--

COPY public."Vehicle" (id, "companyId", type, label, "plateNumber", seats, "photoUrl", "isActive", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: Vendor; Type: TABLE DATA; Schema: public; Owner: yoguide
--

COPY public."Vendor" (id, slug, name, category, description, contact, email, phone, website, city, "isVerified", "isActive", rating, "createdAt", "updatedAt", address, amenities, "checkInTime", "checkOutTime", "ownerId", "rejectionReason", status) FROM stdin;
\.


--
-- Data for Name: Wallet; Type: TABLE DATA; Schema: public; Owner: yoguide
--

COPY public."Wallet" (id, "userId", "balanceCents", currency, "createdAt", "updatedAt") FROM stdin;
cms5z4pi70003va0ixl8b2v1h	cms5z3shk0001va0ib4wwcja6	0	USD	2026-07-29 11:00:52.639	2026-07-29 11:00:52.639
cms63f68e0003va0in5va4i5r	cms63dru50001va0ivklqq28j	0	USD	2026-07-29 13:00:59.342	2026-07-29 13:00:59.342
cms6db27r000fva0ia6sc4yov	cms6dabyo000dva0ivcrcp86d	0	USD	2026-07-29 17:37:43.671	2026-07-29 17:37:43.671
cms786xu6000lva0icw7mn0fk	cms7854vc000jva0ii47a87wv	0	USD	2026-07-30 08:02:19.463	2026-07-30 08:02:19.463
cms78l41k000rva0ihprcvbk2	cms78k2qi000pva0is162qefa	0	USD	2026-07-30 08:13:20.696	2026-07-30 08:13:20.696
cms79iro20019va0ipo48clvo	cms79hhjs0017va0i5o4kibn2	0	USD	2026-07-30 08:39:30.962	2026-07-30 08:39:30.962
cms7akyu8001jva0iwcp9co0f	cms7afm25001hva0igj770sbd	0	USD	2026-07-30 09:09:13.184	2026-07-30 09:09:13.184
cms7c6c2i001pva0ih2zhq06p	cms7c4uhw001nva0i85em0aj5	0	USD	2026-07-30 09:53:49.721	2026-07-30 09:53:49.721
cms7d8w1e001xva0i4nbmg1ww	cms7d78l4001vva0is1n5o8k6	0	USD	2026-07-30 10:23:48.53	2026-07-30 10:23:48.53
cms7e9nc80023va0it4pfmliz	cms7e5gco0021va0i52rru1zf	0	USD	2026-07-30 10:52:23.528	2026-07-30 10:52:23.528
cms7jp0b3002hva0iibp9jggb	cms799jx0000tva0ib8m84g7u	0	USD	2026-07-30 13:24:18.249	2026-07-30 13:24:18.249
cms7ndntd003vva0i2kwoma8p	cms7ncngr003tva0ix7bc80s8	0	USD	2026-07-30 15:07:27.306	2026-07-30 15:07:27.306
cms7nmsf20045va0ikmsy9ozv	cms7nljib0043va0i1tthgrmw	0	USD	2026-07-30 15:14:33.182	2026-07-30 15:14:33.182
cms7p5pdv0049va0i3hv5axfh	cms7p4ljc0047va0ig91lj8bb	0	USD	2026-07-30 15:57:15.321	2026-07-30 15:57:15.321
cms82ff6c0067va0i1ohw07vw	cms82fdow0065va0ir9ur601v	0	USD	2026-07-30 22:08:43.668	2026-07-30 22:08:43.668
cms87bgjz0075va0idtkd35sm	cms7mme1k0037va0isktnwkf9	0	USD	2026-07-31 00:25:36.911	2026-07-31 00:25:36.911
cms8qhh00007lva0ig7p9d6dh	cms8qgzuj007jva0i7x4ug778	0	USD	2026-07-31 09:22:10.128	2026-07-31 09:22:10.128
cms8qncko007xva0id5kc0u18	cms8qncej007vva0itrmhs3tb	0	USD	2026-07-31 09:26:44.328	2026-07-31 09:26:44.328
cms8ro6nz0089va0i0qhw5iy7	cms608jm90001va0i07fprpyi	0	USD	2026-07-31 09:55:22.943	2026-07-31 09:55:22.943
cmsam7o6o000xva0ildlx9xe5	cmsam5zfo000vva0i1435xcyz	0	USD	2026-08-01 16:58:06.769	2026-08-01 16:58:06.769
cmsccjedw0019va0i2xpgvp3l	cmsccjd4e0017va0ipuysb1yg	0	USD	2026-08-02 22:02:50.132	2026-08-02 22:02:50.132
cmsccrnux001jva0igw78dzbt	cmsccrmr4001hva0inls5d6d8	0	USD	2026-08-02 22:09:15.657	2026-08-02 22:09:15.657
cmscd0105001pva0ibcqwynut	cmscd00t2001nva0ibby1rb5f	0	USD	2026-08-02 22:15:45.941	2026-08-02 22:15:45.941
cmscdzofu0025va0ir642hh8u	cmscdznbk0023va0imjkx6veg	0	USD	2026-08-02 22:43:29.274	2026-08-02 22:43:29.274
cmscuuss5002hva0iqbkioxgi	cmscuush2002fva0i1lw308ja	0	USD	2026-08-03 06:35:35.094	2026-08-03 06:35:35.094
cmscxiwnw003zva0itmhwtkfy	cmscxiw16003xva0iiar3ob5n	0	USD	2026-08-03 07:50:19.1	2026-08-03 07:50:19.1
cmscy3s440047va0iqsnc6nov	cmscy1s9n0045va0i9ztao994	0	USD	2026-08-03 08:06:32.98	2026-08-03 08:06:32.98
cmscyk9hp004lva0iuq1wy68s	cmscyk8be004jva0i0yfsyxmt	0	USD	2026-08-03 08:19:21.997	2026-08-03 08:19:21.997
cmscysp2l004vva0inq5adffs	cmscyrzn8004tva0iosuzrmw1	0	USD	2026-08-03 08:25:55.437	2026-08-03 08:25:55.437
cmscyuxp10053va0i7jijiddx	cmscyuxjp0051va0iagw1u7dq	0	USD	2026-08-03 08:27:39.925	2026-08-03 08:27:39.925
cmscz8en3005lva0iw7s6aqhi	cmscz69rg005jva0ic9ty8x82	0	USD	2026-08-03 08:38:08.416	2026-08-03 08:38:08.416
cmsdc24g00063va0ioc7x2knu	cmsdc0ldv0061va0itq3csi69	0	USD	2026-08-03 14:37:10.272	2026-08-03 14:37:10.272
\.


--
-- Data for Name: WalletTransaction; Type: TABLE DATA; Schema: public; Owner: yoguide
--

COPY public."WalletTransaction" (id, "walletId", kind, "amountCents", currency, "bookingId", "externalRef", notes, "createdAt", "cardToken", method, "rwfAmount", "sourceAmount", "sourceCurrency", status, "userId") FROM stdin;
\.


--
-- Data for Name: _prisma_migrations; Type: TABLE DATA; Schema: public; Owner: yoguide
--

COPY public._prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count) FROM stdin;
6efa6b9f-3719-43de-8bbf-02d6d14a87bb	2f7143cd1102972dc9066b0cf513193dae13154dfa12533157293c87bd740bdb	2026-07-29 10:57:34.488078+00	20260509101339_init	\N	\N	2026-07-29 10:57:34.413818+00	1
ac51a8bd-f832-40b5-b63f-3f032ea0d62c	ef001844feada76947819a5fc847694a0127cede5523802a906515fd39c8cb7e	2026-07-29 10:57:34.67742+00	20260509113117_add_country_platform	\N	\N	2026-07-29 10:57:34.490017+00	1
3736b730-9e54-48b1-a62c-7399d5c87fef	cccf5cfd568304d9bce62e651bedb5f601cb7334b21833d067b9fa2435b406e3	2026-07-29 10:57:34.763899+00	20260531121228_add_onboarding_tables	\N	\N	2026-07-29 10:57:34.678741+00	1
d1b285cb-df73-4615-92f5-64b6f9bad9e2	94943ee53cdb7b5cfef343a77329907dc566d6305ee0c1c40adc8fb88294079c	2026-07-29 10:57:34.783863+00	20260531163804_add_notifications	\N	\N	2026-07-29 10:57:34.765287+00	1
61b8e7d8-3f84-4a18-b746-ebe798c031b1	acc351b369865d813ea02bdb794122a11a71e31a01adb5f6129cd400a50b2d70	2026-07-29 10:57:34.79158+00	20260628130000_add_google_auth	\N	\N	2026-07-29 10:57:34.785008+00	1
a34c410a-3163-4097-89e9-57c986dcf87f	2b1950f828c502fee05dc20c3c0cc0a15d815d8e6869dd2d3cebadd792c92935	2026-07-29 10:57:34.796556+00	20260710081654_init	\N	\N	2026-07-29 10:57:34.792457+00	1
f35e0589-3cc1-48a0-9bb2-6143a4b3ca0a	e769ab6ca7fdfdc00aecc9968d3000f0d20e90dda7019ad88a6f7bf050d3bcef	2026-07-29 10:57:34.801398+00	20260720185957_add_password_reset	\N	\N	2026-07-29 10:57:34.797428+00	1
32c63bda-7245-404e-9e48-f47ba7f6beed	a26a75ffe6af2b8af7d35937e57b169c0f11b8744284dbb3fa4d3162b84ab7dd	2026-07-29 10:57:34.808034+00	20260722222144_add_otp_and_guide_user_relation	\N	\N	2026-07-29 10:57:34.802603+00	1
1b34614f-b7c5-433d-a881-800f4f0866c1	c939c29a99e9715ae6bfa7cf15297712a96615096f2149109bb02ee3609448df	2026-07-29 10:57:34.820552+00	20260723080000_add_vendor_ownership_and_hotel_fields	\N	\N	2026-07-29 10:57:34.809122+00	1
dac8bd83-73ea-4133-968f-0c303369b4c0	58a1895b87daae7af58858e0cd405695b960c43c29f7226b278f669319c4bbfd	2026-07-29 10:57:34.866152+00	20260724225608_verification_and_guide_companies	\N	\N	2026-07-29 10:57:34.821882+00	1
9e9f2c52-d099-47ec-b0e0-cbd408ae27fe	383973ccc615cd6ee8d985bcc59d65902f2d5bead28c77b2f54313cd3cf6f7a3	2026-08-05 11:41:20.655749+00	20260804150000_add_tour_category_and_guide_gastronomy_fields	\N	\N	2026-08-05 11:41:20.57928+00	1
\.


--
-- Name: AnalyticsEvent AnalyticsEvent_pkey; Type: CONSTRAINT; Schema: public; Owner: yoguide
--

ALTER TABLE ONLY public."AnalyticsEvent"
    ADD CONSTRAINT "AnalyticsEvent_pkey" PRIMARY KEY (id);


--
-- Name: AuditLog AuditLog_pkey; Type: CONSTRAINT; Schema: public; Owner: yoguide
--

ALTER TABLE ONLY public."AuditLog"
    ADD CONSTRAINT "AuditLog_pkey" PRIMARY KEY (id);


--
-- Name: BookingTransaction BookingTransaction_pkey; Type: CONSTRAINT; Schema: public; Owner: yoguide
--

ALTER TABLE ONLY public."BookingTransaction"
    ADD CONSTRAINT "BookingTransaction_pkey" PRIMARY KEY (id);


--
-- Name: Booking Booking_pkey; Type: CONSTRAINT; Schema: public; Owner: yoguide
--

ALTER TABLE ONLY public."Booking"
    ADD CONSTRAINT "Booking_pkey" PRIMARY KEY (id);


--
-- Name: City City_pkey; Type: CONSTRAINT; Schema: public; Owner: yoguide
--

ALTER TABLE ONLY public."City"
    ADD CONSTRAINT "City_pkey" PRIMARY KEY (id);


--
-- Name: EsimOrder EsimOrder_pkey; Type: CONSTRAINT; Schema: public; Owner: yoguide
--

ALTER TABLE ONLY public."EsimOrder"
    ADD CONSTRAINT "EsimOrder_pkey" PRIMARY KEY (id);


--
-- Name: EventInterest EventInterest_pkey; Type: CONSTRAINT; Schema: public; Owner: yoguide
--

ALTER TABLE ONLY public."EventInterest"
    ADD CONSTRAINT "EventInterest_pkey" PRIMARY KEY (id);


--
-- Name: Event Event_pkey; Type: CONSTRAINT; Schema: public; Owner: yoguide
--

ALTER TABLE ONLY public."Event"
    ADD CONSTRAINT "Event_pkey" PRIMARY KEY (id);


--
-- Name: Favorite Favorite_pkey; Type: CONSTRAINT; Schema: public; Owner: yoguide
--

ALTER TABLE ONLY public."Favorite"
    ADD CONSTRAINT "Favorite_pkey" PRIMARY KEY (id);


--
-- Name: GuideCompany GuideCompany_pkey; Type: CONSTRAINT; Schema: public; Owner: yoguide
--

ALTER TABLE ONLY public."GuideCompany"
    ADD CONSTRAINT "GuideCompany_pkey" PRIMARY KEY (id);


--
-- Name: GuideDocument GuideDocument_pkey; Type: CONSTRAINT; Schema: public; Owner: yoguide
--

ALTER TABLE ONLY public."GuideDocument"
    ADD CONSTRAINT "GuideDocument_pkey" PRIMARY KEY (id);


--
-- Name: Guide Guide_pkey; Type: CONSTRAINT; Schema: public; Owner: yoguide
--

ALTER TABLE ONLY public."Guide"
    ADD CONSTRAINT "Guide_pkey" PRIMARY KEY (id);


--
-- Name: ItineraryItem ItineraryItem_pkey; Type: CONSTRAINT; Schema: public; Owner: yoguide
--

ALTER TABLE ONLY public."ItineraryItem"
    ADD CONSTRAINT "ItineraryItem_pkey" PRIMARY KEY (id);


--
-- Name: Itinerary Itinerary_pkey; Type: CONSTRAINT; Schema: public; Owner: yoguide
--

ALTER TABLE ONLY public."Itinerary"
    ADD CONSTRAINT "Itinerary_pkey" PRIMARY KEY (id);


--
-- Name: MessageThread MessageThread_pkey; Type: CONSTRAINT; Schema: public; Owner: yoguide
--

ALTER TABLE ONLY public."MessageThread"
    ADD CONSTRAINT "MessageThread_pkey" PRIMARY KEY (id);


--
-- Name: Message Message_pkey; Type: CONSTRAINT; Schema: public; Owner: yoguide
--

ALTER TABLE ONLY public."Message"
    ADD CONSTRAINT "Message_pkey" PRIMARY KEY (id);


--
-- Name: Notification Notification_pkey; Type: CONSTRAINT; Schema: public; Owner: yoguide
--

ALTER TABLE ONLY public."Notification"
    ADD CONSTRAINT "Notification_pkey" PRIMARY KEY (id);


--
-- Name: OrderItem OrderItem_pkey; Type: CONSTRAINT; Schema: public; Owner: yoguide
--

ALTER TABLE ONLY public."OrderItem"
    ADD CONSTRAINT "OrderItem_pkey" PRIMARY KEY (id);


--
-- Name: Order Order_pkey; Type: CONSTRAINT; Schema: public; Owner: yoguide
--

ALTER TABLE ONLY public."Order"
    ADD CONSTRAINT "Order_pkey" PRIMARY KEY (id);


--
-- Name: Phrase Phrase_pkey; Type: CONSTRAINT; Schema: public; Owner: yoguide
--

ALTER TABLE ONLY public."Phrase"
    ADD CONSTRAINT "Phrase_pkey" PRIMARY KEY (id);


--
-- Name: Place Place_pkey; Type: CONSTRAINT; Schema: public; Owner: yoguide
--

ALTER TABLE ONLY public."Place"
    ADD CONSTRAINT "Place_pkey" PRIMARY KEY (id);


--
-- Name: Product Product_pkey; Type: CONSTRAINT; Schema: public; Owner: yoguide
--

ALTER TABLE ONLY public."Product"
    ADD CONSTRAINT "Product_pkey" PRIMARY KEY (id);


--
-- Name: Review Review_pkey; Type: CONSTRAINT; Schema: public; Owner: yoguide
--

ALTER TABLE ONLY public."Review"
    ADD CONSTRAINT "Review_pkey" PRIMARY KEY (id);


--
-- Name: Role Role_pkey; Type: CONSTRAINT; Schema: public; Owner: yoguide
--

ALTER TABLE ONLY public."Role"
    ADD CONSTRAINT "Role_pkey" PRIMARY KEY (key);


--
-- Name: ShuttleBooking ShuttleBooking_pkey; Type: CONSTRAINT; Schema: public; Owner: yoguide
--

ALTER TABLE ONLY public."ShuttleBooking"
    ADD CONSTRAINT "ShuttleBooking_pkey" PRIMARY KEY (id);


--
-- Name: TourStop TourStop_pkey; Type: CONSTRAINT; Schema: public; Owner: yoguide
--

ALTER TABLE ONLY public."TourStop"
    ADD CONSTRAINT "TourStop_pkey" PRIMARY KEY (id);


--
-- Name: Tour Tour_pkey; Type: CONSTRAINT; Schema: public; Owner: yoguide
--

ALTER TABLE ONLY public."Tour"
    ADD CONSTRAINT "Tour_pkey" PRIMARY KEY (id);


--
-- Name: TripProfile TripProfile_pkey; Type: CONSTRAINT; Schema: public; Owner: yoguide
--

ALTER TABLE ONLY public."TripProfile"
    ADD CONSTRAINT "TripProfile_pkey" PRIMARY KEY (id);


--
-- Name: User User_pkey; Type: CONSTRAINT; Schema: public; Owner: yoguide
--

ALTER TABLE ONLY public."User"
    ADD CONSTRAINT "User_pkey" PRIMARY KEY (id);


--
-- Name: Vehicle Vehicle_pkey; Type: CONSTRAINT; Schema: public; Owner: yoguide
--

ALTER TABLE ONLY public."Vehicle"
    ADD CONSTRAINT "Vehicle_pkey" PRIMARY KEY (id);


--
-- Name: Vendor Vendor_pkey; Type: CONSTRAINT; Schema: public; Owner: yoguide
--

ALTER TABLE ONLY public."Vendor"
    ADD CONSTRAINT "Vendor_pkey" PRIMARY KEY (id);


--
-- Name: WalletTransaction WalletTransaction_pkey; Type: CONSTRAINT; Schema: public; Owner: yoguide
--

ALTER TABLE ONLY public."WalletTransaction"
    ADD CONSTRAINT "WalletTransaction_pkey" PRIMARY KEY (id);


--
-- Name: Wallet Wallet_pkey; Type: CONSTRAINT; Schema: public; Owner: yoguide
--

ALTER TABLE ONLY public."Wallet"
    ADD CONSTRAINT "Wallet_pkey" PRIMARY KEY (id);


--
-- Name: _prisma_migrations _prisma_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: yoguide
--

ALTER TABLE ONLY public._prisma_migrations
    ADD CONSTRAINT _prisma_migrations_pkey PRIMARY KEY (id);


--
-- Name: AnalyticsEvent_name_idx; Type: INDEX; Schema: public; Owner: yoguide
--

CREATE INDEX "AnalyticsEvent_name_idx" ON public."AnalyticsEvent" USING btree (name);


--
-- Name: AnalyticsEvent_userId_idx; Type: INDEX; Schema: public; Owner: yoguide
--

CREATE INDEX "AnalyticsEvent_userId_idx" ON public."AnalyticsEvent" USING btree ("userId");


--
-- Name: AuditLog_actorId_idx; Type: INDEX; Schema: public; Owner: yoguide
--

CREATE INDEX "AuditLog_actorId_idx" ON public."AuditLog" USING btree ("actorId");


--
-- Name: AuditLog_entity_entityId_idx; Type: INDEX; Schema: public; Owner: yoguide
--

CREATE INDEX "AuditLog_entity_entityId_idx" ON public."AuditLog" USING btree (entity, "entityId");


--
-- Name: City_slug_key; Type: INDEX; Schema: public; Owner: yoguide
--

CREATE UNIQUE INDEX "City_slug_key" ON public."City" USING btree (slug);


--
-- Name: EventInterest_userId_key; Type: INDEX; Schema: public; Owner: yoguide
--

CREATE UNIQUE INDEX "EventInterest_userId_key" ON public."EventInterest" USING btree ("userId");


--
-- Name: Favorite_userId_idx; Type: INDEX; Schema: public; Owner: yoguide
--

CREATE INDEX "Favorite_userId_idx" ON public."Favorite" USING btree ("userId");


--
-- Name: GuideCompany_ownerId_key; Type: INDEX; Schema: public; Owner: yoguide
--

CREATE UNIQUE INDEX "GuideCompany_ownerId_key" ON public."GuideCompany" USING btree ("ownerId");


--
-- Name: GuideCompany_slug_key; Type: INDEX; Schema: public; Owner: yoguide
--

CREATE UNIQUE INDEX "GuideCompany_slug_key" ON public."GuideCompany" USING btree (slug);


--
-- Name: Guide_companyId_idx; Type: INDEX; Schema: public; Owner: yoguide
--

CREATE INDEX "Guide_companyId_idx" ON public."Guide" USING btree ("companyId");


--
-- Name: Guide_userId_key; Type: INDEX; Schema: public; Owner: yoguide
--

CREATE UNIQUE INDEX "Guide_userId_key" ON public."Guide" USING btree ("userId");


--
-- Name: MessageThread_participantA_idx; Type: INDEX; Schema: public; Owner: yoguide
--

CREATE INDEX "MessageThread_participantA_idx" ON public."MessageThread" USING btree ("participantA");


--
-- Name: MessageThread_participantB_idx; Type: INDEX; Schema: public; Owner: yoguide
--

CREATE INDEX "MessageThread_participantB_idx" ON public."MessageThread" USING btree ("participantB");


--
-- Name: Message_threadId_idx; Type: INDEX; Schema: public; Owner: yoguide
--

CREATE INDEX "Message_threadId_idx" ON public."Message" USING btree ("threadId");


--
-- Name: Notification_userId_createdAt_idx; Type: INDEX; Schema: public; Owner: yoguide
--

CREATE INDEX "Notification_userId_createdAt_idx" ON public."Notification" USING btree ("userId", "createdAt");


--
-- Name: Order_userId_idx; Type: INDEX; Schema: public; Owner: yoguide
--

CREATE INDEX "Order_userId_idx" ON public."Order" USING btree ("userId");


--
-- Name: Product_slug_key; Type: INDEX; Schema: public; Owner: yoguide
--

CREATE UNIQUE INDEX "Product_slug_key" ON public."Product" USING btree (slug);


--
-- Name: Review_guideId_idx; Type: INDEX; Schema: public; Owner: yoguide
--

CREATE INDEX "Review_guideId_idx" ON public."Review" USING btree ("guideId");


--
-- Name: Review_placeId_idx; Type: INDEX; Schema: public; Owner: yoguide
--

CREATE INDEX "Review_placeId_idx" ON public."Review" USING btree ("placeId");


--
-- Name: Review_tourId_idx; Type: INDEX; Schema: public; Owner: yoguide
--

CREATE INDEX "Review_tourId_idx" ON public."Review" USING btree ("tourId");


--
-- Name: Review_vendorId_idx; Type: INDEX; Schema: public; Owner: yoguide
--

CREATE INDEX "Review_vendorId_idx" ON public."Review" USING btree ("vendorId");


--
-- Name: TourStop_tourId_ordinal_key; Type: INDEX; Schema: public; Owner: yoguide
--

CREATE UNIQUE INDEX "TourStop_tourId_ordinal_key" ON public."TourStop" USING btree ("tourId", ordinal);


--
-- Name: Tour_companyId_idx; Type: INDEX; Schema: public; Owner: yoguide
--

CREATE INDEX "Tour_companyId_idx" ON public."Tour" USING btree ("companyId");


--
-- Name: Tour_guideId_idx; Type: INDEX; Schema: public; Owner: yoguide
--

CREATE INDEX "Tour_guideId_idx" ON public."Tour" USING btree ("guideId");


--
-- Name: TripProfile_userId_key; Type: INDEX; Schema: public; Owner: yoguide
--

CREATE UNIQUE INDEX "TripProfile_userId_key" ON public."TripProfile" USING btree ("userId");


--
-- Name: User_email_key; Type: INDEX; Schema: public; Owner: yoguide
--

CREATE UNIQUE INDEX "User_email_key" ON public."User" USING btree (email);


--
-- Name: User_googleId_key; Type: INDEX; Schema: public; Owner: yoguide
--

CREATE UNIQUE INDEX "User_googleId_key" ON public."User" USING btree ("googleId");


--
-- Name: Vehicle_companyId_idx; Type: INDEX; Schema: public; Owner: yoguide
--

CREATE INDEX "Vehicle_companyId_idx" ON public."Vehicle" USING btree ("companyId");


--
-- Name: Vendor_ownerId_key; Type: INDEX; Schema: public; Owner: yoguide
--

CREATE UNIQUE INDEX "Vendor_ownerId_key" ON public."Vendor" USING btree ("ownerId");


--
-- Name: Vendor_slug_key; Type: INDEX; Schema: public; Owner: yoguide
--

CREATE UNIQUE INDEX "Vendor_slug_key" ON public."Vendor" USING btree (slug);


--
-- Name: Wallet_userId_key; Type: INDEX; Schema: public; Owner: yoguide
--

CREATE UNIQUE INDEX "Wallet_userId_key" ON public."Wallet" USING btree ("userId");


--
-- PostgreSQL database dump complete
--

\unrestrict msg5vlnNUidskgSFb7WN5mhQq4lc27EoM8XfdO69TU7dBBVEI70lhMsvpkfXjc5

