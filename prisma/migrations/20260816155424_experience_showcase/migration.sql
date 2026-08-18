-- CreateTable
CREATE TABLE "GuideExperience" (
    "id" TEXT NOT NULL,
    "guideId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuideExperience_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuideExperienceMedia" (
    "id" TEXT NOT NULL,
    "experienceId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "type" "MediaType" NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "GuideExperienceMedia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChefCourseMedia" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "type" "MediaType" NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ChefCourseMedia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GuideExperience_guideId_idx" ON "GuideExperience"("guideId");

-- CreateIndex
CREATE INDEX "GuideExperienceMedia_experienceId_idx" ON "GuideExperienceMedia"("experienceId");

-- CreateIndex
CREATE INDEX "ChefCourseMedia_courseId_idx" ON "ChefCourseMedia"("courseId");
