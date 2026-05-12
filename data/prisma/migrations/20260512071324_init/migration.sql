-- CreateTable
CREATE TABLE "Food" (
    "id" SERIAL NOT NULL,
    "fdcId" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "foodClass" TEXT,
    "dataType" TEXT,
    "publicationDate" TEXT,
    "ndbNumber" INTEGER,
    "isHistoricalReference" BOOLEAN NOT NULL DEFAULT false,
    "categoryId" INTEGER,

    CONSTRAINT "Food_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FoodCategory" (
    "id" SERIAL NOT NULL,
    "code" TEXT,
    "description" TEXT NOT NULL,

    CONSTRAINT "FoodCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Nutrient" (
    "id" INTEGER NOT NULL,
    "number" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unitName" TEXT NOT NULL,
    "rank" INTEGER,

    CONSTRAINT "Nutrient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FoodNutrient" (
    "id" INTEGER NOT NULL,
    "amount" DOUBLE PRECISION,
    "median" DOUBLE PRECISION,
    "min" DOUBLE PRECISION,
    "max" DOUBLE PRECISION,
    "dataPoints" INTEGER,
    "foodId" INTEGER NOT NULL,
    "nutrientId" INTEGER NOT NULL,
    "derivationCode" TEXT,
    "derivationDescription" TEXT,
    "sourceCode" TEXT,
    "sourceDescription" TEXT,

    CONSTRAINT "FoodNutrient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeasureUnit" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "abbreviation" TEXT NOT NULL,

    CONSTRAINT "MeasureUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FoodPortion" (
    "id" INTEGER NOT NULL,
    "foodId" INTEGER NOT NULL,
    "measureUnitId" INTEGER,
    "amount" DOUBLE PRECISION,
    "gramWeight" DOUBLE PRECISION,
    "modifier" TEXT,
    "sequenceNumber" INTEGER,
    "minYearAcquired" INTEGER,

    CONSTRAINT "FoodPortion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InputFood" (
    "id" INTEGER NOT NULL,
    "foodId" INTEGER NOT NULL,
    "foodDescription" TEXT,
    "inputFoodFdcId" INTEGER,
    "inputFoodDesc" TEXT,
    "inputFoodCategory" TEXT,

    CONSTRAINT "InputFood_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NutrientConversionFactor" (
    "id" SERIAL NOT NULL,
    "foodId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "proteinValue" DOUBLE PRECISION,
    "fatValue" DOUBLE PRECISION,
    "carbohydrateValue" DOUBLE PRECISION,
    "value" DOUBLE PRECISION,

    CONSTRAINT "NutrientConversionFactor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FoodAttribute" (
    "id" SERIAL NOT NULL,
    "foodId" INTEGER NOT NULL,
    "name" TEXT,
    "value" TEXT,

    CONSTRAINT "FoodAttribute_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Food_fdcId_key" ON "Food"("fdcId");

-- CreateIndex
CREATE INDEX "Food_categoryId_idx" ON "Food"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "FoodCategory_code_key" ON "FoodCategory"("code");

-- CreateIndex
CREATE UNIQUE INDEX "FoodCategory_description_key" ON "FoodCategory"("description");

-- CreateIndex
CREATE UNIQUE INDEX "Nutrient_number_key" ON "Nutrient"("number");

-- CreateIndex
CREATE INDEX "FoodNutrient_foodId_idx" ON "FoodNutrient"("foodId");

-- CreateIndex
CREATE INDEX "FoodNutrient_nutrientId_idx" ON "FoodNutrient"("nutrientId");

-- CreateIndex
CREATE INDEX "FoodPortion_foodId_idx" ON "FoodPortion"("foodId");

-- CreateIndex
CREATE INDEX "InputFood_foodId_idx" ON "InputFood"("foodId");

-- CreateIndex
CREATE INDEX "NutrientConversionFactor_foodId_idx" ON "NutrientConversionFactor"("foodId");

-- CreateIndex
CREATE INDEX "FoodAttribute_foodId_idx" ON "FoodAttribute"("foodId");

-- AddForeignKey
ALTER TABLE "Food" ADD CONSTRAINT "Food_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "FoodCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoodNutrient" ADD CONSTRAINT "FoodNutrient_foodId_fkey" FOREIGN KEY ("foodId") REFERENCES "Food"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoodNutrient" ADD CONSTRAINT "FoodNutrient_nutrientId_fkey" FOREIGN KEY ("nutrientId") REFERENCES "Nutrient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoodPortion" ADD CONSTRAINT "FoodPortion_foodId_fkey" FOREIGN KEY ("foodId") REFERENCES "Food"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoodPortion" ADD CONSTRAINT "FoodPortion_measureUnitId_fkey" FOREIGN KEY ("measureUnitId") REFERENCES "MeasureUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InputFood" ADD CONSTRAINT "InputFood_foodId_fkey" FOREIGN KEY ("foodId") REFERENCES "Food"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NutrientConversionFactor" ADD CONSTRAINT "NutrientConversionFactor_foodId_fkey" FOREIGN KEY ("foodId") REFERENCES "Food"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoodAttribute" ADD CONSTRAINT "FoodAttribute_foodId_fkey" FOREIGN KEY ("foodId") REFERENCES "Food"("id") ON DELETE CASCADE ON UPDATE CASCADE;
