from flask import Flask, jsonify
import sys

app = Flask(__name__)

@app.route('/')
def home():
    version = sys.version.split(' ')[0]
    return f"""
    <html>
        <head><title>Finance Prediction API</title></head>
        <body style="font-family: system-ui, sans-serif; background: #0f172a; color: white; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0;">
            <div style="background: #1e293b; padding: 3rem; border-radius: 12px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.2);">
                <h1 style="color: #38bdf8; margin-top: 0;">📈 Finance API (Python {version})</h1>
                <p>This is a complete Python Flask environment automatically deployed by the NexusCode Dashboard!</p>
                <div style="background: #334155; padding: 1rem; border-radius: 8px; margin-top: 2rem;">
                    <h3>Available Endpoints</h3>
                    <code>GET /status</code><br/>
                    <code>GET /api/v1/forecast</code>
                </div>
            </div>
        </body>
    </html>
    """

@app.route('/status')
def status():
    return jsonify({"status": "healthy", "service": "Finance API Core", "version": "1.0.0"})

@app.route('/api/v1/forecast')
def forecast():
    import random
    return jsonify({
        "asset": "BTC/USD",
        "predicted_price": round(random.uniform(60000, 75000), 2),
        "confidence": "94.2%"
    })

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
