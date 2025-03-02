// script.js - Frontend JavaScript for Clinical Trials App

// Global variables
let map;
let markers = [];
let currentTrials = [];

// Debug function to verify JavaScript is loading
console.log("Clinical Trials Finder JavaScript loaded");

// ========== Map Functions ==========

// Initialize Google Maps
function initMap() {
    console.log("Initializing Google Maps");

    // Create an empty map centered on the US
    map = new google.maps.Map(document.getElementById('map'), {
        zoom: 4,
        center: { lat: 39.8283, lng: -98.5795 }, // Center of the US
        mapTypeId: google.maps.MapTypeId.ROADMAP
    });
}

// Initialize a placeholder map (will be replaced with actual map integration)
function initMapPlaceholder() {
    const mapElement = document.getElementById('map');
    if (!mapElement) {
        console.error("Map element not found!");
        return;
    }

    mapElement.innerHTML = `
        <div style="display: flex; justify-content: center; align-items: center; height: 100%; 
            background-color: #f5f7fa; border-radius: 8px; border: 1px dashed #ccc;">
            <div style="text-align: center; padding: 20px;">
                <div style="font-size: 24px; margin-bottom: 10px;">📍</div>
                <div style="font-weight: bold; margin-bottom: 5px;">Map View</div>
                <div style="font-size: 14px; color: #666;">
                    (Trial locations will appear here)
                </div>
            </div>
        </div>
    `;
}

// Update map with trial locations
function updateMapWithLocations(trials) {
    console.log("Updating map with locations");

    // Clear existing markers
    markers.forEach(marker => marker.setMap(null));
    markers = [];

    // Create bounds to fit all markers
    const bounds = new google.maps.LatLngBounds();
    let hasValidLocations = false;

    // Process trials and add markers for each location
    trials.forEach(trial => {
        if (trial.locations && Array.isArray(trial.locations)) {
            trial.locations.forEach(location => {
                // Skip if missing coordinates
                if (!location.latitude || !location.longitude) {
                    return;
                }

                const position = {
                    lat: parseFloat(location.latitude),
                    lng: parseFloat(location.longitude)
                };

                // Skip invalid coordinates
                if (isNaN(position.lat) || isNaN(position.lng)) {
                    return;
                }

                hasValidLocations = true;

                // Create marker
                const marker = new google.maps.Marker({
                    position: position,
                    map: map,
                    title: location.facility || 'Clinical Trial Site'
                });

                // Create info window content
                const infoContent = `
                    <div class="info-window">
                        <h3>${trial.title || 'Unnamed Trial'}</h3>
                        <p><strong>Facility:</strong> ${location.facility || 'Not specified'}</p>
                        <p><strong>Address:</strong> ${location.city || ''}, ${location.state || ''} ${location.zip || ''}</p>
                        <button onclick="viewTrialDetails('${trial.id}')">View Details</button>
                    </div>
                `;

                // Create info window
                const infoWindow = new google.maps.InfoWindow({
                    content: infoContent
                });

                // Add click listener to marker
                marker.addListener('click', () => {
                    // Close all other info windows
                    markers.forEach(m => m.infoWindow.close());

                    // Open this info window
                    infoWindow.open(map, marker);
                });

                // Store the info window with the marker
                marker.infoWindow = infoWindow;

                // Add marker to array
                markers.push(marker);

                // Extend bounds to include this marker
                bounds.extend(position);
            });
        }
    });

    // Fit map to bounds if we have valid locations
    if (hasValidLocations) {
        map.fitBounds(bounds);

        // Don't zoom in too far on single markers
        const listener = google.maps.event.addListener(map, 'idle', () => {
            if (map.getZoom() > 16) {
                map.setZoom(16);
            }
            google.maps.event.removeListener(listener);
        });
    } else {
        // Show message if no locations
        document.getElementById('map').innerHTML = `
            <div style="display: flex; justify-content: center; align-items: center; height: 100%; 
                background-color: #f5f7fa; border-radius: 8px; border: 1px solid #ccc; padding: 15px;">
                <div style="text-align: center;">
                    <div style="font-weight: bold; margin-bottom: 5px;">No trial locations found</div>
                    <div style="font-size: 14px; color: #666;">
                        Try broadening your search criteria
                    </div>
                </div>
            </div>
        `;
    }
}

// ========== Trial Search Functions ==========

// Handle form submission
function handleSearchSubmit(event) {
    // Always prevent default form submission
    if (event) {
        event.preventDefault();
        console.log("Form submission prevented");
    }

    console.log("Search form submitted");

    // Get form values
    const ageInput = document.getElementById('age');
    const conditionInput = document.getElementById('condition');
    const locationInput = document.getElementById('location');
    const distanceInput = document.getElementById('distance');

    if (!ageInput || !conditionInput || !locationInput || !distanceInput) {
        console.error("One or more form inputs not found!");
        return;
    }

    const age = ageInput.value;
    const condition = conditionInput.value;
    const location = locationInput.value;
    const distance = distanceInput.value;

    console.log("Search parameters:", { age, condition, location, distance });

    // Show loading state
    const trialsList = document.getElementById('trials-list');
    if (trialsList) {
        trialsList.innerHTML = '<div class="loading">Searching for clinical trials...</div>';
    }

    // Show results section
    const resultsSection = document.getElementById('results-section');
    if (resultsSection) {
        resultsSection.classList.remove('hidden');
    }

    // Call the API
    fetchClinicalTrials(age, condition, location, distance);
}

