import os
import textwrap


class MLHandler:
    def __init__(self, base_dir):
        self.base_dir = base_dir


    def generate_api_wrapper(self, env_id, model_filename, target_dir):
        """Generates a Flask API wrapper script for an uploaded ML model."""
       
        # Decide loading mechanism based on extension
        ext = os.path.splitext(model_filename)[1].lower()
       
        loading_script = ""
        imports = ""
       
        if ext == '.pkl' or ext == '.joblib':
            imports = "import joblib\nimport pickle"
            loading_script = f"""
    try:
        model = joblib.load({repr(model_filename)})
    except Exception:
        with open({repr(model_filename)}, 'rb') as f:
            model = pickle.load(f)
    return model
"""
        elif ext == '.h5':
            imports = "import tensorflow as tf"
            loading_script = f"    return tf.keras.models.load_model({repr(model_filename)})"
        elif ext in ['.pt', '.pth']:
            imports = "import torch"
            loading_script = f"    # Load PyTorch model on CPU to avoid CUDA dependency issues\\n    return torch.load({repr(model_filename)}, map_location=torch.device('cpu'))"
        elif ext == '.onnx':
            imports = "import onnxruntime as ort\nimport numpy as np"
            loading_script = f"""
    session = ort.InferenceSession({repr(model_filename)})
    class ONNXWrapper:
        def predict(self, features):
            input_name = session.get_inputs()[0].name
            return session.run(None, {{input_name: features.astype(np.float32)}})[0]
    return ONNXWrapper()
"""
        else:
            imports = "import pickle"
            loading_script = f"    with open({repr(model_filename)}, 'rb') as f:\n        return pickle.load(f)"

        # Write model_api.py
        wrapper_code = f"""
import os
import sys
import traceback
from flask import Flask, request, jsonify
{imports}
import numpy as np


app = Flask(__name__)


class DummyModel:
    def predict(self, features):
        return np.array(['Dummy prediction (Invalid model file uploaded)'])


def load_ml_model():
    print("Loading model {model_filename}...")
{loading_script}


try:
    model = load_ml_model()
    print("Model loaded successfully.")
except Exception as e:
    print(f"Warning: Failed to load model. Error: {{e}}")
    traceback.print_exc()
    print("Running in dummy mode for testing.")
    model = DummyModel()


@app.route('/', methods=['GET'])
def home():
    return jsonify({{
        "message": "ML Model API Running: {model_filename}",
        "endpoints": {{
            "/health": "GET - Check API status",
            "/predict": "POST - Send JSON with 'features' array to get predictions"
        }}
    }})


@app.route('/health', methods=['GET'])
def health():
    status = 'ok' if model.__class__.__name__ != 'DummyModel' else 'dummy_mode'
    return jsonify(status=status, model='{model_filename}')


@app.route('/predict', methods=['POST'])
def predict():
    try:
        data = request.json
        if not data or 'features' not in data:
            return jsonify({{"error": "Please provide 'features' in JSON payload"}}), 400
           
        features = np.array(data['features'])
       
        # Reshape if necessary (basic heuristic)
        if len(features.shape) == 1:
            features = features.reshape(1, -1)
           
        prediction = model.predict(features)
       
        # Handle numpy arrays for JSON serialization
        if hasattr(prediction, 'tolist'):
            prediction = prediction.tolist()
           
        return jsonify({{"prediction": prediction}})
    except Exception as e:
        return jsonify({{"error": str(e)}}), 500


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port)
"""
        with open(os.path.join(target_dir, 'model_api.py'), 'w') as f:
            f.write(wrapper_code)
           
        # Write generic requirements.txt for ML
        reqs = ["flask\n", "werkzeug\n", "numpy\n"]
        if ext == '.pkl' or ext == '.joblib':
            reqs.append("scikit-learn\n")
            reqs.append("joblib\n")
        elif ext == '.h5':
            reqs.append("tensorflow\n")
        elif ext in ['.pt', '.pth']:
            reqs.append("torch\n")
        elif ext == '.onnx':
            reqs.append("onnxruntime\n")
           
        with open(os.path.join(target_dir, 'requirements.txt'), 'w') as f:
            f.writelines(reqs)
           
        return True
