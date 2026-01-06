# Truck Leads Finder - Data Visualizer

A simple web application that pulls data from Google Sheets, geocodes addresses, and displays them on an interactive Google Map with detailed popups.

## Features

- Fetches data from Google Sheets using the Sheets API
- Automatically geocodes addresses to map coordinates
- Displays markers on Google Maps
- Shows detailed information popups when clicking markers
- Responsive design for desktop and mobile

## Setup Instructions

### 1. Get Google API Key

You need a Google API key with both **Google Sheets API** and **Google Maps JavaScript API** enabled.

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the following APIs:
   - Google Sheets API
   - Google Maps JavaScript API
   - Geocoding API
4. Go to "Credentials" and create an API key
5. (Optional but recommended) Restrict your API key to only the APIs listed above and your domain

### 2. Prepare Your Google Sheet

1. Create a Google Sheet with your data
2. Make sure the first row contains column headers
3. Include a column with addresses (can be named "Address", "Location", etc.)
4. Make the sheet publicly readable:
   - Click "Share" in the top right
   - Change "General access" to "Anyone with the link"
   - Set permission to "Viewer"

**Example Sheet Structure:**

| Name | Address | Phone | Email | Notes |
|------|---------|-------|-------|-------|
| ABC Trucking | 123 Main St, New York, NY 10001 | 555-0100 | abc@example.com | Interested in fleet services |
| XYZ Logistics | 456 Oak Ave, Los Angeles, CA 90001 | 555-0200 | xyz@example.com | Looking for new trucks |

### 3. Get Your Sheet ID

Your Google Sheet URL looks like this:
```
https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz/edit
```

The Sheet ID is the long string between `/d/` and `/edit`:
```
1AbCdEfGhIjKlMnOpQrStUvWxYz
```

### 4. Configure the Application

1. Open `config.js`
2. Replace `YOUR_GOOGLE_API_KEY` with your Google API key
3. Replace `YOUR_GOOGLE_SHEET_ID` with your Sheet ID
4. Update `SHEET_RANGE` if needed (default is 'Sheet1')

```javascript
const CONFIG = {
    API_KEY: 'AIzaSyD...your-actual-api-key',
    SHEET_ID: '1AbCdEfGhIjKlMnOpQrStUvWxYz',
    SHEET_RANGE: 'Sheet1'
};
```

5. Open `index.html` and update the Google Maps script tag:
```html
<script src="https://maps.googleapis.com/maps/api/js?key=YOUR_ACTUAL_API_KEY&callback=initMap&libraries=places" async defer></script>
```
Replace `YOUR_API_KEY` with your actual Google API key.

### 5. Run the Application

Since this is a static HTML application, you can run it in several ways:

**Option 1: Simple HTTP Server (Python)**
```bash
# Python 3
python -m http.server 8000

# Then open http://localhost:8000 in your browser
```

**Option 2: Live Server (VS Code)**
- Install the "Live Server" extension in VS Code
- Right-click `index.html` and select "Open with Live Server"

**Option 3: Direct File Opening**
- Simply open `index.html` in your web browser
- Note: Some features may not work due to CORS restrictions

### 6. Use the Application

1. Open the application in your web browser
2. Click "Load Data from Google Sheets"
3. Wait for the data to load and markers to appear
4. Click on any marker to see the popup with detailed information

## Customization

### Change Map Style

Edit `app.js` in the `initMap()` function:

```javascript
map = new google.maps.Map(document.getElementById('map'), {
    zoom: 4,
    center: defaultCenter,
    mapTypeId: 'satellite' // or 'hybrid', 'terrain'
});
```

### Customize Info Window Content

Edit the `createInfoWindowContent()` function in `app.js` to customize what appears in the popup.

### Adjust Geocoding Rate

If you're hitting rate limits, increase the delay in `app.js`:

```javascript
// Change from 200ms to 500ms or higher
await new Promise(resolve => setTimeout(resolve, 500));
```

## Troubleshooting

### No markers appearing
- Check browser console for errors
- Verify your API key is correct and has the required APIs enabled
- Ensure your Google Sheet is publicly readable
- Verify addresses are valid and in a column with "address" or "location" in the header

### Geocoding errors
- Some addresses may fail to geocode if they're incomplete or invalid
- Check console for specific error messages
- Try using complete addresses with city, state, and ZIP

### API quota exceeded
- Google has daily quotas for API usage
- For the free tier, you get limited requests per day
- Consider upgrading to a paid plan if you need more

## File Structure

```
Truck-Leads-Finder/
├── index.html      # Main HTML file
├── app.js          # Application logic
├── config.js       # API configuration
├── styles.css      # Styling
└── README.md       # This file
```

## Security Notes

- Never commit `config.js` with real API keys to public repositories
- Add `config.js` to `.gitignore` if sharing code publicly
- Use API key restrictions in Google Cloud Console
- For production, consider using backend proxy to hide API keys

## License

MIT License - Feel free to use and modify as needed.
