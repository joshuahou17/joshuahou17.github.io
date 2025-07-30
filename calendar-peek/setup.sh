#!/bin/bash

# Calendar Peek Landing Site Setup Script
# This script creates the folder structure and provides deployment instructions

echo "🗓️  Setting up Calendar Peek Landing Site..."

# Create folder structure
echo "📁 Creating folder structure..."
mkdir -p calendar-peek/css
mkdir -p calendar-peek/js
mkdir -p calendar-peek/assets/screenshots

echo "✅ Folder structure created successfully!"

# Make the script executable
chmod +x setup.sh

echo ""
echo "🎉 Setup complete! Your Calendar Peek landing site is ready."
echo ""
echo "📋 Next steps:"
echo "1. Replace the placeholder hero mockup image:"
echo "   - Replace: calendar-peek/assets/screenshots/hero-mockup.png"
echo "   - With an actual screenshot of your extension (600x400px recommended)"
echo ""
echo "2. Update Google OAuth settings:"
echo "   - Replace 'YOUR_GOOGLE_CLIENT_ID' in all HTML files"
echo "   - Replace 'YOUR_EXTENSION_ID' in index.html"
echo ""
echo "3. Deploy to your domain:"
echo "   - Upload the calendar-peek folder to your web server"
echo "   - Ensure it's accessible at: https://joshhou.com/calendar-peek"
echo ""
echo "4. Test the site:"
echo "   - Open https://joshhou.com/calendar-peek in your browser"
echo "   - Test all links and functionality"
echo "   - Verify mobile responsiveness"
echo ""
echo "📚 Files created:"
echo "   📄 calendar-peek/index.html - Main landing page"
echo "   📄 calendar-peek/privacy.html - Privacy policy"
echo "   📄 calendar-peek/terms.html - Terms of service"
echo "   🎨 calendar-peek/css/styles.css - Modern Apple-like styling"
echo "   ⚡ calendar-peek/js/main.js - Interactive functionality"
echo "   🏷️  calendar-peek/assets/calendar-peek-logo.svg - Brand logo"
echo "   📸 calendar-peek/assets/screenshots/hero-mockup.png - Placeholder image"
echo ""
echo "🚀 Ready to launch! 🚀" 