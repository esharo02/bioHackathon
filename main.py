from flask import Flask, jsonify, render_template, request
import os
import dotenv
import requests
import urllib.parse
import threading
import webbrowser
import time
import openai
from openai import OpenAI

# Load environment variables
dotenv.load_dotenv()

# Get API keys from environment variables
OPENAI_API_KEY = os.getenv('OPENAI_API_KEY')
GOOGLE_MAPS_API_KEY = os.getenv('GOOGLE_MAPS_API_KEY')

# Initialize OpenAI client
client = OpenAI(api_key=OPENAI_API_KEY)

# Create Flask app
app = Flask(__name__, static_folder="static", template_folder="templates")


@app.route("/api/get_maps_api_key")
def get_maps_api_key():
    """Endpoint to securely provide the Google Maps API key to the frontend."""
    try:
        return jsonify({
            "status": "success",
            "api_key": GOOGLE_MAPS_API_KEY
        })
    except Exception as e:
        return jsonify({
            "status": "error",
            "error": f"Failed to get Maps API key: {str(e)}"
        })


@app.route("/api/generate_summary", methods=['POST'])
def generate_summary():
    data = request.json
    trial_details = data.get('trial_details', {})

    # Extract relevant information from the trial
    title = trial_details.get('title', 'Unknown Trial')
    description = trial_details.get('description', '')
    condition = trial_details.get('condition', '')

    # Extract eligibility info
    eligibility_criteria = ''
    if 'eligibility' in trial_details:
        eligibility_criteria = f"Gender: {trial_details['eligibility'].get('gender', 'All')}\n"
        eligibility_criteria += f"Age Range: {trial_details['eligibility'].get('min_age', 'N/A')} to {trial_details['eligibility'].get('max_age', 'N/A')}\n"
        eligibility_criteria += trial_details['eligibility'].get('criteria', '')

    try:
        # Prompt for OpenAI to generate a parent-friendly summary
        messages = [
            {"role": "system", "content": "You are a helpful assistant that explains clinical trials in simple terms."},
            {"role": "user", "content": f"""
                Please create a parent-friendly summary of this clinical trial. Write in plain language that is 
                accessible to someone without a medical background. Be encouraging but honest about what the
                trial involves.

                Trial Title: {title}
                Condition: {condition}
                Description: {description}

                Key Eligibility Criteria: {eligibility_criteria[:500]}

                Format the summary with these sections:
                1. What this trial is studying
                2. Who can participate
                3. What participants will need to do
                4. Potential benefits and risks

                Keep the summary under 500 words and avoid complex medical jargon.
            """}
        ]

        # Call OpenAI API
        response = client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=messages,
            max_tokens=1000,
            temperature=0.7
        )

        # Extract the generated summary
        summary = response.choices[0].message.content.strip()

        return jsonify({
            "status": "success",
            "summary": summary
        })

    except Exception as e:
        print(f"Error generating summary: {str(e)}")
        return jsonify({
            "status": "error",
            "error": f"Failed to generate summary: {str(e)}"
        })


@app.route("/")
def index():
    return render_template("index.html")


def get_lat_lon(city_name):
    """
    Convert a city name into latitude and longitude using Google Maps API.
    Returns (lat, lon) as a tuple or None if the lookup fails.
    """
    try:
        geo_url = f"https://maps.googleapis.com/maps/api/geocode/json?address={urllib.parse.quote(city_name)}&key={GOOGLE_MAPS_API_KEY}"
        response = requests.get(geo_url)
        data = response.json()

        if data["status"] == "OK":
            lat = data["results"][0]["geometry"]["location"]["lat"]
            lon = data["results"][0]["geometry"]["location"]["lng"]
            return lat, lon
        else:
            print(f"Google Maps API Error: {data['status']}")
            return None
    except Exception as e:
        print(f"Error fetching coordinates for {city_name}: {str(e)}")
        return None


