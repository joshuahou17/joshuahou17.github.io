# Calendar Peek Landing Site

A modern, production-ready landing page for the Calendar Peek Chrome extension, featuring Apple-like minimalism and Google OAuth compliance.

## 🚀 Features

- **Modern Design**: Clean, Apple-inspired minimalist design
- **Google OAuth Ready**: Compliant with 2025 Google OAuth requirements
- **Fully Responsive**: Optimized for all devices and screen sizes
- **Accessibility**: WCAG 2.1 AA compliant with keyboard navigation
- **Performance**: Optimized for fast loading and smooth animations
- **SEO Ready**: Proper meta tags, Open Graph, and structured data

## 📁 Project Structure

```
calendar-peek/
├── index.html              # Main landing page
├── privacy.html            # Privacy policy (OAuth compliant)
├── terms.html              # Terms of service
├── css/
│   └── styles.css          # Modern Apple-like styling
├── js/
│   └── main.js             # Interactive functionality
├── assets/
│   ├── calendar-peek-logo.svg    # Brand logo
│   └── screenshots/
│       └── hero-mockup.png       # Hero image (placeholder)
└── setup.sh                # Setup script
```

## 🎨 Design Features

- **Typography**: Inter font family for modern readability
- **Color Scheme**: Apple-inspired blue gradient (#007AFF to #5856D6)
- **Animations**: Smooth scroll animations and hover effects
- **Layout**: CSS Grid and Flexbox for responsive design
- **Shadows**: Subtle depth with layered shadow system

## 🔧 Technical Features

- **Vanilla JavaScript**: No dependencies, fast loading
- **CSS Custom Properties**: Easy theming and maintenance
- **Intersection Observer**: Performance-optimized animations
- **Service Worker Ready**: PWA capabilities included
- **Analytics Ready**: Google Analytics integration prepared

## 📱 Responsive Breakpoints

- **Desktop**: 1200px+ (full layout)
- **Tablet**: 768px - 1199px (adjusted grid)
- **Mobile**: < 768px (stacked layout)

## 🚀 Quick Start

1. **Clone or download** the calendar-peek folder
2. **Run the setup script**:
   ```bash
   cd calendar-peek
   chmod +x setup.sh
   ./setup.sh
   ```
3. **Customize the content**:
   - Replace placeholder images
   - Update Google OAuth credentials
   - Modify copy and branding
4. **Deploy to your server**:
   - Upload to `https://joshhou.com/calendar-peek/`
   - Test all functionality

## ⚙️ Configuration

### Google OAuth Setup

1. **Update Client ID** in all HTML files:
   ```html
   <meta name="google-signin-client_id" content="YOUR_ACTUAL_CLIENT_ID.apps.googleusercontent.com">
   ```

2. **Update Extension ID** in index.html:
   ```html
   <a href="https://chrome.google.com/webstore/detail/calendar-peek/YOUR_ACTUAL_EXTENSION_ID">
   ```

### Customization

- **Colors**: Modify CSS custom properties in `css/styles.css`
- **Content**: Update text in HTML files
- **Images**: Replace placeholder images in `assets/`
- **Analytics**: Add Google Analytics tracking code

## 📋 Required Assets

### Hero Mockup Image
- **File**: `assets/screenshots/hero-mockup.png`
- **Size**: 600x400px (recommended)
- **Content**: Screenshot of Calendar Peek extension in action
- **Style**: Clean, modern interface showing calendar integration

### Logo
- **File**: `assets/calendar-peek-logo.svg`
- **Size**: 32x32px (scalable)
- **Style**: Modern calendar icon with gradient

## 🔒 Privacy & Compliance

### Google OAuth 2025 Compliance
- ✅ Minimum scope requests (`calendar.readonly`)
- ✅ Clear data usage disclosure
- ✅ Secure token management
- ✅ User consent documentation
- ✅ Revocation instructions

### Privacy Features
- ✅ Local data processing
- ✅ No unnecessary data collection
- ✅ Clear privacy policy
- ✅ User control over data
- ✅ GDPR compliance ready

## 🧪 Testing Checklist

- [ ] **Cross-browser compatibility** (Chrome, Firefox, Safari, Edge)
- [ ] **Mobile responsiveness** (iOS Safari, Android Chrome)
- [ ] **Accessibility** (screen readers, keyboard navigation)
- [ ] **Performance** (Lighthouse score > 90)
- [ ] **SEO** (meta tags, structured data)
- [ ] **Links and navigation** (all internal/external links work)
- [ ] **Forms and interactions** (if any)
- [ ] **Print styles** (print-friendly layout)

## 🚀 Deployment

### Static Hosting
- **Netlify**: Drag and drop the calendar-peek folder
- **Vercel**: Connect GitHub repository
- **GitHub Pages**: Push to gh-pages branch
- **Traditional hosting**: Upload via FTP/SFTP

### Domain Setup
- **Primary URL**: `https://joshhou.com/calendar-peek/`
- **SSL Certificate**: Required for OAuth compliance
- **Redirects**: Ensure all paths work correctly

## 📊 Analytics & Tracking

The site is prepared for analytics integration:

```javascript
// Google Analytics 4
gtag('config', 'GA_MEASUREMENT_ID');

// Custom events
gtag('event', 'cta_click', {
  button_text: 'Install Extension',
  location: 'hero'
});
```

## 🛠️ Development

### Local Development
1. **Serve locally**:
   ```bash
   python -m http.server 8000
   # or
   npx serve calendar-peek
   ```

2. **Open browser**: `http://localhost:8000`

### Build Process
- **Minification**: Use tools like Terser (JS) and CSSNano
- **Optimization**: Compress images, enable gzip
- **Caching**: Set appropriate cache headers

## 📞 Support

- **Email**: support@joshhou.com
- **GitHub**: https://github.com/joshhou/calendar-peek
- **Documentation**: This README

## 📄 License

This landing site is created for Calendar Peek extension. All rights reserved.

---

**Made with ❤️ for productivity** 