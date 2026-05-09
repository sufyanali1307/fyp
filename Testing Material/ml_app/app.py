from flask import Flask, request, render_template_string
import joblib
import numpy as np

app = Flask(__name__)
model = joblib.load("model.pkl")

HTML = """
<!DOCTYPE html>
<html>
<head>
    <title>ML UI</title>
</head>
<body>
    <h1>ML Prediction App ✅</h1>
    <form method="post">
        <input name="number" placeholder="Enter number" required>
        <button type="submit">Predict</button>
    </form>
    {% if result %}
    <h2>Prediction: {{ result }}</h2>
    {% endif %}
</body>
</html>
"""

@app.route("/", methods=["GET", "POST"])
def home():
    result = None
    if request.method == "POST":
        number = float(request.form["number"])
        prediction = model.predict([[number]])
        result = prediction[0]
    return render_template_string(HTML, result=result)

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)