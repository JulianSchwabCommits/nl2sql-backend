#!/bin/sh
set -e

echo "Setting up Food Database..."


DATA_DIR="/app/database/data"
FOOD_DATA_FILE="FoodData_Central_foundation_food_json_2026-04-30.json"
FOOD_DATA_URL="https://fdc.nal.usda.gov/fdc-datasets/${FOOD_DATA_FILE}.zip"
FOOD_DATA_ZIP="${FOOD_DATA_FILE}.zip"

mkdir -p "$DATA_DIR"
cd "$DATA_DIR"


if [ -f "$FOOD_DATA_FILE" ]; then
    echo "Food data file already exists: $FOOD_DATA_FILE"
else
    echo "Downloading USDA FoodData Central dataset..."
    wget --header="User-Agent: Mozilla/5.0" -O "$FOOD_DATA_ZIP" "$FOOD_DATA_URL"

    echo "Extracting food data..."
    unzip -o "$FOOD_DATA_ZIP"
    rm "$FOOD_DATA_ZIP"

    echo "Food data downloaded successfully"
fi

if [ ! -f "$FOOD_DATA_FILE" ]; then
    echo "Error: Food data file not found after download"
    exit 1
fi

echo "File size: $(du -h $FOOD_DATA_FILE | cut -f1)"


cd /app/database
echo "Running database migrations..."
npx prisma migrate deploy

echo "Seeding database with food data..."
npx tsx data/prisma/seed.ts

echo "Food database setup complete!"