// Fetch clinical trials from the backend API
async function fetchClinicalTrials(age, condition, location, distance) {
    console.log("Fetching clinical trials...");

    try {
        const response = await fetch('/api/search_trials', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                age: age,
                condition: condition,
                location: location,
                distance: distance
            })
        });

        console.log("API response received:", response.status);

        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }

        const data = await response.json();
        console.log("Parsed data:", data);

        if (data.status === 'success') {
            // Store the trials data
            currentTrials = data.trials;

            // Display the results
            displayTrials(data.trials);

            // Update the map
            updateMapWithLocations(data.trials);
        } else {
            // Handle API error
            const trialsList = document.getElementById('trials-list');
            if (trialsList) {
                trialsList.innerHTML =
                    `<div class="error">Error: ${data.error || 'Failed to retrieve clinical trials'}</div>`;
            }
        }
    } catch (error) {
        console.error('Error fetching clinical trials:', error);
        const trialsList = document.getElementById('trials-list');
        if (trialsList) {
            trialsList.innerHTML =
                `<div class="error">Error: ${error.message}</div>`;
        }
    }
}

// Display trials in the list
function displayTrials(trials) {
    console.log("Displaying trials:", trials.length);

    const trialsList = document.getElementById('trials-list');
    if (!trialsList) {
        console.error("Trials list element not found!");
        return;
    }

    if (trials.length === 0) {
        trialsList.innerHTML = '<div class="no-results">No clinical trials found matching your criteria.</div>';
        return;
    }

    let html = '<ul class="trials-list">';

    trials.forEach(trial => {
    const locations = trial.locations.map(loc => `${loc.city || 'Unknown'}, ${loc.state || 'Unknown'}`).join('; ');
    const contacts = trial.contacts.map(contact => `<p><strong>${contact.name}:</strong> ${contact.phone || ''} | ${contact.email || ''}</p>`).join('');
    const ageRange = `${trial.eligibility?.min_age || 'N/A'} - ${trial.eligibility?.max_age || 'N/A'}`;
    const criteria = trial.eligibility?.criteria || 'No criteria available.';

    html += `
        <li class="trial-item" data-trial-id="${trial.id}">
            <h3>${trial.title || 'Unnamed Trial'}</h3>
            <p><strong>Condition:</strong> ${trial.condition || 'Not specified'}</p>
            <p><strong>Phase:</strong> ${trial.phase || 'Not specified'}</p>
            <p><strong>Status:</strong> ${trial.status || 'Unknown'}</p>
            <p><strong>Age Range:</strong> ${ageRange}</p>
            <p><strong>Locations:</strong> ${locations}</p>
            <p><strong>Contacts:</strong> ${contacts}</p>
            <p><strong>Eligibility Criteria:</strong> ${criteria}</p>
            <button class="view-details-btn" onclick="viewTrialDetails('${trial.id}')">View Details</button>
        </li>
    `;
});

    html += '</ul>';
    trialsList.innerHTML = html;
}

// ========== Trial Details & Summary Functions ==========