@app.route("/api/search_trials", methods=['POST'])
def search_trials():
    data = request.json

    condition = data.get('condition', '')
    location = data.get('location', '')
    distance = int(data.get('distance', 50))  # Default to 50 miles
    age = data.get('age', 0)  # Still get age from request but don't filter by it

    base_url = "https://clinicaltrials.gov/api/v2/studies"

    # Create a dictionary of params
    params_dict = {}

    if condition:
        params_dict["query.term"] = condition
        print(f"Using condition: {condition}")

    # Get coordinates for the specified location
    user_coordinates = None
    if location:
        user_coordinates = get_lat_lon(location)
        print(f"Got coordinates for {location}: {user_coordinates}")

        if user_coordinates:
            lat, lon = user_coordinates
            # Use "mi" suffix as shown in the documentation
            params_dict["filter.geo"] = f"distance({lat:.6f},{lon:.6f},{distance}mi)"
            print(f"Using geo filter: {params_dict['filter.geo']}")
        else:
            print(f"Warning: Could not find coordinates for '{location}', skipping location filtering.")

    # Define simplified fields to retrieve
    params_dict["fields"] = "NCTId,BriefTitle,OfficialTitle,BriefSummary,Condition"

    # Request 50 trials max
    params_dict["pageSize"] = "50"

    # Add sorting by relevance
    params_dict["sort"] = "@relevance"

    # Request total count
    params_dict["countTotal"] = "true"

    # Log the parameters we're using
    print(f"Request parameters: {params_dict}")

    headers = {"accept": "application/json"}

    try:
        # Make the request using the params parameter
        response = requests.get(base_url, params=params_dict, headers=headers)

        # Log the actual URL that was requested
        print(f"Actual request URL: {response.url}")
        print(f"Response status code: {response.status_code}")

        if response.status_code != 200:
            return jsonify({
                "status": "error",
                "error": f"Failed to fetch data, status code: {response.status_code}, response: {response.text}"
            })

        data = response.json()
        all_trials = data.get("studies", [])
        total_count = data.get("totalCount", 0)
        print(f"Retrieved {len(all_trials)} trials from API (total available: {total_count})")

        # Process trials to make them easier to work with on the frontend
        processed_trials = []
        for trial in all_trials:
            protocol_section = trial.get("protocolSection", {})

            # Extract identification data
            identification = protocol_section.get("identificationModule", {})
            nct_id = identification.get("nctId", "")

            # Generate the URL for the study based on its NCT ID
            study_url = f"https://clinicaltrials.gov/study/{nct_id}" if nct_id else ""

            # Print study URL for verification
            print(f"Study: {identification.get('briefTitle', 'Unnamed')} | URL: {study_url}")

            # Extract eligibility data for display purposes (not for filtering)
            eligibility_module = protocol_section.get("eligibilityModule", {})
            min_age_str = eligibility_module.get("minimumAge", "0 Years")
            max_age_str = eligibility_module.get("maximumAge", "N/A")

            # Extract status
            status_module = protocol_section.get("statusModule", {})
            overall_status = status_module.get("overallStatus", "Unknown")

            # Extract locations
            contacts_locations_module = protocol_section.get("contactsLocationsModule", {})
            location_list = contacts_locations_module.get("locations", [])

            # Process locations and add coordinates
            processed_locations = []
            for loc in location_list:
                # Create a location object with the data we need
                processed_loc = {
                    "facility": loc.get("facility", ""),
                    "status": loc.get("status", ""),
                    "city": loc.get("city", ""),
                    "state": loc.get("state", ""),
                    "zip": loc.get("zip", ""),
                    "country": loc.get("country", "")
                }

                # Get coordinates for this location
                location_str = f"{loc.get('city', '')} {loc.get('state', '')} {loc.get('zip', '')} {loc.get('country', '')}"
                if location_str.strip():
                    coords = get_lat_lon(location_str)
                    if coords:
                        processed_loc["latitude"] = coords[0]
                        processed_loc["longitude"] = coords[1]

                processed_locations.append(processed_loc)

            # Create a processed trial object
            processed_trial = {
                "id": nct_id,
                "url": study_url,  # Add the URL to the trial object
                "title": identification.get("briefTitle", ""),
                "official_title": identification.get("officialTitle", ""),
                "description": protocol_section.get("descriptionModule", {}).get("briefSummary", ""),
                "condition": ", ".join(protocol_section.get("conditionsModule", {}).get("conditions", [])),
                "status": overall_status,
                "eligibility": {
                    "gender": eligibility_module.get("sex", "All"),
                    "min_age": min_age_str,
                    "max_age": max_age_str,
                    "criteria": eligibility_module.get("eligibilityCriteria", "")
                },
                "locations": processed_locations
            }

            processed_trials.append(processed_trial)

        print(f"Returning {len(processed_trials)} trials")

        return jsonify({
            "status": "success",
            "count": len(processed_trials),
            "totalCount": total_count,
            "trials": processed_trials,
            "search_location": {
                "query": location,
                "coordinates": user_coordinates
            }
        })

    except Exception as e:
        print(f"Error in search_trials: {str(e)}")
        return jsonify({
            "status": "error",
            "error": f"An error occurred: {str(e)}"
        })


def open_browser():
    time.sleep(1.5)
    webbrowser.open('http://127.0.0.1:5000')


if __name__ == '__main__':
    threading.Thread(target=open_browser).start()
    app.run(debug=False, port=5000)