#!/bin/bash
set -e

echo "🍎 Setting up Food Database..."

# Configuration
DATA_DIR="/app/data"
FOOD_DATA_FILE="FoodData_Central_foundation_food_json_2026-04-30.json"
FOOD_DATA_URL="https://fdc.nal.usda.gov/fdc-datasets/${FOOD_DATA_FILE}.zip"
FOOD_DATA_ZIP="${FOOD_DATA_FILE}.zip"

# Create data directory if it doesn't exist
mkdir -p "$DATA_DIR"
cd "$DATA_DIR"

# Download food data if it doesn't exist
if [ -f "$FOOD_DATA_FILE" ]; then
    echo "✅ Food data file already exists: $FOOD_DATA_FILE"
else
    echo "📥 Downloading USDA FoodData Central dataset..."
    wget -O "$FOOD_DATA_ZIP" "$FOOD_DATA_URL"
    
    echo "📦 Extracting food data..."
    unzip -o "$FOOD_DATA_ZIP"
    rm "$FOOD_DATA_ZIP"
    
    echo "✅ Food data downloaded successfully"
fi

# Verify file exists
if [ ! -f "$FOOD_DATA_FILE" ]; then
    echo "❌ Error: Food data file not found after download"
    exit 1
fi

echo "📊 File size: $(du -h $FOOD_DATA_FILE | cut -f1)"

# Run migrations
echo "🔄 Running database migrations..."
cd /app
npx prisma migrate deploy --schema=data/prisma/schema.prisma

# Seed the database
echo "🌱 Seeding database with food data..."
npx tsx data/prisma/seed.ts

echo "✅ Food database setup complete!"
