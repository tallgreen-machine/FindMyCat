#!/bin/bash

# FindMyCat Quick Start Script
echo "🐱 FindMyCat - Quick Start"
echo "=========================="

# Check if we're in the right directory
if [ ! -f "README.md" ] || [ ! -d "backend" ] || [ ! -d "frontend" ]; then
    echo "❌ Please run this script from the FindMyCat project root directory"
    exit 1
fi

# Function to check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check dependencies
echo "🔍 Checking dependencies..."

if ! command_exists node; then
    echo "❌ Node.js is not installed. Please install Node.js 16+ from https://nodejs.org/"
    exit 1
fi

if ! command_exists npm; then
    echo "❌ npm is not installed. Please install npm"
    exit 1
fi

if ! command_exists python3; then
    echo "❌ Python 3 is not installed. Please install Python 3.7+"
    exit 1
fi

echo "✅ All dependencies found"

# Install backend dependencies
echo "📦 Installing backend dependencies..."
cd backend
if [ ! -d "node_modules" ]; then
    npm install
    if [ $? -ne 0 ]; then
        echo "❌ Failed to install backend dependencies"
        exit 1
    fi
fi
cd ..

# Install frontend dependencies
echo "📦 Installing frontend dependencies..."
cd frontend
if [ ! -d "node_modules" ]; then
    npm install
    if [ $? -ne 0 ]; then
        echo "❌ Failed to install frontend dependencies"
        exit 1
    fi
fi
cd ..

# Install Mac client dependencies
echo "📦 Installing Mac client dependencies..."
cd mac-client
if ! pip3 show requests > /dev/null 2>&1; then
    pip3 install -r requirements.txt
    if [ $? -ne 0 ]; then
        echo "⚠️  Failed to install Mac client dependencies. You may need to install them manually:"
        echo "   pip3 install requests"
    fi
fi
cd ..

echo ""
echo "✅ Installation complete!"
echo ""
echo "🚀 To start the FindMyCat system:"
echo ""
echo "1. Start the backend (in one terminal):"
echo "   cd backend && npm run dev"
echo ""
echo "2. Start the frontend (in another terminal):"
echo "   cd frontend && npm start"
echo ""
echo "3. On your Mac, start the client (in a third terminal):"
echo "   cd mac-client && python3 findmycat_client.py"
echo ""
echo "4. Open your browser to:"
echo "   http://localhost:3000"
echo ""
echo "💡 To test with sample data (optional):"
echo "   python3 test_client.py"
echo ""
echo "📚 For more information, see README.md"