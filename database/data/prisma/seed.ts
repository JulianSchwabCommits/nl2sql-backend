import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as fs from 'fs';
import * as path from 'path';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const startTime = Date.now();
  
  // Check if database is already seeded
  const existingFoodCount = await prisma.food.count();
  if (existingFoodCount > 0) {
    console.log(`Database already seeded (${existingFoodCount} foods found). Skipping...`);
    return;
  }

  const filePath = path.join(
    __dirname,
    '../FoodData_Central_foundation_food_json_2026-04-30.json',
  );
  console.log('📖 Loading food data...');
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  const foods = raw.FoundationFoods.filter((f: any) => f != null);

  console.log(`🌱 Seeding ${foods.length} foods with batch operations...`);

  // Collect all unique categories
  const categoryMap = new Map<string, { code?: string; description: string }>();
  for (const f of foods) {
    if (f.foodCategory?.description) {
      const desc = f.foodCategory.description;
      if (!categoryMap.has(desc)) {
        categoryMap.set(desc, {
          code: f.foodCategory.code ?? null,
          description: desc,
        });
      }
    }
  }

  // Batch insert categories
  await prisma.foodCategory.createMany({
    data: Array.from(categoryMap.values()),
    skipDuplicates: true,
  });
  console.log(`✅ Seeded ${categoryMap.size} categories`);

  // Get category IDs for later use
  const categories = await prisma.foodCategory.findMany();
  const categoryIdMap = new Map(categories.map(c => [c.description, c.id]));

  // Collect all unique nutrients
  const nutrientMap = new Map<number, any>();
  for (const f of foods) {
    for (const fn of f.foodNutrients || []) {
      const n = fn.nutrient;
      if (n && !nutrientMap.has(n.id)) {
        nutrientMap.set(n.id, n);
      }
    }
  }

  // Batch insert nutrients
  await prisma.nutrient.createMany({
    data: Array.from(nutrientMap.values()).map(n => ({
      id: n.id,
      number: String(n.number),
      name: n.name,
      unitName: n.unitName,
      rank: n.rank ?? null,
    })),
    skipDuplicates: true,
  });
  console.log(`✅ Seeded ${nutrientMap.size} nutrients`);

  // Collect all unique measure units
  const unitMap = new Map<number, any>();
  for (const f of foods) {
    for (const p of f.foodPortions || []) {
      const u = p.measureUnit;
      if (u && !unitMap.has(u.id)) {
        unitMap.set(u.id, u);
      }
    }
  }

  // Batch insert measure units
  if (unitMap.size > 0) {
    await prisma.measureUnit.createMany({
      data: Array.from(unitMap.values()).map(u => ({
        id: u.id,
        name: u.name,
        abbreviation: u.abbreviation,
      })),
      skipDuplicates: true,
    });
    console.log(`✅ Seeded ${unitMap.size} measure units`);
  }

  // Batch insert foods
  const foodData = foods.map((f: any) => ({
    fdcId: f.fdcId,
    description: f.description,
    foodClass: f.foodClass ?? null,
    dataType: f.dataType ?? null,
    publicationDate: f.publicationDate ?? null,
    ndbNumber: f.ndbNumber ?? null,
    isHistoricalReference: f.isHistoricalReference ?? false,
    categoryId: f.foodCategory?.description ? categoryIdMap.get(f.foodCategory.description) ?? null : null,
  }));

  await prisma.food.createMany({
    data: foodData,
    skipDuplicates: true,
  });
  console.log(`✅ Seeded ${foods.length} foods`);

  // Get food IDs for relationships
  const createdFoods = await prisma.food.findMany();
  const foodIdMap = new Map(createdFoods.map(f => [f.fdcId, f.id]));

  // Prepare batch data for related tables
  const foodNutrients: any[] = [];
  const foodPortions: any[] = [];
  const inputFoods: any[] = [];
  const nutrientConversionFactors: any[] = [];
  const foodAttributes: any[] = [];

  for (const f of foods) {
    const foodId = foodIdMap.get(f.fdcId);
    if (!foodId) continue;

    // Collect food nutrients
    for (const fn of f.foodNutrients || []) {
      const deriv = fn.foodNutrientDerivation;
      foodNutrients.push({
        id: fn.id,
        foodId,
        nutrientId: fn.nutrient.id,
        amount: fn.amount ?? null,
        median: fn.median ?? null,
        min: fn.min ?? null,
        max: fn.max ?? null,
        dataPoints: fn.dataPoints ?? null,
        derivationCode: deriv?.code ?? null,
        derivationDescription: deriv?.description ?? null,
        sourceCode: deriv?.foodNutrientSource?.code ?? null,
        sourceDescription: deriv?.foodNutrientSource?.description ?? null,
      });
    }

    // Collect food portions
    for (const p of f.foodPortions || []) {
      foodPortions.push({
        id: p.id,
        foodId,
        measureUnitId: p.measureUnit?.id ?? null,
        amount: p.amount ?? null,
        gramWeight: p.gramWeight ?? null,
        modifier: p.modifier ?? null,
        sequenceNumber: p.sequenceNumber ?? null,
        minYearAcquired: p.minYearAcquired ?? null,
      });
    }

    // Collect input foods
    for (const inp of f.inputFoods || []) {
      inputFoods.push({
        id: inp.id,
        foodId,
        foodDescription: inp.foodDescription ?? null,
        inputFoodFdcId: inp.inputFood?.fdcId ?? null,
        inputFoodDesc: inp.inputFood?.description ?? null,
        inputFoodCategory: inp.inputFood?.foodCategory?.description ?? null,
      });
    }

    // Collect nutrient conversion factors
    for (const ncf of f.nutrientConversionFactors || []) {
      nutrientConversionFactors.push({
        foodId,
        type: ncf.type,
        proteinValue: ncf.proteinValue ?? null,
        fatValue: ncf.fatValue ?? null,
        carbohydrateValue: ncf.carbohydrateValue ?? null,
        value: ncf.value ?? null,
      });
    }

    // Collect food attributes
    for (const attr of f.foodAttributes || []) {
      foodAttributes.push({
        foodId,
        name: attr.name ?? null,
        value: typeof attr.value === 'string' ? attr.value : (JSON.stringify(attr.value) ?? null),
      });
    }
  }

  // Batch insert all related data
  if (foodNutrients.length > 0) {
    console.log(`📊 Seeding ${foodNutrients.length} food nutrients...`);
    // Insert in chunks of 5000 to avoid memory issues
    for (let i = 0; i < foodNutrients.length; i += 5000) {
      await prisma.foodNutrient.createMany({
        data: foodNutrients.slice(i, i + 5000),
        skipDuplicates: true,
      });
      if (i + 5000 < foodNutrients.length) {
        console.log(`  Progress: ${i + 5000}/${foodNutrients.length}`);
      }
    }
    console.log(`✅ Seeded ${foodNutrients.length} food nutrients`);
  }

  if (foodPortions.length > 0) {
    await prisma.foodPortion.createMany({
      data: foodPortions,
      skipDuplicates: true,
    });
    console.log(`✅ Seeded ${foodPortions.length} food portions`);
  }

  if (inputFoods.length > 0) {
    await prisma.inputFood.createMany({
      data: inputFoods,
      skipDuplicates: true,
    });
    console.log(`✅ Seeded ${inputFoods.length} input foods`);
  }

  if (nutrientConversionFactors.length > 0) {
    await prisma.nutrientConversionFactor.createMany({
      data: nutrientConversionFactors,
      skipDuplicates: true,
    });
    console.log(`✅ Seeded ${nutrientConversionFactors.length} nutrient conversion factors`);
  }

  if (foodAttributes.length > 0) {
    await prisma.foodAttribute.createMany({
      data: foodAttributes,
      skipDuplicates: true,
    });
    console.log(`✅ Seeded ${foodAttributes.length} food attributes`);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`\n🎉 SUCCESS! Database seeding completed in ${elapsed} seconds`);
  console.log(`📈 Summary:`);
  console.log(`   - ${categoryMap.size} categories`);
  console.log(`   - ${nutrientMap.size} nutrients`);
  console.log(`   - ${unitMap.size} measure units`);
  console.log(`   - ${foods.length} foods`);
  console.log(`   - ${foodNutrients.length} food-nutrient relationships`);
  console.log(`   - ${foodPortions.length} food portions`);
  console.log(`\n✨ Your production database is ready!`);
}

main()
  .catch((e) => {
    console.error('❌ SEEDING FAILED:');
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
