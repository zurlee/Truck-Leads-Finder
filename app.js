let map;
let markers = [];
let geocoder;
let allData = [];
let zonesData = {};
let zoneOverlays = [];
let zipCache = {};
let activeZone = null;

// Initialize Google Map
function initMap() {
    const defaultCenter = { lat: 39.8283, lng: -98.5795 };

    map = new google.maps.Map(document.getElementById('map'), {
        zoom: 4,
        center: defaultCenter,
        mapTypeId: 'roadmap'
    });

    geocoder = new google.maps.Geocoder();
    updateStatus('Map initialized. Ready to load data.');
    loadZones();
}

// Update status message
function updateStatus(message, isError = false) {
    const statusDiv = document.getElementById('status');
    statusDiv.textContent = message;
    statusDiv.className = 'status ' + (isError ? 'error' : 'success');
}

// Fetch data from Google Sheets
async function fetchSheetData() {
    try {
        updateStatus('Fetching data from Google Sheets...');

        const url = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SHEET_ID}/values/${CONFIG.SHEET_RANGE}?key=${CONFIG.API_KEY}`;

        const response = await fetch(url);

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error?.message || `Failed to fetch data: ${response.statusText}`);
        }

        const data = await response.json();

        if (!data.values || data.values.length === 0) {
            throw new Error('No data found in spreadsheet');
        }

        return data.values;
    } catch (error) {
        updateStatus(`Error: ${error.message}`, true);
        console.error('Error fetching sheet data:', error);
        return null;
    }
}

// Parse sheet data (assumes first row is headers)
function parseSheetData(rawData) {
    const headers = rawData[0];
    const rows = rawData.slice(1);

    return rows.map(row => {
        const obj = {};
        headers.forEach((header, index) => {
            obj[header] = row[index] || '';
        });
        return obj;
    });
}

// Geocode an address
function geocodeAddress(address) {
    return new Promise((resolve, reject) => {
        geocoder.geocode({ address: address }, (results, status) => {
            if (status === 'OK') {
                resolve(results[0].geometry.location);
            } else {
                reject(new Error(`Geocoding failed: ${status}`));
            }
        });
    });
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Create marker with info window
function createMarker(location, data) {
    const marker = new google.maps.Marker({
        position: location,
        map: map,
        title: data.name || data.address || 'Location'
    });

    const infoContent = createInfoWindowContent(data);

    const infoWindow = new google.maps.InfoWindow({
        content: infoContent
    });

    marker.addListener('click', () => {
        markers.forEach(m => {
            if (m.infoWindow) {
                m.infoWindow.close();
            }
        });
        infoWindow.open(map, marker);
    });

    marker.infoWindow = infoWindow;
    markers.push(marker);

    return marker;
}

// Create HTML content for info window
function createInfoWindowContent(data) {
    let content = '<div class="info-window">';

    for (const [key, value] of Object.entries(data)) {
        if (value) {
            const keyLower = key.toLowerCase();
            const escapedKey = escapeHtml(key);
            const escapedValue = escapeHtml(value);
            let displayValue = escapedValue;

            if (keyLower.includes('phone') || keyLower.includes('cell') || keyLower.includes('fax')) {
                displayValue = `<a href="tel:${escapedValue}">${escapedValue}</a>`;
            }
            else if (keyLower.includes('email') || keyLower.includes('mail')) {
                displayValue = `<a href="mailto:${escapedValue}">${escapedValue}</a>`;
            }
            else if (keyLower === 'cab report') {
                let url = value;
                if (data.dot || data.DOT || data.Dot) {
                    const dotValue = data.dot || data.DOT || data.Dot;
                    url = `${value}${dotValue}`;
                }
                if (!url.startsWith('http://') && !url.startsWith('https://')) {
                    url = 'https://' + url;
                }
                displayValue = `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapedKey}</a>`;
            }
            else if (keyLower === 'vitals report') {
                let url = value;
                if (data.dot || data.DOT || data.Dot) {
                    const dotValue = data.dot || data.DOT || data.Dot;
                    url = `${value}${dotValue}`;
                }
                if (!url.startsWith('http://') && !url.startsWith('https://')) {
                    url = 'https://' + url;
                }
                displayValue = `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapedKey}</a>`;
            }

            content += `<p><strong>${escapedKey}:</strong> ${displayValue}</p>`;
        }
    }

    content += '</div>';
    return content;
}

// Clear all markers from map
function clearMarkers() {
    markers.forEach(marker => {
        marker.setMap(null);
    });
    markers = [];
}

// Process and display data
async function processAndDisplayData() {
    clearMarkers();

    const rawData = await fetchSheetData();

    if (!rawData) {
        return;
    }

    const parsedData = parseSheetData(rawData);
    allData = parsedData;

    updateStatus(`Processing ${parsedData.length} records...`);

    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < parsedData.length; i++) {
        const record = parsedData[i];

        const lat = parseFloat(record.latitude || record.Latitude);
        const lng = parseFloat(record.longitude || record.Longitude);

        if (isNaN(lat) || isNaN(lng)) {
            console.warn(`Skipping record ${i + 1}: No valid latitude/longitude`);
            errorCount++;
            continue;
        }

        try {
            const location = { lat: lat, lng: lng };
            createMarker(location, record);
            successCount++;

            updateStatus(`Processed ${successCount + errorCount} of ${parsedData.length} records...`);
        } catch (error) {
            console.error(`Error creating marker for record ${i + 1}:`, error);
            errorCount++;
        }
    }

    if (markers.length > 0) {
        const bounds = new google.maps.LatLngBounds();
        markers.forEach(marker => {
            bounds.extend(marker.getPosition());
        });
        map.fitBounds(bounds);
    }

    updateStatus(`Complete! ${successCount} locations displayed, ${errorCount} failed.`, errorCount > 0);
}

// Search function
function searchCompanies(searchTerm) {
    if (!searchTerm || searchTerm.trim() === '') {
        updateStatus('Please enter a company name or DOT number', true);
        return;
    }

    const term = searchTerm.toLowerCase().trim();
    let bestMatch = null;
    let bestMatchIndex = -1;

    markers.forEach(m => {
        if (m.infoWindow) {
            m.infoWindow.close();
        }
    });

    allData.forEach((data, index) => {
        const companyName = (data.name || data.Name || data.company || data.Company || '').toLowerCase();
        const dotNumber = (data.dot || data.DOT || data.Dot || '').toLowerCase();

        if (companyName === term || dotNumber === term) {
            bestMatch = data;
            bestMatchIndex = index;
            return;
        }

        if (!bestMatch && (companyName.includes(term) || dotNumber.includes(term))) {
            bestMatch = data;
            bestMatchIndex = index;
        }
    });

    if (bestMatch && bestMatchIndex !== -1) {
        const marker = markers[bestMatchIndex];

        map.setCenter(marker.getPosition());
        map.setZoom(15);

        if (marker.infoWindow) {
            marker.infoWindow.open(map, marker);
        }

        const companyName = bestMatch.name || bestMatch.Name || bestMatch.company || bestMatch.Company || 'Company';
        updateStatus(`Found: ${companyName}`);
    } else {
        updateStatus(`No match found for "${escapeHtml(searchTerm)}"`, true);
    }
}

// Zone colors for each zone
const ZONE_COLORS = [
    '#e74c3c', // red
    '#3498db', // blue
    '#2ecc71', // green
    '#f39c12', // orange
    '#9b59b6', // purple
    '#1abc9c', // teal
    '#e67e22', // dark orange
    '#34495e'  // dark blue-grey
];

// Format zone key into a readable name
function formatZoneName(key) {
    return key
        .replace(/^zone_\d+_/, '')
        .replace(/_/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase());
}

// Load zones from zones.json and create buttons
async function loadZones() {
    try {
        const response = await fetch('zones.json');
        if (!response.ok) return;
        zonesData = await response.json();

        const container = document.getElementById('zone-buttons');
        const clearBtn = document.getElementById('clearZonesBtn');
        const keys = Object.keys(zonesData);

        if (keys.length === 0) return;

        keys.forEach((key, index) => {
            const btn = document.createElement('button');
            btn.className = 'zone-btn';
            btn.textContent = formatZoneName(key);
            btn.style.backgroundColor = ZONE_COLORS[index % ZONE_COLORS.length];
            btn.dataset.zone = key;
            btn.dataset.color = ZONE_COLORS[index % ZONE_COLORS.length];
            btn.addEventListener('click', () => toggleZone(key, btn));
            container.appendChild(btn);
        });

        clearBtn.style.display = 'inline-block';
        clearBtn.addEventListener('click', clearAllZones);
    } catch (err) {
        console.warn('Could not load zones.json:', err);
    }
}

// Geocode a single ZIP code with caching
function geocodeZip(zip) {
    if (zipCache[zip]) {
        return Promise.resolve(zipCache[zip]);
    }
    return new Promise((resolve, reject) => {
        geocoder.geocode({ address: zip, componentRestrictions: { country: 'US' } }, (results, status) => {
            if (status === 'OK' && results[0]) {
                const loc = results[0].geometry.location;
                const bounds = results[0].geometry.bounds || results[0].geometry.viewport;
                zipCache[zip] = { location: loc, bounds: bounds };
                resolve(zipCache[zip]);
            } else {
                reject(new Error(`Geocode failed for ${zip}: ${status}`));
            }
        });
    });
}

// Process ZIP codes in batches to avoid rate limiting
async function geocodeZipBatch(zips, batchSize = 10, delayMs = 200) {
    const results = [];
    for (let i = 0; i < zips.length; i += batchSize) {
        const batch = zips.slice(i, i + batchSize);
        const batchResults = await Promise.allSettled(batch.map(z => geocodeZip(z)));
        for (let j = 0; j < batchResults.length; j++) {
            if (batchResults[j].status === 'fulfilled') {
                results.push({ zip: batch[j], data: batchResults[j].value });
            }
        }
        if (i + batchSize < zips.length) {
            await new Promise(r => setTimeout(r, delayMs));
        }
    }
    return results;
}

// Clear zone overlays from the map
function clearZoneOverlays() {
    zoneOverlays.forEach(overlay => overlay.setMap(null));
    zoneOverlays = [];
}

// Toggle a zone on/off
async function toggleZone(zoneKey, btn) {
    // If this zone is already active, turn it off
    if (activeZone === zoneKey) {
        clearAllZones();
        return;
    }

    // Deactivate previous zone button
    document.querySelectorAll('.zone-btn.active').forEach(b => b.classList.remove('active'));
    clearZoneOverlays();

    activeZone = zoneKey;
    btn.classList.add('active');

    const zips = zonesData[zoneKey];
    const color = btn.dataset.color;

    updateStatus(`Loading zone: ${formatZoneName(zoneKey)} (${zips.length} ZIP codes)...`);

    const results = await geocodeZipBatch(zips);

    if (results.length === 0) {
        updateStatus('Could not geocode any ZIP codes for this zone.', true);
        return;
    }

    const bounds = new google.maps.LatLngBounds();

    results.forEach(({ zip, data }) => {
        const circle = new google.maps.Circle({
            strokeColor: color,
            strokeOpacity: 0.6,
            strokeWeight: 1,
            fillColor: color,
            fillOpacity: 0.25,
            map: map,
            center: data.location,
            radius: 3000 // ~3km radius per ZIP
        });
        zoneOverlays.push(circle);
        bounds.extend(data.location);
    });

    map.fitBounds(bounds);
    updateStatus(`Zone "${formatZoneName(zoneKey)}" highlighted (${results.length}/${zips.length} ZIP codes mapped).`);
}

// Clear all zone highlights
function clearAllZones() {
    clearZoneOverlays();
    activeZone = null;
    document.querySelectorAll('.zone-btn.active').forEach(b => b.classList.remove('active'));
    updateStatus('Zone highlights cleared.');
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
    const loadDataBtn = document.getElementById('loadDataBtn');
    const searchBox = document.getElementById('searchBox');
    const clearSearchBtn = document.getElementById('clearSearchBtn');

    loadDataBtn.addEventListener('click', () => {
        if (!CONFIG || !CONFIG.API_KEY || CONFIG.API_KEY === 'YOUR_GOOGLE_API_KEY') {
            updateStatus('Please configure your API key', true);
            return;
        }

        if (!CONFIG.SHEET_ID || CONFIG.SHEET_ID === 'YOUR_GOOGLE_SHEET_ID') {
            updateStatus('Please configure your Sheet ID', true);
            return;
        }

        processAndDisplayData();
    });

    searchBox.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            searchCompanies(e.target.value);
        }
    });

    clearSearchBtn.addEventListener('click', () => {
        searchBox.value = '';
        updateStatus('Search cleared');
    });
});
