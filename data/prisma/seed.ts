import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as fs from 'fs';
import * as path from 'path';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const filePath = path.join(
    __dirname,
    '../FoodData_Central_foundation_food_json_2026-04-30.json',
  );
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  const foods = raw.FoundationFoods.filter((f: any) => f != null);

  console.log(`Seeding ${foods.length} foods...`);

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

  for (const cat of categoryMap.values()) {
    await prisma.foodCategory.upsert({
      where: { description: cat.description },
      update: {},
      create: { code: cat.code, description: cat.description },
    });
  }
  console.log(`Seeded ${categoryMap.size} categories`);

  const nutrientMap = new Map<number, any>();
  for (const f of foods) {
    for (const fn of f.foodNutrients || []) {
      const n = fn.nutrient;
      if (n && !nutrientMap.has(n.id)) {
        nutrientMap.set(n.id, n);
      }
    }
  }

  for (const n of nutrientMap.values()) {
    await prisma.nutrient.upsert({
      where: { id: n.id },
      update: {},
      create: {
        id: n.id,
        number: String(n.number),
        name: n.name,
        unitName: n.unitName,
        rank: n.rank ?? null,
      },
    });
  }
  console.log(`Seeded ${nutrientMap.size} nutrients`);

  const unitMap = new Map<number, any>();
  for (const f of foods) {
    for (const p of f.foodPortions || []) {
      const u = p.measureUnit;
      if (u && !unitMap.has(u.id)) {
        unitMap.set(u.id, u);
      }
    }
  }

  for (const u of unitMap.values()) {
    await prisma.measureUnit.upsert({
      where: { id: u.id },
      update: {},
      create: {
        id: u.id,
        name: u.name,
        abbreviation: u.abbreviation,
      },
    });
  }
  console.log(`Seeded ${unitMap.size} measure units`);

  for (let i = 0; i < foods.length; i++) {
    const f = foods[i];

    let categoryId: number | null = null;
    if (f.foodCategory?.description) {
      const cat = await prisma.foodCategory.findUnique({
        where: { description: f.foodCategory.description },
      });
      categoryId = cat?.id ?? null;
    }

    const food = await prisma.food.upsert({
      where: { fdcId: f.fdcId },
      update: {},
      create: {
        fdcId: f.fdcId,
        description: f.description,
        foodClass: f.foodClass ?? null,
        dataType: f.dataType ?? null,
        publicationDate: f.publicationDate ?? null,
        ndbNumber: f.ndbNumber ?? null,
        isHistoricalReference: f.isHistoricalReference ?? false,
        categoryId,
      },
    });

    for (const fn of f.foodNutrients || []) {
      const deriv = fn.foodNutrientDerivation;
      await prisma.foodNutrient.upsert({
        where: { id: fn.id },
        update: {},
        create: {
          id: fn.id,
          foodId: food.id,
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
        },
      });
    }

    for (const p of f.foodPortions || []) {
      await prisma.foodPortion.upsert({
        where: { id: p.id },
        update: {},
        create: {
          id: p.id,
          foodId: food.id,
          measureUnitId: p.measureUnit?.id ?? null,
          amount: p.amount ?? null,
          gramWeight: p.gramWeight ?? null,
          modifier: p.modifier ?? null,
          sequenceNumber: p.sequenceNumber ?? null,
          minYearAcquired: p.minYearAcquired ?? null,
        },
      });
    }

    for (const inp of f.inputFoods || []) {
      await prisma.inputFood.upsert({
        where: { id: inp.id },
        update: {},
        create: {
          id: inp.id,
          foodId: food.id,
          foodDescription: inp.foodDescription ?? null,
          inputFoodFdcId: inp.inputFood?.fdcId ?? null,
          inputFoodDesc: inp.inputFood?.description ?? null,
          inputFoodCategory: inp.inputFood?.foodCategory?.description ?? null,
        },
      });
    }

    for (const ncf of f.nutrientConversionFactors || []) {
      await prisma.nutrientConversionFactor.create({
        data: {
          foodId: food.id,
          type: ncf.type,
          proteinValue: ncf.proteinValue ?? null,
          fatValue: ncf.fatValue ?? null,
          carbohydrateValue: ncf.carbohydrateValue ?? null,
          value: ncf.value ?? null,
        },
      });
    }

    for (const attr of f.foodAttributes || []) {
      await prisma.foodAttribute.create({
        data: {
          foodId: food.id,
          name: attr.name ?? null,
          value:
            typeof attr.value === 'string'
              ? attr.value
              : (JSON.stringify(attr.value) ?? null),
        },
      });
    }

    if ((i + 1) % 50 === 0) {
      console.log(`  Seeded ${i + 1}/${foods.length} foods`);
    }
  }

  console.log(`Done! Seeded ${foods.length} foods.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
