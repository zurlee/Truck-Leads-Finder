let map;
let markers = [];
let geocoder;
let allData = [];

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
