# Peek Landing Site

A dark, sophisticated landing page for the Peek Chrome extension - a tool that instantly exports available calendar dates to email.

## 🚀 Features

- **Dark, Minimalist Design**: Sophisticated black background with white text
- **Perfect Centering**: Logo and text perfectly centered on screen
- **Scroll-Based Navigation**: Navigation appears when scrolling up, disappears when scrolling down
- **Space Grotesk Font**: Modern, geometric typography for a contemporary feel
- **Responsive Design**: Works perfectly on all devices
- **Google OAuth Ready**: Compliant with Google's 2025 OAuth requirements

## 🎨 Design

- **Color Scheme**: Pure black background (#000000) with white text
- **Typography**: Space Grotesk font family for modern, tech-forward appearance
- **Layout**: Ultra-clean, minimal design focusing on the product name
- **Navigation**: Centered at top with glass morphism effect
- **Logo**: Minimalist calendar icon with checkmark

## 🛠 Technical Features

- **Vanilla JavaScript**: No frameworks, pure performance
- **CSS Custom Properties**: Easy theming and maintenance
- **Smooth Animations**: Subtle transitions and hover effects
- **Accessibility**: WCAG 2.1 AA compliant
- **SEO Optimized**: Meta tags, Open Graph, structured data
- **Mobile Responsive**: Perfect on all screen sizes

## 📁 Structure

```
/calendar-peek
├─ index.html          # Main landing page
├─ privacy.html        # Privacy policy
├─ terms.html          # Terms of service
├─ css/
│   └─ styles.css      # All styling
├─ js/
│   └─ main.js         # Interactive functionality
└─ assets/
    ├─ calendar-peek-logo.svg
    └─ screenshots/hero-mockup.png
```

## 🚀 Quick Start

1. **Deploy to your domain**: Upload all files to `/calendar-peek/` on your web server
2. **Update Google Client ID**: Replace `YOUR_GOOGLE_CLIENT_ID` in `index.html`
3. **Update Extension ID**: Replace `YOUR_EXTENSION_ID` in the install button
4. **Add Screenshots**: Replace placeholder with actual extension screenshots

## ⚙️ Configuration

### Google OAuth Setup
```html
<meta name="google-signin-client_id" content="YOUR_ACTUAL_CLIENT_ID.apps.googleusercontent.com">
```

### Extension Store Link
```html
<a href="https://chrome.google.com/webstore/detail/peek/YOUR_ACTUAL_EXTENSION_ID">
```

## 🧪 Testing Checklist

- [ ] Navigation appears/disappears on scroll
- [ ] Smooth scrolling to sections works
- [ ] All links are functional
- [ ] Responsive on mobile devices
- [ ] Google OAuth compliance verified
- [ ] Accessibility standards met
- [ ] Loading performance optimized

## 📈 Analytics

The site is ready for Google Analytics integration. Add your tracking code to the `<head>` section.

## 🔧 Development

To modify the design:
1. Edit `css/styles.css` for styling changes
2. Edit `js/main.js` for functionality changes
3. Edit `index.html` for content changes

## 📞 Support

For support or questions about Peek, contact: support@joshhou.com

## 📄 License

This landing site is part of the Peek project.

---

Made with ❤️ for calendar productivity 