# import pandas as pd
from flask import Flask, jsonify, render_template, request
import json
import pandas as pd
# from difflib import get_close_matches

import openai
import os, dotenv, requests, urllib.parse

dotenv.load_dotenv()
OpenAI_api_key = os.getenv('OPENAI_API_KEY')
if not OpenAI_api_key:
    raise ValueError("No OpenAI API key found in environment variables")

app = Flask(__name__)


@app.route("/")
def index():
    return render_template("index.html", text="")


@app.route("/get_trial")
def get_clinical_trial_info():
    condition = request.args.get('condition')
    # team2 = request.args.get('team2')
    condition = "chronic myeloid leukemia"
    url = f"https://clinicaltrials.gov/api/v2/studies?query.cond={urllib.parse.quote(condition)}"
    headers = {"accept": "application/json"}

    response = requests.get(url, headers=headers)

    if response.status_code != 200:
        return {"error": f"Failed to fetch data, status code: {response.status_code}"}

    data = response.json()
    trials = data.get("studies", [])
    trial_info = trials[0]  # Only fetching the first study
    sum = summarize_study(trial_info)
    print(sum)
    return json.dumps(sum)


def summarize_study(trial_info):
    openai.api_key = OpenAI_api_key
    prompt = f"Summarize the following clinical trial study under 300 tokens: {trial_info}"
    client = openai.OpenAI()
    response = client.chat.completions.create(
        model="gpt-3.5-turbo",  # Use "gpt-4" if needed
        messages=[
            {"role": "system", "content": "You are an AI assistant."},
            {"role": "user", "content": prompt}
        ],
        max_tokens=300  # Increase the max_tokens value to get a longer summary
    )
    resp = response.choices[0].message.content
    # return resp
    return json.dumps(resp)


# if __name__ == '__main__':
   # app.run(debug=False)

# import os

if __name__ == '__main__':
     app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 8080)))