// View trial details in modal
function viewTrialDetails(trialId) {
    console.log("Viewing trial details for:", trialId);

    const trial = currentTrials.find(t => t.id === trialId);

    if (!trial) {
        console.error('Trial not found:', trialId);
        return;
    }

    const modalTitle = document.getElementById('modal-trial-title');
    const modalDetails = document.getElementById('modal-trial-details');

    if (!modalTitle || !modalDetails) {
        console.error("Modal elements not found!");
        return;
    }

    modalTitle.textContent = trial.title || 'Trial Details';

    // Create eligibility criteria string
    const eligibilityCriteria = trial.eligibility?.criteria || 'Not specified';

    // Format the modal content
    modalDetails.innerHTML = `
        <div class="trial-detail-section">
            <h3>Description</h3>
            <p>${trial.description || 'No description available.'}</p>
        </div>
        
        <div class="trial-detail-section">
            <h3>Eligibility</h3>
            <p><strong>Gender:</strong> ${trial.eligibility?.gender || 'All'}</p>
            <p><strong>Age Range:</strong> ${trial.eligibility?.min_age || 'N/A'} to ${trial.eligibility?.max_age || 'N/A'}</p>
            <div class="criteria-box">
                <h4>Detailed Criteria:</h4>
                <p style="white-space: pre-line;">${eligibilityCriteria}</p>
            </div>
        </div>
        
        <div class="trial-detail-section">
            <h3>Locations</h3>
            <ul class="locations-list">
                ${trial.locations && trial.locations.length > 0 ? trial.locations.map(loc => `
                    <li>
                        <strong>${loc.facility || 'Clinical Site'}</strong><br>
                        ${loc.address ? loc.address + ', ' : ''}${loc.city || 'Unknown city'}, ${loc.state || 'Unknown state'} ${loc.zip || ''}
                    </li>
                `).join('') : '<li>No location information available</li>'}
            </ul>
        </div>
        
        <div class="trial-detail-section">
    <h3>Contacts</h3>
    <ul class="contacts-list">
        ${Array.isArray(trial.contacts) && trial.contacts.length > 0 ? trial.contacts.map(contact => `
            <li>
                <strong>${contact.name || 'Contact Name Not Available'}</strong><br>
                ${contact.role || 'Role Not Specified'}<br>
                ${contact.phone || ''} ${contact.email ? `| ${contact.email}` : ''}
            </li>
        `).join('') : '<li>No contact information available</li>'}
    </ul>
</div>

    // Store the current trial ID for summary generation
    const summaryButton = document.getElementById('generate-summary-button');
    if (summaryButton) {
        summaryButton.setAttribute('data-trial-id', trialId);
    }

    // Show the modal
    const trialModal = document.getElementById('trial-modal');
    if (trialModal) {
        trialModal.classList.remove('hidden');
    }
}

// Close the modal
function closeModal() {
    console.log("Closing modal");

    const trialModal = document.getElementById('trial-modal');
    if (trialModal) {
        trialModal.classList.add('hidden');
    }
}

// Handle summary generation
async function handleSummaryGeneration() {
    console.log("Generating summary");

    const summaryButton = document.getElementById('generate-summary-button');
    if (!summaryButton) {
        console.error("Summary button not found!");
        return;
    }

    const trialId = summaryButton.getAttribute('data-trial-id');

    if (!trialId) {
        console.error('No trial ID found for summary generation');
        return;
    }

    // Find the trial details
    const trial = currentTrials.find(t => t.id === trialId);

    if (!trial) {
        console.error('Trial not found:', trialId);
        return;
    }

    // Show loading state
    summaryButton.textContent = 'Generating Summary...';
    summaryButton.disabled = true;

    try {
        console.log("Calling generate_summary API");

        const response = await fetch('/api/generate_summary', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                trial_id: trialId,
                trial_details: trial
            })
        });

        console.log("API response received:", response.status);

        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }

        const data = await response.json();
        console.log("Summary data received:", data);

        if (data.status === 'success') {
            // Close the modal
            closeModal();

            // Show the summary section
            const summarySection = document.getElementById('summary-section');
            if (summarySection) {
                summarySection.classList.remove('hidden');
            }

            // Display the summary
            const summaryContainer = document.getElementById('simplified-summary');
            if (summaryContainer) {
                summaryContainer.innerHTML = `
                    <h3>${trial.title || 'Trial Summary'}</h3>
                    <div class="summary-content">
                        ${data.summary.replace(/\n/g, '<br>')}
                    </div>
                    <p class="summary-note">This summary was generated to help explain the clinical trial in simpler terms.</p>
                `;

                // Scroll to the summary section
                summarySection.scrollIntoView({ behavior: 'smooth' });
            }
        } else {
            throw new Error(data.error || 'Failed to generate summary');
        }
    } catch (error) {
        console.error('Error generating summary:', error);
        alert(`Error generating summary: ${error.message}`);
    } finally {
        // Reset button state
        summaryButton.textContent = 'Generate Parent-Friendly Summary';
        summaryButton.disabled = false;
    }
}

// ========== Initialize App ==========

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    console.log("DOM fully loaded");

    // Set up event listeners
    const searchForm = document.getElementById('clinical-trial-form');

    if (searchForm) {
        console.log("Search form found:", searchForm);
        searchForm.addEventListener('submit', handleSearchSubmit);

        // Also attach the handler directly to the search button as a backup
        const searchButton = document.getElementById('search-button');
        if (searchButton) {
            console.log("Search button found");
            searchButton.addEventListener('click', function(event) {
                event.preventDefault();
                console.log("Search button clicked");
                handleSearchSubmit(event);
            });
        } else {
            console.error("Search button not found!");
        }
    } else {
        console.error("Search form not found! Check your HTML id attributes.");
    }

    // Set up close button for modal
    const closeButton = document.querySelector('.close-button');
    if (closeButton) {
        closeButton.addEventListener('click', closeModal);
    }

    // Set up generate summary button
    const summaryButton = document.getElementById('generate-summary-button');
    if (summaryButton) {
        summaryButton.addEventListener('click', handleSummaryGeneration);
    }

    // Initialize map placeholder
    initMapPlaceholder();
});

// Make viewTrialDetails function available globally
window.viewTrialDetails = viewTrialDetails;